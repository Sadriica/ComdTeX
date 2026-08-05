/**
 * "Keep" marks: invisible highlighting.
 *
 * Syntax (inline, single-line):
 *
 *     ^^texto^^                 → mark with no category
 *     ^^def: texto^^            → mark with category "def"
 *     ^^duda: revisar esto^^    → category "duda"
 *
 * The category is an optional freeform `word: ` prefix inside the delimiters.
 * It is NOT a fixed enum; users invent their own (keep/def/dato/duda/…).
 *
 * The mark is deliberately invisible OUTSIDE the editor: the preview and every
 * export render the plain inner text with the delimiters and the `cat:` prefix
 * removed (`stripKeepMarks`). The only place a mark is visible is the Monaco
 * editor, which decorates it (see `setupKeepMarkDecorations` in monacoSetup.ts),
 * and the Keep panel (`KeepPanel.tsx`), which collects them vault-wide.
 *
 * ── Why `^^`, and not `{{ }}` or `%%` ───────────────────────────────────────
 *
 * Both obvious delimiters were already spoken for:
 *
 *   - `{{X}}` is an Anki cloze deletion inside a `:::definition` body
 *     (`ankiExport.ts`), and also a template / PDF header-footer variable
 *     (`{{title}}`, `{{date}}`, `{{page}}`). Definitions are exactly where marks
 *     get written, so sharing it would have exported cards answering "def: …".
 *   - `%%X%%` is Obsidian's comment syntax, which HIDES the text (the opposite
 *     of a keep mark, which shows it). ComdTeX ships an Obsidian export and
 *     filesystem cloud sync, so vaults really do get opened in Obsidian.
 *
 * `^^` has no other meaning in ComdTeX. It coexists with the two `^` constructs
 * that do exist: LaTeX superscript (`$x^2$`, excluded as math) and trailing
 * block ids (`^myid`, see `processBlockIds` in transclusion.ts), neither of
 * which can produce a doubled `^`. See the block-id note under exclusions.
 *
 * ── Parsing decisions (edge cases) ──────────────────────────────────────────
 *
 * `^^` is a SYMMETRIC, doubled delimiter. These rules are derived from that:
 *
 * 1. The inner text is matched LAZILY (`.+?`) and MAY itself contain a single
 *    `^`. This is the important one: `^^dato: 2^10 = 1024^^` and
 *    `^^def: x^n crece^^` are both plausible prose, and forbidding `^` inside
 *    (the obvious `[^^\n]*` analogue) silently fails to match them and drops
 *    the mark. Single carets cannot produce a false positive: a mark needs two
 *    ADJACENT `^` on both sides, so `x^2 y^3` is untouched.
 *
 * 2. A mark NEVER spans a newline (`.` excludes `\n`), so an unclosed `^^`
 *    cannot swallow the rest of the document hunting for a far-away `^^`. An
 *    unclosed `^^` is simply not a mark and stays verbatim.
 *
 * 3. No nesting. Because the delimiter is symmetric, pairing is LEFTMOST-FIRST
 *    rather than innermost: `^^a ^^b^^ c^^` yields the two marks "a" and "c",
 *    with "b" left outside as plain text (stripping gives "abc", since each
 *    mark's text is trimmed). A paired `{{`/`}}` form would instead have
 *    resolved innermost-first, to "b"; so don't reason from brace behaviour.
 *    Either way nesting carries no extra meaning: a fragment inside a fragment
 *    is still one fragment.
 *
 * 4. `^^^^` is not a mark (the lazy `.+?` needs at least one character), and
 *    neither is an all-whitespace body like `^^ ^^`: there is nothing to keep.
 *    Both stay verbatim.
 *
 *    Sharp edge, documented rather than defended against: because the match is
 *    lazy, a `^^^^` with ANOTHER `^^` later on the same line can bridge into a
 *    spurious mark. This needs a literal `^^^^` in prose, which nothing real
 *    produces, and it cannot lose data: the text survives, only the delimiters
 *    move. Guarding it would cost more regex complexity than the case is worth.
 *
 * 5. A category REQUIRES whitespace after its colon: `^^def: texto^^` has
 *    category "def", `^^def:texto^^` does not (the text is the literal
 *    `def:texto`). This is what keeps `^^https://example.com^^` from acquiring
 *    a bogus "https" category. So for `^^ver: esto y aquello^^`, yes, "ver"
 *    IS the category; a user who wants a literal leading "ver: " writes
 *    `^^ver:esto^^` or `^^ver : esto^^`.
 *
 * ── Exclusions ──────────────────────────────────────────────────────────────
 *
 * `blankExclusions` blanks math, code and the ComdTeX special blocks (whose
 * bodies are raw DSL) BEFORE any scan, preserving offsets and line structure so
 * matches found in the blanked text can be sliced out of the original. Nothing
 * inside those regions is ever treated as a mark.
 *
 * The MATH exclusion carries real weight for `^^`: `^` is LaTeX superscript, so
 * `$x^{2^^3}$` (or the plain typo `$x^^2$`) contains a doubled caret that must
 * never be read as a mark. The CODE exclusion matters for the same reason any
 * code sample of this syntax must survive verbatim.
 *
 * Block ids (`^myid` at end of line, `processBlockIds` in transclusion.ts) do
 * NOT collide, and this is load-bearing enough to be worth stating: that
 * matcher is `/\s*\^([\w-]+)\s*$/`, whose `[\w-]+` cannot match a `^`. So a
 * line ending in a keep mark (`… ^^texto^^`) is never read as a block id, and
 * `^^a^^ ^blockid` yields both the mark and the id. Both directions are tested.
 */

