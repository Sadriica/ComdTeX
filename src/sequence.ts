/**
 * Sequence blocks for ComdTeX.
 *
 * Parses `:::seq` blocks (DNA, RNA or protein: FASTA records or raw lines),
 * validates them, finds motifs and highlight ranges, lays them out in numbered
 * groups, and renders them as preview HTML, Markdown or verbatim-safe LaTeX.
 *
 * Pure: no DOM, no Monaco, no i18n. Messages here are English, like the other
 * special-block renderers (`tt-error`, `plot` errors); the linter translates the
 * stable `code` of each issue.
 *
 * Body syntax:
 *
 *   type: dna                     dna | rna | protein (auto-detected when absent)
 *   highlight: 12-31 primer-F, 2:5-9 loop     range, optional label; `N:` picks record N
 *   motif: GAATTC, GGATCC         every occurrence, case-insensitive
 *   revcomp: yes                  motifs also match the reverse complement (DNA/RNA)
 *   width: 60                     residues per line (10..200)
 *   group: 10                     residues per group, 0 for none
 *   >name description             FASTA header (optional; several records allowed)
 *   GAATTCGGATCC...               sequence lines (spaces and a leading position
 *                                 number, as in GenBank, are ignored)
 */

export type SeqType = "dna" | "rna" | "protein"

export type SeqIssueCode = "seq-empty" | "seq-invalid-char" | "seq-bad-option" | "seq-bad-range"

export interface SeqIssue {
  code: SeqIssueCode
  message: string
  /** 0-based line within the block body. */
  line: number
  /** 0-based column of the offending text; -1 when the whole line is meant. */
  col: number
  /** Length of the offending text (1 for a single character). */
  length: number
  /** The offending character (seq-invalid-char only). */
  char?: string
  /** 1-based residue position (seq-invalid-char only). */
  position?: number
}

export interface SeqOptions {
  type: SeqType | null
  width: number
  group: number
  revcomp: boolean
  highlights: SeqHighlightSpec[]
  motifs: string[]
}

export interface SeqHighlightSpec {
  /** 1-based record the range applies to. */
  record: number
  start: number
  end: number
  label: string
  line: number
}

export interface SeqMark {
  kind: "range" | "motif"
  start: number
  end: number
  label: string
  /** Colour slot for ranges (0..5). */
  colour: number
  /** Strand a motif hit was found on. */
  strand: "+" | "-"
}

export interface SeqRecord {
  name: string
  description: string
  residues: string
  type: SeqType
  /** Residue count. */
  length: number
  /** GC content in percent, one decimal; null for proteins or no A/C/G/T/U. */
  gc: number | null
  marks: SeqMark[]
  /** Per-motif summary, in the order given. */
  motifHits: { motif: string; positions: number[]; reverse: number[] }[]
}

export interface SeqDoc {
  options: SeqOptions
  records: SeqRecord[]
  issues: SeqIssue[]
}

export const SEQ_DEFAULT_WIDTH = 60
export const SEQ_DEFAULT_GROUP = 10
export const SEQ_COLOURS = 6

const NUCLEOTIDE_CHARS = "ACGTURYKMSWBDHVN"
const DNA_CHARS = new Set("ACGTRYKMSWBDHVN")
const RNA_CHARS = new Set("ACGURYKMSWBDHVN")
const PROTEIN_CHARS = new Set("ACDEFGHIKLMNPQRSTVWYBZXUOJ*")
const OPTION_KEYS = new Set(["type", "highlight", "motif", "width", "group", "revcomp"])

const TYPE_LABEL: Record<SeqType, string> = { dna: "DNA", rna: "RNA", protein: "Protein" }

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ── Biology helpers ───────────────────────────────────────────────────────────

const COMPLEMENT: Record<string, string> = {
  A: "T",
  T: "A",
  U: "A",
  C: "G",
  G: "C",
  R: "Y",
  Y: "R",
  K: "M",
  M: "K",
  B: "V",
  V: "B",
  D: "H",
  H: "D",
  S: "S",
  W: "W",
  N: "N",
}

