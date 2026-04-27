import MarkdownIt from "markdown-it"
import footnotePlugin from "markdown-it-footnote"
import katex from "katex"
import { convertFileSrc } from "@tauri-apps/api/core"
import { preprocess } from "./preprocessor"
import { extractEnvironments, prescanEnvironmentLabels, resetEnvCounters, resolveEnvironmentRefs } from "./environments"
import { processWikilinks } from "./wikilinks"
import type { KatexMacros } from "./macros"
import { resetEqCounters, prescanEquations, resolveEqRefs, wrapNumbered, DISPLAY_MATH_RE } from "./equations"
import { resolveCitations, renderBibliography } from "./bibtex"
import type { BibEntry } from "./bibtex"
import { extractFrontmatter, renderFrontmatterHeader } from "./frontmatter"
import { resetFigCounters, prescanFigures, resolveFigRefs, wrapFigures, preprocessFigureLabels } from "./figures"
import { numberHeadings, resolveSectionRefs } from "./references"
import { prescanTables, resolveTableRefs, wrapTables } from "./tables"
import { resolveTransclusions, processBlockIds, attachBlockIds, type TransclusionResolver } from "./transclusion"

const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
  .use(footnotePlugin)
  .enable("table")
  .enable("strikethrough")

const CALLOUT_ICONS: Record<string, string> = {
  note: "ℹ", info: "ℹ", tip: "💡", hint: "💡",
  warning: "⚠", caution: "⚠", attention: "⚠",
  important: "❗", danger: "🔴", failure: "✗", error: "✗",
  success: "✓", check: "✓", done: "✓",
  question: "?", help: "?", faq: "?",
  quote: "❝", cite: "❝",
  theorem: "∎", lemma: "∎", corollary: "∎", proposition: "∎",
  definition: "≝", example: "▶", exercise: "✏", proof: "□",
  remark: "◆", abstract: "◈",
}

function preprocessCallouts(text: string): string {
  const lines = text.split("\n")
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const opener = /^>\s*\[!([\w]+)\](.*)$/.exec(line)
    if (opener) {
      const type = opener[1].toLowerCase()
      const titleRest = opener[2].trim()
      const icon = CALLOUT_ICONS[type] ?? "◈"
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
        `<div class="callout-title"><span class="callout-icon">${icon}</span> ${escHtml(title)}</div>` +
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

function renderKatex(expr: string, display: boolean, macros: KatexMacros): string {
  try {
    const rendered = katex.renderToString(expr.trim(), {
      displayMode: display,
      throwOnError: false,
      macros,
    })
    return `<span class="katex-wrapper" data-expr="${encodeURIComponent(expr.trim())}">${rendered}</span>`
  } catch {
    const safe = expr.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    return `<span class="math-error">${safe}</span>`
  }
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
  DISPLAY_MATH_RE.lastIndex = 0
  const replaced = text.replace(DISPLAY_MATH_RE, (_full, expr: string) => {
    n++
    const html = wrapNumbered(renderKatex(expr, true, macros), n)
    slots.push(html)
    return `\x02DMATH${slots.length - 1}\x03`
  })
  return { text: replaced, slots }
}

function renderInner(raw: string, macros: KatexMacros): string {
  let text = preprocess(raw)

  const { text: withEnvs, slots: envSlots } = extractEnvironments(text, (inner) =>
    renderInner(inner, macros)
  )
  text = withEnvs

  const mathSlots: string[] = []
  const saveMath = (rendered: string) => {
    mathSlots.push(rendered)
    return `\x02MATH${mathSlots.length - 1}\x03`
  }

  // Display math is pre-rendered before `renderInner` is called and survives
  // here as `\x02DMATH<n>\x03` placeholders. Only inline math is processed.
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, expr) =>
    saveMath(renderKatex(expr, false, macros))
  )

  let html = md.render(text)

  html = html.replace(/\x02MATH(\d+)\x03/g, (_, i) => mathSlots[parseInt(i)] ?? "")
  html = html.replace(/\x02ENV(\d+)\x03/g,  (_, i) => envSlots[parseInt(i)] ?? "")

  return html
}

