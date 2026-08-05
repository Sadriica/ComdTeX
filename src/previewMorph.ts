import { annotateSourceLinesIn } from "./renderer"
import { sanitizeRenderedHtmlToFragment } from "./sanitizeRenderedHtml"

/**
 * Block-level DOM reconciliation for the markdown preview.
 *
 * The preview used to be committed via `dangerouslySetInnerHTML`, which replaces
 * the ENTIRE preview subtree on every (debounced) keystroke. For a document with
 * many inline diagram SVGs (mermaid / excalidraw / graphviz / plots) that means
 * re-parsing the whole HTML string and re-laying-out every diagram on each edit:
 * the dominant cause of typing lag in diagram-heavy files like comdtex.md.
 *
 * This morphs the live container to match `content` by comparing TOP-LEVEL
 * blocks position-by-position and only replacing the ones that actually
 * changed. Unchanged blocks keep their existing DOM nodes (and their
 * already-rendered SVGs), so editing one paragraph no longer disturbs every
 * diagram on the page.
 *
 * Positional matching means inserting/removing a block shifts everything after it
 * (those get replaced that one time); the common case (typing WITHIN an existing
 * block) touches only that block. `isEqualNode` is a read-only structural
 * comparison: no HTML re-parse and no layout for the blocks it leaves in place.
 */
export function morphPreviewContent(container: HTMLElement, content: DocumentFragment): void {
  // Snapshot to arrays: both `content.childNodes` and `container.childNodes`
  // are LIVE lists that mutate as we move/replace nodes below.
  const newNodes = Array.from(content.childNodes)
  const oldNodes = Array.from(container.childNodes)

  for (let i = 0; i < newNodes.length; i++) {
    const newNode = newNodes[i]
    const oldNode = oldNodes[i]
    if (!oldNode) {
      container.appendChild(newNode) // new trailing block
    } else if (!sameBlock(oldNode, newNode)) {
      container.replaceChild(newNode, oldNode) // changed block
    }
    // else: structurally identical (or only its source-line shifted); leave the
    // live node (and its already-rendered SVGs) in place.
  }
  // Remove any leftover blocks the new HTML no longer has.
  for (let i = oldNodes.length - 1; i >= newNodes.length; i--) {
    oldNodes[i].remove()
  }
}

/**
 * Should the live `oldNode` be KEPT to satisfy `newNode`? True when they are
 * structurally identical, OR when their only difference is the `data-source-line`
 * bookkeeping attribute, which shifts on EVERY block below an inserted/removed
 * line even though the block's content is unchanged. Treating that shift as
 * "equal" (and updating the attribute in place) means editing one line no longer
 * re-creates, and re-renders, every block beneath it, and never tears down an
 * already-rendered diagram SVG just because lines moved above it.
 */
function sameBlock(oldNode: Node, newNode: Node): boolean {
  if (oldNode.isEqualNode(newNode)) return true
  if (oldNode.nodeType !== 1 || newNode.nodeType !== 1) return false
  const oldEl = oldNode as Element
  const newEl = newNode as Element
  const oldLine = oldEl.getAttribute("data-source-line")
  const newLine = newEl.getAttribute("data-source-line")
  if (oldLine === newLine) return false // differ by something other than the line
  // Tentatively align the line attribute and re-test: if now equal, the line was
  // the ONLY difference: keep the live node with its attribute updated.
  if (newLine === null) oldEl.removeAttribute("data-source-line")
  else oldEl.setAttribute("data-source-line", newLine)
  if (oldEl.isEqualNode(newEl)) return true
  // Genuinely different content: restore the original line and let it be replaced.
  if (oldLine === null) oldEl.removeAttribute("data-source-line")
  else oldEl.setAttribute("data-source-line", oldLine)
  return false
}

/**
 * The ONLY sanctioned path for raw `renderMarkdown()` output to reach the DOM.
 *
 * Parses `rawHtml` exactly ONCE: `sanitizeRenderedHtmlToFragment` returns a
 * DOMPurify-sanitized `DocumentFragment` (`RETURN_DOM_FRAGMENT`) instead of a
 * re-serialized string, then annotates that same fragment in place with
 * `data-source-line` bookkeeping (`annotateSourceLinesIn`, using `sourceText`,
 * the exact source that produced `rawHtml`), then hands it to
 * `morphPreviewContent`. The raw string returned by `renderMarkdown` must
 * NEVER be injected into the DOM by any other means (no
 * `dangerouslySetInnerHTML`, no `el.innerHTML = ...`); always go through
 * this function so sanitization and annotation can never be skipped.
 */
export function commitPreview(container: HTMLElement, rawHtml: string, sourceText: string): void {
  const fragment = sanitizeRenderedHtmlToFragment(rawHtml)
  annotateSourceLinesIn(fragment, sourceText)
  morphPreviewContent(container, fragment)
}