/** Reverse complement (IUPAC aware, case preserved). `rna` writes U instead of T. */
export function reverseComplement(seq: string, rna = false): string {
  let out = ""
  for (let i = seq.length - 1; i >= 0; i--) {
    const ch = seq[i]
    const upper = ch.toUpperCase()
    let c = COMPLEMENT[upper]
    if (c === undefined) {
      out += ch
      continue
    }
    if (rna && c === "T") c = "U"
    out += ch === upper ? c : c.toLowerCase()
  }
  return out
}

/** GC content in percent over unambiguous bases, one decimal; null if there are none. */
export function gcContent(seq: string): number | null {
  let gc = 0
  let total = 0
  for (const ch of seq.toUpperCase()) {
    if (ch === "G" || ch === "C") {
      gc++
      total++
    } else if (ch === "A" || ch === "T" || ch === "U") total++
  }
  if (total === 0) return null
  return Math.round((gc / total) * 1000) / 10
}

/** Guess the alphabet: U means RNA, nucleotide-only letters mean DNA, anything else protein. */
export function detectSeqType(seq: string): SeqType {
  const up = seq.toUpperCase()
  if (up.length === 0) return "dna"
  for (const ch of up) {
    if (!NUCLEOTIDE_CHARS.includes(ch)) return "protein"
  }
  return up.includes("U") ? "rna" : "dna"
}

function allowedChars(type: SeqType): Set<string> {
  return type === "dna" ? DNA_CHARS : type === "rna" ? RNA_CHARS : PROTEIN_CHARS
}

function findAll(haystack: string, needle: string): number[] {
  const out: number[] = []
  if (!needle) return out
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    out.push(i + 1)
    i = haystack.indexOf(needle, i + 1)
  }
  return out
}

// ── Parsing ───────────────────────────────────────────────────────────────────

const TRUTHY = new Set(["true", "yes", "on", "1", "si", "sí"])
const FALSY = new Set(["false", "no", "off", "0"])
const HIGHLIGHT_RE = /^(?:(\d+)\s*:\s*)?(\d+)(?:\s*(?:-|–|\.\.)\s*(\d+))?(?:\s+(.+))?$/

interface RawRecord {
  name: string
  description: string
  headerLine: number
  chars: string
  /** Origin (line, col) of each char in `chars`. */
  origins: { line: number; col: number }[]
}

function defaultOptions(): SeqOptions {
  return {
    type: null,
    width: SEQ_DEFAULT_WIDTH,
    group: SEQ_DEFAULT_GROUP,
    revcomp: false,
    highlights: [],
    motifs: [],
  }
}

function parseInteger(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null
}

