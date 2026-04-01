import MarkdownIt from "markdown-it"
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

const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
  .enable("table")
  .enable("strikethrough")

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

  // Display math — auto-numbered, strip optional {#label} (already resolved in prescan pass)
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

function resolveImages(html: string, vaultPath: string): string {
  return html.replace(
    /<img([^>]*?)\ssrc="([^"]+)"([^>]*?)>/g,
    (match, before, src, after) => {
      if (/^https?:\/\/|^data:|^blob:/.test(src)) return match
      const abs = src.startsWith("/") ? src : `${vaultPath}/${src}`
      return `<img${before} src="${convertFileSrc(abs)}"${after}>`
    }
  )
}

export function renderMarkdown(
  raw: string,
  macros: KatexMacros = {},
  vaultPath?: string,
  wikiNames?: Set<string>,
  bibMap?: Map<string, BibEntry>
): string {
  resetEnvCounters()
  resetEqCounters()

  // Strip frontmatter and render as styled header
  const parsed = extractFrontmatter(raw)
  const content = parsed ? parsed.content : raw
  const frontmatterHtml = parsed ? renderFrontmatterHeader(parsed.data) : ""

  // First pass: build equation label→number map for @eq: cross-references
  const eqLabels = prescanEquations(content)

  // Resolve @eq:label references before markdown (HTML spans pass through html:true)
  const withWikilinks = wikiNames ? processWikilinks(content, wikiNames) : content
  const withEqRefs = resolveEqRefs(withWikilinks, eqLabels)

  let html = renderInner(withEqRefs, macros)
  if (vaultPath) html = resolveImages(html, vaultPath)

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