function resolveImages(html: string, vaultPath: string): string {
  return html.replace(
    /<img([^>]*?)\ssrc="([^"]+)"([^>]*?)>/g,
    (match, before, src, after) => {
      if (/^https?:\/\/|^data:|^blob:/.test(src)) return match
      const figLabelMatch = /title="fig-label:(fig:[\w:.-]+)"/.exec(before + " " + after)
      const dataAttr = figLabelMatch ? ` data-fig-label="${figLabelMatch[1]}"` : ""
      const cleanBefore = before.replace(/\s*title="fig-label:[^"]*"/, "")
      const cleanAfter = after.replace(/\s*title="fig-label:[^"]*"/, "")
      const abs = src.startsWith("/") ? src : `${vaultPath}/${src}`
      return `<img${cleanBefore} src="${convertFileSrc(abs)}"${cleanAfter}${dataAttr}>`
    }
  )
}

// ── Source-line annotation (preview ↔ editor sync) ──────────────────────────

const SOURCE_KEY_LEN = 40

/** Strip markdown noise so a line's first 40 chars match its rendered text. */
function normalizeSourceKey(s: string): string {
  return s
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
}

/** Pick the rendered-text key for a DOM element (first 40 chars, normalized). */
function elementTextKey(el: Element): string {
  let text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
  // Strip auto-numbering prefixes from headings: numberHeadings turns
  // `# Intro` → `<h1>1 Intro</h1>` and `## Sub` → `<h2>1.1 Sub</h2>`. The
  // source line is just `Intro`, so peel the leading `N(.N)*` group.
  if (/^h[1-6]$/i.test(el.tagName)) {
    text = text.replace(/^\d+(?:\.\d+)*\s+/, "")
  }
  return text.slice(0, SOURCE_KEY_LEN)
}

/**
 * Build a map from `key → line[]` for lines in `raw` that can plausibly be
 * the source of a rendered block. `key` is the first ~40 chars of the line's
 * non-markup text. Multiple source lines can share a key — we keep them all
 * and consume them in order during annotation so repeated content (e.g. a
 * list of "TODO") still maps each `<li>` to its own source line.
 */