/** Parse, validate and analyze a `:::seq` body. Never throws. */
export function parseSeq(body: string): SeqDoc {
  const lines = body.replace(/\r/g, "").split("\n")
  const options = defaultOptions()
  const issues: SeqIssue[] = []
  const bad = (line: number, col: number, length: number, message: string) =>
    issues.push({ code: "seq-bad-option", message, line, col, length })

  // Header: leading `key: value` lines (a sequence line can never hold a colon).
  let i = 0
  for (; i < lines.length; i++) {
    const raw = lines[i]
    const text = raw.trim()
    if (text === "") continue
    if (text.startsWith(">") || !text.includes(":")) break
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(text)
    const col = raw.length - raw.trimStart().length
    if (!m || !OPTION_KEYS.has(m[1].toLowerCase())) {
      bad(i, col, text.length, `Unknown option "${m ? m[1] : text}"`)
      continue
    }
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === "type") {
      const v = value.toLowerCase()
      if (v === "dna" || v === "rna" || v === "protein") options.type = v
      else if (v === "aa") options.type = "protein"
      else bad(i, col, text.length, `type must be dna, rna or protein, not "${value}"`)
    } else if (key === "width" || key === "group") {
      const n = parseInteger(value)
      if (n === null) bad(i, col, text.length, `${key} must be a whole number`)
      else if (key === "width") {
        if (n < 10 || n > 200) bad(i, col, text.length, "width must be between 10 and 200")
        else options.width = n
      } else if (n > 200) bad(i, col, text.length, "group must be 200 or less (0 for no groups)")
      else options.group = n
    } else if (key === "revcomp") {
      const v = value.toLowerCase()
      if (TRUTHY.has(v)) options.revcomp = true
      else if (FALSY.has(v)) options.revcomp = false
      else bad(i, col, text.length, "revcomp must be yes or no")
    } else if (key === "motif") {
      for (const part of value.split(",")) {
        const motif = part.trim()
        if (!motif) continue
        if (!/^[A-Za-z*]+$/.test(motif)) bad(i, col, text.length, `Invalid motif "${motif}"`)
        else options.motifs.push(motif)
      }
    } else if (key === "highlight") {
      for (const part of value.split(",")) {
        const item = part.trim()
        if (!item) continue
        const h = HIGHLIGHT_RE.exec(item)
        if (!h) {
          bad(i, col, text.length, `Invalid highlight "${item}" (use 12-31 label)`)
          continue
        }
        const start = Number(h[2])
        const end = h[3] !== undefined ? Number(h[3]) : start
        if (start < 1 || end < start) {
          bad(i, col, text.length, `Invalid range "${item}"`)
          continue
        }
        options.highlights.push({
          record: h[1] !== undefined ? Number(h[1]) : 1,
          start,
          end,
          label: (h[4] ?? "").trim(),
          line: i,
        })
      }
    }
  }

  // Records.
  const raws: RawRecord[] = []
  let cur: RawRecord | null = null
  for (; i < lines.length; i++) {
    const raw = lines[i]
    const text = raw.trim()
    if (text === "") continue
    if (text.startsWith(">")) {
      const header = text.slice(1).trim()
      const sp = header.search(/\s/)
      cur = {
        name: sp === -1 ? header : header.slice(0, sp),
        description: sp === -1 ? "" : header.slice(sp).trim(),
        headerLine: i,
        chars: "",
        origins: [],
      }
      raws.push(cur)
      continue
    }
    if (!cur) {
      cur = { name: "", description: "", headerLine: i, chars: "", origins: [] }
      raws.push(cur)
    }
    // A GenBank-style position number at the line start is not residue data.
    const lead = /^\s*\d+(?=\s)/.exec(raw)
    for (let c = lead ? lead[0].length : 0; c < raw.length; c++) {
      if (/\s/.test(raw[c])) continue
      cur.chars += raw[c]
      cur.origins.push({ line: i, col: c })
    }
  }

  if (raws.length === 0) {
    issues.push({
      code: "seq-empty",
      message: "No sequence provided",
      line: Math.max(0, Math.min(i, lines.length - 1)),
      col: -1,
      length: 0,
    })
  }

  const records: SeqRecord[] = []
  raws.forEach((raw, idx) => {
    const label = raw.name ? `"${raw.name}"` : `record ${idx + 1}`
    if (raw.chars.length === 0) {
      issues.push({
        code: "seq-empty",
        message: `Sequence ${label} is empty`,
        line: raw.headerLine,
        col: -1,
        length: 0,
      })
      return
    }
    const type = options.type ?? detectSeqType(raw.chars)
    const allowed = allowedChars(type)
    const reported = new Set<string>()
    for (let p = 0; p < raw.chars.length; p++) {
      const ch = raw.chars[p]
      if (allowed.has(ch.toUpperCase())) continue
      if (reported.has(ch)) continue
      reported.add(ch)
      if (reported.size > 5) break
      const o = raw.origins[p]
      issues.push({
        code: "seq-invalid-char",
        message: `Invalid ${TYPE_LABEL[type]} character "${ch}" at position ${p + 1} in ${label}`,
        line: o.line,
        col: o.col,
        length: 1,
        char: ch,
        position: p + 1,
      })
    }
    records.push({
      name: raw.name,
      description: raw.description,
      residues: raw.chars,
      type,
      length: raw.chars.length,
      gc: type === "protein" ? null : gcContent(raw.chars),
      marks: [],
      motifHits: [],
    })
  })

  // Marks (only for valid, non-empty records).
  if (!issues.some((x) => x.code === "seq-invalid-char" || x.code === "seq-empty")) {
    for (const h of options.highlights) {
      const rec = records[h.record - 1]
      if (!rec) {
        issues.push({
          code: "seq-bad-range",
          message: `Highlight ${h.start}-${h.end} refers to record ${h.record}, which does not exist`,
          line: h.line,
          col: -1,
          length: 0,
        })
      } else if (h.end > rec.length) {
        issues.push({
          code: "seq-bad-range",
          message: `Highlight ${h.start}-${h.end} is outside the sequence (length ${rec.length})`,
          line: h.line,
          col: -1,
          length: 0,
        })
      }
    }
    records.forEach((rec, idx) => {
      let colour = 0
      for (const h of options.highlights) {
        if (h.record !== idx + 1 || h.end > rec.length) continue
        rec.marks.push({
          kind: "range",
          start: h.start,
          end: h.end,
          label: h.label,
          colour: colour++ % SEQ_COLOURS,
          strand: "+",
        })
      }
      const upper = rec.residues.toUpperCase()
      for (const motif of options.motifs) {
        let m = motif.toUpperCase()
        if (rec.type === "dna") m = m.replace(/U/g, "T")
        else if (rec.type === "rna") m = m.replace(/T/g, "U")
        const forward = findAll(upper, m)
        let reverse: number[] = []
        if (options.revcomp && rec.type !== "protein") {
          const rc = reverseComplement(m, rec.type === "rna")
          if (rc !== m) reverse = findAll(upper, rc)
          for (const start of reverse) {
            rec.marks.push({
              kind: "motif",
              start,
              end: start + rc.length - 1,
              label: motif,
              colour: 0,
              strand: "-",
            })
          }
        }
        for (const start of forward) {
          rec.marks.push({
            kind: "motif",
            start,
            end: start + m.length - 1,
            label: motif,
            colour: 0,
            strand: "+",
          })
        }
        rec.motifHits.push({ motif, positions: forward, reverse })
      }
    })
  }

  return { options, records, issues }
}

