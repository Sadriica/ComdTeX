import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useT } from "./i18n"
import { ArrowLeftRight, Icon } from "./icons"
import { parseSyncTex, inverseSync, type SyncTexData } from "./synctex"

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
        const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
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
   *
   * `sync` is populated only when real SyncTeX data is available (see the
   * `synctex` prop): it carries the resolved input file and 1-based source
   * line for true inverse sync. When absent, callers fall back to matching
   * `nearestText` against document headings.
   */
  onClickSource?: (
    page: number,
    x: number,
    y: number,
    nearestText: string,
    sync?: { file: string; line: number },
  ) => void
  /**
   * Uncompressed SyncTeX text emitted alongside the PDF, when available. When
   * provided and parseable, clicks resolve to an exact source line via inverse
   * sync; otherwise the panel transparently falls back to the heading shim.
   * The bundled WASM engine does not currently emit SyncTeX, so this is
   * normally undefined and the shim remains active.
   */
  synctex?: string | null
  /**
   * Forward-sync request: scroll to `page`. `seq` makes repeated requests for
   * the same page re-fire (state identity would otherwise swallow them).
   */
  focusPage?: { page: number; seq: number } | null
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
/** Pages on each side of the view whose bitmaps are kept; the rest are freed. */
const PAGES_KEPT_AROUND = 3
/** Scroll quiet time before the queue paints, and the longest it may wait. */
const SCHEDULE_IDLE_MS = 90
const SCHEDULE_MAX_WAIT_MS = 300

/**
 * PDF preview pane. Renders the document page-by-page on canvases, virtualised
 * via IntersectionObserver so memory stays bounded for large PDFs.
 */
