/**
 * Printing the open PDF, annotations included, the way pdf.js's own viewer
 * does it: each page is drawn for print into an image, the images go into a
 * container the print stylesheet shows alone (`html.pdf-printing`, see
 * styles/print.css), and the system print dialog takes it from there.
 */
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy

/** Print resolution: 150 dpi is what pdf.js's viewer uses. */
const PRINT_DPI = 150

export interface PrintProgress {
  (done: number, total: number): void
}

/** Renders every page to an image URL (blob:), with the annotations drawn in. */
export async function renderPagesForPrint(
  doc: PDFDocumentProxy,
  onProgress?: PrintProgress,
  signal?: AbortSignal,
): Promise<{ urls: string[]; widthPt: number; heightPt: number }> {
  const { AnnotationMode } = await import("pdfjs-dist")
  const urls: string[] = []
  let widthPt = 612
  let heightPt = 792
  const printStorage = (doc.annotationStorage as unknown as { print: unknown }).print
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new DOMException("Print cancelled", "AbortError")
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      if (n === 1) {
        widthPt = base.width
        heightPt = base.height
      }
      const viewport = page.getViewport({ scale: PRINT_DPI / 72 })
      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("No 2D canvas")
      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        intent: "print",
        annotationMode: AnnotationMode.ENABLE_STORAGE,
        printAnnotationStorage: printStorage,
      } as unknown as Parameters<typeof page.render>[0]).promise
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      canvas.width = canvas.height = 0
      if (!blob) throw new Error("Could not draw page " + n)
      urls.push(URL.createObjectURL(blob))
      onProgress?.(n, doc.numPages)
    }
  } catch (err) {
    for (const u of urls) URL.revokeObjectURL(u)
    throw err
  }
  return { urls, widthPt, heightPt }
}

/**
 * Shows the rendered pages alone and opens the print dialog. Cleans up after
 * the dialog closes (afterprint), or on the next call if that never fires.
 */
let cleanupPrevious: (() => void) | null = null

export function printImages(urls: string[], widthPt: number, heightPt: number): void {
  cleanupPrevious?.()
  const root = document.createElement("div")
  root.className = "pdf-print-root"
  for (const url of urls) {
    const img = document.createElement("img")
    img.src = url
    img.alt = ""
    root.append(img)
  }
  // The sheet takes the PDF's first page size, with no margins: the page
  // already carries its own.
  const style = document.createElement("style")
  style.textContent = `@page { size: ${widthPt}pt ${heightPt}pt; margin: 0; }`
  document.head.append(style)
  document.body.append(root)
  document.documentElement.classList.add("pdf-printing")

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup)
    document.documentElement.classList.remove("pdf-printing")
    root.remove()
    style.remove()
    for (const u of urls) URL.revokeObjectURL(u)
    if (cleanupPrevious === cleanup) cleanupPrevious = null
  }
  cleanupPrevious = cleanup
  window.addEventListener("afterprint", cleanup)

  // Print once every image has decoded, or the sheets come out blank.
  void Promise.all(
    [...root.querySelectorAll("img")].map((img) => img.decode().catch(() => {})),
  ).then(() => window.print())
}
