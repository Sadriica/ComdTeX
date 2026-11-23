/**
 * CriticMarkup: tracked changes written in plain text.
 *
 *     {++added++}            an addition
 *     {--deleted--}          a deletion
 *     {~~old~>new~~}         a substitution
 *     {>>a comment<<}        a comment
 *     {==highlighted==}      a highlight (optionally followed, with nothing
 *                            in between, by a comment that belongs to it)
 *
 * Everything here is pure text in, text out. The preview (`renderCriticMarks`),
 * the editor commands and the export step all go through the same parser, so
 * a mark means the same thing wherever it is read.
 *
 * ── Atomic regions ──────────────────────────────────────────────────────────
 *
 * Math (`$...$`, `$$...$$`), fenced code, inline code, indented code and the
 * raw-DSL `:::` blocks are ATOMIC (the same regions `keepMarks.exclusionRegions`
 * reports, which mirror what the renderer treats as math or code):
 *
 *  - an opener inside an atomic region is not an opener: a mark is never
 *    parsed inside a formula or a code sample;
 *  - a closer inside an atomic region is not a closer: `{++$a++}$ b++}` is
 *    ONE mark whose text is `$a++}$ b`;
 *  - a formula that sits fully inside a mark is preserved verbatim by every
 *    operation (accept, reject, wrap), so it can never be cut in half;
 *  - editor commands that wrap a selection snap its edges outward to the
 *    edges of any atomic region they cut (`suggestEdit`).
 *
 * ── Malformed input: the rules (none of them ever throws) ──────────────────
 *
 *  1. An opener with no closer of its own kind anywhere after it is plain
 *     text. So is a substitution that has no `~>` before its closer.
 *  2. Marks do NOT nest. The first closer of the same kind wins, so in
 *     `{++a {++b++} c++}` the mark is `{++a {++b++}` (text `a {++b`) and
 *     ` c++}` is plain text. A different kind inside a mark is just text in it:
 *     `{++a {--b--} c++}` is one addition whose text is `a {--b--} c`; accepting
 *     it leaves the inner braces literally in the document.
 *  3. A closer that appears without an opener is plain text.
 *  4. A backslash escapes an opener: `\{++x++}` is not a mark.
 *  5. A mark may span lines and paragraphs, and may be empty (`{++++}`).
 *  6. Scanning is leftmost-first and a mark's closer is the first one found
 *     outside atomic regions, so `{++a+++}` is the text `a+`.
 *  7. A `{>>comment<<}` directly after a highlight is part of the highlight
 *     (its `comment`); a comment anywhere else is a mark of its own.
 *
 * ── Resolving ───────────────────────────────────────────────────────────────
 *
 *   mark          accept            reject
 *   {++x++}       x                 (nothing)
 *   {--x--}       (nothing)         x
 *   {~~a~>b~~}    b                 a
 *   {==x==}{>>c<<}  x               x       (the comment goes with it)
 *   {>>c<<}       (nothing)         (nothing)   (comments are not changes)
 *
 * Resolving removes exactly the mark and leaves the surrounding whitespace
 * alone, so `a {--b--} c` accepts to `a  c`.
 */

import { exclusionRegions } from "./keepMarks"

export type CriticKind = "add" | "del" | "sub" | "comment" | "highlight"
export type CriticAction = "accept" | "reject"

export interface CriticMark {
  kind: CriticKind
  /** Offset of the opening `{`. */
  start: number
  /** Offset just past the closing `}` (including an attached comment). */
  end: number
  /** The exact source of the mark. */
  raw: string
  /** Body of an addition, deletion, highlight or comment. Empty for a substitution. */
  text: string
  /** Substitution only. */
  oldText?: string
  newText?: string
  /** Highlight only: the comment attached right after it. */
  comment?: string
}

interface Def {
  kind: CriticKind
  open: string
  close: string
}

const DEFS: Record<string, Def> = {
  "{++": { kind: "add", open: "{++", close: "++}" },
  "{--": { kind: "del", open: "{--", close: "--}" },
  "{~~": { kind: "sub", open: "{~~", close: "~~}" },
  "{>>": { kind: "comment", open: "{>>", close: "<<}" },
  "{==": { kind: "highlight", open: "{==", close: "==}" },
}

const DEF_BY_KIND: Record<CriticKind, Def> = {
  add: DEFS["{++"],
  del: DEFS["{--"],
  sub: DEFS["{~~"],
  comment: DEFS["{>>"],
  highlight: DEFS["{=="],
}