export default function PdfPreviewPanel({
  pdfPath,
  onClickSource,
  synctex,
  focusPage,
  invert = false,
}: PdfPreviewPanelProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map())
  const renderedRef = useRef<Set<number>>(new Set())
  // Pages holding a bitmap, current or stale (renderedRef holds the current ones).
  const paintedRef = useRef<Set<number>>(new Set())

  // Parse SyncTeX data once per payload. Parsing is tolerant and never throws,
  // so a malformed payload simply yields empty boxes and we fall back to the
  // heading shim. null payload => no synctex (the common case today).
  const syncData = useMemo<SyncTexData | null>(() => {
    if (!synctex) return null
    try {
      const d = parseSyncTex(synctex)
      return d.boxes.length > 0 ? d : null
    } catch {
      return null
    }
  }, [synctex])

  const [pages, setPages] = useState<RenderedPage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [fitWidth, setFitWidth] = useState(true)
  // Width of the pages pane, tracked so a resized pane re-sizes the sheets.
  const [paneWidth, setPaneWidth] = useState(0)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new document clears the previous pages and render tasks before loading
    setError(null)
    setPages([])
    setCurrentPage(1)
    renderedRef.current.clear()
    paintedRef.current.clear()
    for (const task of renderTasksRef.current.values()) task.cancel()
    renderTasksRef.current.clear()

    if (!pdfPath) {
      docRef.current?.loadingTask.destroy().catch(() => {})
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
          doc.loadingTask.destroy().catch(() => {})
          return
        }
        docRef.current?.loadingTask.destroy().catch(() => {})
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
    // The Map is created once and only mutated, so capturing it here is safe.
    const renderTasks = renderTasksRef.current
    return () => {
      for (const task of renderTasks.values()) task.cancel()
      renderTasks.clear()
      docRef.current?.loadingTask.destroy().catch(() => {})
      docRef.current = null
    }
  }, [])

  // Compute the effective scale for a page: either fit-to-width (using the
  // container's clientWidth) or the manual zoom.
  const computeScale = useCallback(
    (page: RenderedPage): number => {
      if (fitWidth && containerRef.current) {
        const width = paneWidth || containerRef.current.clientWidth
        const available = Math.max(200, width - 32)
        return available / page.width
      }
      return zoom
    },
    [fitWidth, zoom, paneWidth],
  )

  // ── Rendering ─────────────────────────────────────────────────────────────
  // Scrolling was slow on long PDFs in the desktop app: every page that came
  // into view started its own render at once (all of them painting on the
  // main thread together), each page cleared to blank before it repainted, and
  // no canvas was ever released, so a 19-page article held 19 full-resolution
  // bitmaps that WebKitGTK composites on the CPU. Now one render queue paints a
  // page at a time (visible pages first, once the scroll settles), paints off
  // screen and copies the result in, and frees pages far from the view.

  const visibleRef = useRef<Set<number>>(new Set())
  const queueGenRef = useRef(0)
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstScheduleRef = useRef(0)

  /** Paint one page off screen, then copy it onto its canvas. */
  const renderPage = useCallback(
    async (pageNum: number, gen: number): Promise<void> => {
      const doc = docRef.current
      const pageInfo = pages.find((p) => p.pageNum === pageNum)
      if (!doc || !pageInfo) return
      renderTasksRef.current.get(pageNum)?.cancel()
      try {
        const page = await doc.getPage(pageNum)
        if (gen !== queueGenRef.current) return
        const scale = computeScale(pageInfo)
        const viewport = page.getViewport({ scale })
        // Past 2x the extra pixels are invisible and only cost paint time.
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const off = document.createElement("canvas")
        off.width = Math.floor(viewport.width * dpr)
        off.height = Math.floor(viewport.height * dpr)
        const offCtx = off.getContext("2d")
        if (!offCtx) return
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const task = page.render({ canvasContext: offCtx, viewport, canvas: off })
        renderTasksRef.current.set(pageNum, task)
        await task.promise
        renderTasksRef.current.delete(pageNum)
        const canvas = containerRef.current?.querySelector<HTMLCanvasElement>(
          `canvas[data-page="${pageNum}"]`,
        )
        const ctx = canvas?.getContext("2d")
        if (!canvas || !ctx) return
        canvas.width = off.width
        canvas.height = off.height
        ctx.drawImage(off, 0, 0)
        off.width = 0
        off.height = 0
        renderedRef.current.add(pageNum)
        paintedRef.current.add(pageNum)
      } catch (err) {
        renderTasksRef.current.delete(pageNum)
        // RenderingCancelledException is expected when scrolling fast or
        // resizing: don't surface those.
        const msg = err instanceof Error ? err.name : ""
        if (msg !== "RenderingCancelledException") {
          console.warn("pdfjs render failed", err)
        }
      }
    },
    [pages, computeScale],
  )

  /** Releases the bitmap of a page far from the view (its box keeps its size). */
  const releasePage = useCallback((pageNum: number) => {
    renderTasksRef.current.get(pageNum)?.cancel()
    renderTasksRef.current.delete(pageNum)
    renderedRef.current.delete(pageNum)
    paintedRef.current.delete(pageNum)
    const canvas = containerRef.current?.querySelector<HTMLCanvasElement>(
      `canvas[data-page="${pageNum}"]`,
    )
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }, [])

  /** Renders what the view needs, one page at a time; a newer call supersedes it. */
  const runQueue = useCallback(async () => {
    const gen = ++queueGenRef.current
    const visible = [...visibleRef.current].sort((x, y) => x - y)
    if (visible.length === 0) return
    const first = visible[0]
    const last = visible[visible.length - 1]
    const keepFrom = first - PAGES_KEPT_AROUND
    const keepTo = last + PAGES_KEPT_AROUND
    for (const p of [...paintedRef.current]) {
      if (p < keepFrom || p > keepTo) releasePage(p)
    }
    const wanted = [...visible]
    if (first > 1) wanted.push(first - 1)
    if (last < pages.length) wanted.push(last + 1)
    for (const p of wanted) {
      if (gen !== queueGenRef.current) return
      if (!renderedRef.current.has(p)) await renderPage(p, gen)
    }
  }, [pages.length, renderPage, releasePage])

  // Wait for the scroll to settle before painting, but never more than
  // SCHEDULE_MAX_WAIT_MS, so a slow continuous scroll still fills pages in.
  const scheduleRender = useCallback(() => {
    const now = performance.now()
    if (scheduleTimerRef.current === null) firstScheduleRef.current = now
    else clearTimeout(scheduleTimerRef.current)
    const waited = now - firstScheduleRef.current
    const delay = Math.max(0, Math.min(SCHEDULE_IDLE_MS, SCHEDULE_MAX_WAIT_MS - waited))
    scheduleTimerRef.current = setTimeout(() => {
      scheduleTimerRef.current = null
      void runQueue()
    }, delay)
  }, [runQueue])

  useEffect(
    () => () => {
      if (scheduleTimerRef.current !== null) clearTimeout(scheduleTimerRef.current)
      queueGenRef.current++
    },
    [],
  )

  // Track which pages are on screen; every change asks the queue to run.
  useEffect(() => {
    const container = containerRef.current
    if (!container || pages.length === 0) return

    const visible = visibleRef.current
    visible.clear()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageAttr = entry.target.getAttribute("data-page")
          const pageNum = pageAttr ? Number(pageAttr) : NaN
          if (!Number.isFinite(pageNum)) continue
          if (entry.isIntersecting) visible.add(pageNum)
          else visible.delete(pageNum)
        }
        scheduleRender()
        // Update current page indicator: pick the smallest visible.
        if (visible.size > 0) setCurrentPage(Math.min(...visible))
      },
      { root: container, rootMargin: "200px", threshold: 0.01 },
    )

    const placeholders = container.querySelectorAll<HTMLDivElement>(".pdf-page")
    placeholders.forEach((el) => observer.observe(el))
    const onScroll = () => {
      if (scheduleTimerRef.current !== null) scheduleRender()
    }
    container.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      observer.disconnect()
      container.removeEventListener("scroll", onScroll)
    }
  }, [pages, scheduleRender])

  // Zoom, fit-width or a resized pane: every painted page is stale. The old
  // bitmaps stay up (stretched by CSS) until their replacement is ready.
  useEffect(() => {
    renderedRef.current.clear()
    scheduleRender()
  }, [zoom, fitWidth, paneWidth, scheduleRender])

  // Recompute layout on container resize when fit-width is on.
  useEffect(() => {
    if (!fitWidth) return
    const container = containerRef.current
    if (!container) return
    let lastWidth = container.clientWidth
    const ro = new ResizeObserver(() => {
      // The observer also fires once on observe and on height-only changes;
      // only a new width changes the fit-to-width scale.
      if (container.clientWidth === lastWidth) return
      lastWidth = container.clientWidth
      // New width, new scale: the sheets resize and the queue repaints them
      // (the zoom effect below reruns through computeScale's identity).
      setPaneWidth(lastWidth)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [fitWidth])

  const scrollToPage = useCallback((pageNum: number) => {
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector<HTMLDivElement>(`.pdf-page[data-page="${pageNum}"]`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  // Forward sync: honor an external scroll request once per seq.
  useEffect(() => {
    if (!focusPage || pages.length === 0) return
    const page = Math.min(Math.max(1, focusPage.page), pages.length)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- applies an external scroll request (forward sync) to the page indicator
    setCurrentPage(page)
    scrollToPage(page)
  }, [focusPage, pages.length, scrollToPage])

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

  // Leaving fit-to-width starts from the scale on screen: the manual zoom
  // kept its own 1.0, so "zoom in" from a wide pane made the page smaller.
  const currentScale = useCallback(
    () => (fitWidth && pages[0] ? computeScale(pages[0]) : zoom),
    [fitWidth, pages, computeScale, zoom],
  )

  const zoomIn = useCallback(() => {
    const from = currentScale()
    setFitWidth(false)
    setZoom(Math.min(MAX_ZOOM, +(from + ZOOM_STEP).toFixed(2)))
  }, [currentScale])

  const zoomOut = useCallback(() => {
    const from = currentScale()
    setFitWidth(false)
    setZoom(Math.max(MIN_ZOOM, +(from - ZOOM_STEP).toFixed(2)))
  }, [currentScale])

  const toggleFitWidth = useCallback(() => {
    setFitWidth((f) => !f)
  }, [])

  // Handle a click on a page canvas: derive PDF coordinates and the nearest
  // text (heading-style synctex shim).
  const handlePageClick = useCallback(
    async (pageNum: number, e: React.MouseEvent<HTMLCanvasElement>) => {
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
        // Real SyncTeX inverse sync, when data is present. pdfjs gives user-space
        // coords (origin bottom-left); our parser stores top-left coords, so flip
        // Y against the page height (in points, at scale 1 = pageInfo.height).
        let sync: { file: string; line: number } | undefined
        if (syncData) {
          const topLeftY = pageInfo.height - pdfY
          const hit = inverseSync(syncData, pageNum, pdfX, topLeftY)
          if (hit) sync = { file: hit.file, line: hit.line }
        }
        onClickSource(pageNum, pdfX, pdfY, nearestText, sync)
      } catch {
        // ignore
      }
    },
    [onClickSource, pages, computeScale, syncData],
  )

  const totalPages = pages.length

  // Compute placeholder dimensions so the layout is stable before render
  // completes (keeps virtualisation predictable).
  const placeholders = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- the placeholder size needs the container width, a DOM measurement taken on purpose
      pages.map((p) => {
        const scale = computeScale(p)
        return { ...p, displayWidth: p.width * scale, displayHeight: p.height * scale }
      }),
    [pages, computeScale],
  )

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
          <Icon icon={ArrowLeftRight} size={14} />
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
        {!pdfPath && <div className="pdf-empty">{t.pdfPreview.noPdf}</div>}
        {pdfPath && loading && <div className="pdf-empty">{t.pdfPreview.loading}</div>}
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
            {/* Zero-sized until the queue paints it (a bare canvas holds 300x150). */}
            <canvas
              data-page={p.pageNum}
              width={0}
              height={0}
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