// ── Layout ────────────────────────────────────────────────────────────────────

export interface SeqLine {
  /** 1-based position of the first residue. */
  start: number
  /** Groups as [from, to) 0-based residue offsets. */
  groups: [number, number][]
}

/** Split `length` residues into lines of `width` residues, in groups of `group` (0 = one group). */
export function layoutSeq(length: number, width: number, group: number): SeqLine[] {
  const lines: SeqLine[] = []
  const g = group > 0 ? group : width
  for (let from = 0; from < length; from += width) {
    const to = Math.min(length, from + width)
    const groups: [number, number][] = []
    for (let s = from; s < to; s += g) groups.push([s, Math.min(to, s + g)])
    lines.push({ start: from + 1, groups })
  }
  return lines
}

/** Per residue, the index into `marks` that paints it (-1 for none). Ranges beat motifs. */
function paintMap(rec: SeqRecord): Int32Array {
  const map = new Int32Array(rec.length).fill(-1)
  const order = [
    ...rec.marks.map((m, i) => [m, i] as const).filter(([m]) => m.kind === "range"),
    ...rec.marks.map((m, i) => [m, i] as const).filter(([m]) => m.kind === "motif"),
  ]
  for (const [m, idx] of order) {
    for (let p = m.start - 1; p < m.end; p++) if (map[p] === -1) map[p] = idx
  }
  return map
}

/** The grouped text of one record: header line plus numbered lines. */
export function seqRecordLines(rec: SeqRecord, options: SeqOptions): string[] {
  const out: string[] = []
  if (rec.name || rec.description) {
    out.push(`>${[rec.name, rec.description].filter(Boolean).join(" ")}`)
  }
  const gutter = String(rec.length).length
  for (const line of layoutSeq(rec.length, options.width, options.group)) {
    const text = line.groups.map(([s, e]) => rec.residues.slice(s, e)).join(" ")
    out.push(`${String(line.start).padStart(gutter)} ${text}`)
  }
  return out
}

/** "DNA, 120 bp, GC 45.0%" / "Protein, 120 aa". */
export function seqCaption(rec: SeqRecord): string {
  const unit = rec.type === "protein" ? "aa" : "bp"
  const parts = [TYPE_LABEL[rec.type], `${rec.length} ${unit}`]
  if (rec.gc !== null) parts.push(`GC ${rec.gc.toFixed(1)}%`)
  return parts.join(", ")
}

