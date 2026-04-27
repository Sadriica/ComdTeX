import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useT } from "./i18n"

// Lazy module loader: keep pdfjs out of the initial bundle and behind a
// runtime guard so that environments that cannot parse the worker URL
// (e.g. unit tests under jsdom) fall back gracefully.
type PdfJsModule = typeof import("pdfjs-dist")
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy

let pdfJsPromise: Promise<PdfJsModule> | null = null
async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const mod = await import("pdfjs-dist")
      try {
        // Vite-friendly worker path. new URL(...) works in both Vite dev and
        // production builds and is how the upstream pdfjs-dist docs recommend
        // wiring the worker for ESM bundlers.
        const workerUrl = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString()
        mod.GlobalWorkerOptions.workerSrc = workerUrl
      } catch {
        // If the URL constructor fails (very old browsers / test env) we
        // simply leave workerSrc unset; pdfjs will warn but the panel will
        // still render an error message instead of crashing the app.
      }
      return mod
    })()
  }
  return pdfJsPromise
}

export interface PdfPreviewPanelProps {
  /** Absolute path to the compiled PDF, or null if no PDF is available. */
  pdfPath: string | null
  /**
   * Optional callback fired when the user clicks on a page. The page number
   * is 1-indexed. (x, y) are in PDF user-space (origin bottom-left).
   * `nearestText` is the closest text snippet found on that page (best-effort
   * heading-based synctex shim).
   */
  onClickSource?: (page: number, x: number, y: number, nearestText: string) => void
  /** Invert colours for dark themes. */
  invert?: boolean
}

interface RenderedPage {
  pageNum: number
  width: number
  height: number
}

const MIN_ZOOM = 0.4
const MAX_ZOOM = 4
const ZOOM_STEP = 0.2

/**
 * PDF preview pane. Renders the document page-by-page on canvases, virtualised
 * via IntersectionObserver so memory stays bounded for large PDFs.
 */
