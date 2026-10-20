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
 * This morphs the live container to match `content` with a KEYED diff of the
 * TOP-LEVEL blocks:
 *
 *  1. Every block (old and new) gets a structural content hash that ignores the
 *     `data-source-line` bookkeeping attribute (it shifts on every block below an
 *     inserted/removed line although the block itself did not change). Identical
 *     blocks are disambiguated by occurrence index (key + n-th occurrence).
 *  2. New blocks are paired with live blocks by key. The longest increasing
 *     subsequence of the paired live indices is the set of blocks that can stay
 *     where they are; everything else is moved (paired) or inserted (unpaired),
 *     and live blocks with no partner are removed. That is a minimal plan.
 *  3. Paired blocks keep their live DOM node (and its already-rendered SVGs,
 *     KaTeX spans, images); only their `data-source-line` attributes are synced.
 *
 * So inserting or deleting a block near the top no longer re-creates every block
 * below it; typing WITHIN a block replaces only that block (its hash changed).
 * A native `isEqualNode` prefix/suffix trim runs first, so the hashing walk only
 * covers the blocks between the first and last difference. Hashing is a
 * read-only tree walk: no HTML re-parse, no serialization, no layout.
 */
export function morphPreviewContent(container: HTMLElement, content: DocumentFragment): void {
  // Snapshot to arrays: both `content.childNodes` and `container.childNodes`
  // are LIVE lists that mutate as we move/replace nodes below.
  const allNew = Array.from(content.childNodes)
  const allOld = Array.from(container.childNodes)

  // Fast path: trim the common prefix and suffix with the NATIVE `isEqualNode`
  // (no JS tree walk). Typing inside one block, the dominant case, ends here
  // with a single-block middle; a top insertion/removal is absorbed by the
  // suffix scan. Only the (small) middle pays for hashing.
  const limit = Math.min(allNew.length, allOld.length)
  let lo = 0
  while (lo < limit && keepsLiveNode(allOld[lo], allNew[lo])) lo++
  let oldEnd = allOld.length
  let newEnd = allNew.length
  while (oldEnd > lo && newEnd > lo && keepsLiveNode(allOld[oldEnd - 1], allNew[newEnd - 1])) {
    oldEnd--
    newEnd--
  }
  const oldNodes = allOld.slice(lo, oldEnd)
  const newNodes = allNew.slice(lo, newEnd)
  // The first untouched suffix node (or null = end of container) anchors the middle.
  let anchor: Node | null = oldEnd < allOld.length ? allOld[oldEnd] : null

  // Live blocks by key (+ occurrence), in document order.
  const oldByKey = new Map<string, number[]>()
  const oldSigs: Sig[] = []
  for (let j = 0; j < oldNodes.length; j++) {
    const sig = signature(oldNodes[j])
    oldSigs.push(sig)
    const list = oldByKey.get(sig.key)
    if (list) list.push(j)
    else oldByKey.set(sig.key, [j])
  }

  // Pair each new block with the next unused live block of the same key.
  const nextUse = new Map<string, number>()
  const pair: number[] = new Array(newNodes.length) // new index -> old index or -1
  const newSigs: Sig[] = []
  const used = new Uint8Array(oldNodes.length)
  for (let i = 0; i < newNodes.length; i++) {
    const sig = signature(newNodes[i])
    newSigs.push(sig)
    const list = oldByKey.get(sig.key)
    const n = nextUse.get(sig.key) ?? 0
    if (list && n < list.length) {
      pair[i] = list[n]
      used[list[n]] = 1
      nextUse.set(sig.key, n + 1)
    } else {
      pair[i] = -1
    }
  }

  // Drop live blocks nobody claims.
  for (let j = 0; j < oldNodes.length; j++) if (!used[j]) oldNodes[j].remove()

  // Blocks on the LIS of paired live indices keep their position untouched.
  const stay = new Uint8Array(newNodes.length)
  for (const i of longestIncreasingSubsequence(pair)) stay[i] = 1

  // Walk backwards so each placed node has a settled `next` sibling to anchor on.
  for (let i = newNodes.length - 1; i >= 0; i--) {
    const j = pair[i]
    if (j < 0) {
      container.insertBefore(newNodes[i], anchor) // new or changed block
      anchor = newNodes[i]
      continue
    }
    const live = oldNodes[j]
    if (!stay[i]) container.insertBefore(live, anchor) // moved block, same node
    if (oldSigs[j].lines !== newSigs[i].lines) syncSourceLines(live, newNodes[i])
    anchor = live
  }
}

/**
 * Should the live `oldNode` be KEPT for `newNode`? True when structurally
 * identical, or when the only difference is the block's own `data-source-line`
 * (which is then updated in place). Native comparison only; nested line shifts
 * fall through to the keyed diff.
 */
