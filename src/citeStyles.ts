// Citation styles, because one fixed style is wrong everywhere.
//
// Over a thousand biomedical journals require Vancouver (ICMJE); AMA is its
// close cousin (journal titles italic, different punctuation); astronomy and
// the social sciences cite author-year. ComdTeX rendered a single invented
// numeric style, which is correct for no venue at all.
//
// A style here decides two things: how a reference reads in the
// bibliography, and how an in-text citation looks (a number in brackets or
// "(Rudin, 1976)"). The LaTeX export maps the same choice to the right
// natbib options, so preview and PDF agree.

export type CiteStyleId = "default" | "vancouver" | "ama" | "apa" | "author-year"

export interface BibFields {
  author?: string
  year?: string
  title?: string
  journal?: string
  booktitle?: string
  volume?: string
  number?: string
  pages?: string
  publisher?: string
  address?: string
  edition?: string
  doi?: string
  howpublished?: string
  [k: string]: string | undefined
}

export interface StyleContext {
  type: string
  fields: BibFields
  /** 1-based position in the bibliography. */
  n: number
}

export interface CiteStyle {
  id: CiteStyleId
  label: string
  /** In-text marker for a citation, e.g. "[1]" or "(Rudin, 1976)". */
  inText: (ctx: StyleContext) => string
  /** One bibliography entry as plain text (the caller escapes and wraps). */
  reference: (ctx: StyleContext) => string
  /** Whether the bibliography shows a leading [n]. */
  numbered: boolean
  /** natbib options for the LaTeX export, or null when natbib is not used. */
  natbib: string | null
}

// ── Author helpers ────────────────────────────────────────────────────────────

interface Person {
  last: string
  initials: string
}

/** BibTeX author fields are "Last, First and Last, First" or "First Last and ...". */
export function parseAuthors(raw: string): Person[] {
  return raw
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      if (a.includes(",")) {
        const [last, rest = ""] = a.split(",")
        return { last: last.trim(), initials: initialsOf(rest) }
      }
      const parts = a.split(/\s+/)
      const last = parts.pop() ?? a
      return { last, initials: initialsOf(parts.join(" ")) }
    })
}

function initialsOf(given: string): string {
  return given
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("")
}

/** Vancouver/AMA: "Rudin W, Smith AB"; over six authors, "et al". */
function authorsVancouver(people: Person[], max = 6): string {
  if (people.length === 0) return ""
  const shown = people.slice(0, max).map((p) => `${p.last}${p.initials ? ` ${p.initials}` : ""}`)
  return people.length > max ? `${shown.join(", ")}, et al` : shown.join(", ")
}

/** APA: "Rudin, W., & Smith, A. B."; over 20, ellipsis before the last. */
function authorsApa(people: Person[]): string {
  if (people.length === 0) return ""
  const fmt = (p: Person) => `${p.last}${p.initials ? `, ${p.initials.split("").join(". ")}.` : ""}`
  if (people.length === 1) return fmt(people[0])
  if (people.length <= 20) {
    const all = people.map(fmt)
    return `${all.slice(0, -1).join(", ")}, & ${all[all.length - 1]}`
  }
  return `${people.slice(0, 19).map(fmt).join(", ")}, ... ${fmt(people[people.length - 1])}`
}

/** In-text author for author-year styles: "Rudin", "Rudin & Smith", "Rudin et al." */
function authorsInText(people: Person[]): string {
  if (people.length === 0) return "Anon"
  if (people.length === 1) return people[0].last
  if (people.length === 2) return `${people[0].last} & ${people[1].last}`
  return `${people[0].last} et al.`
}

function joinNonEmpty(parts: Array<string | undefined | false>, sep: string): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(sep)
}

// ── The styles ────────────────────────────────────────────────────────────────

