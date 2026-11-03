/**
 * Supplementary material numbering ("Figure S1", "Table S2").
 *
 * Syntax: a standalone HTML comment line marks where the supplement starts:
 *
 *   <!-- supplement -->
 *
 * From that line on, figures and tables restart at 1 and print with an "S"
 * prefix. A comment is the one marker that is invisible in Obsidian and in every
 * Markdown viewer, needs no closing line, survives markdown-it untouched (so the
 * renderer can find it in the HTML) and is already opaque text to cmdxFormat, so
 * it round-trips byte for byte. Only the first marker counts; later ones are
 * no-ops, so a stray duplicate never resets the numbering twice.
 *
 * Equations keep their single document-wide numbering: journals rarely ask for
 * "Equation S1".
 */

/** The canonical marker line (what the editor inserts). */
export const SUPPLEMENT_MARKER = "<!-- supplement -->"

const MARKER_BODY = String.raw`<!--\s*supplement\s*-->`

/** A whole source line that is the marker. */
export const SUPPLEMENT_LINE_RE = new RegExp(String.raw`^[ \t]*${MARKER_BODY}[ \t]*$`, "i")

/** Marker alternative to embed in a scanning regex: source-line form (use with the `m` flag). */
export const SUPPLEMENT_LINE_SRC = String.raw`^[ \t]*${MARKER_BODY}[ \t]*$`

/** Marker alternative for scanning rendered HTML (markdown-it keeps the comment verbatim). */
export const SUPPLEMENT_HTML_SRC = MARKER_BODY

/** True when the text contains a supplement marker line (cheap pre-check before a full scan). */
export function hasSupplementMarker(text: string): boolean {
  return text.includes("supplement") && new RegExp(SUPPLEMENT_LINE_SRC, "im").test(text)
}

/** Printed number: `3` in the main text, `"S3"` in the supplement. */
export function supplementNumber(n: number, inSupplement: boolean): number | string {
  return inSupplement ? `S${n}` : n
}
