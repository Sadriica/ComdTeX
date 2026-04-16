import MarkdownIt from "markdown-it"
import footnotePlugin from "markdown-it-footnote"
import katex from "katex"
import { convertFileSrc } from "@tauri-apps/api/core"
import { preprocess } from "./preprocessor"
import { extractEnvironments, resetEnvCounters } from "./environments"
import { processWikilinks } from "./wikilinks"
import type { KatexMacros } from "./macros"
import { resetEqCounters, nextEqNumber, prescanEquations, resolveEqRefs, wrapNumbered } from "./equations"
import { resolveCitations, renderBibliography } from "./bibtex"
import type { BibEntry } from "./bibtex"
import { extractFrontmatter, renderFrontmatterHeader } from "./frontmatter"
import { resetFigCounters, prescanFigures, resolveFigRefs, wrapFigures, preprocessFigureLabels } from "./figures"

const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
  .use(footnotePlugin)
  .enable("table")
  .enable("strikethrough")

// ── Callout preprocessing ─────────────────────────────────────────────────────

const CALLOUT_ICONS: Record<string, string> = {
  note: "ℹ", info: "ℹ", tip: "💡", hint: "💡",
  warning: "⚠", caution: "⚠", attention: "⚠",
  important: "❗", danger: "🔴", failure: "✗", error: "✗",
  success: "✓", check: "✓", done: "✓",
  question: "?", help: "?", faq: "?",
  quote: "❝", cite: "❝",
  // Academic
  theorem: "∎", lemma: "∎", corollary: "∎", proposition: "∎",
  definition: "≝", example: "▶", exercise: "✏", proof: "□",
  remark: "◆", abstract: "◈",
}

/**
 * Convert `> [!TYPE] Optional title\n> content` blockquotes into
 * styled callout divs before markdown rendering.
 *
 * Supports multi-line callout bodies (consecutive `> ` lines).
 */
function preprocessCallouts(text: string): string {
  const lines = text.split("\n")
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    // Detect callout opener: "> [!TYPE]" optionally followed by title
    const opener = /^>\s*\[!([\w]+)\](.*)$/.exec(line)
    if (opener) {
      const type = opener[1].toLowerCase()
      const titleRest = opener[2].trim()
      const icon = CALLOUT_ICONS[type] ?? "◈"
      const defaultTitle = type.charAt(0).toUpperCase() + type.slice(1)
      const title = titleRest || defaultTitle

      // Collect continuation lines
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

// ── Math rendering ────────────────────────────────────────────────────────────

function renderKatex(expr: string, display: boolean, macros: KatexMacros): string {
  try {
    return katex.renderToString(expr.trim(), {
      displayMode: display,
      throwOnError: false,
      macros,
    })
  } catch {
    const safe = expr.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    return `<span class="math-error">${safe}</span>`
  }
}

/** Renders inner environment content (called recursively from environments). */
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

  // Display math — auto-numbered, strip optional {#label}
  text = text.replace(/\$\$([\s\S]+?)\$\$(?:\s*\{#[\w:.-]+\})?/g, (_, expr) =>
    saveMath(wrapNumbered(renderKatex(expr, true, macros), nextEqNumber()))
  )
  // Inline math
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, expr) =>
    saveMath(renderKatex(expr, false, macros))
  )

  let html = md.render(text)

  html = html.replace(/\x02MATH(\d+)\x03/g, (_, i) => mathSlots[parseInt(i)] ?? "")
  html = html.replace(/\x02ENV(\d+)\x03/g,  (_, i) => envSlots[parseInt(i)] ?? "")

  return html
}

// ── Image resolution ──────────────────────────────────────────────────────────

function resolveImages(html: string, vaultPath: string): string {
  return html.replace(
    /<img([^>]*?)\ssrc="([^"]+)"([^>]*?)>/g,
    (match, before, src, after) => {
      if (/^https?:\/\/|^data:|^blob:/.test(src)) return match
      // Extract fig label from title attribute if present
      const figLabelMatch = /title="fig-label:(fig:[\w:.-]+)"/.exec(before + " " + after)
      const dataAttr = figLabelMatch ? ` data-fig-label="${figLabelMatch[1]}"` : ""
      const cleanBefore = before.replace(/\s*title="fig-label:[^"]*"/, "")
      const cleanAfter = after.replace(/\s*title="fig-label:[^"]*"/, "")
      const abs = src.startsWith("/") ? src : `${vaultPath}/${src}`
      return `<img${cleanBefore} src="${convertFileSrc(abs)}"${cleanAfter}${dataAttr}>`
    }
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

export function renderMarkdown(
  raw: string,
  macros: KatexMacros = {},
  vaultPath?: string,
  wikiNames?: Set<string>,
  bibMap?: Map<string, BibEntry>
): string {
  resetEnvCounters()
  resetEqCounters()
  resetFigCounters()

  // Strip frontmatter and render as styled header
  const parsed = extractFrontmatter(raw)
  const content = parsed ? parsed.content : raw
  const frontmatterHtml = parsed ? renderFrontmatterHeader(parsed.data) : ""

  // Preprocess figure labels before any other pass
  const processed = preprocessFigureLabels(content)

  // Prescan for figure labels (for cross-references)
  const figLabels = prescanFigures(content)

  // First pass: build equation label→number map for @eq: cross-references
  const eqLabels = prescanEquations(processed)

  // Resolve cross-references: @eq:label and @fig:label
  let withRefs = wikiNames ? processWikilinks(processed, wikiNames) : processed
  withRefs = resolveEqRefs(withRefs, eqLabels)
  withRefs = resolveFigRefs(withRefs, figLabels)

  // Preprocess checkboxes before markdown rendering
  withRefs = withRefs.split('\n').map((line, i) => {
    if (/^(\s*)-\s\[ \]/.test(line))
      return line.replace(/^(\s*)-\s\[ \]/, `$1- <input type="checkbox" class="preview-checkbox" data-line="${i}">`)
    if (/^(\s*)-\s\[x\]/i.test(line))
      return line.replace(/^(\s*)-\s\[x\]/i, `$1- <input type="checkbox" class="preview-checkbox" data-line="${i}" checked>`)
    return line
  }).join('\n')

  // Preprocess callouts before markdown rendering
  withRefs = preprocessCallouts(withRefs)

  let html = renderInner(withRefs, macros)
  if (vaultPath) html = resolveImages(html, vaultPath)

  // Wrap images in figure blocks with captions and numbers
  html = wrapFigures(html, figLabels)

  // BibTeX citations
  let citedKeys: string[] = []
  if (bibMap) {
    const resolved = resolveCitations(html, bibMap)
    html = resolved.text
    citedKeys = resolved.citedKeys
  }
  const bibHtml = bibMap && citedKeys.length > 0 ? renderBibliography(citedKeys, bibMap) : ""

  return frontmatterHtml + html + bibHtml
}
