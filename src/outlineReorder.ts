// outlineReorder.ts: pure logic for drag-to-reorder of document sections.
//
// A "section block" is a heading line plus everything beneath it up to (but
// not including) the next heading whose level is the SAME or HIGHER (i.e. a
// `#`/`##`/… of equal or smaller number). Nested subsections (deeper headings)
// therefore travel WITH their parent.
//
// REORDER RULE: the dragged section is reinserted immediately BEFORE the
// target heading's block. (Drop a heading "onto" another heading → it lands
// just above that target.)

interface HeadingPos {
  level: number
  line: number // 1-based
}

function scanHeadings(lines: string[]): HeadingPos[] {
  const out: HeadingPos[] = []
  lines.forEach((line, i) => {
    const m = /^(#{1,6})\s+\S/.exec(line)
    if (m) out.push({ level: m[1].length, line: i + 1 })
  })
  return out
}

/**
 * Returns the [start, end] 1-based inclusive line range of the section block
 * whose heading is on `headingLine`. The block runs from the heading line up to
 * the line before the next same-or-higher level heading (or EOF).
 */
function blockRange(
  headings: HeadingPos[],
  lineCount: number,
  headingLine: number,
): { start: number; end: number } | null {
  const idx = headings.findIndex((h) => h.line === headingLine)
  if (idx < 0) return null
  const start = headings[idx].line
  const level = headings[idx].level
  let end = lineCount // inclusive, default to EOF
  for (let j = idx + 1; j < headings.length; j++) {
    if (headings[j].level <= level) {
      end = headings[j].line - 1
      break
    }
  }
  return { start, end }
}

/**
 * Move the section whose heading is at `fromLine` so it sits immediately before
 * the section whose heading is at `toLine`. Both are 1-based line numbers of
 * heading lines. Returns the rewritten content. Returns the original content
 * unchanged on any invalid input or no-op.
 */
export function reorderSection(content: string, fromLine: number, toLine: number): string {
  if (fromLine === toLine) return content
  if (!Number.isInteger(fromLine) || !Number.isInteger(toLine)) return content

  // Preserve a trailing-newline so we can restore the document's shape.
  const hadTrailingNewline = content.endsWith("\n")
  const lines = content.split("\n")
  const lineCount = lines.length

  if (fromLine < 1 || fromLine > lineCount || toLine < 1 || toLine > lineCount) {
    return content
  }

  const headings = scanHeadings(lines)
  // Both endpoints must be actual headings.
  if (!headings.some((h) => h.line === fromLine)) return content
  if (!headings.some((h) => h.line === toLine)) return content

  const from = blockRange(headings, lineCount, fromLine)
  const to = blockRange(headings, lineCount, toLine)
  if (!from || !to) return content

  // If the target is inside the dragged block, moving is meaningless / unsafe.
  if (toLine >= from.start && toLine <= from.end) return content

  // Extract the dragged block (0-based slice indices).
  const block = lines.slice(from.start - 1, from.end)

  // Remove the block from the working array.
  const remaining = [...lines.slice(0, from.start - 1), ...lines.slice(from.end)]

  // The target heading's start line may have shifted if the removed block was
  // above it. Recompute the insertion index by re-scanning the remaining lines
  // for the target heading line. We identify the target by its original text
  // line content rather than line number to stay robust.
  const targetText = lines[toLine - 1]
  // Find the insertion index: the first occurrence of the target heading line
  // in `remaining` at/after the appropriate position. Because removal only
  // deletes a contiguous block, line identity is preserved; locate by counting.
  let insertIdx: number
  if (from.end < toLine) {
    // Block was entirely above the target: target shifted up by block length.
    insertIdx = toLine - 1 - block.length
  } else {
    // Block was entirely below the target: target index unchanged.
    insertIdx = toLine - 1
  }

  // Safety check: the line we're inserting before should be the target heading.
  if (remaining[insertIdx] !== targetText) {
    // Fall back to a search if our arithmetic was off for any edge case.
    const found = remaining.indexOf(targetText)
    if (found < 0) return content
    insertIdx = found
  }

  const result = [
    ...remaining.slice(0, insertIdx),
    ...block,
    ...remaining.slice(insertIdx),
  ]

  let out = result.join("\n")
  // Normalize: collapse any 3+ consecutive blank lines created by the move down
  // to at most 2 (one blank line of separation).
  out = out.replace(/\n{3,}/g, "\n\n")
  if (hadTrailingNewline && !out.endsWith("\n")) out += "\n"
  if (!hadTrailingNewline && out.endsWith("\n")) out = out.replace(/\n+$/, "")
  return out
}
