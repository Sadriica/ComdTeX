/**
 * A caret position in a pdf.js text layer for any point on the page, snapped
 * to the nearest text when the point is between lines, words or in a margin.
 *
 * The highlight tool uses it so a drag that starts off the glyphs still
 * selects text (a browser starts no selection there, and pdf.js would draw a
 * freehand marker stroke instead).
 */

export interface Caret {
  node: Text
  offset: number
}

function textNodeOf(span: Element): Text | null {
  const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT)
  const node = walker.nextNode()
  return node instanceof Text ? node : null
}

/** The browser's own caret under the point, if it falls in this layer's text. */
function caretFromPoint(layer: Element, x: number, y: number): Caret | null {
  const doc = layer.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  let node: Node | null = null
  let offset = 0
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y)
    if (pos) {
      node = pos.offsetNode
      offset = pos.offset
    }
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y)
    if (range) {
      node = range.startContainer
      offset = range.startOffset
    }
  }
  if (node instanceof Text && layer.contains(node)) return { node, offset }
  return null
}

/**
 * The caret for (x, y): exact over text; otherwise in the span nearest the
 * point, on its line if one is level with it, at the end facing the point.
 */
export function caretInTextLayer(layer: Element, x: number, y: number): Caret | null {
  const exact = caretFromPoint(layer, x, y)
  if (exact) return exact
  let best: { span: Element; rect: DOMRect; score: number } | null = null
  for (const span of layer.querySelectorAll("span")) {
    if (span.classList.contains("markedContent") || !span.textContent) continue
    const rect = span.getBoundingClientRect()
    if (!rect.width || !rect.height) continue
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
    // Being on the line matters far more than being close sideways.
    const score = dy * 1000 + dx
    if (!best || score < best.score) best = { span, rect, score }
  }
  if (!best) return null
  const node = textNodeOf(best.span)
  if (!node) return null
  const { rect } = best
  const len = node.length
  const share = rect.width ? (x - rect.left) / rect.width : 0
  const offset = Math.max(0, Math.min(len, Math.round(share * len)))
  return { node, offset }
}