export default function PdfPreviewPanel({ pdfPath, onClickSource, invert = false }: PdfPreviewPanelProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map())
  const renderedRef = useRef<Set<number>>(new Set())

  const [pages, setPages] = useState<RenderedPage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [fitWidth, setFitWidth] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Helper: convert a Tauri/OS file path to a URL the webview can fetch from.
  // Tauri exposes asset:// URLs through convertFileSrc; in non-Tauri tests we
  // simply pass the path through.
  const resolvePdfUrl = useCallback(async (path: string): Promise<string> => {
    try {
      const mod = await import("@tauri-apps/api/core")
      return mod.convertFileSrc(path)
    } catch {
      return path
    }
  }, [])

  // Load document whenever the path changes.
  useEffect(() => {
    let cancelled = false
    setError(null)
    setPages([])
    setCurrentPage(1)
    renderedRef.current.clear()
    for (const task of renderTasksRef.current.values()) task.cancel()
    renderTasksRef.current.clear()

    if (!pdfPath) {
      docRef.current?.destroy().catch(() => {})
      docRef.current = null
      return
    }

    setLoading(true)
    ;(async () => {
      try {
        const mod = await loadPdfJs()
        const url = await resolvePdfUrl(pdfPath)
        const loadingTask = mod.getDocument({ url })
        const doc = await loadingTask.promise
        if (cancelled) {
          doc.destroy().catch(() => {})
          return
        }
        docRef.current?.destroy().catch(() => {})
        docRef.current = doc

        const pageInfos: RenderedPage[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const viewport = page.getViewport({ scale: 1 })
          pageInfos.push({ pageNum: i, width: viewport.width, height: viewport.height })
        }
        if (!cancelled) setPages(pageInfos)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pdfPath, resolvePdfUrl])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const task of renderTasksRef.current.values()) task.cancel()
      renderTasksRef.current.clear()
      docRef.current?.destroy().catch(() => {})
      docRef.current = null
    }
  }, [])

  // Compute the effective scale for a page: either fit-to-width (using the
  // container's clientWidth) or the manual zoom.
  const computeScale = useCallback((page: RenderedPage): number => {
    if (fitWidth && containerRef.current) {
      const available = Math.max(200, containerRef.current.clientWidth - 32)
      return available / page.width
    }
    return zoom
  }, [fitWidth, zoom])

  // Render a single page into the canvas with the data-page attribute matching.
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = docRef.current
    if (!doc) return
    const canvas = containerRef.current?.querySelector<HTMLCanvasElement>(
      `canvas[data-page="${pageNum}"]`,
    )
    if (!canvas) return
    const pageInfo = pages.find((p) => p.pageNum === pageNum)
    if (!pageInfo) return

    // Cancel any in-flight render for this page.
    const prev = renderTasksRef.current.get(pageNum)
    if (prev) prev.cancel()

    try {
      const page = await doc.getPage(pageNum)
      const scale = computeScale(pageInfo)
      const viewport = page.getViewport({ scale })
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const task = page.render({ canvasContext: ctx, viewport, canvas })
      renderTasksRef.current.set(pageNum, task)
      await task.promise
      renderedRef.current.add(pageNum)
    } catch (err) {
      // RenderingCancelledException is expected when scrolling fast or
      // resizing — don't surface those.
      const msg = err instanceof Error ? err.name : ""
      if (msg !== "RenderingCancelledException") {
        // eslint-disable-next-line no-console
        console.warn("pdfjs render failed", err)
      }
    }
  }, [pages, computeScale])

  // Lazy render visible (and ±1) pages via IntersectionObserver.
  useEffect(() => {
    const container = containerRef.current
    if (!container || pages.length === 0) return

    const visible = new Set<number>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageAttr = entry.target.getAttribute("data-page")
        const pageNum = pageAttr ? Number(pageAttr) : NaN
        if (!Number.isFinite(pageNum)) continue
        if (entry.isIntersecting) {
          visible.add(pageNum)
        } else {
          visible.delete(pageNum)
        }
      }
      // Pages to render: all visible plus ±1 neighbours.
      const toRender = new Set<number>()
      for (const p of visible) {
        toRender.add(p)
        if (p > 1) toRender.add(p - 1)
        if (p < pages.length) toRender.add(p + 1)
      }
      for (const p of toRender) {
        if (!renderedRef.current.has(p)) renderPage(p)
      }
      // Update current page indicator: pick the smallest visible.
      if (visible.size > 0) {
        const next = Math.min(...visible)
        setCurrentPage(next)
      }
    }, { root: container, rootMargin: "200px", threshold: 0.01 })

    const placeholders = container.querySelectorAll<HTMLDivElement>(".pdf-page")
    placeholders.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [pages, renderPage])

  // Re-render all rendered pages when zoom / fit-width changes.
  useEffect(() => {
    const rendered = Array.from(renderedRef.current)
    renderedRef.current.clear()
    for (const p of rendered) renderPage(p)
  }, [zoom, fitWidth, renderPage])

  // Recompute layout on container resize when fit-width is on.
  useEffect(() => {
    if (!fitWidth) return
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      // Trigger a re-render by forcing the computeScale to recompute via state
      // tick. We simply iterate rendered pages.
      const rendered = Array.from(renderedRef.current)
      renderedRef.current.clear()
      for (const p of rendered) renderPage(p)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [fitWidth, renderPage])

  const scrollToPage = useCallback((pageNum: number) => {
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector<HTMLDivElement>(`.pdf-page[data-page="${pageNum}"]`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const goPrev = useCallback(() => {
    const next = Math.max(1, currentPage - 1)
    setCurrentPage(next)
    scrollToPage(next)
  }, [currentPage, scrollToPage])

  const goNext = useCallback(() => {
    const next = Math.min(pages.length, currentPage + 1)
    setCurrentPage(next)
    scrollToPage(next)
  }, [currentPage, pages.length, scrollToPage])

  const zoomIn = useCallback(() => {
    setFitWidth(false)
    setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))
  }, [])

  const zoomOut = useCallback(() => {
    setFitWidth(false)
    setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))
  }, [])

  const toggleFitWidth = useCallback(() => {
    setFitWidth((f) => !f)
  }, [])

  // Handle a click on a page canvas — derive PDF coordinates and the nearest
  // text (heading-style synctex shim).
  const handlePageClick = useCallback(async (pageNum: number, e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClickSource) return
    const doc = docRef.current
    if (!doc) return
    try {
      const canvas = e.currentTarget
      const rect = canvas.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const page = await doc.getPage(pageNum)
      const pageInfo = pages.find((p) => p.pageNum === pageNum)
      if (!pageInfo) return
      const scale = computeScale(pageInfo)
      const viewport = page.getViewport({ scale })
      // pdfjs provides convertToPdfPoint for canvas->user-space conversion.
      const [pdfX, pdfY] = viewport.convertToPdfPoint(localX, localY)
      // Find nearest text item (small rectangle around click).
      let nearestText = ""
      try {
        const tc = await page.getTextContent()
        let bestDist = Infinity
        for (const item of tc.items) {
          if (!("transform" in item) || !("str" in item)) continue
          const anyItem = item as { transform: number[]; str: string }
          const tx = anyItem.transform[4]
          const ty = anyItem.transform[5]
          const dx = tx - pdfX
          const dy = ty - pdfY
          const d = dx * dx + dy * dy
          if (d < bestDist && anyItem.str.trim().length > 0) {
            bestDist = d
            nearestText = anyItem.str.trim()
          }
        }
      } catch {
        // ignore text-extraction errors
      }
      onClickSource(pageNum, pdfX, pdfY, nearestText)
    } catch {
      // ignore
    }
  }, [onClickSource, pages, computeScale])

  const totalPages = pages.length

  // Compute placeholder dimensions so the layout is stable before render
  // completes (keeps virtualisation predictable).
  const placeholders = useMemo(() => pages.map((p) => {
    const scale = computeScale(p)
    return { ...p, displayWidth: p.width * scale, displayHeight: p.height * scale }
  }), [pages, computeScale])

  return (
    <div className={`pdf-preview-panel${invert ? " inverted" : ""}`}>
      <div className="pdf-toolbar" role="toolbar" aria-label={t.pdfPreview.title}>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={goPrev}
          disabled={currentPage <= 1 || totalPages === 0}
          title={t.pdfPreview.previousPage}
          aria-label={t.pdfPreview.previousPage}
        >
          ‹
        </button>
        <span className="pdf-page-indicator" aria-live="polite">
          {totalPages === 0 ? "—" : `${currentPage} / ${totalPages}`}
        </span>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={goNext}
          disabled={currentPage >= totalPages || totalPages === 0}
          title={t.pdfPreview.nextPage}
          aria-label={t.pdfPreview.nextPage}
        >
          ›
        </button>
        <span className="pdf-toolbar-sep" />
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={zoomOut}
          disabled={!pdfPath}
          title={t.pdfPreview.zoomOut}
          aria-label={t.pdfPreview.zoomOut}
        >
          −
        </button>
        <button
          type="button"
          className={`pdf-toolbar-btn${fitWidth ? " active" : ""}`}
          onClick={toggleFitWidth}
          disabled={!pdfPath}
          title={t.pdfPreview.fitWidth}
          aria-label={t.pdfPreview.fitWidth}
        >
          ↔
        </button>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={zoomIn}
          disabled={!pdfPath}
          title={t.pdfPreview.zoomIn}
          aria-label={t.pdfPreview.zoomIn}
        >
          +
        </button>
      </div>
      <div className="pdf-pages" ref={containerRef}>
        {!pdfPath && (
          <div className="pdf-empty">{t.pdfPreview.noPdf}</div>
        )}
        {pdfPath && loading && (
          <div className="pdf-empty">{t.pdfPreview.loading}</div>
        )}
        {pdfPath && error && (
          <div className="pdf-error">
            {t.pdfPreview.error}: {error}
          </div>
        )}
        {placeholders.map((p) => (
          <div
            key={p.pageNum}
            className="pdf-page"
            data-page={p.pageNum}
            style={{ width: p.displayWidth, height: p.displayHeight }}
          >
            <canvas
              data-page={p.pageNum}
              onClick={(e) => handlePageClick(p.pageNum, e)}
            />
            <div className="pdf-page-label">
              {t.pdfPreview.page} {p.pageNum}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