const vancouver: CiteStyle = {
  id: "vancouver",
  label: "Vancouver (ICMJE)",
  numbered: true,
  natbib: "numbers,square",
  inText: ({ n }) => `[${n}]`,
  reference: ({ type, fields: f }) => {
    const authors = f.author ? authorsVancouver(parseAuthors(f.author)) : ""
    const title = f.title ? `${f.title}.` : ""
    if (type === "book") {
      return joinNonEmpty([
        authors && `${authors}.`,
        title,
        f.edition && `${f.edition} ed.`,
        joinNonEmpty([f.address, f.publisher], ": "),
        f.year && `${f.year}.`,
      ], " ")
    }
    const vol = joinNonEmpty([f.volume, f.number && `(${f.number})`], "")
    const tail = joinNonEmpty([vol, f.pages && `:${f.pages}`], "")
    return joinNonEmpty([
      authors && `${authors}.`,
      title,
      f.journal || f.booktitle,
      joinNonEmpty([f.year, tail && `;${tail}`], ""),
    ], " ").replace(/\s+;/, ";") + "."
  },
}

const ama: CiteStyle = {
  ...vancouver,
  id: "ama",
  label: "AMA",
  // AMA differs from Vancouver mainly in italic journal titles, which the
  // caller renders; the reference text itself is nearly identical.
}

const apa: CiteStyle = {
  id: "apa",
  label: "APA 7",
  numbered: false,
  natbib: "authoryear,round",
  inText: ({ fields: f }) => {
    const people = f.author ? parseAuthors(f.author) : []
    return `(${authorsInText(people)}, ${f.year ?? "n.d."})`
  },
  reference: ({ type, fields: f }) => {
    const authors = f.author ? authorsApa(parseAuthors(f.author)) : ""
    const year = `(${f.year ?? "n.d."}).`
    if (type === "book") {
      return joinNonEmpty([authors, year, f.title && `${f.title}.`, f.publisher && `${f.publisher}.`], " ")
    }
    const vol = joinNonEmpty([f.volume, f.number && `(${f.number})`], "")
    return joinNonEmpty([
      authors,
      year,
      f.title && `${f.title}.`,
      f.journal || f.booktitle,
      joinNonEmpty([vol, f.pages], ", ") && `${joinNonEmpty([vol, f.pages], ", ")}.`,
    ], " ")
  },
}

const authorYear: CiteStyle = {
  id: "author-year",
  label: "Author-year",
  numbered: false,
  natbib: "authoryear",
  inText: ({ fields: f }) => {
    const people = f.author ? parseAuthors(f.author) : []
    return `(${authorsInText(people)} ${f.year ?? "n.d."})`
  },
  reference: ({ fields: f }) => {
    const people = f.author ? parseAuthors(f.author) : []
    const authors = people.map((p) => `${p.last}, ${p.initials}`).join("; ")
    return joinNonEmpty([
      authors && `${authors}`,
      f.year && `${f.year}.`,
      f.title && `${f.title}.`,
      f.journal || f.booktitle,
      f.volume,
      f.pages,
    ], ", ")
  },
}

/** The original ComdTeX style, kept as the default so nothing changes silently. */
const defaultStyle: CiteStyle = {
  id: "default",
  label: "ComdTeX",
  numbered: true,
  natbib: null,
  inText: ({ n }) => `[${n}]`,
  reference: ({ type, fields: f }) => {
    const authors = f.author ? parseAuthors(f.author).map((p) => `${p.last}, ${p.initials}.`).join("; ") : "?"
    const year = f.year ? `(${f.year})` : ""
    const title = f.title ?? ""
    let source = ""
    if (type === "article") {
      source = joinNonEmpty([f.journal, f.volume && `vol. ${f.volume}`, f.pages && `pp. ${f.pages}`], ", ")
    } else if (type === "book") {
      source = joinNonEmpty([f.publisher, f.address], ", ")
    } else if (type === "inproceedings" || type === "incollection") {
      source = f.booktitle ?? ""
    } else {
      source = f.publisher ?? f.journal ?? f.howpublished ?? ""
    }
    return joinNonEmpty([`${authors} ${year}.`, title, source], " ")
  },
}

export const CITE_STYLES: Record<CiteStyleId, CiteStyle> = {
  default: defaultStyle,
  vancouver,
  ama,
  apa,
  "author-year": authorYear,
}

/** Read `comdtex.citestyle` from frontmatter data; unknown values fall back. */
export function pickCiteStyle(raw: unknown): CiteStyle {
  if (typeof raw !== "string") return CITE_STYLES.default
  const id = raw.trim().toLowerCase().replace(/[_\s]/g, "-") as CiteStyleId
  return CITE_STYLES[id] ?? CITE_STYLES.default
}
