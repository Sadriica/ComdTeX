import MarkdownIt from "markdown-it"
import footnotePlugin from "markdown-it-footnote"
import markPlugin from "markdown-it-mark"
import katex from "katex"
// mhchem extension: teaches KaTeX \ce{} so chemistry renders in the preview
// exactly as it will in the LaTeX export (which loads the mhchem package).
import "katex/contrib/mhchem"
import { convertFileSrc } from "@tauri-apps/api/core"
import { preprocess } from "./preprocessor"
import {
  extractEnvironments,
  prescanEnvironmentLabels,
  resetEnvCounters,
  resolveEnvironmentRefs,
  type EnvironmentDocResolver,
} from "./environments"
import { processWikilinks } from "./wikilinks"
import type { KatexMacros } from "./macros"
import {
  resetEqCounters,
  prescanEquations,
  resolveEqRefs,
  wrapNumbered,
  wrapInlineNumbered,
  NUMBERED_MATH_RE,
} from "./equations"
import { resolveCitations, renderBibliography } from "./bibtex"
import { resolveImagePath } from "./imagePaths"
import { resolveDocLanguage, withDocLanguage, type DocLang } from "./docLang"
import type { BibEntry } from "./bibtex"
import { extractFrontmatter, renderFrontmatterHeader } from "./frontmatter"
import {
  resetFigCounters,
  prescanFigures,
  resolveFigRefs,
  wrapFigures,
  preprocessFigureLabels,
} from "./figures"
import { numberHeadings, resolveSectionRefs, SECTION_ID_MARKER_RE } from "./references"
import { slugifyHeading } from "./toc"
import { prescanTables, resolveTableRefs, wrapTables } from "./tables"
import { processBlockIds, attachBlockIds, type TransclusionResolver } from "./transclusion"
import { resolveDocumentContent } from "./documentResolve"
import { stripKeepMarks } from "./keepMarks"
import { pickCiteStyle } from "./citeStyles"
import { highlightCode } from "./syntaxHighlight"

// `breaks`: a single newline inside a paragraph is a line break, as the preview
// has always shown it (it used to be `white-space: pre-wrap` in CSS, which also
// kept runs of spaces and broke normal typesetting). `highlight` returns the
// inner HTML of a known language or "", which keeps markdown-it's plain
// escaped output.
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight: (code, lang) => highlightCode(code, lang) ?? "",
})
  .use(footnotePlugin)
  .use(markPlugin)
  .enable("table")
  .enable("strikethrough")

// Callout type → icon key. The key is emitted as `data-icon` on an empty span;
// styles/components/callout-icons.css draws the matching Lucide icon with a
// CSS mask (currentColor), so no glyph or emoji is baked into the HTML.
const CALLOUT_ICONS: Record<string, string> = {
  note: "info",
  info: "info",
  tip: "tip",
  hint: "tip",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  important: "important",
  danger: "danger",
  failure: "error",
  error: "error",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  quote: "quote",
  cite: "quote",
  theorem: "theorem",
  lemma: "theorem",
  corollary: "theorem",
  proposition: "theorem",
  definition: "definition",
  example: "example",
  exercise: "exercise",
  proof: "proof",
  remark: "remark",
  abstract: "abstract",
}

function preprocessCallouts(text: string): string {
  const lines = text.split("\n")
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const opener = /^>\s*\[!([\w-]+)\][+-]?(.*)$/.exec(line)
    if (opener) {
      const type = opener[1].toLowerCase()
      const titleRest = opener[2].trim()
      const icon = CALLOUT_ICONS[type] ?? "abstract"
      const defaultTitle = type.charAt(0).toUpperCase() + type.slice(1)
      const title = titleRest || defaultTitle

      const bodyLines: string[] = []
      i++
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      const body = bodyLines.join("\n")

      out.push(
        `<div class="callout callout-${type}">` +
          `<div class="callout-title"><span class="callout-icon" data-icon="${icon}" aria-hidden="true"></span> ${escHtml(title)}</div>` +
          `<div class="callout-body">\n\n${body}\n\n</div></div>`,
      )
    } else {
      out.push(line)
      i++
    }
  }

  return out.join("\n")
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// KaTeX render cache. `katex.renderToString` is one of the most expensive
// per-call operations in the whole pipeline, and the live preview re-runs the
// ENTIRE document render on every edit; without this, every equation was
// re-rendered from scratch on each keystroke, the dominant cost in a math-heavy
// document. Cached by (displayMode, source); editing one equation now only
// re-renders that one. (Mirrors the Mermaid/Excalidraw SVG caches.)
const katexCache = new Map<string, string>()
let katexCacheMacrosRef: KatexMacros | null = null
const KATEX_CACHE_MAX = 5000