export interface SeqLegendItem {
  /** Colour slot (0..5) for a range, "motif" or "motif-rc" for motif hits. */
  swatch: number | "motif" | "motif-rc"
  text: string
}

const MAX_LISTED_SITES = 8

function sitesText(positions: number[]): string {
  const shown = positions.slice(0, MAX_LISTED_SITES).join(", ")
  return positions.length > MAX_LISTED_SITES ? `${shown}, ...` : shown
}

/** What the highlights mean, as plain text (also the LaTeX/Markdown fallback). */
export function seqLegend(rec: SeqRecord): SeqLegendItem[] {
  const items: SeqLegendItem[] = []
  for (const m of rec.marks) {
    if (m.kind !== "range") continue
    const range = m.start === m.end ? `${m.start}` : `${m.start}-${m.end}`
    items.push({ swatch: m.colour, text: m.label ? `${m.label} (${range})` : range })
  }
  for (const hit of rec.motifHits) {
    const total = hit.positions.length + hit.reverse.length
    if (total === 0) {
      items.push({ swatch: "motif", text: `motif ${hit.motif}: no match` })
      continue
    }
    const where = [
      hit.positions.length ? `+ ${sitesText(hit.positions)}` : "",
      hit.reverse.length ? `- ${sitesText(hit.reverse)}` : "",
    ]
      .filter(Boolean)
      .join("; ")
    items.push({
      swatch: hit.positions.length ? "motif" : "motif-rc",
      text: `motif ${hit.motif}: ${total} ${total === 1 ? "site" : "sites"} (${where})`,
    })
  }
  return items
}

// ── Preview HTML ──────────────────────────────────────────────────────────────

function markClass(m: SeqMark): string {
  if (m.kind === "range") return `seq-hl seq-hl-${m.colour}`
  return m.strand === "-" ? "seq-motif seq-motif-rc" : "seq-motif"
}

function markTitle(m: SeqMark): string {
  if (m.kind === "range") return m.label ? `${m.label} ${m.start}-${m.end}` : `${m.start}-${m.end}`
  return `motif ${m.label} (${m.strand})`
}

function groupHTML(rec: SeqRecord, map: Int32Array, from: number, to: number): string {
  let html = ""
  let p = from
  while (p < to) {
    const mark = map[p]
    let q = p + 1
    while (q < to && map[q] === mark) q++
    const text = escHtml(rec.residues.slice(p, q))
    if (mark === -1) html += text
    else {
      const m = rec.marks[mark]
      html += `<span class="${markClass(m)}" title="${escHtml(markTitle(m))}">${text}</span>`
    }
    p = q
  }
  return `<span class="seq-g">${html}</span>`
}

function recordHTML(rec: SeqRecord, options: SeqOptions): string {
  const map = paintMap(rec)
  const gutter = String(rec.length).length
  const lines = layoutSeq(rec.length, options.width, options.group).map((line) => {
    const pos = `<span class="seq-pos">${String(line.start).padStart(gutter)}</span>`
    const groups = line.groups.map(([s, e]) => groupHTML(rec, map, s, e)).join(" ")
    return `<span class="seq-line">${pos} ${groups}</span>`
  })
  const head =
    rec.name || rec.description
      ? `<div class="seq-name">${escHtml(rec.name)}${
          rec.description ? ` <span class="seq-desc">${escHtml(rec.description)}</span>` : ""
        }</div>`
      : ""
  const legend = seqLegend(rec)
  const legendHTML = legend.length
    ? `<ul class="seq-legend">${legend
        .map((item) => {
          const cls =
            typeof item.swatch === "number"
              ? `seq-hl seq-hl-${item.swatch}`
              : item.swatch === "motif-rc"
                ? "seq-motif seq-motif-rc"
                : "seq-motif"
          return `<li><span class="${cls} seq-swatch" aria-hidden="true">&nbsp;&nbsp;</span> ${escHtml(item.text)}</li>`
        })
        .join("")}</ul>`
    : ""
  return [
    `<div class="seq-record">`,
    head,
    `<pre class="seq-lines">${lines.join("\n")}</pre>`,
    `<div class="seq-caption">${escHtml(seqCaption(rec))}</div>`,
    legendHTML,
    `</div>`,
  ]
    .filter(Boolean)
    .join("")
}