export interface KeepMark {
  /** Freeform category (`def`, `duda`, …), or null when the mark has none. */
  category: string | null
  /** The inner text, with the `cat: ` prefix removed and trimmed. */
  text: string
  /** 1-based line the mark starts on. */
  line: number
  /** Character offset of the opening `^^` in the source. */
  index: number
  /** The full matched source, delimiters included. */
  raw: string
}

export interface KeepEntry extends KeepMark {
  filePath: string
  fileName: string
}

export interface KeepFile {
  path: string
  name: string
  content: string
}

/** Category-less marks are grouped under this key. */
export const UNCATEGORIZED = "\x00uncategorized"

// Lazy inner text so a single `^` inside the mark ("2^10", "x^n") still
// matches, and `.` so a mark can't cross a newline. See decisions 1-4 above:
// in particular, do NOT "tighten" this to `[^^\n]*`: that drops any mark whose
// text contains a caret.
const KEEP_MARK_RE = /\^\^(.+?)\^\^/g

// `word: ` prefix. The trailing `\s+` is what disambiguates a category from a
// URL scheme or a bare `a:b`; see decision 5 above.
const CATEGORY_RE = /^([\p{L}\p{N}_-]+):\s+([\s\S]+)$/u

/** ComdTeX-only blocks whose bodies are raw DSL/code; mirrors cmdxFormat.ts. */
const SPECIAL_ENVS = new Set([
  "pseudocode", "flowchart", "truth", "graph", "plot", "commdiag", "code", "excalidraw",
])

const SPECIAL_START_RE = /^:::(?:(?:sm|lg)\s+)?([\w]+)(?:\[[^\]]*\])?(?:\s*\{#[\w:.-]+\})?\s*$/
const SPECIAL_END_RE = /^:::\s*$/

/** Blank every non-newline character, keeping length and line structure. */
function blank(match: string): string {
  return match.replace(/[^\n]/g, " ")
}

/** Blank the bodies of `:::code`, `:::commdiag`, … blocks (raw DSL, not prose). */
function blankSpecialBlocks(text: string): string {
  if (text.indexOf(":::") < 0) return text
  const lines = text.split("\n")
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    if (depth > 0) {
      if (SPECIAL_END_RE.test(lines[i])) {
        depth--
        lines[i] = blank(lines[i])
        continue
      }
      if (SPECIAL_START_RE.test(lines[i])) depth++
      lines[i] = blank(lines[i])
      continue
    }
    const start = SPECIAL_START_RE.exec(lines[i])
    if (start && SPECIAL_ENVS.has(start[1].toLowerCase())) {
      depth = 1
      lines[i] = blank(lines[i])
    }
  }
  return lines.join("\n")
}

/**
 * Blank indented (4-space / tab) code blocks.
 *
 * Deliberately conservative: a run only counts as code when it is preceded by a
 * blank line AND its first line is not a list marker; otherwise indented list
 * content (`- a` ⏎ ⏎ `    - nested`) would be mistaken for code and its marks
 * silently dropped. Over-blanking only ever means "a mark here is not detected",
 * never "code gets mangled", so this errs on the safe side of a false negative.
 */
function blankIndentedCode(text: string): string {
  const lines = text.split("\n")
  let prevBlank = true
  for (let i = 0; i < lines.length; i++) {
    const isIndented = /^(?: {4}|\t)/.test(lines[i]) && lines[i].trim() !== ""
    if (!isIndented) {
      prevBlank = lines[i].trim() === ""
      continue
    }
    if (!prevBlank) continue
    if (/^(?: {4}|\t)\s*(?:[-*+]|\d+[.)])\s/.test(lines[i])) { prevBlank = false; continue }
    // Blank the whole run of indented/blank lines up to the next flush line.
    let j = i
    for (; j < lines.length; j++) {
      if (lines[j].trim() === "") continue
      if (!/^(?: {4}|\t)/.test(lines[j])) break
      lines[j] = blank(lines[j])
    }
    i = j - 1
    prevBlank = false
  }
  return lines.join("\n")
}