// Macros change rarely (only when `macros.md` is saved → a new object from
// `setMacros`). Reference equality is a cheap, correct invalidation signal:
// clear the cache when a different macros object is rendered with.
function syncKatexCacheMacros(macros: KatexMacros): void {
  if (macros !== katexCacheMacrosRef) {
    katexCache.clear()
    katexCacheMacrosRef = macros
  }
}

function renderKatex(expr: string, display: boolean, macros: KatexMacros): string {
  syncKatexCacheMacros(macros)
  const trimmed = expr.trim()
  const key = (display ? "D\x00" : "I\x00") + trimmed
  const cached = katexCache.get(key)
  if (cached !== undefined) return cached

  let result: string
  try {
    const rendered = katex.renderToString(trimmed, {
      displayMode: display,
      throwOnError: false,
      macros,
    })
    result = `<span class="katex-wrapper" data-expr="${encodeURIComponent(trimmed)}">${rendered}</span>`
  } catch {
    const safe = trimmed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    result = `<span class="math-error">${safe}</span>`
  }

  // Evict oldest-first instead of clearing: a Map preserves insertion order,
  // and clearing threw away entries inserted earlier in the SAME render, so
  // crossing the cap degraded exactly the heaviest documents to no cache.
  if (katexCache.size >= KATEX_CACHE_MAX) {
    const oldest = katexCache.keys().next()
    if (!oldest.done) katexCache.delete(oldest.value)
  }
  katexCache.set(key, result)
  return result
}

/**
 * Pre-render display math (`$$ ... $$ {#label}?`) blocks in textual order.
 *
 * Returns the text with each display block replaced by a `\x02DMATH<n>\x03`
 * placeholder, plus an array of pre-rendered HTML strings indexed by `<n>`.
 *
 * This MUST run before `renderInner` (and therefore before
 * `extractEnvironments`) so that equation numbering follows the document's
 * textual order rather than the recursive render order. Otherwise math inside
 * a `:::theorem:::` block would be numbered before math that textually
 * precedes it, and the `(N)` rendered next to the equation would not match
 * the `(N)` produced by `@eq:label` references (which use prescan order).
 *
 * Also strips the `{#label}` annotation here so it never leaks to the output.
 */
function preRenderDisplayMath(
  text: string,
  macros: KatexMacros,
): { text: string; slots: string[] } {
  const slots: string[] = []
  let n = 0

  // Mask inline-code spans before scanning so that `$$...$$` or `$..$ {#eq:..}`
  // appearing inside backticks (e.g. documentation about the syntax itself) is
  // NOT treated as numbered math. We mask with whitespace of identical length
  // so positions are preserved, then re-overlay the original code spans.
  // Also blank fenced code blocks (length-preserving, so byte offsets into the
  // ORIGINAL text stay valid) BEFORE scanning. Without this, `$$...$$` inside a
  // ``` fence is counted here and KaTeX-rendered, while prescanEquations (which
  // strips fences) excludes it, so the visible (N) desyncs from what every
  // `@eq:` reference resolves to, and math renders inside what should be a
  // literal code listing. Mirror equations.ts stripCodeFences' fence pattern.
  const codeSpans: Array<{ start: number; end: number; text: string }> = []
  const fenceBlanked = text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, (m) =>
    " ".repeat(m.length),
  )
  const masked = fenceBlanked.replace(/(`+)([^`\n]*?)\1/g, (m, _t, _c, offset: number) => {
    codeSpans.push({ start: offset, end: offset + m.length, text: m })
    return " ".repeat(m.length)
  })

  // Walk the masked text, building a result where matched math is replaced
  // with placeholders and surrounding (masked) text is replaced with the
  // ORIGINAL text from the same byte range, restoring inline code spans.
  const out: string[] = []
  let cursor = 0
  NUMBERED_MATH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUMBERED_MATH_RE.exec(masked)) !== null) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index))
    n++
    const isDisplay = m[1] !== undefined
    const expr = isDisplay ? m[1] : m[3]
    const rendered = renderKatex(expr, isDisplay, macros)
    const html = isDisplay ? wrapNumbered(rendered, n) : wrapInlineNumbered(rendered, n)
    slots.push(html)
    out.push(`\x02DMATH${slots.length - 1}\x03`)
    cursor = m.index + m[0].length
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  // Re-overlay was implicit: slices were taken from the ORIGINAL `text`, so
  // backticked content is preserved automatically.
  void codeSpans
  return { text: out.join(""), slots }
}

