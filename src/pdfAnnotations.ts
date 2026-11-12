/**
 * The annotations of a PDF as a list a person reads: what was highlighted, what
 * they wrote about it, where. Pure helpers behind the viewer's Annotations
 * panel, "Copy as quote" and "Export to note" (the Zotero / PDF++ workflow:
 * reading notes that point back to the page they came from).
 *
 * Coordinates are PDF user space (points, origin bottom-left), as pdf.js
 * reports them for annotations and text items alike.
 */

export type AnnotationKind = "highlight" | "text" | "ink" | "image" | "note"

export interface PdfAnnotationEntry {
  /** Editor uid for annotations made in this session, else the PDF's own id. */
  id: string
  /** 1-based page number. */
  page: number
  kind: AnnotationKind
  /** CSS colour (#rrggbb) when the annotation has one. */
  color: string | null
  /** The highlighted text, or the typed text of a text box. */
  text: string
  /** The comment attached to it ("" when none). */
  comment: string
  /** [x1, y1, x2, y2] in PDF points. */
  rect: [number, number, number, number]
  /** True when it can be edited here (made or opened for editing this session). */
  live: boolean
}

/** A text item as pdf.js's getTextContent returns it (the fields used here). */
export interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

/** pdf.js annotation types, as numbers (AnnotationType / AnnotationEditorType). */
export const ANNOTATION_TYPE = { TEXT: 1, FREETEXT: 3, HIGHLIGHT: 9, STAMP: 13, INK: 15 } as const

export function kindOf(annotationType: number, it?: string | null): AnnotationKind | null {
  switch (annotationType) {
    case ANNOTATION_TYPE.HIGHLIGHT:
      return "highlight"
    case ANNOTATION_TYPE.FREETEXT:
      return "text"
    case ANNOTATION_TYPE.STAMP:
      return "image"
    case ANNOTATION_TYPE.TEXT:
      return "note"
    case ANNOTATION_TYPE.INK:
      // pdf.js saves a freehand highlight as an Ink annotation marked so.
      return it === "InkHighlight" ? "highlight" : "ink"
    default:
      return null
  }
}

/** #rrggbb from pdf.js's [r, g, b] (0-255), or null. */
export function rgbToHex(rgb: ArrayLike<number> | null | undefined): string | null {
  if (!rgb || rgb.length < 3) return null
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0")
  return `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`
}

/** Bounding boxes [x1, y1, x2, y2] of quadPoints (8 numbers per quad, any order). */
export function quadBoxes(quadPoints: ArrayLike<number> | null | undefined): number[][] {
  const boxes: number[][] = []
  if (!quadPoints) return boxes
  for (let i = 0; i + 7 < quadPoints.length; i += 8) {
    const xs = [quadPoints[i], quadPoints[i + 2], quadPoints[i + 4], quadPoints[i + 6]]
    const ys = [quadPoints[i + 1], quadPoints[i + 3], quadPoints[i + 5], quadPoints[i + 7]]
    boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  return boxes
}

/**
 * The text of a page that lies under the given boxes (a highlight's quads).
 * Partly covered items contribute the share of their characters inside the
 * box, assuming even character widths: close enough to name what was marked.
 */
export function textInBoxes(items: readonly TextItemLike[], boxes: readonly number[][]): string {
  const parts: string[] = []
  for (const box of boxes) {
    const [bx1, by1, bx2, by2] = box
    const line: { x: number; text: string }[] = []
    for (const item of items) {
      if (!item.str) continue
      const [, , c, d, e, f] = item.transform
      const fontHeight = item.height || Math.hypot(c, d) || 1
      const top = f + fontHeight * 0.8
      const bottom = f - fontHeight * 0.2
      const overlapY = Math.min(top, by2) - Math.max(bottom, by1)
      if (overlapY < Math.min(top - bottom, by2 - by1) * 0.5) continue
      const x1 = e
      const x2 = e + (item.width || 0)
      const from = Math.max(x1, bx1)
      const to = Math.min(x2, bx2)
      if (to <= from) continue
      const span = x2 - x1
      const len = item.str.length
      const start = span > 0 ? Math.round(((from - x1) / span) * len) : 0
      const end = span > 0 ? Math.round(((to - x1) / span) * len) : len
      const piece = item.str.slice(start, Math.max(start, end))
      if (piece) line.push({ x: from, text: piece })
    }
    line.sort((a, b) => a.x - b.x)
    const text = line.map((p) => p.text).join(" ")
    if (text.trim()) parts.push(text)
  }
  return tidy(parts.join(" "))
}

/** Collapses whitespace and joins words hyphenated across a line break. */
export function tidy(text: string): string {
  return text
    .replace(/(\p{L})- +(\p{Ll})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
}

/** Reading order: page, then top to bottom, then left to right. */
export function sortEntries(entries: PdfAnnotationEntry[]): PdfAnnotationEntry[] {
  return [...entries].sort(
    (a, b) => a.page - b.page || b.rect[3] - a.rect[3] || a.rect[0] - b.rect[0],
  )
}

export interface QuoteLabels {
  /** "p." / "pág." */
  page: string
}

/** The source line under a quote: a wikilink to the PDF and the page. */
function source(pdfName: string, page: number, labels: QuoteLabels): string {
  return `[[${pdfName}]], ${labels.page} ${page}`
}

/** A Markdown block quote of a passage, with where it came from. */
export function quoteMarkdown(
  text: string,
  pdfName: string,
  page: number,
  labels: QuoteLabels,
): string {
  const body = tidy(text)
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")
  return `${body}\n>\n> (${source(pdfName, page, labels)})\n`
}

export interface NoteLabels extends QuoteLabels {
  /** Title of the note, e.g. "Annotations: paper.pdf". */
  title: (pdfName: string) => string
  /** Heading per page, e.g. "Page 3". */
  pageHeading: (page: number) => string
  /** Names for annotations that carry no text of their own. */
  kinds: Record<AnnotationKind, string>
  /** Shown when there is nothing to export. */
  empty: string
}

/**
 * A reading note made of a PDF's annotations, grouped by page: highlights as
 * quotes with their comments underneath, text boxes and notes as text,
 * drawings and images by name when they carry a comment.
 */
export function annotationsMarkdown(
  pdfName: string,
  entries: readonly PdfAnnotationEntry[],
  labels: NoteLabels,
): string {
  const out: string[] = [`# ${labels.title(pdfName)}`, "", `[[${pdfName}]]`, ""]
  const sorted = sortEntries([...entries])
  if (!sorted.length) {
    out.push(labels.empty, "")
    return out.join("\n")
  }
  let page = 0
  for (const e of sorted) {
    if (e.page !== page) {
      page = e.page
      out.push(`## ${labels.pageHeading(page)}`, "")
    }
    const text = tidy(e.text)
    const comment = e.comment.trim()
    if (e.kind === "highlight" && text) {
      out.push(...text.split("\n").map((l) => `> ${l}`))
      out.push(`>`, `> (${source(pdfName, e.page, labels)})`, "")
      if (comment) out.push(comment, "")
    } else if (text || comment) {
      const head = text || labels.kinds[e.kind]
      out.push(`- ${head} (${labels.page} ${e.page})`)
      if (comment && comment !== text) out.push(`  ${comment.replace(/\n/g, "\n  ")}`)
      out.push("")
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n")
}

/** File name for the exported note beside the PDF: paper.pdf -> paper-annotations.md. */
export function notePathFor(pdfPath: string): string {
  return pdfPath.replace(/\.pdf$/i, "") + "-annotations.md"
}
