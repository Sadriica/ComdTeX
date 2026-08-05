// Alignment between an edited document and its generated LaTeX.
//
// SyncTeX speaks in lines of the *compiled* file, which for ComdTeX is the
// .tex the exporter generates, not the Markdown/CMDX the user edits. This
// module bridges the two with a monotonic text alignment: for each source
// line with enough prose to be distinctive, find the first not-yet-consumed
// tex line that contains the same normalized text, and record the pair as an
// anchor. Lines between anchors inherit the previous anchor's source line,
// so a click always lands on the right paragraph even when the exact line
// (math, markup) could not be anchored.
//
// Deliberately approximate and deliberately pure: no I/O, no LaTeX parsing.
// Math-only lines, tables and markup rarely anchor; prose does, and prose is
// what carries the structure of an academic document.

/** Strip everything that is not comparable prose and lowercase it. */
function normalize(s: string): string {
  return s
    .replace(/[^A-Za-z0-9À-ſ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/**
 * A source line's search signature, or null when the line carries too little
 * prose to anchor reliably (math, fences, labels, pure markup).
 */
export function lineSignature(line: string): string | null {
  const cleaned = line
    // fenced-code markers and CMDX block openers/closers never anchor
    .replace(/^(```|~~~|:::).*$/g, "")
    // structural labels: {#sec:intro} appears as \label{sec:intro} in tex,
    // with different word order; drop it from the signature entirely
    .replace(/\{#[^}]*\}/g, "")
    // wikilinks and transclusions render as other text or not at all
    .replace(/!?\[\[[^\]]*\]\]/g, "")
    // image/link syntax: keep the visible text only
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    // inline math is rewritten beyond recognition by the exporter
    .replace(/\$[^$]*\$/g, "")
  const sig = normalize(cleaned)
  if (sig.length < 8) return null
  // A long line only needs a distinctive prefix; cut at a word boundary.
  if (sig.length <= 60) return sig
  const cut = sig.lastIndexOf(" ", 60)
  return sig.slice(0, cut > 20 ? cut : 60)
}

/**
 * Build the tex-line -> source-line map. Index is the 1-based tex line;
 * index 0 is unused and stays 0. Unanchored tex lines inherit the nearest
 * anchor at or before them (leading lines inherit the first anchor).
 */
export function buildTexLineMap(source: string, tex: string): number[] {
  const srcLines = source.split(/\r?\n/)
  const texLines = tex.split(/\r?\n/)
  const normTex = texLines.map(normalize)

  // YAML frontmatter is metadata, not body: `title: Nota` would otherwise
  // anchor against the preamble's \title{Nota} and skew every early mapping.
  let bodyStart = 0
  if (srcLines[0]?.trim() === "---") {
    const closing = srcLines.findIndex((l, i) => i > 0 && l.trim() === "---")
    if (closing > 0) bodyStart = closing + 1
  }

  const anchors: Array<[texLine: number, srcLine: number]> = []
  let cursor = 0 // index into texLines, monotonic
  for (let s = bodyStart; s < srcLines.length; s++) {
    const sig = lineSignature(srcLines[s])
    if (!sig) continue
    for (let t = cursor; t < normTex.length; t++) {
      if (normTex[t].includes(sig)) {
        anchors.push([t + 1, s + 1])
        cursor = t + 1
        break
      }
    }
  }

  const map = new Array<number>(texLines.length + 1).fill(0)
  if (anchors.length === 0) return map
  let a = 0
  for (let t = 1; t <= texLines.length; t++) {
    while (a + 1 < anchors.length && anchors[a + 1][0] <= t) a++
    // Leading tex lines (preamble) map to the first anchored source line.
    map[t] = t < anchors[0][0] ? anchors[0][1] : anchors[a][1]
  }
  return map
}

/**
 * Forward direction: the tex line that best represents a source line, for
 * feeding into SyncTeX forward sync. Prefers the first tex line mapped at or
 * past the source line; falls back to the closest mapping overall.
 */
export function nearestTexLine(map: number[], srcLine: number): number | null {
  // The map is monotonic non-decreasing, so the first tex line mapped at or
  // past the source line is the tightest at-or-after match.
  let last: number | null = null
  for (let t = 1; t < map.length; t++) {
    if (map[t] === 0) continue
    if (map[t] >= srcLine) return t
    last = t
  }
  return last
}