const QUICK_RE = /\{(?:\+\+|--|~~|>>|==)/

/** True when `text` may contain a mark (a cheap pre-check, no parsing). */
export function hasCriticMarks(text: string): boolean {
  return QUICK_RE.test(text)
}

type Region = [number, number]

function regionAt(regions: Region[], i: number): Region | null {
  let lo = 0
  let hi = regions.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = regions[mid]
    if (i < r[0]) hi = mid - 1
    else if (i >= r[1]) lo = mid + 1
    else return r
  }
  return null
}

/** First `needle` at or after `from` that does not touch an atomic region. */
function findOutside(text: string, needle: string, from: number, regions: Region[]): number {
  let p = from
  for (;;) {
    const k = text.indexOf(needle, p)
    if (k < 0) return -1
    const r = regionAt(regions, k) ?? regionAt(regions, k + needle.length - 1)
    if (!r) return k
    p = Math.max(r[1], k + 1)
  }
}

function isEscaped(text: string, i: number): boolean {
  let n = 0
  for (let j = i - 1; j >= 0 && text.charCodeAt(j) === 92; j--) n++
  return n % 2 === 1
}

/** Every mark in `text`, in document order. Never throws. */
export function parseCriticMarks(text: string): CriticMark[] {
  if (!QUICK_RE.test(text)) return []
  return parseWith(text, exclusionRegions(text))
}

function parseWith(text: string, regions: Region[]): CriticMark[] {
  const marks: CriticMark[] = []
  const n = text.length
  // A closer search that failed from `p` fails from every later point too.
  const failedFrom = new Map<string, number>()
  let i = 0
  while (i < n) {
    const j = text.indexOf("{", i)
    if (j < 0) break
    const def = DEFS[text.slice(j, j + 3)]
    if (!def || regionAt(regions, j) || isEscaped(text, j)) {
      i = j + 1
      continue
    }
    const from = j + 3
    const failed = failedFrom.get(def.close)
    if (failed !== undefined && from >= failed) {
      i = j + 1
      continue
    }
    const c = findOutside(text, def.close, from, regions)
    if (c < 0) {
      failedFrom.set(def.close, from)
      i = j + 1
      continue
    }
    const end = c + 3
    const body = text.slice(from, c)
    let mark: CriticMark
    if (def.kind === "sub") {
      const sep = findOutside(text, "~>", from, regions)
      if (sep < 0 || sep + 2 > c) {
        i = j + 1
        continue
      }
      mark = {
        kind: "sub",
        start: j,
        end,
        raw: text.slice(j, end),
        text: "",
        oldText: text.slice(from, sep),
        newText: text.slice(sep + 2, c),
      }
    } else {
      mark = { kind: def.kind, start: j, end, raw: text.slice(j, end), text: body }
      if (def.kind === "highlight" && text.startsWith("{>>", end)) {
        const cc = findOutside(text, "<<}", end + 3, regions)
        if (cc >= 0) {
          mark.comment = text.slice(end + 3, cc)
          mark.end = cc + 3
          mark.raw = text.slice(j, mark.end)
        }
      }
    }
    marks.push(mark)
    i = mark.end
  }
  return marks
}

/** The source form of a mark built from parts (the inverse of parsing). */
export function serializeMark(
  mark: Pick<CriticMark, "kind" | "text" | "oldText" | "newText" | "comment">,
): string {
  switch (mark.kind) {
    case "add":
      return `{++${mark.text}++}`
    case "del":
      return `{--${mark.text}--}`
    case "sub":
      return `{~~${mark.oldText ?? ""}~>${mark.newText ?? ""}~~}`
    case "comment":
      return `{>>${mark.text}<<}`
    case "highlight":
      return `{==${mark.text}==}` + (mark.comment !== undefined ? `{>>${mark.comment}<<}` : "")
  }
}

/** What a mark leaves in the document once it is resolved. */
export function resolveMark(mark: CriticMark, action: CriticAction): string {
  const accept = action === "accept"
  switch (mark.kind) {
    case "add":
      return accept ? mark.text : ""
    case "del":
      return accept ? "" : mark.text
    case "sub":
      return (accept ? mark.newText : mark.oldText) ?? ""
    case "comment":
      return ""
    case "highlight":
      return mark.text
  }
}

function resolveAll(text: string, action: CriticAction): string {
  const marks = parseCriticMarks(text)
  if (marks.length === 0) return text
  let out = ""
  let cursor = 0
  for (const m of marks) {
    out += text.slice(cursor, m.start) + resolveMark(m, action)
    cursor = m.end
  }
  return out + text.slice(cursor)
}

/** The document as if every change were accepted (comments dropped). */
export function acceptAll(text: string): string {
  return resolveAll(text, "accept")
}

/** The document as if every change were rejected (comments dropped). */
export function rejectAll(text: string): string {
  return resolveAll(text, "reject")
}

