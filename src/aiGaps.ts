/**
 * "Gaps": explicit placeholders the author leaves for the AI to fill in later.
 *
 * The workflow this serves: writing class notes live, you know a definition or a
 * proof belongs somewhere but you do not want to stop and write it. You leave a
 * marker, keep going, and fill the holes afterwards.
 *
 * Two forms:
 *   {{?}}                  : fill in what belongs here
 *   {{? una pista}}        : same, with a hint for the model
 *
 * Deliberately explicit rather than ghost-text autocompletion: the author says
 * where the AI may write, and nothing is generated until they ask. It also keeps
 * Tab free for shorthand expansion, which an inline-suggestion UI would fight.
 *
 * Pure: finding and replacing gaps involves no I/O and no React, so the
 * behaviour is fully testable without a provider.
 */

/** `{{?}}` or `{{? hint}}`. The hint stops at the closing braces. */
const GAP_RE = /\{\{\?\s*([^}]*)\}\}/g

export interface Gap {
  /** Character offset of the `{{` in the document. */
  start: number
  /** Character offset just past the `}}`. */
  end: number
  /** The hint text, or "" for a bare `{{?}}`. */
  hint: string
  /** 1-indexed line the gap starts on. */
  line: number
}

/**
 * Every gap in `text`, in document order.
 *
 * Gaps inside fenced code blocks are skipped: a `{{?}}` shown in a code sample
 * is documentation about the feature, not a request to fill it in.
 */
export function findGaps(text: string): Gap[] {
  const masked = maskFencedCode(text)
  const gaps: Gap[] = []
  GAP_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = GAP_RE.exec(masked)) !== null) {
    gaps.push({
      start: m.index,
      end: m.index + m[0].length,
      hint: m[1].trim(),
      line: lineOf(text, m.index),
    })
  }
  return gaps
}

/** The gap containing `offset`, or null. Used to resolve "fill the gap at the cursor". */
export function gapAtOffset(text: string, offset: number): Gap | null {
  return findGaps(text).find((gap) => offset >= gap.start && offset <= gap.end) ?? null
}

/**
 * Context handed to the model for one gap: the surrounding block, with the gap
 * itself marked so the model knows exactly what to replace.
 *
 * Bounded to `radius` lines each way; sending the whole document would be slow,
 * expensive, and no more accurate for a local hole.
 */
export function gapContext(text: string, gap: Gap, radius = 12): string {
  const lines = text.split("\n")
  const idx = gap.line - 1
  const from = Math.max(0, idx - radius)
  const to = Math.min(lines.length, idx + radius + 1)
  return lines.slice(from, to).join("\n")
}

/**
 * Clean a model's answer so it can be dropped straight into the document.
 *
 * Models habitually wrap answers in a code fence and restate the prompt; both
 * would be visible corruption inside prose.
 */
export function cleanGapCompletion(raw: string): string {
  let out = raw.trim()
  const fence = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(out)
  if (fence) out = fence[1].trim()
  // A model that echoes the marker back would reinsert the hole it just filled.
  out = out.replace(GAP_RE, "").trim()
  return out
}

/** Mask fenced code with spaces, preserving offsets so matches stay aligned. */
function maskFencedCode(text: string): string {
  const buf = Array.from(text)
  const fenceRe = /^(```+|~~~+)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(text)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) {
      if (buf[i] !== "\n") buf[i] = " "
    }
  }
  return buf.join("")
}

function lineOf(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") line++
  }
  return line
}
