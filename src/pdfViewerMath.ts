/**
 * Pure pieces of the PDF viewer (PdfPreviewPanel.tsx): zoom steps and text
 * search over the text runs pdf.js extracts from a page.
 */

/**
 * CSS pixels per PDF point at 100%. A PDF point is 1/72 inch and a CSS pixel
 * 1/96 inch, so "100%" shows the page at its printed size, as every PDF
 * viewer does. A scale of 1 is therefore 75%.
 */
export const CSS_UNITS = 96 / 72

/** The zoom levels the buttons and Ctrl +/- step through, in percent. */
export const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400]

/** The levels offered in the zoom menu, in percent. */
export const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300, 400]

export const MIN_PERCENT = ZOOM_STEPS[0]
export const MAX_PERCENT = ZOOM_STEPS[ZOOM_STEPS.length - 1]

export function scaleToPercent(scale: number): number {
  return (scale / CSS_UNITS) * 100
}

export function percentToScale(percent: number): number {
  return (percent / 100) * CSS_UNITS
}

export function clampPercent(percent: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, percent))
}

/**
 * The next zoom level after `percent` in direction `dir`. From a level between
 * two steps (a fitted width, a pinch) it moves to the nearest step on that side,
 * so one press always changes the zoom and never jumps two steps.
 */
export function nextZoomStep(percent: number, dir: 1 | -1): number {
  const eps = 0.5
  if (dir > 0) return ZOOM_STEPS.find((s) => s > percent + eps) ?? MAX_PERCENT
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--)
    if (ZOOM_STEPS[i] < percent - eps) return ZOOM_STEPS[i]
  return MIN_PERCENT
}

/** Case and accent insensitive form used by the search (ñ stays its own letter). */
export function foldForSearch(text: string): string {
  return text
    .replace(/ñ/g, "\u0000")
    .replace(/Ñ/g, "\u0001")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0000/g, "ñ")
    .replace(/\u0001/g, "ñ")
    .toLowerCase()
}

/** One occurrence of the query inside a text run. */
export interface RunMatch {
  /** Index of the run in the list that was searched. */
  run: number
  /** Offset and length inside that run's text. */
  start: number
  length: number
}

/**
 * Every occurrence of `query` in a page's text runs, in reading order. A match
 * never crosses runs (pdf.js splits lines and font changes into runs), which
 * is also how the browser's own PDF viewer counts.
 */
export function findInRuns(runs: readonly string[], query: string): RunMatch[] {
  const needle = foldForSearch(query.trim())
  if (!needle) return []
  const out: RunMatch[] = []
  runs.forEach((text, run) => {
    // Folding keeps the length here: one code unit per letter once the
    // combining marks are dropped, as long as the run was NFC to begin with.
    const folded = foldForSearch(text)
    if (folded.length !== text.length) {
      // A run with decomposed letters: search it as is, without folding.
      let at = text.toLowerCase().indexOf(needle)
      while (at >= 0) {
        out.push({ run, start: at, length: needle.length })
        at = text.toLowerCase().indexOf(needle, at + needle.length)
      }
      return
    }
    let at = folded.indexOf(needle)
    while (at >= 0) {
      out.push({ run, start: at, length: needle.length })
      at = folded.indexOf(needle, at + needle.length)
    }
  })
  return out
}
