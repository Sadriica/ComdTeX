import type { BibEntry } from "./bibtex"
import { foldText, rankItems, type FuzzyField } from "./fuzzy"
import type { LineEdit } from "./cursorContext"
import type { StructuralLabel } from "./structuralLabels"
import type { PaletteMode } from "./paletteTypes"
import { displayDestination, finalName, validateName, type NameProblem } from "./fileNaming"

/**
 * Data sources for the palette modes. Pure functions over data the app already
 * holds (the file tree, the open document, the label index, the bib map); none
 * of them touches the disk or Monaco, and none runs on a path the user did not
 * ask for (they run when the palette is open and the query changes).
 */

// ── Modes and prefixes ──────────────────────────────────────────────────────

export const MODE_PREFIX: Record<Exclude<PaletteMode, "files">, string> = {
  commands: ">",
  outline: "@",
  labels: "#",
  cite: "[",
  line: ":",
  help: "?",
}

const PREFIX_MODE = new Map<string, PaletteMode>(
  (Object.entries(MODE_PREFIX) as [PaletteMode, string][]).map(([m, p]) => [p, m]),
)

export const MODE_ORDER: PaletteMode[] = [
  "files",
  "commands",
  "outline",
  "labels",
  "cite",
  "line",
  "help",
]

export function prefixOfMode(mode: PaletteMode): string {
  return mode === "files" ? "" : MODE_PREFIX[mode]
}

/**
 * Apply the text the input now holds to the current mode. Only the files mode
 * switches by prefix (the other modes own their first character already), and
 * only when the prefix is the first character: `note#heading` keeps its `#`.
 */
export function parsePaletteInput(
  mode: PaletteMode,
  value: string,
): { mode: PaletteMode; query: string } {
  if (mode === "files" && value.length > 0) {
    const target = PREFIX_MODE.get(value[0])
    if (target) return { mode: target, query: value.slice(1) }
  }
  return { mode, query: value }
}

// ── Files ───────────────────────────────────────────────────────────────────

export interface FileEntry {
  path: string
  name: string
  /** Vault-relative path with `/` separators. */
  rel: string
  /** Vault-relative folder ("" for the vault root). */
  folder: string
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/")
}

export function buildFileEntries(
  files: readonly { path: string; name?: string }[],
  vaultRoot: string | null,
): FileEntry[] {
  const root = vaultRoot ? normalizeSlashes(vaultRoot).replace(/\/+$/, "") : ""
  return files.map((f) => {
    const full = normalizeSlashes(f.path)
    const rel = root && full.startsWith(root + "/") ? full.slice(root.length + 1) : full
    const slash = rel.lastIndexOf("/")
    return {
      path: f.path,
      name: f.name ?? rel.slice(slash + 1),
      rel,
      folder: slash >= 0 ? rel.slice(0, slash) : "",
    }
  })
}

export interface RankedFile {
  entry: FileEntry
  /** Positions inside `entry.name`. */
  positions: number[]
  recent: boolean
}

/** Max entries the empty files view lists after the recents. */
const EMPTY_VIEW_FILES = 40

export function rankFileEntries(
  entries: readonly FileEntry[],
  query: string,
  recentPaths: readonly string[],
): RankedFile[] {
  const recentIndex = new Map(recentPaths.map((p, i) => [p, i]))
  if (!query.trim()) {
    const byPath = new Map(entries.map((e) => [e.path, e]))
    const recents: RankedFile[] = []
    for (const p of recentPaths) {
      const entry = byPath.get(p)
      if (entry) recents.push({ entry, positions: [], recent: true })
    }
    const rest = entries
      .filter((e) => !recentIndex.has(e.path))
      .sort((a, b) => a.rel.localeCompare(b.rel))
      .slice(0, EMPTY_VIEW_FILES)
      .map((entry) => ({ entry, positions: [], recent: false }))
    return [...recents, ...rest]
  }
  const ranked = rankItems(entries, query, (e) => [
    { text: e.name, weight: 1 },
    { text: e.rel, weight: 0.55 },
  ])
  // Recency breaks near-ties without overriding a clearly better match.
  const boosted = ranked.map((r) => {
    const idx = recentIndex.get(r.item.path)
    const boost = idx === undefined ? 0 : Math.max(0, 12 - idx)
    return { ...r, score: r.score + boost }
  })
  boosted.sort((a, b) => b.score - a.score)
  return boosted.map((r) => ({
    entry: r.item,
    positions: r.field === 0 ? r.positions : [],
    recent: recentIndex.has(r.item.path),
  }))
}

/** `note#heading`: the part before the first `#` names a note. */
export function parseNoteQuery(query: string): { note: string; heading: string } | null {
  const idx = query.indexOf("#")
  if (idx <= 0) return null
  const note = query.slice(0, idx).trim()
  if (!note) return null
  return { note, heading: query.slice(idx + 1).trim() }
}

