/**
 * Pure scanning behind editor navigation and hovers (editorNavigation.ts,
 * editorHovers.ts). No Monaco, no React, no I/O: every function takes text and
 * returns plain data, so the providers stay thin and the behaviour is testable
 * without an editor.
 *
 * Positions are 1-based lines and 0-based columns unless a name says otherwise.
 * Per-file results are cached by CONTENT IDENTITY (the same string reference
 * returns the same index), the same pointer-compare technique environments.ts
 * uses, because providers run on hover and the label index can cover thousands
 * of labels.
 */
import { CITATION_GROUP_RE, parseCitationGroup } from "./bibtex"
import { ALL_ENVS, nextEnvNumber } from "./environments"
import { NUMBERED_MATH_RE } from "./equations"
import { sectionSlug } from "./markdownEditing"
import { matchesVaultRelPath } from "./wikilinks"

export interface NavFile {
  path: string
  name: string
  content: string
}

// ── Label vocabulary ──────────────────────────────────────────────────────────

/** Written kind (`theorem`, `lem`) to the canonical prefix the label index uses. */
const KIND_ALIASES: Record<string, string> = {
  data: "data",
  dataset: "data",
  sec: "sec",
  eq: "eq",
  fig: "fig",
  tbl: "tbl",
  thm: "thm",
  theorem: "thm",
  lem: "lem",
  lemma: "lem",
  cor: "cor",
  prop: "prop",
  def: "def",
  definition: "def",
  ex: "ex",
  example: "ex",
  exc: "exc",
  exercise: "exc",
}

export function normalizeLabelKind(kind: string): string | null {
  return KIND_ALIASES[kind] ?? null
}

// ── Constructs on one line ────────────────────────────────────────────────────

export type LineConstruct =
  | {
      type: "wikilink"
      start: number
      end: number
      note: string
      heading: string | null
      embed: boolean
    }
  | {
      type: "ref"
      start: number
      end: number
      kind: string
      name: string
      id: string
      docPath: string | null
    }
  | { type: "cite"; start: number; end: number; key: string; groupStart: number; groupEnd: number }
  | { type: "labelDef"; start: number; end: number; id: string }

