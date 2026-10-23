// KaTeX rendering shared by the math hover widget and the label previews in
// the suggest widget. One cache, keyed by source, so a preview that was
// already drawn while the caret sat in a formula costs nothing here.

import katex from "katex"
// mhchem extension: teaches KaTeX \ce{} so chemistry renders in the preview
// exactly as it will in the LaTeX export (which loads the mhchem package).
import "katex/contrib/mhchem"

// Cache hover-widget KaTeX by source, so re-rendering while the caret sits in a
// math block (every cursor move / keystroke fires the handler) is free.
const hoverKatexCache = new Map<string, string | null>()
let hoverKatexCacheMacros: Record<string, string> | null = null

export function renderHoverKatex(
  expr: string,
  displayMode: boolean,
  macros: Record<string, string>,
): string | null {
  if (macros !== hoverKatexCacheMacros) {
    hoverKatexCache.clear()
    hoverKatexCacheMacros = macros
  }
  const key = (displayMode ? "D\x00" : "I\x00") + expr.trim()
  const cached = hoverKatexCache.get(key)
  if (cached !== undefined) return cached
  let html: string | null
  try {
    html = katex.renderToString(expr.trim(), { displayMode, throwOnError: false, macros })
  } catch {
    html = null
  }
  if (hoverKatexCache.size >= 2000) hoverKatexCache.clear()
  hoverKatexCache.set(key, html)
  return html
}

const PREVIEW_CLASS = "comdtex-suggest-math"
const IDLE_MS = 20_000

/** TeX sources whose rendered preview may be shown in the suggest details pane. */
const previewSources = new Set<string>()
let observer: MutationObserver | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** Put the rendered equation at the top of the details pane when it shows a registered source. */
function syncPane(doc: Document, getMacros: () => Record<string, string>): void {
  const pane = doc.querySelector(".suggest-details .docs")
  if (!pane) return
  const code = pane.querySelector(".monaco-tokenized-source")
  const source = code ? normalize(code.textContent ?? "") : ""
  const existing = pane.querySelector(`.${PREVIEW_CLASS}`)
  if (!source || !previewSources.has(source)) {
    existing?.remove()
    return
  }
  if (existing?.getAttribute("data-source") === source) return
  const html = renderHoverKatex(source, true, getMacros())
  if (!html) return
  existing?.remove()
  const box = doc.createElement("div")
  box.className = PREVIEW_CLASS
  box.setAttribute("data-source", source)
  box.style.overflowX = "auto"
  box.style.padding = "4px 0"
  box.innerHTML = html
  pane.insertBefore(box, pane.firstChild)
}

/**
 * Monaco renders suggestion documentation as sanitized Markdown, which strips
 * the inline styles KaTeX needs, and it builds the details pane again for each
 * focused item (and only once the pane is opened). So the rendered equation is
 * drawn into the pane directly: a short-lived observer watches the DOM while
 * label suggestions are in use and re-draws the preview whenever the pane shows
 * a registered source. Best effort: when the pane is not open, the Markdown
 * fallback (the TeX source in a code block) is what is shown.
 */
export function showSuggestPreview(
  source: string,
  getMacros: () => Record<string, string>,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): void {
  if (!doc) return
  previewSources.add(normalize(source))
  if (previewSources.size > 500) previewSources.clear()
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => syncPane(doc, getMacros))
    observer.observe(doc.body, { childList: true, subtree: true })
  }
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    observer?.disconnect()
    observer = null
    previewSources.clear()
  }, IDLE_MS)
  window.setTimeout(() => syncPane(doc, getMacros), 0)
}
