import MarkdownIt from "markdown-it"
import footnotePlugin from "markdown-it-footnote"
import katex from "katex"
import { convertFileSrc } from "@tauri-apps/api/core"
import { preprocess } from "./preprocessor"
import { extractEnvironments, prescanEnvironmentLabels, resetEnvCounters, resolveEnvironmentRefs } from "./environments"
import { processWikilinks } from "./wikilinks"
import type { KatexMacros } from "./macros"
import { resetEqCounters, nextEqNumber, prescanEquations, resolveEqRefs, wrapNumbered } from "./equations"
import { resolveCitations, renderBibliography } from "./bibtex"
import type { BibEntry } from "./bibtex"
import { extractFrontmatter, renderFrontmatterHeader } from "./frontmatter"
import { resetFigCounters, prescanFigures, resolveFigRefs, wrapFigures, preprocessFigureLabels } from "./figures"
import { numberHeadings, resolveSectionRefs } from "./references"
import { prescanTables, resolveTableRefs, wrapTables } from "./tables"
import { resolveTransclusions, type TransclusionResolver } from "./transclusion"

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

  text = text.replace(/\$\$([\s\S]+?)\$\$(?:\s*\{#[\w:.-]+\})?/g, (_, expr) =>
    saveMath(wrapNumbered(renderKatex(expr, true, macros), nextEqNumber()))
  )
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

  let html = renderInner(withRefs, macros)
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