function renderInner(raw: string, macros: KatexMacros, rootSource?: string): string {
  let text = preprocess(raw)

  // Pass the editor's raw text down so env source-lines can be resolved against
  // the original document: preprocessCallouts and preRenderDisplayMath collapse
  // multi-line constructs to placeholders, which would otherwise misalign lines.
  const sourceForLines = rootSource ?? raw
  const { text: withEnvs, slots: envSlots } = extractEnvironments(
    text,
    (inner) => renderInner(inner, macros),
    sourceForLines,
  )
  text = withEnvs

  const mathSlots: string[] = []
  const saveMath = (rendered: string) => {
    mathSlots.push(rendered)
    return `\x02MATH${mathSlots.length - 1}\x03`
  }

  // Display math is pre-rendered before `renderInner` is called and survives
  // here as `\x02DMATH<n>\x03` placeholders. Only inline math is processed.
  // Skip `$..$` that appears inside an inline-code span (`...`) so docs that
  // talk about math syntax don't render as actual math.
  text = text.replace(/(`+)([^`\n]*?)\1|\$([^\$\n]+?)\$/g, (full, _t, _c, expr) => {
    if (expr === undefined) return full
    return saveMath(renderKatex(expr, false, macros))
  })

  text = preserveParagraphIndentationSource(text)
  let html = md.render(text)
  html = preserveParagraphIndentation(html)
  html = unwrapBlockSlots(html)

  html = html.replace(/\x02MATH(\d+)\x03/g, (_, i) => mathSlots[parseInt(i)] ?? "")
  html = html.replace(/\x02ENV(\d+)\x03/g, (_, i) => envSlots[parseInt(i)] ?? "")

  return html
}

// Environments and display equations are block-level, but they travel through
// markdown-it as placeholders inside ordinary paragraphs. Left there, the HTML
// parser would close the paragraph around each one and leave empty paragraphs,
// bare text nodes and (with the `breaks` option) stray <br> elements. So a
// paragraph that holds a block placeholder is split at it: the text on either
// side becomes a paragraph of its own and the placeholder stands alone.
const BLOCK_SLOT = "\\x02(?:ENV|DMATH)\\d+\\x03"
const HAS_BLOCK_SLOT_RE = new RegExp(BLOCK_SLOT)
const SPLIT_AT_BLOCK_SLOT_RE = new RegExp(`(${BLOCK_SLOT})`)
const EDGE_BREAKS_RE = /^(?:\s|<br>)+|(?:\s|<br>)+$/g

function unwrapBlockSlots(html: string): string {
  if (html.indexOf("\x02") < 0) return html
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (match, body: string) => {
    if (!HAS_BLOCK_SLOT_RE.test(body)) return match
    return body
      .split(SPLIT_AT_BLOCK_SLOT_RE)
      .map((part, i) => {
        if (i % 2 === 1) return part
        const text = part.replace(EDGE_BREAKS_RE, "")
        return text ? `<p>${text}</p>` : ""
      })
      .join("\n")
  })
}

function preserveParagraphIndentation(html: string): string {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (match, body: string) => {
    const next = body.replace(/\n([ \t]+)(?=\S)/g, (_m, indent: string) => {
      const spaces = indent.replace(/\t/g, "    ").length
      return `\n<span class="md-soft-indent" aria-hidden="true">${"&nbsp;".repeat(spaces)}</span>`
    })
    return next === body ? match : `<p>${next}</p>`
  })
}

function preserveParagraphIndentationSource(text: string): string {
  const lines = text.split("\n")
  let inFence = false
  // A list item and everything indented under it up to the next blank line is
  // structure (nesting, continuation), not paragraph indentation to preserve.
  let inList = false
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (!inFence) {
      if (trimmed === "") inList = false
      else if (/^([-*+]|\d{1,9}[.)])\s/.test(trimmed)) inList = true
    }
    if (inFence || inList || i === 0 || lines[i - 1].trim() === "") continue
    const match = /^([ \t]{2,})(?=\S)/.exec(lines[i])
    if (!match) continue
    const spaces = match[1].replace(/\t/g, "    ").length
    lines[i] =
      `<span class="md-soft-indent" aria-hidden="true">${"&nbsp;".repeat(spaces)}</span>` +
      lines[i].slice(match[1].length)
  }
  return lines.join("\n")
}

function safeDecode(src: string): string {
  try {
    return decodeURI(src)
  } catch {
    return src
  }
}

function resolveImages(
  html: string,
  vaultPath: string,
  docPath?: string,
  fileExists?: (absPath: string) => boolean,
): string {
  return html.replace(/<img([^>]*?)\ssrc="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
    if (/^https?:\/\/|^data:|^blob:/.test(src)) return match
    const figLabelMatch = /title="fig-label:(fig:[\w:.-]+)"/.exec(before + " " + after)
    const dataAttr = figLabelMatch ? ` data-fig-label="${figLabelMatch[1]}"` : ""
    const cleanBefore = before.replace(/\s*title="fig-label:[^"]*"/, "")
    const cleanAfter = after.replace(/\s*title="fig-label:[^"]*"/, "")
    // The document's own folder first, then the vault root (imagePaths.ts).
    const abs = resolveImagePath(safeDecode(src), docPath, vaultPath, fileExists) ?? src
    return `<img${cleanBefore} src="${convertFileSrc(abs)}"${cleanAfter}${dataAttr}>`
  })
}

// ── Source-line annotation (preview ↔ editor sync) ──────────────────────────

const SOURCE_KEY_LEN = 40