const WIKILINK_RE = /(!?)\[\[([^\]|#\n]+?)(?:#([^\]|]+?))?(?:\|([^\]\n]+?))?\]\]/g
const LABEL_DEF_RE = /\{#([a-zA-Z]+):([\w-]+(?:[.:][\w-]+)*)\}/g
// Cross-file alternatives first, as in environments.ts ENV_REF_RE: the local
// pattern would otherwise match the INNER `@def:x` of `@doc@def:x`.
const REF_RE =
  /@(?:\[([^\]\n]+)\]|([A-Za-z0-9_./-]+))@([a-zA-Z]+):([\w-]+(?:[.:][\w-]+)*)|@([a-zA-Z]+):([\w-]+(?:[.:][\w-]+)*)/g

function codeSpans(line: string): [number, number][] {
  if (!line.includes("`")) return []
  const spans: [number, number][] = []
  const re = /(`+)[^`\n]*?\1/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) spans.push([m.index, m.index + m[0].length])
  return spans
}

// ── LaTeX (.tex) ──────────────────────────────────────────────────────────────
// The same constructs under their LaTeX names: `\label{x}` defines, `\ref{x}`
// (and `\eqref`, `\autoref`, `\cref`...) uses, `\cite{a,b}` (and the natbib /
// biblatex variants) cites. Label ids are kept as written: no kind prefix is
// required (`\label{main}` works) and none is normalized.

const LATEX_LABEL_RE = /\\label\s*\{([^{}\n]*)\}/g
const LATEX_REF_RE = /\\(?:eqref|autoref|cref|Cref|vref|ref|pageref|nameref)\*?\s*\{([^{}\n]*)\}/g
const LATEX_CITE_RE = /\\[A-Za-z]*cite[A-Za-z]*\*?(?:\s*\[[^\]\n]*\]){0,2}\s*\{([^{}\n]*)\}/g

/** Comma-separated items inside the braces of `match`, each with its 0-based span in the line. */
function latexItems(match: RegExpExecArray): { text: string; start: number; end: number }[] {
  const open = match[0].lastIndexOf("{")
  const base = match.index + open + 1
  const items: { text: string; start: number; end: number }[] = []
  let at = 0
  for (const part of match[1].split(",")) {
    const text = part.trim()
    if (text) {
      const start = base + at + part.indexOf(text)
      items.push({ text, start, end: start + text.length })
    }
    at += part.length + 1
  }
  return items
}

function latexConstructs(line: string): LineConstruct[] {
  if (!line.includes("\\") && !line.includes("{#")) return []
  // Everything after an unescaped % is a comment.
  const cut = /(?<!\\)%/.exec(line)
  const text = cut ? line.slice(0, cut.index) : line
  const out: LineConstruct[] = []
  let m: RegExpExecArray | null

  const label = new RegExp(LATEX_LABEL_RE.source, "g")
  while ((m = label.exec(text)) !== null) {
    const id = m[1].trim()
    if (id) out.push({ type: "labelDef", start: m.index, end: m.index + m[0].length, id })
  }
  // The editor shows a .tex file with its labels already rewritten to `{#kind:name}`
  // (the storage format is converted on open), so that form defines labels too.
  const braced = new RegExp(LABEL_DEF_RE.source, "g")
  while ((m = braced.exec(text)) !== null) {
    const kind = normalizeLabelKind(m[1])
    if (kind) {
      out.push({
        type: "labelDef",
        start: m.index,
        end: m.index + m[0].length,
        id: `${kind}:${m[2]}`,
      })
    }
  }
  const ref = new RegExp(LATEX_REF_RE.source, "g")
  while ((m = ref.exec(text)) !== null) {
    for (const item of latexItems(m)) {
      const [prefix, ...rest] = item.text.split(":")
      out.push({
        type: "ref",
        start: item.start,
        end: item.end,
        kind: rest.length > 0 ? prefix : "",
        name: rest.length > 0 ? rest.join(":") : item.text,
        id: item.text,
        docPath: null,
      })
    }
  }
  const cite = new RegExp(LATEX_CITE_RE.source, "g")
  while ((m = cite.exec(text)) !== null) {
    const groupStart = m.index
    const groupEnd = m.index + m[0].length
    for (const item of latexItems(m)) {
      out.push({
        type: "cite",
        start: item.start,
        end: item.end,
        key: item.text,
        groupStart,
        groupEnd,
      })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/**
 * Every navigable construct on a line, in order, minus anything inside inline
 * code. `latex` reads the LaTeX commands instead of the Markdown syntax.
 */
export function constructsInLine(line: string, latex = false): LineConstruct[] {
  if (latex) return latexConstructs(line)
  if (!line.includes("@") && !line.includes("[[") && !line.includes("{#")) return []
  const out: LineConstruct[] = []
  const spans = codeSpans(line)
  const inCode = (i: number) => spans.some(([a, b]) => i >= a && i < b)

  if (line.includes("[[")) {
    const re = new RegExp(WIKILINK_RE.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      if (inCode(m.index)) continue
      out.push({
        type: "wikilink",
        start: m.index,
        end: m.index + m[0].length,
        note: m[2].trim().replace(/\.(md|tex)$/i, ""),
        heading: m[3]?.trim() || null,
        embed: m[1] === "!",
      })
    }
  }

  if (line.includes("[@")) {
    const re = new RegExp(CITATION_GROUP_RE.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      if (inCode(m.index)) continue
      const inner = m[1]
      const items = parseCitationGroup(inner)
      if (!items) continue
      let cursor = 0
      for (const item of items) {
        const at = inner.indexOf(`@${item.key}`, cursor)
        if (at < 0) continue
        cursor = at + item.key.length + 1
        const start = m.index + 1 + at
        out.push({
          type: "cite",
          start,
          end: start + item.key.length + 1,
          key: item.key,
          groupStart: m.index,
          groupEnd: m.index + m[0].length,
        })
      }
    }
  }

  if (line.includes("{#")) {
    const re = new RegExp(LABEL_DEF_RE.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const kind = normalizeLabelKind(m[1])
      if (!kind || inCode(m.index)) continue
      out.push({
        type: "labelDef",
        start: m.index,
        end: m.index + m[0].length,
        id: `${kind}:${m[2]}`,
      })
    }
  }

  if (line.includes("@")) {
    const taken = out.filter((c) => c.type === "cite" || c.type === "wikilink")
    const re = new RegExp(REF_RE.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (inCode(start)) continue
      const rawKind = m[3] ?? m[5]
      const name = m[4] ?? m[6]
      const kind = normalizeLabelKind(rawKind)
      if (!kind) continue
      const group = taken.find((c) => {
        const a = c.type === "cite" ? c.groupStart : c.start
        const b = c.type === "cite" ? c.groupEnd : c.end
        return start < b && end > a
      })
      if (group) continue
      const docPath = m[4] !== undefined ? (m[1] ?? m[2] ?? "").trim() || null : null
      out.push({ type: "ref", start, end, kind, name, id: `${kind}:${name}`, docPath })
    }
  }

  out.sort((a, b) => a.start - b.start)
  return out
}

/** The construct under a 0-based column, or null. Cites resolve to the key under the cursor. */
export function constructAt(line: string, col0: number, latex = false): LineConstruct | null {
  const all = constructsInLine(line, latex)
  let hit: LineConstruct | null = null
  for (const c of all) {
    if (col0 >= c.start && col0 <= c.end) {
      // The narrowest wins (a label inside a wikilink cannot happen, but a cite key beats its group).
      if (!hit || c.end - c.start <= hit.end - hit.start) hit = c
    }
  }
  return hit
}

// ── Code masking, shared with the renderer's numbering ───────────────────────

const FENCE_RE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm

const blank = (s: string) => s.replace(/[^\n]/g, " ")

/**
 * The text with fenced code and inline code spans replaced by spaces
 * (newlines kept). Same regions the renderer removes before numbering
 * (`stripCodeFences` + `blankInlineCode` in equations.ts), but LENGTH
 * PRESERVING so offsets in the result are offsets in the original.
 */
export function maskCode(text: string): string {
  return text
    .replace(new RegExp(FENCE_RE.source, "gm"), blank)
    .replace(/(`+)([^`\n]*?)\1/g, (m) => " ".repeat(m.length))
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  return starts
}

function lineOf(starts: number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

// ── Numbered math ─────────────────────────────────────────────────────────────

export interface MathBlock {
  /** Equation number as the preview shows it. */
  n: number
  /** Label as written after `{#`, e.g. `eq:gap`; null when unlabeled. */
  label: string | null
  body: string
  inline: boolean
  startLine: number
  endLine: number
}

/**
 * Every numbered equation, in the renderer's order. Fenced code and inline
 * code never count (a `$$` inside a fence is documentation), matching
 * `prescanEquations`, which the preview uses.
 */
export function listNumberedMath(text: string): MathBlock[] {
  if (!text.includes("$")) return []
  const masked = maskCode(text)
  const starts = lineStarts(text)
  const re = new RegExp(NUMBERED_MATH_RE.source, "g")
  const out: MathBlock[] = []
  let n = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) {
    n++
    const inline = m[3] !== undefined
    out.push({
      n,
      label: (m[2] ?? m[4]) || null,
      body: (m[1] ?? m[3] ?? "").trim(),
      inline,
      startLine: lineOf(starts, m.index),
      endLine: lineOf(starts, m.index + m[0].length - 1),
    })
  }
  return out
}

// ── Environments ──────────────────────────────────────────────────────────────

export interface EnvBlock {
  type: string
  title: string
  label: string | null
  /** Number as the preview prints it ("" for unnumbered environments). */
  number: string
  startLine: number
  endLine: number
  body: string
}

const ENV_BLOCK_RE =
  /^:::(?:(sm|lg)\s+)?([\w]+)(?:\[([^\]]*)\])?(?:\s*\{#([\w:.-]+)\})?\s*\n([\s\S]*?)^:::\s*$/gm

export function listEnvironments(text: string): EnvBlock[] {
  if (!text.includes(":::")) return []
  const masked = maskCode(text)
  const starts = lineStarts(text)
  const counters: Record<string, number> = {}
  const re = new RegExp(ENV_BLOCK_RE.source, "gm")
  const out: EnvBlock[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) {
    const type = m[2].toLowerCase()
    if (!ALL_ENVS[type]) continue
    const bodyStart = m.index + m[0].indexOf("\n") + 1
    out.push({
      type,
      title: (m[3] ?? "").trim(),
      label: m[4] ?? null,
      number: nextEnvNumber(counters, type),
      startLine: lineOf(starts, m.index),
      endLine: lineOf(starts, m.index + m[0].trimEnd().length - 1),
      body: text.slice(bodyStart, bodyStart + m[5].length).replace(/\n$/, ""),
    })
  }
  return out
}

// ── Per-file index ────────────────────────────────────────────────────────────

export interface NavLabel {
  id: string
  kind: string
  name: string
  /** Line of the `{#...}` token. */
  line: number
  start: number
  end: number
}
export interface NavRef {
  id: string
  kind: string
  docPath: string | null
  line: number
  start: number
  end: number
}
export interface NavCite {
  key: string
  line: number
  start: number
  end: number
}
export interface NavWikilink {
  note: string
  heading: string | null
  line: number
  start: number
  end: number
}
export interface NavHeading {
  text: string
  slug: string
  level: number
  line: number
}

export interface FileNav {
  path: string
  name: string
  text: string
  labels: NavLabel[]
  labelsById: Map<string, NavLabel[]>
  refs: NavRef[]
  cites: NavCite[]
  wikilinks: NavWikilink[]
  headings: NavHeading[]
  math(): MathBlock[]
  envs(): EnvBlock[]
  lines(): string[]
}

const indexCache = new Map<string, { content: string; nav: FileNav }>()

function memo<T>(fn: () => T): () => T {
  let done = false
  let value: T
  return () => {
    if (!done) {
      value = fn()
      done = true
    }
    return value
  }
}

/** A `.tex` file is scanned for LaTeX commands, everything else as ComdTeX Markdown. */
export const isLatexPath = (path: string) => /\.tex$/i.test(path)

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*(?:\{#[^}]*\})?\s*$/

export function indexFile(file: NavFile): FileNav {
  const hit = indexCache.get(file.path)
  if (hit && hit.content === file.content) return hit.nav

  const labels: NavLabel[] = []
  const refs: NavRef[] = []
  const cites: NavCite[] = []
  const wikilinks: NavWikilink[] = []
  const headings: NavHeading[] = []
  const text = file.content
  const lines = memo(() => text.split("\n"))
  const latex = isLatexPath(file.path)

  if (text) {
    let fence: string | null = null
    const all = text.split("\n")
    for (let i = 0; i < all.length; i++) {
      const line = all[i]
      // No fences or headings in LaTeX: the commands are all that is indexed.
      if (!latex) {
        const f = /^(`{3,}|~{3,})/.exec(line)
        if (fence) {
          const t = line.trim()
          if (t[0] === fence[0] && t.length >= fence.length && /^(`+|~+)$/.test(t)) fence = null
          continue
        }
        if (f) {
          fence = f[1]
          continue
        }
      }
      const lineNo = i + 1
      const h = !latex && line.charCodeAt(0) === 35 ? HEADING_RE.exec(line) : null
      if (h) {
        const title = h[2].trim()
        headings.push({
          text: title,
          slug: sectionSlug(title, headings.length),
          level: h[1].length,
          line: lineNo,
        })
      }
      for (const c of constructsInLine(line, latex)) {
        if (c.type === "labelDef") {
          const [kind, ...rest] = c.id.split(":")
          labels.push({
            id: c.id,
            kind,
            name: rest.join(":"),
            line: lineNo,
            start: c.start,
            end: c.end,
          })
        } else if (c.type === "ref") {
          refs.push({
            id: c.id,
            kind: c.kind,
            docPath: c.docPath,
            line: lineNo,
            start: c.start,
            end: c.end,
          })
        } else if (c.type === "cite") {
          cites.push({ key: c.key, line: lineNo, start: c.start, end: c.end })
        } else {
          wikilinks.push({
            note: c.note,
            heading: c.heading,
            line: lineNo,
            start: c.start,
            end: c.end,
          })
        }
      }
    }
  }

  const labelsById = new Map<string, NavLabel[]>()
  for (const l of labels) {
    const bucket = labelsById.get(l.id)
    if (bucket) bucket.push(l)
    else labelsById.set(l.id, [l])
  }

  const nav: FileNav = {
    path: file.path,
    name: file.name,
    text,
    labels,
    labelsById,
    refs,
    cites,
    wikilinks,
    headings,
    math: memo(() => listNumberedMath(text)),
    envs: memo(() => listEnvironments(text)),
    lines,
  }
  indexCache.set(file.path, { content: file.content, nav })
  return nav
}

export function clearNavCache(): void {
  indexCache.clear()
}

// ── Vault-wide database ──────────────────────────────────────────────────────

export interface NavTarget {
  path: string
  /** First line of the target block (what a peek shows). */
  line: number
  endLine: number
  /** Where the caret lands. */
  selLine: number
  selStart: number
  selEnd: number
}

export interface LabelHit {
  file: FileNav
  label: NavLabel
}

const stripExt = (s: string) => s.replace(/\.[^./\\]+$/, "")
const dirOf = (p: string) => p.replace(/\\/g, "/").replace(/\/[^/]*$/, "")

export class NavDb {
  readonly files: FileNav[]
  private byPath = new Map<string, FileNav>()

  constructor(files: NavFile[]) {
    this.files = files.map(indexFile)
    for (const f of this.files) this.byPath.set(f.path, f)
    // Drop cache entries of files that left the vault.
    if (indexCache.size > this.files.length + 64) {
      for (const key of indexCache.keys()) if (!this.byPath.has(key)) indexCache.delete(key)
    }
  }

  file(path: string): FileNav | null {
    return this.byPath.get(path) ?? null
  }

  /** `[[note]]` / `[[folder/note]]` to a file; same folder wins on a tie. */
  findNote(note: string, fromPath: string | null): FileNav | null {
    const target = note.trim().replace(/\\/g, "/")
    if (!target) return null
    if (target.includes("/")) {
      return this.files.find((f) => matchesVaultRelPath(f.path, target)) ?? null
    }
    const lower = stripExt(target).toLowerCase()
    const matches = this.files.filter((f) => stripExt(f.name).toLowerCase() === lower)
    if (matches.length <= 1 || !fromPath) return matches[0] ?? null
    const dir = dirOf(fromPath)
    return matches.find((f) => dirOf(f.path) === dir) ?? matches[0]
  }

  findDoc(docPath: string): FileNav | null {
    return this.files.find((f) => matchesVaultRelPath(f.path, docPath)) ?? null
  }

  /** Where a heading lives in a note: exact text, then slug, case-insensitive. */
  findHeading(file: FileNav, heading: string): NavHeading | null {
    const lower = heading.trim().toLowerCase()
    const slug = sectionSlug(heading, 0)
    return (
      file.headings.find((h) => h.text.toLowerCase() === lower) ??
      file.headings.find((h) => h.slug === slug) ??
      null
    )
  }

  /**
   * Definitions of a reference. `@doc@kind:x` looks only in `doc`; a bare
   * `@kind:x` looks in the current file first and falls back to the rest of
   * the vault (the Labels panel's vault-wide view), current folder first.
   */
  resolveRef(ref: { id: string; docPath: string | null }, fromPath: string | null): LabelHit[] {
    if (ref.docPath) {
      const file = this.findDoc(ref.docPath)
      return (file?.labelsById.get(ref.id) ?? []).map((label) => ({ file: file!, label }))
    }
    const own = fromPath ? this.byPath.get(fromPath) : null
    const ownHits = own?.labelsById.get(ref.id)
    if (ownHits?.length) return ownHits.map((label) => ({ file: own!, label }))
    const dir = fromPath ? dirOf(fromPath) : ""
    const hits: LabelHit[] = []
    for (const file of this.files) {
      if (file === own) continue
      const found = file.labelsById.get(ref.id)
      if (found) for (const label of found) hits.push({ file, label })
    }
    return hits.sort(
      (a, b) => Number(dirOf(b.file.path) === dir) - Number(dirOf(a.file.path) === dir),
    )
  }

  /** The block a label belongs to, with the position the caret should land on. */
  targetOf(hit: LabelHit): NavTarget {
    const { file, label } = hit
    const base: NavTarget = {
      path: file.path,
      line: label.line,
      endLine: label.line,
      selLine: label.line,
      selStart: label.start,
      selEnd: label.end,
    }
    if (label.kind === "eq") {
      const block = file.math().find((b) => b.label === label.id)
      if (block) {
        const opening = file.lines()[block.startLine - 1] ?? ""
        const col = Math.max(0, opening.search(/\S/))
        return {
          ...base,
          line: block.startLine,
          endLine: block.endLine,
          selLine: block.startLine,
          selStart: col,
          selEnd: Math.max(col, opening.trimEnd().length),
        }
      }
    }
    return base
  }

  /**
   * Every place that uses a label: references that resolve to it, plus the
   * definition itself. A bare ref counts when it sits in the defining file or
   * in a file that defines no label of that id (it can only mean this one).
   */
  usagesOfLabel(id: string, defPath: string): { file: FileNav; ref: NavRef }[] {
    const out: { file: FileNav; ref: NavRef }[] = []
    for (const file of this.files) {
      for (const ref of file.refs) {
        if (ref.id !== id) continue
        if (ref.docPath) {
          if (this.findDoc(ref.docPath)?.path === defPath) out.push({ file, ref })
        } else if (file.path === defPath) {
          out.push({ file, ref })
        } else if (!file.labelsById.has(id)) {
          // No definition of its own: it means the first one the vault offers it.
          if (this.resolveRef(ref, file.path)[0]?.file.path === defPath) out.push({ file, ref })
        }
      }
    }
    return out
  }

  usagesOfCite(key: string): { file: FileNav; cite: NavCite }[] {
    const out: { file: FileNav; cite: NavCite }[] = []
    for (const file of this.files)
      for (const cite of file.cites) if (cite.key === key) out.push({ file, cite })
    return out
  }

  backlinks(target: FileNav): { file: FileNav; link: NavWikilink }[] {
    const out: { file: FileNav; link: NavWikilink }[] = []
    for (const file of this.files)
      for (const link of file.wikilinks)
        if (this.findNote(link.note, file.path)?.path === target.path) out.push({ file, link })
    return out
  }
}
