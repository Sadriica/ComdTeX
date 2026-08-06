/**
 * Minimal single-range diff between two versions of a document.
 *
 * `editor.setValue()` replaces the whole buffer, which wipes the undo stack,
 * every collapsed region, all decorations and the selection: the user sees
 * text "move on its own" when an external change lands while they are typing.
 * Applying the smallest edit that turns `oldText` into `newText` keeps all of
 * that intact, and for the common case (one paragraph changed by a vault-wide
 * replace) the edit is tiny.
 */

export interface TextEdit {
  /** Offset in `oldText` where the replacement starts. */
  start: number
  /** Offset in `oldText` where the replaced span ends (exclusive). */
  end: number
  /** Text to put in its place. */
  text: string
}

/**
 * The single replacement that turns `oldText` into `newText`, or null when they
 * are already equal. Computed by trimming the common prefix and suffix, so it is
 * O(n) and allocation-free until the very end.
 */
export function minimalEdit(oldText: string, newText: string): TextEdit | null {
  if (oldText === newText) return null

  const maxPrefix = Math.min(oldText.length, newText.length)
  let prefix = 0
  while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix++

  // Don't let the suffix scan cross into the prefix; the two must not overlap,
  // or the resulting range would be inverted.
  const maxSuffix = maxPrefix - prefix
  let suffix = 0
  while (
    suffix < maxSuffix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) suffix++

  // A surrogate pair must not be split down the middle: doing so would emit
  // half a code point and corrupt the character.
  if (prefix > 0 && isLowSurrogate(oldText.charCodeAt(prefix)) && isHighSurrogate(oldText.charCodeAt(prefix - 1))) {
    prefix--
  }

  return {
    start: prefix,
    end: oldText.length - suffix,
    text: newText.slice(prefix, newText.length - suffix),
  }
}

export interface LineDiffSummary {
  added: number
  removed: number
  /** True when the two texts are identical. */
  identical: boolean
}

/**
 * How far apart two versions of a document are, in whole lines.
 *
 * Shown in the "changed on disk" prompt so the choice between reloading and
 * keeping your version is informed: "3 lines differ" and "400 lines differ"
 * call for very different decisions, and the dialog previously said neither.
 *
 * Computed by trimming the common head and tail, which is exact for the common
 * shape (one edited region) and a safe upper bound otherwise.
 */
export function diffLineSummary(oldText: string, newText: string): LineDiffSummary {
  if (oldText === newText) return { added: 0, removed: 0, identical: true }

  const a = oldText.split("\n")
  const b = newText.split("\n")

  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++

  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail++

  return {
    removed: a.length - head - tail,
    added: b.length - head - tail,
    identical: false,
  }
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}
