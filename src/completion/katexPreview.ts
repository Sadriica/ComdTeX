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
let latestPreviewKey = ""

/**
 * Monaco renders suggestion documentation as sanitized Markdown, which strips
 * the inline styles KaTeX needs. So the equation is drawn into the details
 * pane directly, after Monaco has shown it. Best effort: when the pane is not
 * there (details collapsed, another host) the Markdown fallback still reads.
 */
export function injectSuggestPreview(
  html: string,
  key: string,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): void {
  latestPreviewKey = key
  if (!doc) return
  const attempt = (): boolean => {
    // The focus may have moved on to another suggestion while we waited.
    if (key !== latestPreviewKey) return true
    const pane = doc.querySelector(".suggest-details .docs")
    if (!pane) return false
    const existing = pane.querySelector(`.${PREVIEW_CLASS}`)
    if (existing?.getAttribute("data-key") === key) return true
    existing?.remove()
    const box = doc.createElement("div")
    box.className = PREVIEW_CLASS
    box.setAttribute("data-key", key)
    box.style.overflowX = "auto"
    box.style.padding = "4px 0"
    box.innerHTML = html
    pane.insertBefore(box, pane.firstChild)
    return true
  }
  if (typeof window === "undefined") return
  for (const delay of [0, 30, 90, 200]) {
    window.setTimeout(attempt, delay)
  }
}