function issuesHTML(issues: SeqIssue[]): string {
  return `<div class="seq-error">Sequence error: ${issues.map((x) => escHtml(x.message)).join("<br>")}</div>`
}

export function renderSeqHTML(title: string, body: string, number = ""): string {
  try {
    const doc = parseSeq(body)
    if (doc.issues.length > 0) return issuesHTML(doc.issues)
    const header = title ? `Sequence ${number}: ${escHtml(title)}` : `Sequence ${number}`
    return [
      `<div class="seq-block">`,
      `<div class="seq-title">${header}</div>`,
      ...doc.records.map((r) => recordHTML(r, doc.options)),
      `</div>`,
    ].join("\n")
  } catch (e) {
    return `<div class="seq-error">Sequence error: ${escHtml(String(e).replace(/^Error:\s*/, ""))}</div>`
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

function captionText(title: string, number: string | number): string {
  return `Sequence ${number}${title ? `: ${title}` : ""}`
}

/**
 * Markdown for non-LaTeX exports: a bold caption, a fenced block with the same
 * grouped text and, when the block had highlights, a plain legend (colour is
 * lost). `null` when the block is invalid so the caller can keep the raw source.
 */
export function seqBlockToMarkdown(
  title: string,
  body: string,
  number: string | number,
): string[] | null {
  const doc = parseSeq(body)
  if (doc.issues.length > 0) return null
  const out = [`**${captionText(title, number)}**`, ""]
  for (const rec of doc.records) {
    out.push("```", ...seqRecordLines(rec, doc.options), "```", "")
    out.push(`*${seqCaption(rec)}*`, "")
    const legend = seqLegend(rec)
    if (legend.length) out.push(`Highlights: ${legend.map((l) => l.text).join("; ")}`, "")
  }
  while (out[out.length - 1] === "") out.pop()
  return out
}

/**
 * LaTeX for a block: caption, the grouped layout in `verbatim` (no extra
 * packages), the stats line and the highlights as a plain legend of ranges.
 * `esc` is the exporter's LaTeX text escaper. `null` when the block is invalid.
 */
export function seqBlockToLatex(
  title: string,
  body: string,
  number: string | number,
  esc: (s: string) => string,
): string | null {
  const doc = parseSeq(body)
  if (doc.issues.length > 0) return null
  const out = [
    "\\begin{samepage}",
    `\\noindent\\textbf{${esc(captionText(title, number))}}\\par\\smallskip`,
  ]
  for (const rec of doc.records) {
    const text = seqRecordLines(rec, doc.options)
      .join("\n")
      .split("\\end{verbatim}")
      .join("\\end {verbatim}")
    out.push("{\\footnotesize", "\\begin{verbatim}", text, "\\end{verbatim}", "}")
    out.push(`\\noindent\\textit{${esc(seqCaption(rec))}}\\par`)
    const legend = seqLegend(rec)
    if (legend.length) {
      out.push(`\\noindent Highlights: ${esc(legend.map((l) => l.text).join("; "))}\\par`)
    }
    out.push("\\smallskip")
  }
  out.push("\\end{samepage}")
  return out.join("\n")
}

/** True when a body looks like a `:::seq` body (used to recover blocks from legacy callouts). */
export function looksLikeSeqBody(body: string): boolean {
  const first = body
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean)
  if (!first) return false
  if (first.startsWith(">")) return true
  if (/^(type|highlight|motif|width|group|revcomp)\s*:/i.test(first)) return true
  // Raw lines: residue letters only, in one token or in equal-sized groups.
  const tokens = first.replace(/^\d+\s+/, "").split(/\s+/)
  if (!tokens.every((t) => /^[A-Za-z*]+$/.test(t))) return false
  if (tokens.length === 1) return tokens[0].length >= 6
  return tokens.slice(0, -1).every((t) => t.length === tokens[0].length && t.length >= 3)
}