/** A text edit: replace `[start, end)` with `text`. */
export interface CriticEdit {
  start: number
  end: number
  text: string
}

/**
 * The mark under `offset` (an offset at its first character or inside it, or
 * just past its last character when nothing else is there), or null.
 */
export function markAt(text: string, offset: number): CriticMark | null {
  const marks = parseCriticMarks(text)
  for (const m of marks) if (offset >= m.start && offset < m.end) return m
  for (const m of marks) if (offset === m.end) return m
  return null
}

/** Resolve the mark at `offset`; null when there is none. */
export function resolveAt(text: string, offset: number, action: CriticAction): CriticEdit | null {
  const m = markAt(text, offset)
  if (!m) return null
  return { start: m.start, end: m.end, text: resolveMark(m, action) }
}

export type SuggestKind = "add" | "del" | "sub" | "comment"

export type SuggestResult =
  | {
      ok: true
      edit: CriticEdit
      /** Selection to set in the document AFTER the edit is applied. */
      selection: { start: number; end: number }
    }
  | { ok: false; reason: "overlap" | "delimiter" }

/**
 * Build the edit that turns the selection `[selStart, selEnd]` into a mark.
 *
 *  - `add`/`del` wrap the selection (empty selection: an empty mark with the
 *    caret inside, ready to type).
 *  - `sub` wraps it as the OLD text with the caret in the (empty) new text.
 *  - `comment` highlights the selection and attaches an empty comment with
 *    the caret in it; with no selection it inserts a lone comment.
 *
 * Selection edges that fall inside math or code snap OUTWARD to the whole
 * region; an empty selection inside one moves to just after it. Fails (never
 * throws) when the selection cuts through an existing mark, or when its text
 * contains the delimiter that would close the new mark early.
 */
export function suggestEdit(
  text: string,
  selStart: number,
  selEnd: number,
  kind: SuggestKind,
): SuggestResult {
  let s = Math.max(0, Math.min(selStart, selEnd, text.length))
  let e = Math.max(0, Math.min(Math.max(selStart, selEnd), text.length))
  const regions = exclusionRegions(text)
  const marks = parseWith(text, regions)

  if (s === e) {
    const r = regions.find((x) => s > x[0] && s < x[1])
    if (r) s = e = r[1]
    if (kind === "comment") {
      const m = marks.find((x) => s > x.start && s < x.end)
      if (m) s = e = m.end
    }
  } else {
    for (const r of regions) {
      if (r[0] < e && s < r[1]) {
        s = Math.min(s, r[0])
        e = Math.max(e, r[1])
      }
    }
  }

  for (const m of marks) {
    const clash = s === e ? s > m.start && s < m.end : m.start < e && s < m.end
    if (clash) return { ok: false, reason: "overlap" }
  }

  const sel = text.slice(s, e)
  const def = DEF_BY_KIND[kind]
  let pre: string
  let post: string
  let caret: [number, number]
  if (kind === "comment") {
    if (sel) {
      pre = "{=="
      post = `==}{>><<}`
      caret = [s + pre.length + sel.length + 6, s + pre.length + sel.length + 6]
    } else {
      pre = "{>>"
      post = "<<}"
      caret = [s + 3, s + 3]
    }
  } else if (kind === "sub") {
    pre = def.open
    post = "~>~~}"
    caret = [s + 3 + sel.length + 2, s + 3 + sel.length + 2]
  } else {
    pre = def.open
    post = def.close
    caret = [s + 3, s + 3 + sel.length]
  }
  if (kind === "sub" && sel.includes("~>")) return { ok: false, reason: "delimiter" }
  const replacement = pre + sel + post
  const next = text.slice(0, s) + replacement + text.slice(e)

  // The new mark must read back exactly as built; otherwise the selection
  // held something (a stray closer) that would end it early.
  const want = kind === "comment" && !sel ? "comment" : kind === "comment" ? "highlight" : kind
  const back = parseCriticMarks(next).find((m) => m.start === s)
  if (!back || back.kind !== want || back.end !== s + replacement.length) {
    return { ok: false, reason: "delimiter" }
  }
  return {
    ok: true,
    edit: { start: s, end: e, text: replacement },
    selection: { start: caret[0], end: caret[1] },
  }
}

// ── Preview ──────────────────────────────────────────────────────────────────

export interface CriticLabels {
  added: string
  deleted: string
  comment: string
  highlight: string
}

const DEFAULT_LABELS: CriticLabels = {
  added: "Added",
  deleted: "Deleted",
  comment: "Comment",
  highlight: "Highlight",
}