export function buildParagraphLineMap(raw: string): Map<string, number[]> {
  const map = new Map<string, number[]>()
  const lines = raw.split("\n")
  let inFence = false
  let inFrontmatter = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    // Toggle fenced code blocks
    if (/^```/.test(trimmed)) { inFence = !inFence; continue }
    if (inFence) continue
    // Toggle YAML frontmatter (only at very top)
    if (i === 0 && trimmed === "---") { inFrontmatter = true; continue }
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
  return map
}

const ANNOTATABLE_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, blockquote, figure.tbl-block, div.callout"

/**
 * Walk the rendered HTML and add `data-source-line="N"` to block elements
 * (headings, paragraphs, list items, blockquotes, table figures, callouts)
 * whose text content matches a source line in `raw`. Used by the preview
 * pane click handler to jump the editor to the corresponding line.
 */
export function annotateSourceLines(html: string, raw: string): string {
  if (typeof DOMParser === "undefined") return html
  const map = buildParagraphLineMap(raw)
  // Track consumed indices per key so duplicate keys map to distinct lines.
  const consumed = new Map<string, number>()

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html")
  const root = doc.getElementById("root")
  if (!root) return html

  const targets = [...root.querySelectorAll(ANNOTATABLE_SELECTOR)] as HTMLElement[]
  for (const el of targets) {
    if (el.hasAttribute("data-source-line")) continue
    const key = elementTextKey(el)
    if (!key) continue
    const lines = map.get(key)
    if (!lines || lines.length === 0) continue
    const idx = consumed.get(key) ?? 0
    const line = lines[Math.min(idx, lines.length - 1)]
    consumed.set(key, idx + 1)
    el.setAttribute("data-source-line", String(line))
  }

  return root.innerHTML
}

function resolveFootnotes(html: string): string {
  const footnoteRefs: Map<string, string> = new Map()
  let counter = 1

  const withRefs = html.replace(/\[\^([^\]]+)\]/g, (_match, id) => {
    if (!footnoteRefs.has(id)) {
      footnoteRefs.set(id, `fn${counter++}`)
    }
    const fnId = footnoteRefs.get(id) ?? `fn${counter}`
    return `<sup class="footnote-ref"><a href="#fn-${fnId}" id="fnref-${fnId}">[${fnId.replace("fn", "")}]</a></sup>`
  })

  if (footnoteRefs.size === 0) return html

  const footnoteDefs: string[] = []
  footnoteRefs.forEach((fnId, origId) => {
    const content = html.match(new RegExp(`\\[\\^${origId}\\]:\\s*(.+)`))?.[1] || origId
    footnoteDefs.push(`<li id="fn-${fnId}">${content} <a href="#fnref-${fnId}">↩</a></li>`)
  })

  return withRefs + `<ol class="footnotes">${footnoteDefs.join("")}</ol>`
}

export function renderMarkdown(
  raw: string,
  macros: KatexMacros = {},
  vaultPath?: string,
  wikiNames?: Set<string>,
  bibMap?: Map<string, BibEntry>,
  transclusionResolver?: TransclusionResolver,
): string {
  resetEnvCounters()
  resetEqCounters()
  resetFigCounters()

  const parsed = extractFrontmatter(raw)
  let content = parsed ? parsed.content : raw
  const frontmatterHtml = parsed ? renderFrontmatterHeader(parsed.data) : ""

  content = resolveTransclusions(content, transclusionResolver)
  content = processBlockIds(content)
  const numbered = numberHeadings(content)
  content = numbered.content

  const processed = preprocessFigureLabels(content)
  const figLabels = prescanFigures(content)
  const tableLabels = prescanTables(content)
  const eqLabels = prescanEquations(processed)
  const envLabels = prescanEnvironmentLabels(processed)

  let withRefs = wikiNames ? processWikilinks(processed, wikiNames) : processed
  withRefs = resolveSectionRefs(withRefs, numbered.sections)
  withRefs = resolveEqRefs(withRefs, eqLabels)
  withRefs = resolveFigRefs(withRefs, figLabels)
  withRefs = resolveTableRefs(withRefs, tableLabels)
  withRefs = resolveEnvironmentRefs(withRefs, envLabels)

  withRefs = withRefs.split('\n').map((line, i) => {
    if (/^(\s*)-\s\[ \]/.test(line))
      return line.replace(/^(\s*)-\s\[ \]/, `$1- <input type="checkbox" class="preview-checkbox" data-line="${i}">`)
    if (/^(\s*)-\s\[x\]/i.test(line))
      return line.replace(/^(\s*)-\s\[x\]/i, `$1- <input type="checkbox" class="preview-checkbox" data-line="${i}" checked>`)
    return line
  }).join('\n')

  withRefs = preprocessCallouts(withRefs)

  // Pre-render display math in textual order before recursive renderInner so
  // equation numbers match prescan-based references.
  const dmath = preRenderDisplayMath(withRefs, macros)

  let html = renderInner(dmath.text, macros)
  // Restore display-math placeholders left intact through markdown-it and
  // recursive environment extraction.
  html = html.replace(/\x02DMATH(\d+)\x03/g, (_, i) => dmath.slots[parseInt(i)] ?? "")
  if (vaultPath) html = resolveImages(html, vaultPath)
  html = resolveFootnotes(html)

  html = wrapFigures(html, figLabels)
  html = wrapTables(html, tableLabels)

  let citedKeys: string[] = []
  if (bibMap) {
    const resolved = resolveCitations(html, bibMap)
    html = resolved.text
    citedKeys = resolved.citedKeys
  }
  const bibHtml = bibMap && citedKeys.length > 0 ? renderBibliography(citedKeys, bibMap) : ""

  // Hoist block-id placeholders to their parent elements before sanitizer runs.
  html = attachBlockIds(html)

  // Annotate block elements with their source line for preview ↔ editor sync.
  // Use the original raw input so headings/lists/callouts carry an accurate
  // line number for the click-to-jump handler in the preview pane.
  html = annotateSourceLines(html, raw)

  return frontmatterHtml + html + bibHtml
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