/**
 * Return `text` with every region a keep mark must not be parsed in replaced by
 * spaces. Length and newline positions are preserved exactly, so an index in the
 * result addresses the same character in the original.
 *
 * Order matters: fenced code is blanked before inline code (so a ``` line is not
 * then read as a code span), and `$$…$$` before `$…$`.
 */
export function blankExclusions(text: string): string {
  let s = blankSpecialBlocks(text)
  s = s.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, blank)
  s = blankIndentedCode(s)
  s = s.replace(/(`+)([^`\n]*?)\1/g, blank)
  s = s.replace(/\$\$[\s\S]*?\$\$/g, blank)
  s = s.replace(/\$[^$\n]+?\$/g, blank)
  return s
}

function parseInner(inner: string): { category: string | null; text: string } | null {
  const body = inner.trim()
  if (!body) return null // whitespace-only body (`^^ ^^`) is not a mark, per decision 4.
  const cat = CATEGORY_RE.exec(body)
  if (cat) return { category: cat[1].toLowerCase(), text: cat[2].trim() }
  return { category: null, text: body }
}

/** 1-based line number for a character offset. */
function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/**
 * Parse every keep mark in `text`, in document order.
 *
 * Hot path: `renderMarkdown` and the Keep panel both call into this on content
 * that usually has no marks at all, so bail out on a single `indexOf` before
 * paying for the six blanking passes.
 */
export function parseKeepMarks(text: string): KeepMark[] {
  if (text.indexOf("^^") < 0) return []
  const scan = blankExclusions(text)
  const marks: KeepMark[] = []
  KEEP_MARK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = KEEP_MARK_RE.exec(scan)) !== null) {
    // Slice from the ORIGINAL text: `scan` only located the match.
    const raw = text.slice(m.index, m.index + m[0].length)
    const parsed = parseInner(raw.slice(2, -2))
    if (!parsed) continue
    marks.push({ ...parsed, line: lineAt(text, m.index), index: m.index, raw })
  }
  return marks
}

/**
 * Replace every keep mark with its plain inner text: the delimiters and the
 * `cat: ` prefix disappear. This is what makes a mark invisible in the preview
 * and in every export; the result must be indistinguishable from prose that was
 * never marked.
 */
export function stripKeepMarks(text: string): string {
  if (text.indexOf("^^") < 0) return text
  const scan = blankExclusions(text)
  const out: string[] = []
  let cursor = 0
  KEEP_MARK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = KEEP_MARK_RE.exec(scan)) !== null) {
    const raw = text.slice(m.index, m.index + m[0].length)
    const parsed = parseInner(raw.slice(2, -2))
    if (!parsed) continue
    out.push(text.slice(cursor, m.index), parsed.text)
    cursor = m.index + m[0].length
  }
  if (cursor === 0) return text
  out.push(text.slice(cursor))
  return out.join("")
}

/** Collect the marks of every file, in file order then document order. */
export function scanVaultKeepMarks(files: KeepFile[]): KeepEntry[] {
  const entries: KeepEntry[] = []
  for (const file of files) {
    for (const mark of parseKeepMarks(file.content)) {
      entries.push({ ...mark, filePath: file.path, fileName: file.name })
    }
  }
  return entries
}

/** Group entries by category, preserving first-seen order within each group. */
export function groupByCategory(entries: KeepEntry[]): Map<string, KeepEntry[]> {
  const groups = new Map<string, KeepEntry[]>()
  for (const entry of entries) {
    const key = entry.category ?? UNCATEGORIZED
    const bucket = groups.get(key)
    if (bucket) bucket.push(entry)
    else groups.set(key, [entry])
  }
  return groups
}

/** Every distinct category present, sorted; uncategorized (if any) goes last. */
export function categoriesOf(entries: KeepEntry[]): string[] {
  const cats = [...new Set(entries.map((e) => e.category).filter((c): c is string => c !== null))]
  cats.sort((a, b) => a.localeCompare(b))
  if (entries.some((e) => e.category === null)) cats.push(UNCATEGORIZED)
  return cats
}

/**
 * Render the collected marks as a standalone Markdown glossary. Written only on
 * demand (the panel's export button): ComdTeX never auto-writes this file; the
 * panel itself is the always-in-sync source of truth.
 */
export function formatGlossary(
  entries: KeepEntry[],
  labels: { title: string; uncategorized: string },
): string {
  const groups = groupByCategory(entries)
  const out: string[] = [`# ${labels.title}`, ""]
  for (const key of categoriesOf(entries)) {
    const bucket = groups.get(key) ?? []
    out.push(`## ${key === UNCATEGORIZED ? labels.uncategorized : key}`, "")
    for (const entry of bucket) {
      out.push(`- ${entry.text} (\`${entry.fileName}:${entry.line}\`)`)
    }
    out.push("")
  }
  return out.join("\n")
}