function keepsLiveNode(oldNode: Node, newNode: Node): boolean {
  if (oldNode.isEqualNode(newNode)) return true
  if (oldNode.nodeType !== 1 || newNode.nodeType !== 1) return false
  const oldEl = oldNode as Element
  const newEl = newNode as Element
  const oldLine = oldEl.getAttribute(LINE_ATTR)
  const newLine = newEl.getAttribute(LINE_ATTR)
  if (oldLine === newLine) return false
  if (newLine === null) oldEl.removeAttribute(LINE_ATTR)
  else oldEl.setAttribute(LINE_ATTR, newLine)
  if (oldEl.isEqualNode(newEl)) return true
  if (oldLine === null) oldEl.removeAttribute(LINE_ATTR)
  else oldEl.setAttribute(LINE_ATTR, oldLine)
  return false
}

interface Sig {
  /** Structural hash ignoring `data-source-line`. */
  key: string
  /** Hash of the `data-source-line` attributes (value and presence, in tree order). */
  lines: string
}

const LINE_ATTR = "data-source-line"

// Two independent 32-bit lanes of a cyrb53-style stream hash; together with the
// node count (mixed into the key) accidental collisions are not a practical risk.
let ch1 = 0
let ch2 = 0
let lh1 = 0
let lh2 = 0
let nodeCount = 0

function feed(str: string, tag: number): void {
  ch1 = Math.imul(ch1 ^ tag, 2654435761)
  ch2 = Math.imul(ch2 ^ tag, 1597334677)
  for (let k = 0; k < str.length; k++) {
    const c = str.charCodeAt(k)
    ch1 = Math.imul(ch1 ^ c, 2654435761)
    ch2 = Math.imul(ch2 ^ c, 1597334677)
  }
}

function feedLine(str: string): void {
  lh1 = Math.imul(lh1 ^ 7, 2654435761)
  lh2 = Math.imul(lh2 ^ 7, 1597334677)
  for (let k = 0; k < str.length; k++) {
    const c = str.charCodeAt(k)
    lh1 = Math.imul(lh1 ^ c, 2654435761)
    lh2 = Math.imul(lh2 ^ c, 1597334677)
  }
}

function walk(node: Node): void {
  nodeCount++
  if (node.nodeType === 1) {
    const el = node as Element
    feed(el.localName, 1)
    const attrs = el.attributes
    for (let a = 0; a < attrs.length; a++) {
      const attr = attrs[a]
      if (attr.name === LINE_ATTR) {
        feedLine(attr.value)
      } else {
        feed(attr.name, 2)
        feed(attr.value, 3)
      }
    }
    if (!el.hasAttribute(LINE_ATTR)) feedLine("") // presence matters for the sync check
    for (let c = el.firstChild; c; c = c.nextSibling) walk(c)
    feed("", 4) // close
  } else {
    feed(node.nodeValue ?? "", 5 + node.nodeType)
  }
}

function signature(node: Node): Sig {
  ch1 = 0xdeadbeef
  ch2 = 0x41c6ce57
  lh1 = 0xdeadbeef
  lh2 = 0x41c6ce57
  nodeCount = 0
  walk(node)
  return {
    key: `${ch1 >>> 0}.${ch2 >>> 0}.${nodeCount}`,
    lines: `${lh1 >>> 0}.${lh2 >>> 0}`,
  }
}

/**
 * Copy the `data-source-line` attributes of `from` onto the structurally
 * identical live `to` (parallel walk; equal structure is guaranteed by the key).
 */
function syncSourceLines(to: Node, from: Node): void {
  if (to.nodeType !== 1 || from.nodeType !== 1) return
  const toEl = to as Element
  const fromEl = from as Element
  const line = fromEl.getAttribute(LINE_ATTR)
  if (line === null) toEl.removeAttribute(LINE_ATTR)
  else if (toEl.getAttribute(LINE_ATTR) !== line) toEl.setAttribute(LINE_ATTR, line)
  let a = toEl.firstChild
  let b = fromEl.firstChild
  while (a && b) {
    syncSourceLines(a, b)
    a = a.nextSibling
    b = b.nextSibling
  }
}

/** Indices (into `seq`) of a longest strictly increasing subsequence, ignoring negatives. */
function longestIncreasingSubsequence(seq: number[]): number[] {
  const tails: number[] = [] // tails[k] = index in seq of the smallest tail of a run of length k+1
  const prev: number[] = new Array(seq.length).fill(-1)
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i]
    if (v < 0) continue
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (seq[tails[mid]] < v) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const out: number[] = []
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(i)
  return out
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