/** Strip markdown noise so a line's first 40 chars match its rendered text. */
function normalizeSourceKey(s: string): string {
  return (
    s
      // List bullets and task-list markers
      .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, "")
      // Blockquote markers (also "> [!callout]")
      .replace(/^\s*>+\s*(?:\[![\w]+\]\s*)?/, "")
      // Heading markers
      .replace(/^\s*#{1,6}\s+/, "")
      // Table row leading pipe + cell separators
      .replace(/^\s*\|\s*/, "")
      // Common markdown emphasis / wikilink delimiters
      .replace(/[*_`~|]+/g, "")
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_m, t, l) => l ?? t)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, SOURCE_KEY_LEN)
  )
}

/**
 * Build a map from `key → line[]` for lines in `raw` that can plausibly be
 * the source of a rendered block. `key` is the first ~40 chars of the line's
 * non-markup text. Multiple source lines can share a key; we keep them all
 * and consume them in order during annotation so repeated content (e.g. a
 * list of "TODO") still maps each `<li>` to its own source line.
 */
// The map is read-only for callers (annotation tracks its own `consumed`
// counts), and the preview commits the same `raw` twice whenever the split
// pane is open. One entry is enough: consecutive commits share their text.
let lastLineMapRaw: string | null = null
let lastLineMap: Map<string, number[]> = new Map()

export function buildParagraphLineMap(raw: string): Map<string, number[]> {
  if (raw === lastLineMapRaw) return lastLineMap
  const map = new Map<string, number[]>()
  const lines = raw.split("\n")
  let inFence = false
  let inFrontmatter = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    // Toggle fenced code blocks. Content inside a fence is deliberately NOT
    // indexed (code text must not shadow prose keys), but we do record the
    // fence's first non-empty content line so the rendered `<pre>` can be
    // annotated: `elementTextKey` keys a `<pre>` by exactly that line.
    if (/^```/.test(trimmed)) {
      if (!inFence) {
        for (let j = i + 1; j < lines.length && !/^```/.test(lines[j].trim()); j++) {
          if (!lines[j].trim()) continue
          const fenceKey = normalizeSourceKey(lines[j].trim())
          if (fenceKey) {
            const prev = map.get(fenceKey)
            if (prev) prev.push(j + 1)
            else map.set(fenceKey, [j + 1])
          }
          break
        }
      }
      inFence = !inFence
      continue
    }
    if (inFence) continue
    // Toggle YAML frontmatter (only at very top)
    if (i === 0 && trimmed === "---") {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      if (trimmed === "---") inFrontmatter = false
      continue
    }
    if (!trimmed) continue
    // Skip equation/env delimiters and standalone math
    if (/^:::/.test(trimmed)) continue
    if (/^\$\$/.test(trimmed) && !/[^$]/.test(trimmed.replace(/\$\$/g, ""))) continue
    // Skip table separator rows
    if (/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?$/.test(trimmed)) continue

    const key = normalizeSourceKey(trimmed)
    if (!key) continue
    const existing = map.get(key)
    // Store as 1-indexed lines (Monaco convention)
    if (existing) existing.push(i + 1)
    else map.set(key, [i + 1])
  }
  lastLineMapRaw = raw
  lastLineMap = map
  return map
}

const ANNOTATABLE_SELECTOR =
  "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, figure.tbl-block, div.callout, div.env-wrap"

/**
 * Walk the rendered HTML and add `data-source-line="N"` to block elements
 * (headings, paragraphs, list items, blockquotes, table figures, callouts)
 * whose text content matches a source line in `raw`. Used by the preview
 * pane click handler to jump the editor to the corresponding line.
 */
export function annotateSourceLines(html: string, raw: string): string {
  if (typeof DOMParser === "undefined") return html
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html")
  const root = doc.getElementById("root")
  if (!root) return html
  annotateSourceLinesIn(root, raw)
  return root.innerHTML
}

/**
 * Same as `annotateSourceLines`, but operates IN PLACE on an already-parsed
 * DOM subtree (element or fragment); no HTML parse, no re-serialize. This is
 * the hot-path variant: the preview pipeline calls it on the DocumentFragment
 * DOMPurify already produced, so the (potentially multi-MB, KaTeX-heavy)
 * document HTML is parsed exactly once per render instead of three times.
 */
export function annotateSourceLinesIn(root: ParentNode, raw: string): void {
  const entries = buildSignatureEntries(raw)
  if (entries.length === 0) return
  // Rendered blocks come out in source order, so matching walks the source
  // lines with a pointer that only moves forward: a repeated sentence maps to
  // its own occurrence, and one unmatched block (a transclusion, a generated
  // caption) never drags the rest of the document onto wrong lines.
  let next = 0
  const targets = [...root.querySelectorAll(ANNOTATABLE_SELECTOR)] as HTMLElement[]
  for (const el of targets) {
    // Not body text: the frontmatter header, the bibliography, footnotes.
    if (el.closest(".frontmatter-header, .bibliography, .footnotes")) continue
    const own = el.getAttribute("data-source-line")
    if (own !== null) {
      // Pre-annotated by the renderer (environments): resync the pointer.
      const line = Number(own)
      while (next < entries.length && entries[next].line <= line) next++
      continue
    }
    const sig = elementSignature(el)
    if (!sig) continue
    // A paragraph inside an already annotated list item or quote shares its
    // first line: reuse the parent's line instead of consuming another one.
    if (el.tagName === "P") {
      const parent = el.parentElement
      const parentLine = parent?.matches("li, blockquote")
        ? parent.getAttribute("data-source-line")
        : null
      if (parentLine !== null && parentLine !== undefined && parent?.firstElementChild === el) {
        el.setAttribute("data-source-line", parentLine)
        continue
      }
    }
    const end = Math.min(entries.length, next + MATCH_WINDOW)
    for (let i = next; i < end; i++) {
      if (signaturesMatch(entries[i].sig, sig)) {
        el.setAttribute("data-source-line", String(entries[i].line))
        next = i + 1
        break
      }
    }
  }
}

/** How far ahead (in indexed source lines) a block may match. */
const MATCH_WINDOW = 400
const SIGNATURE_LEN = 32
const MIN_PREFIX = 4

interface SignatureEntry {
  line: number
  sig: string
}

/**
 * A line's or block's comparable text: letters and digits only, lowercased,
 * with everything the preview renders differently from the source removed
 * (math, citations, cross-references, labels, footnote marks, markup).
 */
function signature(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, SIGNATURE_LEN)
}

function sourceSignature(line: string): string {
  const prose = line
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, "")
    .replace(/^\s*>+\s*(?:\[![\w-]+\][+-]?\s*)?/, "")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/\{#[^}\s]+\}/g, "")
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, "")
    .replace(/\$\$/g, "")
    .replace(/\[(?:[^\]]*?)@[\w:.-]+[^\]]*\]/g, "")
    .replace(/@\[[^\]]+\]@[\w]+:[\w.-]+|@[\w./-]+@[\w]+:[\w.-]+|@[a-z]+:[\w.-]*\w/gi, "")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_m, t, l) => l ?? t)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
  return signature(prose)
}

/** Ordered source lines that can start a rendered block, with signatures. */
function buildSignatureEntries(raw: string): SignatureEntry[] {
  if (raw === lastEntriesRaw) return lastEntries
  const out: SignatureEntry[] = []
  const lines = raw.split("\n")
  let inFence = false
  let fenceFirstPending = false
  let inFrontmatter = false
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence
      fenceFirstPending = inFence
      continue
    }
    if (inFence) {
      // A code block is keyed by its first content line, like the <pre>.
      if (fenceFirstPending && trimmed) {
        const sig = signature(trimmed)
        if (sig) out.push({ line: i + 1, sig })
        fenceFirstPending = false
      }
      continue
    }
    if (i === 0 && trimmed === "---") {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      if (trimmed === "---") inFrontmatter = false
      continue
    }
    if (!trimmed || /^:::/.test(trimmed)) continue
    if (/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?$/.test(trimmed)) continue
    const sig = sourceSignature(trimmed)
    if (sig) out.push({ line: i + 1, sig })
  }
  lastEntriesRaw = raw
  lastEntries = out
  return out
}
let lastEntriesRaw: string | null = null
let lastEntries: SignatureEntry[] = []

/** Rendered parts that do not exist as such in the source line. */
const NOT_SOURCE_TEXT =
  ".katex, .katex-display, .eq-ref, .eq-ref-broken, .env-ref, .env-ref-broken, .fig-ref, " +
  ".fig-ref-broken, .xref, .xref-broken, .cite-ref, .cite-broken, sup, .footnote-ref, " +
  ".sec-num, .callout-icon, .math-env-qed, .callout-title"

function elementSignature(el: Element): string {
  if (el.tagName.toLowerCase() === "pre") {
    const first = (el.textContent ?? "").split("\n").find((l) => l.trim() !== "")
    return first ? signature(first) : ""
  }
  const clone = el.cloneNode(true) as Element
  for (const n of clone.querySelectorAll(NOT_SOURCE_TEXT)) n.remove()
  return signature(clone.textContent ?? "")
}

/**
 * Same block? A source line is often only the first line of a paragraph, so
 * one signature may be a prefix of the other (both truncated to the same
 * length), as long as the shorter one says enough to be specific.
 */
function signaturesMatch(source: string, rendered: string): boolean {
  if (source === rendered) return true
  const shorter = source.length <= rendered.length ? source : rendered
  const longer = shorter === source ? rendered : source
  return shorter.length >= MIN_PREFIX && longer.startsWith(shorter)
}

// A standalone `[[toc]]` or `[toc]` line (case-insensitive) → auto TOC.
const TOC_MARKER_RE = /^[ \t]*\[\[?toc\]\]?[ \t]*$/gim
// Placeholder the marker becomes before markdown-it runs; swapped for the
// generated TOC after rendering. Same control-char scheme as the math/code
// placeholders elsewhere in this file.
const TOC_PLACEHOLDER = "\x02TOC\x03"

/**
 * Expand the `[[toc]]` placeholder into an auto-generated table of contents and
 * give the h1–h3 headings stable `id`s so the TOC links navigate to them.
 *
 * Both the ids and the TOC links are derived from the SAME rendered headings
 * (slug of each heading's own visible text, de-numbered, with collisions
 * suffixed), so they can never desync. Headings that live inside code blocks
 * are not `<h*>` elements and so are correctly excluded; Setext headings,
 * blockquote headings, etc. are all handled because we read the real DOM output
 * rather than re-scanning the markdown source.
 */
interface HeadingItem {
  level: number
  text: string
  slug: string
}

/**
 * Stamp the explicit `{#sec:label}` ids carried through markdown-it by
 * `numberHeadings` onto their rendered `<h*>` element. Runs for every document,
 * so `@sec:` links work with or without a `[[toc]]`.
 */
/**
 * The auto-number prefix `numberHeadings` writes ("1.2 Title") gets its own
 * span so the preview can align and style it. The text is unchanged: the
 * space after the span stays, and every reader of `textContent` (source-line
 * keys, heading ids, the outline) sees "1.2 Title" as before.
 */
function wrapSectionNumbers(html: string): string {
  return html.replace(
    /<h([1-3])(\b[^>]*)>(\d+(?:\.\d+)*) /g,
    (_m, lvl: string, attrs: string, num: string) =>
      `<h${lvl}${attrs}><span class="sec-num">${num}</span> `,
  )
}

function attachSectionIds(html: string): string {
  // No marker, nothing to attach: skip two full-document regex scans.
  if (html.indexOf("\x02SECID:") < 0) return html
  const out = html.replace(/<h([1-6])(\b[^>]*?)>([\s\S]*?)<\/h\1>/g, (full, lvl, attrs, inner) => {
    const marker = SECTION_ID_MARKER_RE.exec(inner)
    if (!marker) return full
    const cleaned = inner.replace(SECTION_ID_MARKER_RE, "").replace(/\s+$/, "")
    if (/\sid=/.test(attrs)) return `<h${lvl}${attrs}>${cleaned}</h${lvl}>`
    return `<h${lvl}${attrs} id="${marker[1]}">${cleaned}</h${lvl}>`
  })
  // Drop any stray marker (e.g. a heading written inside a code sample, which
  // `numberHeadings` also rewrites) so control chars never reach the output.
  return out.replace(/\x02SECID:[\w:.-]+\x03/g, "")
}

/**
 * Give every h1–h3 a stable `id` and collect them for the TOC. Headings that
 * already carry an explicit id (from `attachSectionIds`) keep it, and the TOC
 * links to that same id; the two can never desync.
 */
function assignHeadingIds(html: string): { html: string; items: HeadingItem[] } {
  const used = new Set<string>()
  const items: HeadingItem[] = []

  const withIds = html.replace(
    /<h([1-3])(\b[^>]*?)>([\s\S]*?)<\/h\1>/g,
    (full, lvl, attrs, inner) => {
      // Visible text only: drop nested markup and the auto-number prefix ("1.2 ").
      const text = inner
        .replace(/<[^>]+>/g, "")
        .replace(/^\s*\d+(?:\.\d+)*\s+/, "")
        .trim()
      if (!text) return full

      const existing = /\sid="([^"]+)"/.exec(attrs)
      if (existing) {
        used.add(existing[1])
        items.push({ level: Number(lvl), text, slug: existing[1] })
        return full
      }

      let slug = slugifyHeading(text) || "section"
      if (used.has(slug)) {
        let k = 2
        while (used.has(`${slug}-${k}`)) k++
        slug = `${slug}-${k}`
      }
      used.add(slug)
      items.push({ level: Number(lvl), text, slug })
      return `<h${lvl}${attrs} id="${slug}">${inner}</h${lvl}>`
    },
  )

  return { html: withIds, items }
}

function injectToc(html: string, items: HeadingItem[]): string {
  if (!html.includes(TOC_PLACEHOLDER)) return html

  // `text` is already HTML-escaped (it came out of rendered HTML), so it is
  // safe to drop straight into the link.
  const toc = items.length
    ? `<nav class="md-toc"><ul>${items
        .map((it) => `<li class="toc-l${it.level}"><a href="#${it.slug}">${it.text}</a></li>`)
        .join("")}</ul></nav>`
    : ""

  return html
    .replace(new RegExp(`<p>${TOC_PLACEHOLDER}</p>`, "g"), toc)
    .replace(new RegExp(TOC_PLACEHOLDER, "g"), toc)
}

/**
 * Replace fenced code blocks and inline-code spans with `\x02CODE<n>\x03`
 * placeholders, returning a `restore` that puts the exact original text back.
 * Unlike `blankInlineCode`/`stripCodeFences` (which destroy content), this
 * preserves the code so it can be masked around a transform pass and restored.
 */
function maskCodeRegions(text: string): { masked: string; restore: (s: string) => string } {
  // Hot path (runs on every render): skip the two regex passes entirely when
  // the document has no code markers at all.
  if (text.indexOf("`") < 0 && text.indexOf("~~~") < 0) {
    return { masked: text, restore: (s) => s }
  }
  const slots: string[] = []
  const stash = (m: string): string => {
    slots.push(m)
    return `\x02CODE${slots.length - 1}\x03`
  }
  // Fenced blocks first (so a ``` line isn't then seen as inline code), then
  // inline-code spans.
  let masked = text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, stash)
  masked = masked.replace(/(`+)([^`\n]*?)\1/g, stash)
  const restore = (s: string): string =>
    s.replace(/\x02CODE(\d+)\x03/g, (_, i) => slots[parseInt(i)] ?? "")
  return { masked, restore }
}

function renderMarkdownImpl(
  raw: string,
  macros: KatexMacros = {},
  vaultPath?: string,
  wikiNames?: Set<string>,
  bibMap?: Map<string, BibEntry>,
  transclusionResolver?: TransclusionResolver,
  envRefResolver?: EnvironmentDocResolver,
  opts?: {
    /**
     * Add `data-source-line` attributes for preview↔editor sync (default true).
     * Costs a full DOMParser parse + innerHTML re-serialize of the rendered
     * document. The preview pipeline passes `false` and instead annotates the
     * sanitized DocumentFragment in place (`annotateSourceLinesIn`), one parse
     * total. Callers that never use the annotations (AI panel, hover cards,
     * copy-as-HTML) also pass `false` to skip the cost outright.
     */
    annotate?: boolean
    /**
     * Vault path of the document being rendered. Relative image paths are read
     * from its folder first, then from the vault root.
     */
    docPath?: string
    /** Sync existence check (forward-slash absolute paths) used to pick between those two. */
    fileExists?: (absPath: string) => boolean
    /**
     * Language of the words the document prints ("Theorem 2", "Figure 1",
     * "References"). The document's own `lang`/`language` frontmatter wins;
     * without either, the interface language (docLang.ts).
     */
    lang?: DocLang
  },
): string {
  resetEnvCounters()
  resetEqCounters()
  resetFigCounters()

  const parsed = extractFrontmatter(raw)
  // `comdtex.citestyle` decides both the in-text marker and the bibliography
  // shape (Vancouver for biomedicine, author-year for astronomy, ...).
  const citeStyle = pickCiteStyle(parsed?.data?.["comdtex.citestyle"])
  let content = parsed ? parsed.content : raw
  // Lines the frontmatter occupied in the editor: checkbox `data-line`s are
  // counted on the stripped text and must point back at editor lines.
  const frontmatterLines = parsed
    ? (raw.slice(0, raw.length - parsed.content.length).match(/\n/g)?.length ?? 0)
    : 0
  const frontmatterHtml = parsed ? renderFrontmatterHeader(parsed.data) : ""

  // Transclusions and `:::csv` selections, resolved exactly as every export
  // path resolves them (documentResolve.ts is the single definition).
  content = resolveDocumentContent(content, transclusionResolver)
  content = processBlockIds(content)

  // Keep marks (`^^texto^^` / `^^def: texto^^`) are invisible outside the
  // editor: collapse them to their plain inner text before anything else looks
  // at the document, so the preview is byte-identical to the same prose written
  // without marks. Runs AFTER transclusion so marks in embedded notes are
  // stripped too. `stripKeepMarks` is math/code-aware and bails on a single
  // `indexOf` when the document has no marks, so this costs nothing on the
  // per-keystroke render path for documents that don't use the feature.
  content = stripKeepMarks(content)

  // Auto-generated table of contents: a standalone `[[toc]]` / `[toc]` line
  // becomes a placeholder now and is expanded into a live list (always in sync
  // with the current headings) after rendering, by `injectToc`.
  // The marker is case-insensitive (`[toc]`, `[TOC]`, `[[Toc]]`), so the
  // guard must be too; it only exists to skip a full-document replace on
  // the documents that have no table of contents, which is most of them.
  if (/\[toc\]/i.test(content)) {
    content = content.replace(TOC_MARKER_RE, () => TOC_PLACEHOLDER)
  }

  const numbered = numberHeadings(content)
  content = numbered.content

  const processed = preprocessFigureLabels(content)
  const figLabels = prescanFigures(content)
  const tableLabels = prescanTables(content)
  const eqLabels = prescanEquations(processed)
  const envLabels = prescanEnvironmentLabels(processed)

  // Mask fenced + inline code before resolving refs/wikilinks so that an
  // `@eq:`, `@fig:`, `[@cite]` or `[[wikilink]]` written *inside a code sample*
  // (common when documenting the syntax itself) is left verbatim instead of
  // being turned into a live link. Restored right after, before markdown-it
  // re-processes the code normally: line structure is preserved.
  const { masked: maskedProcessed, restore: restoreCode } = maskCodeRegions(processed)
  let withRefs = wikiNames ? processWikilinks(maskedProcessed, wikiNames) : maskedProcessed
  withRefs = resolveSectionRefs(withRefs, numbered.sections)
  withRefs = resolveEqRefs(withRefs, eqLabels)
  withRefs = resolveFigRefs(withRefs, figLabels)
  withRefs = resolveTableRefs(withRefs, tableLabels)
  withRefs = resolveEnvironmentRefs(withRefs, envLabels, envRefResolver)
  withRefs = restoreCode(withRefs)

  // Guarded like `maskCodeRegions`: most documents have no task list, and
  // this is a full split/scan/join of the whole document per render.
  if (withRefs.includes("- ["))
    withRefs = withRefs
      .split("\n")
      .map((line, i) => {
        if (/^(\s*)-\s\[ \]/.test(line))
          return line.replace(
            /^(\s*)-\s\[ \]/,
            `$1- <input type="checkbox" class="preview-checkbox" data-line="${i + frontmatterLines}">`,
          )
        if (/^(\s*)-\s\[x\]/i.test(line))
          return line.replace(
            /^(\s*)-\s\[x\]/i,
            `$1- <input type="checkbox" class="preview-checkbox" data-line="${i + frontmatterLines}" checked>`,
          )
        return line
      })
      .join("\n")

  withRefs = preprocessCallouts(withRefs)

  // Pre-render display math in textual order before recursive renderInner so
  // equation numbers match prescan-based references.
  const dmath = preRenderDisplayMath(withRefs, macros)

  let html = renderInner(dmath.text, macros, raw)
  // Restore display-math placeholders left intact through markdown-it and
  // recursive environment extraction.
  html = html.replace(/\x02DMATH(\d+)\x03/g, (_, i) => dmath.slots[parseInt(i)] ?? "")
  if (vaultPath) html = resolveImages(html, vaultPath, opts?.docPath, opts?.fileExists)
  // Footnotes are fully handled by the markdown-it-footnote plugin during
  // md.render (it emits `.footnote-ref` / `.footnotes` markup the preview CSS
  // already styles). No post-pass is needed.

  html = wrapFigures(html, figLabels)
  html = wrapTables(html, tableLabels)

  let citedKeys: string[] = []
  if (bibMap) {
    const resolved = resolveCitations(html, bibMap, citeStyle)
    html = resolved.text
    citedKeys = resolved.citedKeys
  }
  const bibHtml =
    bibMap && citedKeys.length > 0 ? renderBibliography(citedKeys, bibMap, citeStyle) : ""

  // Assign heading ids for navigation (always; `@sec:` anchors must resolve in
  // documents with no TOC), then expand the `[[toc]]` placeholder against them.
  html = attachSectionIds(html)
  html = wrapSectionNumbers(html)
  const headings = assignHeadingIds(html)
  html = injectToc(headings.html, headings.items)

  // Hoist block-id placeholders to their parent elements before sanitizer runs.
  html = attachBlockIds(html)

  // Annotate block elements with their source line for preview ↔ editor sync.
  // Use the original raw input so headings/lists/callouts carry an accurate
  // line number for the click-to-jump handler in the preview pane.
  if (opts?.annotate !== false) html = annotateSourceLines(html, raw)

  return frontmatterHtml + html + bibHtml
}

export function renderMarkdown(...args: Parameters<typeof renderMarkdownImpl>): string {
  const [raw, , , , , , , opts] = args
  const data = raw.startsWith("---") ? extractFrontmatter(raw)?.data : undefined
  return withDocLanguage(resolveDocLanguage(data, opts?.lang), () => renderMarkdownImpl(...args))
}

// Process file includes synchronously - for export use
export function processIncludes(text: string, getFileContent: (path: string) => string): string {
  const lines = text.split("\n")
  const result: string[] = []
  const included = new Set<string>()

  for (const line of lines) {
    const match = /^<<(.+)>>$/.exec(line.trim())
    if (match) {
      const file = match[1].trim()
      if (included.has(file)) {
        result.push(`<!-- already included: ${file} -->`)
        continue
      }
      included.add(file)
      try {
        const content = getFileContent(file)
        const parsed = extractFrontmatter(content)
        const inner = parsed ? parsed.content : content
        result.push(`<!-- include: ${file} -->`)
        result.push(processIncludes(inner, getFileContent))
      } catch {
        result.push(`<!-- include error: ${file} -->`)
      }
    } else {
      result.push(line)
    }
  }
  return result.join("\n")
}