/** The best file for the note part of `note#heading` (extension ignored). */
export function resolveNote(entries: readonly FileEntry[], note: string): FileEntry | null {
  const folded = foldText(note.trim().replace(/\.(md|tex|typ)$/i, ""))
  const exact = entries.find((e) => foldText(e.name.replace(/\.(md|tex|typ)$/i, "")) === folded)
  if (exact) return exact
  const ranked = rankItems(entries, note, (e) => [
    { text: e.name.replace(/\.(md|tex|typ)$/i, ""), weight: 1 },
    { text: e.rel, weight: 0.5 },
  ])
  return ranked[0]?.item ?? null
}

/**
 * The file a "Create note" row would write: `<query>.md` in the current folder.
 * Path separators and characters Windows refuses are replaced, so a query can
 * never escape the folder.
 */
export function createNoteTarget(
  query: string,
  currentFolderRel: string,
): { fileName: string; folderRel: string; rel: string; problem: NameProblem | null } | null {
  const cleaned = query
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[-.\s]+|[-\s]+$/g, "")
  if (!cleaned) return null
  const fileName = finalName(cleaned, "file")
  const folderRel = currentFolderRel.replace(/^\/+|\/+$/g, "")
  return {
    fileName,
    folderRel,
    rel: displayDestination(folderRel, fileName),
    // Existing names are the file rows above the create row; this catches the rest.
    problem: validateName(cleaned, "file", []),
  }
}

// ── Outline of a document (the `@` mode and note#heading) ───────────────────

export interface OutlineEntry {
  kind: "heading" | "env" | "label"
  text: string
  line: number
  /** Heading level 1-6. */
  level?: number
  /** `:::theorem` type, or the kind of a label. */
  type?: string
  /** `kind:name` of an explicit label. */
  label?: string
}