/**
 * Entity-encode everything but plain letters, digits and spaces. The result
 * goes inside an HTML attribute that the renderer's later passes still see as
 * text, so `$`, backticks, `@eq:`, `[[`, `frac(` and quotes must not survive.
 */
function attrSafe(s: string): string {
  let out = ""
  for (const ch of s.replace(/\s+/g, " ").trim()) {
    out += /[\p{L}\p{N} ]/u.test(ch) ? ch : `&#${ch.codePointAt(0)};`
  }
  return out
}

/**
 * Split a mark's body at blank lines and wrap each paragraph in its own tag,
 * so the HTML stays valid when a mark spans paragraphs. Atomic block regions
 * (display math, fenced code) inside the body are left outside the tag. The
 * number of lines is unchanged: the preview's source-line sync stays right.
 */
function wrapBody(body: string, open: string, close: string, lineStart = false): string {
  if (body === "") return ""
  const regions = exclusionRegions(body)
  const parts: string[] = []
  let last = 0
  for (const r of regions) {
    if (!body.slice(r[0], r[1]).includes("\n")) continue
    parts.push(body.slice(last, r[0]), "\u0000" + body.slice(r[0], r[1]))
    last = r[1]
  }
  parts.push(body.slice(last))
  const pieces: string[] = []
  for (const part of parts) {
    if (part.startsWith("\u0000")) {
      pieces.push(part.slice(1))
      continue
    }
    const first = pieces.length === 0
    pieces.push(
      part
        .split(/(\n[ \t]*\n)/)
        .map((seg, k) =>
          k % 2 === 1 || seg.trim() === ""
            ? seg
            : wrapSegment(seg, open, close, k > 0 || (first && lineStart)),
        )
        .join(""),
    )
  }
  return pieces.join("")
}

// A list, heading or quote marker opening a mark that starts a line stays
// outside the tag, so `{++## New++}` still renders as a heading.
const BLOCK_PREFIX_RE = /^(?:#{1,6} |[-*+] |\d+[.)] |> )/

function wrapSegment(seg: string, open: string, close: string, lineStart: boolean): string {
  const lead = /^\s*/.exec(seg)![0]
  const trail = /\s*$/.exec(seg)![0]
  let body = seg.slice(lead.length, seg.length - trail.length)
  let prefix = ""
  if (lineStart || lead.includes("\n")) {
    prefix = BLOCK_PREFIX_RE.exec(body)?.[0] ?? ""
    body = body.slice(prefix.length)
  }
  if (body === "") return seg
  return lead + prefix + open + body + close + trail
}

/**
 * Replace every mark with HTML for the preview. Addition and deletion become
 * `<ins>`/`<del>`, a highlight `<mark>`, a comment a focusable marker that
 * carries its text in `data-comment`. The body stays Markdown (it is rendered
 * by the normal pass afterwards, so math inside a mark renders as usual).
 * Meaning never rests on color alone: see `.critic-*` in preview.css.
 */
export function renderCriticMarks(text: string, labels: CriticLabels = DEFAULT_LABELS): string {
  const marks = parseCriticMarks(text)
  if (marks.length === 0) return text
  const comment = (c: string): string => {
    const t = attrSafe(c)
    return `<span class="critic critic-comment" role="note" tabindex="0" data-comment="${t}" aria-label="${labels.comment}: ${t}"><span class="critic-comment-icon" aria-hidden="true"></span></span>`
  }
  let out = ""
  let cursor = 0
  for (const m of marks) {
    out += text.slice(cursor, m.start)
    cursor = m.end
    const ls = m.start === 0 || text[m.start - 1] === "\n"
    switch (m.kind) {
      case "add":
        out += wrapBody(
          m.text,
          `<ins class="critic critic-add" title="${labels.added}">`,
          "</ins>",
          ls,
        )
        break
      case "del":
        out += wrapBody(
          m.text,
          `<del class="critic critic-del" title="${labels.deleted}">`,
          "</del>",
          ls,
        )
        break
      case "sub":
        out +=
          wrapBody(
            m.oldText ?? "",
            `<del class="critic critic-del" title="${labels.deleted}">`,
            "</del>",
            ls,
          ) +
          wrapBody(
            m.newText ?? "",
            `<ins class="critic critic-add" title="${labels.added}">`,
            "</ins>",
          )
        break
      case "comment":
        out += comment(m.text)
        break
      case "highlight":
        out +=
          wrapBody(
            m.text,
            `<mark class="critic critic-highlight" title="${labels.highlight}">`,
            "</mark>",
            ls,
          ) + (m.comment !== undefined ? comment(m.comment) : "")
        break
    }
  }
  return out + text.slice(cursor)
}