const ENV_OPEN = /^\s*:::\s*([A-Za-z][\w-]*)(?:\[([^\]]*)\])?(?:\s*\{#([\w:.-]+)\})?\s*$/
const HEADING = /^(#{1,6})\s+(\S.*?)\s*$/
const LABEL = /\{#([a-zA-Z]+:[\w:.-]+)\}/g

/**
 * Headings, environments and labels of a document, in line order. Skips fenced
 * code and `$$` blocks so a `# comment` inside a code fence is not a heading.
 */
export function documentOutline(content: string): OutlineEntry[] {
  const out: OutlineEntry[] = []
  const lines = content.split("\n")
  let inFence = false
  let inDisplay = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```+|~~~+)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const dollars = (line.match(/\$\$/g) ?? []).length
    const labelsHere = [...line.matchAll(LABEL)].map((m) => m[1])
    if (inDisplay || dollars > 0) {
      // A display block closes on a line with an odd number of `$$`; its label
      // sits on that closing line (`$$ {#eq:x}`).
      if (dollars % 2 === 1) inDisplay = !inDisplay
      for (const label of labelsHere) {
        out.push({
          kind: "label",
          text: label,
          line: i + 1,
          type: label.split(":")[0],
          label,
        })
      }
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const text = heading[2].replace(/\s*\{#[\w:.-]+\}\s*$/, "")
      out.push({
        kind: "heading",
        text,
        line: i + 1,
        level: heading[1].length,
        label: labelsHere[0],
      })
      continue
    }
    const env = ENV_OPEN.exec(line)
    if (env) {
      out.push({
        kind: "env",
        text: env[2]?.trim() || env[1],
        line: i + 1,
        type: env[1],
        label: env[3],
      })
      continue
    }
    for (const label of labelsHere) {
      out.push({
        kind: "label",
        text: label,
        line: i + 1,
        type: label.split(":")[0],
        label,
      })
    }
  }
  return out
}

export interface RankedOutline {
  entry: OutlineEntry
  positions: number[]
}

export function rankOutline(entries: readonly OutlineEntry[], query: string): RankedOutline[] {
  if (!query.trim()) return entries.map((entry) => ({ entry, positions: [] }))
  return rankItems(entries, query, (e) => [
    { text: e.text, weight: 1 },
    { text: e.label, weight: 0.8 },
    { text: e.type, weight: 0.4 },
  ]).map((r) => ({ entry: r.item, positions: r.field === 0 ? r.positions : [] }))
}

// ── Labels across the vault (`#`) ───────────────────────────────────────────

export interface RankedLabel {
  label: StructuralLabel
  positions: number[]
}

export function rankLabels(
  labels: readonly StructuralLabel[],
  query: string,
  currentFilePath: string | null,
): RankedLabel[] {
  const sameFileFirst = [...labels].sort(
    (a, b) =>
      Number(b.filePath === currentFilePath) - Number(a.filePath === currentFilePath) ||
      a.id.localeCompare(b.id),
  )
  if (!query.trim()) return sameFileFirst.map((label) => ({ label, positions: [] }))
  const fields = (l: StructuralLabel): FuzzyField[] => [
    { text: l.id, weight: 1 },
    { text: l.context, weight: 0.45 },
    { text: l.fileName, weight: 0.3 },
  ]
  const ranked = rankItems(sameFileFirst, query, fields).map((r) => ({
    label: r.item,
    positions: r.field === 0 ? r.positions : [],
    score: r.score + (r.item.filePath === currentFilePath ? 6 : 0),
  }))
  ranked.sort((a, b) => b.score - a.score)
  return ranked.map(({ label, positions }) => ({ label, positions }))
}

const CROSS_FILE_KINDS = new Set(["thm", "lem", "cor", "prop", "def", "ex", "exc"])

/**
 * The text that references a label. Environments in another file need the
 * cross-file form `@folder/note@def:x` (vault-relative, no extension; the
 * bracketed escape when the path has spaces); everything else, and anything in
 * the current file, is the plain `@kind:name`.
 */
export function referenceText(
  label: StructuralLabel,
  currentFilePath: string | null,
  vaultRoot: string | null,
): string {
  if (label.filePath === currentFilePath || !CROSS_FILE_KINDS.has(label.kind)) {
    return `@${label.id}`
  }
  const rel =
    buildFileEntries([{ path: label.filePath }], vaultRoot)[0]?.rel.replace(/\.[^./]+$/, "") ??
    label.filePath
  return /\s/.test(rel) ? `@[${rel}]@${label.id}` : `@${rel}@${label.id}`
}

// ── Citations (`[`) ─────────────────────────────────────────────────────────

export interface CitationEntry {
  key: string
  /** "Lubotzky, Phillips and Sarnak": last names only. */
  authors: string
  /** "Lubotzky et al." for the row label. */
  authorsShort: string
  year: string
  title: string
  label: string
}

function lastName(author: string): string {
  const a = author.trim()
  if (a.includes(",")) return a.split(",")[0].trim()
  const parts = a.split(/\s+/)
  return parts[parts.length - 1] ?? a
}

function cleanBibText(s: string | undefined): string {
  return (s ?? "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim()
}

export function citationEntries(bib: ReadonlyMap<string, BibEntry>): CitationEntry[] {
  const out: CitationEntry[] = []
  for (const [key, entry] of bib) {
    const rawAuthors = cleanBibText(entry.fields.author ?? entry.fields.editor)
    const names = rawAuthors
      ? rawAuthors
          .split(/\s+and\s+/i)
          .map(lastName)
          .filter(Boolean)
      : []
    const authors =
      names.length <= 1
        ? (names[0] ?? "")
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    const authorsShort = names.length > 2 ? `${names[0]} et al.` : authors
    const year = cleanBibText(entry.fields.year ?? entry.fields.date).slice(0, 4)
    const title = cleanBibText(entry.fields.title)
    const label = [authorsShort || key, year].filter(Boolean).join(" ")
    out.push({ key, authors, authorsShort, year, title, label })
  }
  return out
}

export interface RankedCitation {
  entry: CitationEntry
  positions: number[]
}

export function rankCitations(entries: readonly CitationEntry[], query: string): RankedCitation[] {
  if (!query.trim()) {
    return [...entries]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((entry) => ({ entry, positions: [] }))
  }
  return rankItems(entries, query, (e) => [
    { text: e.label, weight: 1 },
    { text: e.key, weight: 0.9 },
    { text: e.title, weight: 0.75 },
    { text: e.authors, weight: 0.8 },
    { text: e.year, weight: 0.7 },
  ]).map((r) => ({ entry: r.item, positions: r.field === 0 ? r.positions : [] }))
}

/**
 * The edit that cites `key` at the cursor. Inside an existing `[@a]` group it
 * appends `; @key` before the closing bracket; elsewhere it inserts `[@key]`.
 * Null when the group already cites the key.
 */
export function citationInsertEdit(line: string, column: number, key: string): LineEdit | null {
  const col0 = column - 1
  const re = /\[@[^\]\n]*\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (col0 > m.index && col0 < m.index + m[0].length) {
      const keys = [...m[0].matchAll(/@([\w:.-]+)/g)].map((k) => k[1])
      if (keys.includes(key)) return null
      const close = m.index + m[0].length // 0-based index just after `]`
      return { startColumn: close, endColumn: close, text: `; @${key}` }
    }
  }
  return { startColumn: column, endColumn: column, text: `[@${key}]` }
}

// ── Go to line (`:`) ────────────────────────────────────────────────────────

export function parseLineQuery(
  query: string,
  lineCount: number,
): { line: number; column?: number } | null {
  const m = /^\s*(\d+)(?::(\d+))?\s*$/.exec(query)
  if (!m) return null
  const line = Math.min(Math.max(1, parseInt(m[1], 10)), Math.max(1, lineCount))
  return m[2] ? { line, column: Math.max(1, parseInt(m[2], 10)) } : { line }
}
