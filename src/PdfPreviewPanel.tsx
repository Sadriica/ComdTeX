import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { useT } from "./i18n"
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Icon,
  Search,
  StretchVertical,
  X,
  ZoomIn,
  ZoomOut,
} from "./icons"
import { parseSyncTex, inverseSync, type SyncTexData } from "./synctex"
import {
  ZOOM_PRESETS,
  clampPercent,
  findInRuns,
  nextZoomStep,
  percentToScale,
  scaleToPercent,
} from "./pdfViewerMath"

// Lazy module loader: keep pdfjs out of the initial bundle and behind a
// runtime guard so that environments that cannot parse the worker URL
// (e.g. unit tests under jsdom) fall back gracefully.
type PdfJsModule = typeof import("pdfjs-dist")
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy
type TextContent = Awaited<ReturnType<import("pdfjs-dist").PDFPageProxy["getTextContent"]>>
type TextLayerInstance = InstanceType<PdfJsModule["TextLayer"]>

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
  /**
   * The PDF fills the editor area (a PDF tab). Its keyboard shortcuts (Ctrl +/-,
   * Ctrl+0, Ctrl+F) then apply without hovering it; the side panel only takes
   * them while the pointer or the focus is inside it.
   */
  primary?: boolean
}

interface RenderedPage {
  pageNum: number
  width: number
  height: number
}

type FitMode = "width" | "page" | "manual"

/** Pages on each side of the view whose bitmaps are kept; the rest are freed. */
const PAGES_KEPT_AROUND = 3
/** Scroll quiet time before the queue paints, and the longest it may wait. */
const SCHEDULE_IDLE_MS = 90
const SCHEDULE_MAX_WAIT_MS = 300
/** Horizontal and vertical room the pages pane keeps around a fitted sheet. */
const FIT_PAD_X = 40
const FIT_PAD_Y = 56

interface Sheet extends RenderedPage {
  displayWidth: number
  displayHeight: number
  scale: number
}

/**
 * The sheets. Memoised on its props so a new current page, a typed search or
 * a toolbar change does not re-render hundreds of pages (it did, on every
 * scroll step, and that was most of the jank on long PDFs).
 */
const PdfPageList = memo(function PdfPageList({
  sheets,
  pageLabel,
}: {
  sheets: Sheet[]
  pageLabel: string
}) {
  return (
    <>
      {sheets.map((p) => (
        <div
          key={p.pageNum}
          className="pdf-page"
          data-page={p.pageNum}
          style={
            {
              width: p.displayWidth,
              height: p.displayHeight,
              "--total-scale-factor": p.scale,
            } as CSSProperties
          }
        >
          {/* Zero-sized until the queue paints it (a bare canvas holds 300x150). */}
          <canvas data-page={p.pageNum} width={0} height={0} />
          <div className="pdf-text-layer textLayer" />
          <div className="pdf-page-label">
            {pageLabel} {p.pageNum}
          </div>
        </div>
      ))}
    </>
  )
})

/**
 * PDF viewer, as a side panel or as a whole tab. Pages are virtualised: one
 * render queue paints the pages around the view and frees the others, and a
 * text layer over each painted page makes its text selectable and searchable.
 */
export default function PdfPreviewPanel({
  pdfPath,
  onClickSource,
  synctex,
  focusPage,
  invert = false,
  primary = false,
}: PdfPreviewPanelProps) {
  const t = useT()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const modRef = useRef<PdfJsModule | null>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map())
  const renderedRef = useRef<Set<number>>(new Set())
  // Pages holding a bitmap, current or stale (renderedRef holds the current ones).
  const paintedRef = useRef<Set<number>>(new Set())
  const textLayersRef = useRef<Map<number, TextLayerInstance>>(new Map())
  const textCacheRef = useRef<Map<number, Promise<TextContent>>>(new Map())
  const pointerInsideRef = useRef(false)

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
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = useState<FitMode>("width")
  // Size of the pages pane, tracked so a resized pane re-sizes fitted sheets.
  const [paneSize, setPaneSize] = useState({ w: 0, h: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search state. Matches are (page, ordinal on that page); the text layer
  // recomputes the exact spans when it paints the page.
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [matches, setMatches] = useState<Array<{ page: number; ordinal: number }>>([])
  const [activeMatch, setActiveMatch] = useState(-1)
  const [searching, setSearching] = useState(false)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const queryRef = useRef("")
  const activeRef = useRef<{ page: number; ordinal: number } | null>(null)

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

  const clearPageLayers = useCallback(() => {
    for (const layer of textLayersRef.current.values()) layer.cancel()
    textLayersRef.current.clear()
    textCacheRef.current.clear()
  }, [])

  // Load document whenever the path changes. The viewer shows the document as
  // soon as page 1 is read, with every page at page 1's size; the real sizes
  // are read in the background. Reading all of them first took seconds on a
  // long PDF before anything appeared.
  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new document clears the previous pages and render tasks before loading
    setError(null)
    setPages([])
    setCurrentPage(1)
    setMatches([])
    setActiveMatch(-1)
    renderedRef.current.clear()
    paintedRef.current.clear()
    for (const task of renderTasksRef.current.values()) task.cancel()
    renderTasksRef.current.clear()
    clearPageLayers()

    if (!pdfPath) {
      docRef.current?.loadingTask.destroy().catch(() => {})
      docRef.current = null
      return
    }

    setLoading(true)
    ;(async () => {
      try {
        const mod = await loadPdfJs()
        modRef.current = mod
        const url = await resolvePdfUrl(pdfPath)
        const loadingTask = mod.getDocument({ url })
        const doc = await loadingTask.promise
        if (cancelled) {
          doc.loadingTask.destroy().catch(() => {})
          return
        }
        docRef.current?.loadingTask.destroy().catch(() => {})
        docRef.current = doc

        const first = (await doc.getPage(1)).getViewport({ scale: 1 })
        const initial: RenderedPage[] = Array.from({ length: doc.numPages }, (_, i) => ({
          pageNum: i + 1,
          width: first.width,
          height: first.height,
        }))
        if (cancelled) return
        setPages(initial)
        setLoading(false)

        let differs = false
        const sizes = initial.slice()
        for (let i = 2; i <= doc.numPages; i++) {
          if (cancelled) return
          const vp = (await doc.getPage(i)).getViewport({ scale: 1 })
          if (vp.width !== first.width || vp.height !== first.height) {
            sizes[i - 1] = { pageNum: i, width: vp.width, height: vp.height }
            differs = true
          }
          // Yield now and then so a long document never holds the main thread.
          if (i % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
        }
        if (differs && !cancelled) setPages(sizes)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pdfPath, resolvePdfUrl, clearPageLayers])

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

  // The pane's height only matters when the whole page has to fit.
  const fitHeight = fitMode === "page" ? paneSize.h : 0

  // The scale of a page: fitted to the pane's width or height, or the manual zoom.
  const computeScale = useCallback(
    (page: RenderedPage): number => {
      if (fitMode === "manual") return zoom
      const width = paneSize.w || containerRef.current?.clientWidth || 800
      const byWidth = Math.max(0.1, (width - FIT_PAD_X) / page.width)
      if (fitMode === "width") return byWidth
      const height = fitHeight || containerRef.current?.clientHeight || 600
      return Math.min(byWidth, Math.max(0.1, (height - FIT_PAD_Y) / page.height))
    },
    [fitMode, zoom, paneSize.w, fitHeight],
  )

  /** Text runs of a page, extracted once (search, text layer, click-to-source). */
  const getText = useCallback((pageNum: number): Promise<TextContent> | null => {
    const doc = docRef.current
    if (!doc) return null
    let hit = textCacheRef.current.get(pageNum)
    if (!hit) {
      hit = doc.getPage(pageNum).then((page) => page.getTextContent())
      textCacheRef.current.set(pageNum, hit)
      hit.catch(() => textCacheRef.current.delete(pageNum))
    }
    return hit
  }, [])

  /**
   * Marks the search hits inside a painted page's text layer: each match is
   * wrapped in its own span, the active one gets `pdf-hit-active`.
   */
  const applyHighlights = useCallback((pageNum: number) => {
    const layer = textLayersRef.current.get(pageNum)
    if (!layer) return
    const divs = layer.textDivs
    const runs = layer.textContentItemsStr
    // Undo a previous pass: put each run's plain text back.
    divs.forEach((div, i) => {
      if (div.querySelector(".pdf-hit")) div.textContent = runs[i] ?? div.textContent
    })
    const q = queryRef.current
    if (!q.trim()) return
    const found = findInRuns(runs, q)
    const byRun = new Map<number, typeof found>()
    found.forEach((m) => byRun.set(m.run, [...(byRun.get(m.run) ?? []), m]))
    let ordinal = 0
    let activeEl: HTMLElement | null = null
    const active = activeRef.current
    for (let run = 0; run < runs.length; run++) {
      const hits = byRun.get(run)
      const div = divs[run]
      if (!hits || !div) continue
      const text = runs[run]
      const frag = document.createDocumentFragment()
      let at = 0
      for (const m of hits) {
        if (m.start > at) frag.append(text.slice(at, m.start))
        const mark = document.createElement("span")
        mark.className = "pdf-hit"
        mark.textContent = text.slice(m.start, m.start + m.length)
        if (active && active.page === pageNum && active.ordinal === ordinal) {
          mark.classList.add("pdf-hit-active")
          activeEl = mark
        }
        frag.append(mark)
        at = m.start + m.length
        ordinal++
      }
      if (at < text.length) frag.append(text.slice(at))
      div.replaceChildren(frag)
    }
    activeEl?.scrollIntoView({ block: "center", inline: "nearest" })
  }, [])

  // ── Rendering ─────────────────────────────────────────────────────────────
  // One render queue paints a page at a time (visible pages first, once the
  // scroll settles), paints off screen and copies the result in, and frees
  // pages far from the view. See CHANGELOG 1.34.0 for why.

  const visibleRef = useRef<Set<number>>(new Set())
  const queueGenRef = useRef(0)
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstScheduleRef = useRef(0)

  /** Paint one page off screen and copy it onto its canvas. */
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
        const sheet = containerRef.current?.querySelector<HTMLElement>(
          `.pdf-page[data-page="${pageNum}"]`,
        )
        const canvas = sheet?.querySelector("canvas")
        const ctx = canvas?.getContext("2d")
        if (!sheet || !canvas || !ctx) return
        canvas.width = off.width
        canvas.height = off.height
        ctx.drawImage(off, 0, 0)
        off.width = 0
        off.height = 0
        renderedRef.current.add(pageNum)
        paintedRef.current.add(pageNum)
        textLayersRef.current.get(pageNum)?.cancel()
        textLayersRef.current.delete(pageNum)
      } catch (err) {
        renderTasksRef.current.delete(pageNum)
        // RenderingCancelledException is expected when scrolling fast or
        // resizing: don't surface those.
        const msg = err instanceof Error ? err.name : ""
        if (msg !== "RenderingCancelledException" && msg !== "AbortException") {
          console.warn("pdfjs render failed", err)
        }
      }
    },
    [pages, computeScale],
  )

  /**
   * Text layer: selectable, copyable, searchable text over a painted page. It
   * sizes itself from --total-scale-factor, so a zoom rescales it at once. The
   * queue builds it only after every page in view is painted: measuring the
   * text runs is main-thread work, and the picture matters first.
   */
  const buildTextLayer = useCallback(
    async (pageNum: number, gen: number): Promise<void> => {
      const doc = docRef.current
      const mod = modRef.current
      const pageInfo = pages.find((p) => p.pageNum === pageNum)
      const sheet = containerRef.current?.querySelector<HTMLElement>(
        `.pdf-page[data-page="${pageNum}"]`,
      )
      const layerEl = sheet?.querySelector<HTMLElement>(".pdf-text-layer")
      const textPromise = getText(pageNum)
      if (!doc || !mod || !pageInfo || !layerEl || !textPromise) return
      try {
        const [page, text] = await Promise.all([doc.getPage(pageNum), textPromise])
        if (gen !== queueGenRef.current || !paintedRef.current.has(pageNum)) return
        const viewport = page.getViewport({ scale: computeScale(pageInfo) })
        textLayersRef.current.get(pageNum)?.cancel()
        layerEl.replaceChildren()
        const layer = new mod.TextLayer({ textContentSource: text, container: layerEl, viewport })
        textLayersRef.current.set(pageNum, layer)
        await layer.render()
        applyHighlights(pageNum)
      } catch (err) {
        const name = err instanceof Error ? err.name : ""
        if (name !== "AbortException") console.warn("pdfjs text layer failed", err)
      }
    },
    [pages, computeScale, getText, applyHighlights],
  )

  /** Releases the bitmap and text of a page far from the view (its box keeps its size). */
  const releasePage = useCallback((pageNum: number) => {
    renderTasksRef.current.get(pageNum)?.cancel()
    renderTasksRef.current.delete(pageNum)
    renderedRef.current.delete(pageNum)
    paintedRef.current.delete(pageNum)
    textLayersRef.current.get(pageNum)?.cancel()
    textLayersRef.current.delete(pageNum)
    const sheet = containerRef.current?.querySelector<HTMLElement>(
      `.pdf-page[data-page="${pageNum}"]`,
    )
    const canvas = sheet?.querySelector("canvas")
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    sheet?.querySelector(".pdf-text-layer")?.replaceChildren()
    // Let pdf.js drop the page's parsed operators and fonts too.
    void docRef.current
      ?.getPage(pageNum)
      .then((page) => page.cleanup())
      .catch(() => {})
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
    for (const p of wanted) {
      if (gen !== queueGenRef.current) return
      if (paintedRef.current.has(p) && !textLayersRef.current.has(p)) {
        await buildTextLayer(p, gen)
      }
    }
  }, [pages.length, renderPage, releasePage, buildTextLayer])

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
      },
      { root: container, rootMargin: "200px", threshold: 0.01 },
    )

    const sheets = container.querySelectorAll<HTMLDivElement>(".pdf-page")
    sheets.forEach((el) => observer.observe(el))

    // The current page is the one under the top third of the view (the
    // observer's margin counts neighbours as visible, so it cannot say).
    // Binary search over the sheets' offsets, at most once per frame.
    let frame = 0
    const updateCurrent = () => {
      frame = 0
      const probe = container.scrollTop + container.clientHeight / 3
      let lo = 0
      let hi = sheets.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (sheets[mid].offsetTop <= probe) lo = mid
        else hi = mid - 1
      }
      if (sheets.length > 0) setCurrentPage(lo + 1)
    }
    const onScroll = () => {
      if (scheduleTimerRef.current !== null) scheduleRender()
      if (!frame) frame = requestAnimationFrame(updateCurrent)
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    updateCurrent()

    return () => {
      observer.disconnect()
      container.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [pages, scheduleRender])

  // Zoom, fit mode or a resized pane: every painted page is stale. The old
  // bitmaps stay up (stretched by CSS) until their replacement is ready.
  useEffect(() => {
    renderedRef.current.clear()
    scheduleRender()
  }, [computeScale, scheduleRender])

  // Track the pane's size (fit modes depend on it).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      setPaneSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const scrollToPage = useCallback((pageNum: number, smooth = true) => {
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector<HTMLDivElement>(`.pdf-page[data-page="${pageNum}"]`)
    if (el) el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" })
  }, [])

  // Forward sync: honor an external scroll request once per seq.
  useEffect(() => {
    if (!focusPage || pages.length === 0) return
    const page = Math.min(Math.max(1, focusPage.page), pages.length)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- applies an external scroll request (forward sync) to the page indicator
    setCurrentPage(page)
    scrollToPage(page)
  }, [focusPage, pages.length, scrollToPage])

  const goToPage = useCallback(
    (pageNum: number, smooth = true) => {
      if (pages.length === 0) return
      const next = Math.min(pages.length, Math.max(1, Math.round(pageNum)))
      setCurrentPage(next)
      scrollToPage(next, smooth)
    },
    [pages.length, scrollToPage],
  )

  // ── Zoom ────────────────────────────────────────────────────────────────
  // The scale on screen right now (page 1 stands for the document).
  const currentScale = useCallback(
    () => (pages[0] ? computeScale(pages[0]) : zoom),
    [pages, computeScale, zoom],
  )
  const scaleRef = useRef(1)
  useLayoutEffect(() => {
    scaleRef.current = currentScale()
  }, [currentScale])

  // Zooming keeps the point under the pointer (or the pane's centre) still.
  const anchorRef = useRef<{
    cx: number
    cy: number
    ax: number
    ay: number
    ratio: number
  } | null>(null)
  const setScale = useCallback((nextScale: number, anchor?: { x: number; y: number }) => {
    const container = containerRef.current
    const from = scaleRef.current
    const to = percentToScale(clampPercent(scaleToPercent(nextScale)))
    if (Math.abs(to - from) < 1e-4) return
    if (container) {
      const ax = anchor?.x ?? container.clientWidth / 2
      const ay = anchor?.y ?? container.clientHeight / 2
      anchorRef.current = {
        cx: container.scrollLeft + ax,
        cy: container.scrollTop + ay,
        ax,
        ay,
        ratio: to / from,
      }
    }
    scaleRef.current = to
    setFitMode("manual")
    setZoom(to)
  }, [])

  useLayoutEffect(() => {
    const a = anchorRef.current
    const container = containerRef.current
    if (!a || !container) return
    anchorRef.current = null
    container.scrollLeft = a.cx * a.ratio - a.ax
    container.scrollTop = a.cy * a.ratio - a.ay
  }, [zoom, fitMode])

  const zoomStep = useCallback(
    (dir: 1 | -1) => setScale(percentToScale(nextZoomStep(scaleToPercent(scaleRef.current), dir))),
    [setScale],
  )
  const zoomIn = useCallback(() => zoomStep(1), [zoomStep])
  const zoomOut = useCallback(() => zoomStep(-1), [zoomStep])
  const fitTo = useCallback((mode: "width" | "page") => setFitMode(mode), [])

  // Ctrl+wheel and touchpad pinch (which the webview reports as Ctrl+wheel)
  // zoom the PDF, coalesced to one zoom per frame. The root carries
  // data-gesture-optout, so the app-wide Ctrl+wheel font zoom stays out.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let pending = 1
    let anchor: { x: number; y: number } | null = null
    let frame = 0
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 0.5 : 0.0025
      pending *= Math.exp(-e.deltaY * unit)
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          const factor = pending
          pending = 1
          setScale(scaleRef.current * factor, anchor ?? undefined)
        })
      }
    }
    container.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      container.removeEventListener("wheel", onWheel)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [setScale])

  // ── Search ──────────────────────────────────────────────────────────────
  const searchGenRef = useRef(0)
  useEffect(() => {
    // A closed find bar leaves no marks on the pages.
    queryRef.current = findOpen ? query : ""
    const gen = ++searchGenRef.current
    const doc = docRef.current
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new query starts a new result list
    setMatches([])
    setActiveMatch(-1)
    activeRef.current = null
    for (const p of textLayersRef.current.keys()) applyHighlights(p)
    if (!findOpen || !doc || !query.trim() || pages.length === 0) {
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      const found: Array<{ page: number; ordinal: number }> = []
      for (let p = 1; p <= pages.length; p++) {
        if (gen !== searchGenRef.current) return
        const text = await getText(p)?.catch(() => null)
        if (!text) continue
        const runs = text.items.map((item) => ("str" in item ? item.str : ""))
        const hits = findInRuns(runs, query)
        hits.forEach((_, ordinal) => found.push({ page: p, ordinal }))
        // Show results as they come: the first hit jumps at once.
        if ((hits.length && found.length === hits.length) || p % 20 === 0 || p === pages.length) {
          if (gen !== searchGenRef.current) return
          setMatches(found.slice())
        }
      }
      if (gen === searchGenRef.current) setSearching(false)
    }, 180)
    return () => clearTimeout(timer)
  }, [query, findOpen, pages.length, getText, applyHighlights])

  // The first result becomes active as soon as it exists.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selects the first hit once the search finds one
    if (matches.length > 0 && activeMatch < 0) setActiveMatch(0)
  }, [matches, activeMatch])

  // Moving the active hit: scroll its page into view and mark it.
  useEffect(() => {
    const m = activeMatch >= 0 ? matches[activeMatch] : undefined
    const prev = activeRef.current
    activeRef.current = m ?? null
    if (prev && prev.page !== m?.page) applyHighlights(prev.page)
    if (!m) return
    if (textLayersRef.current.has(m.page)) {
      applyHighlights(m.page)
      // Off screen though painted (a neighbour of the view): bring it in.
      const sheet = containerRef.current?.querySelector(`.pdf-page[data-page="${m.page}"]`)
      if (!sheet?.querySelector(".pdf-hit-active")) scrollToPage(m.page, false)
    } else {
      // Painting it applies the highlight and scrolls to the hit.
      scrollToPage(m.page, false)
    }
  }, [activeMatch, matches, applyHighlights, scrollToPage])

  const stepMatch = useCallback(
    (dir: 1 | -1) => {
      if (matches.length === 0) return
      setActiveMatch((i) => (i < 0 ? 0 : (i + dir + matches.length) % matches.length))
    },
    [matches.length],
  )

  const openFind = useCallback(() => {
    setFindOpen(true)
    // The input exists after this render; focus and select what was typed before.
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }, [])

  const closeFind = useCallback(() => {
    setFindOpen(false)
    containerRef.current?.focus({ preventScroll: true })
  }, [])

  // ── Keyboard ────────────────────────────────────────────────────────────
  // Captured on window so they win over the app's own Ctrl +/- (font size)
  // and Ctrl+F, but only while this viewer is the thing being used.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pdfPath || e.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      const root = rootRef.current
      const inside = !!root && root.contains(document.activeElement)
      if (!(primary || inside || pointerInsideRef.current)) return
      const mod = e.ctrlKey || e.metaKey
      const take = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        take()
        zoomIn()
      } else if (mod && (e.key === "-" || e.key === "_")) {
        take()
        zoomOut()
      } else if (mod && e.key === "0") {
        take()
        fitTo("width")
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "f") {
        take()
        openFind()
      } else if (e.key === "F3" || (mod && e.key.toLowerCase() === "g")) {
        if (!findOpen) return
        take()
        stepMatch(e.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [pdfPath, primary, zoomIn, zoomOut, fitTo, openFind, findOpen, stepMatch])

  // ── Click to source ─────────────────────────────────────────────────────
  // Derive PDF coordinates and the nearest text (heading-style synctex shim).
  // A click that ends a text selection is a selection, not a jump.
  const handlePagesClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onClickSource) return
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) return
      const sheet = (e.target as Element).closest<HTMLElement>(".pdf-page")
      const doc = docRef.current
      if (!sheet || !doc) return
      const pageNum = Number(sheet.dataset.page)
      const pageInfo = pages.find((p) => p.pageNum === pageNum)
      if (!pageInfo) return
      try {
        const rect = sheet.getBoundingClientRect()
        const page = await doc.getPage(pageNum)
        const viewport = page.getViewport({ scale: computeScale(pageInfo) })
        // pdfjs provides convertToPdfPoint for canvas->user-space conversion.
        const [pdfX, pdfY] = viewport.convertToPdfPoint(e.clientX - rect.left, e.clientY - rect.top)
        // Find nearest text item (small rectangle around click).
        let nearestText = ""
        try {
          const tc = await getText(pageNum)
          let bestDist = Infinity
          for (const item of tc?.items ?? []) {
            if (!("transform" in item) || !("str" in item)) continue
            const dx = item.transform[4] - pdfX
            const dy = item.transform[5] - pdfY
            const d = dx * dx + dy * dy
            if (d < bestDist && item.str.trim().length > 0) {
              bestDist = d
              nearestText = item.str.trim()
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
          const hit = inverseSync(syncData, pageNum, pdfX, pageInfo.height - pdfY)
          if (hit) sync = { file: hit.file, line: hit.line }
        }
        onClickSource(pageNum, pdfX, pdfY, nearestText, sync)
      } catch {
        // ignore
      }
    },
    [onClickSource, pages, computeScale, syncData, getText],
  )

  const openExternally = useCallback(() => {
    if (!pdfPath) return
    void import("@tauri-apps/plugin-opener").then((m) => m.openPath(pdfPath)).catch(() => {})
  }, [pdfPath])

  const totalPages = pages.length

  // Sheet sizes, so the layout is stable before any page is painted.
  const sheets = useMemo<Sheet[]>(
    () =>
      // eslint-disable-next-line react-hooks/refs -- the fitted size needs the container size, a DOM measurement taken on purpose
      pages.map((p) => {
        const scale = computeScale(p)
        return { ...p, scale, displayWidth: p.width * scale, displayHeight: p.height * scale }
      }),
    [pages, computeScale],
  )

  // eslint-disable-next-line react-hooks/refs -- the zoom label reads the scale currentScale computes from the pane size
  const percent = Math.round(scaleToPercent(currentScale()))
  const zoomValue = fitMode === "manual" ? String(percent) : fitMode
  const presetValues = ZOOM_PRESETS.map(String)

  const commitPageDraft = () => {
    if (pageDraft !== null) {
      const n = Number(pageDraft)
      // A typed page is a jump, not a glide past dozens of pages.
      if (pageDraft !== "" && Number.isFinite(n) && n !== currentPage) goToPage(n, false)
    }
    setPageDraft(null)
  }

  return (
    <div
      ref={rootRef}
      className={`pdf-preview-panel${invert ? " inverted" : ""}`}
      data-gesture-optout
      onPointerEnter={() => (pointerInsideRef.current = true)}
      onPointerLeave={() => (pointerInsideRef.current = false)}
    >
      <div className="pdf-toolbar" role="toolbar" aria-label={t.pdfPreview.title}>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1 || totalPages === 0}
          title={t.pdfPreview.previousPage}
          aria-label={t.pdfPreview.previousPage}
        >
          <Icon icon={ChevronLeft} size={14} />
        </button>
        <span className="pdf-page-indicator">
          <input
            className="pdf-page-input"
            inputMode="numeric"
            aria-label={t.pdfPreview.goToPage}
            title={t.pdfPreview.goToPage}
            disabled={totalPages === 0}
            value={pageDraft ?? (totalPages === 0 ? "" : String(currentPage))}
            onFocus={(e) => {
              setPageDraft(String(currentPage))
              e.currentTarget.select()
            }}
            onChange={(e) => setPageDraft(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={commitPageDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitPageDraft()
                containerRef.current?.focus({ preventScroll: true })
              } else if (e.key === "Escape") {
                setPageDraft(null)
                containerRef.current?.focus({ preventScroll: true })
              }
            }}
          />
          <span className="pdf-page-total">/ {totalPages === 0 ? "—" : totalPages}</span>
        </span>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages || totalPages === 0}
          title={t.pdfPreview.nextPage}
          aria-label={t.pdfPreview.nextPage}
        >
          <Icon icon={ChevronRight} size={14} />
        </button>
        <span className="pdf-toolbar-sep" />
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={zoomOut}
          disabled={!pdfPath}
          title={`${t.pdfPreview.zoomOut} (Ctrl+-)`}
          aria-label={t.pdfPreview.zoomOut}
        >
          <Icon icon={ZoomOut} size={14} />
        </button>
        <select
          className="pdf-zoom-select"
          aria-label={t.pdfPreview.zoomLevel}
          title={t.pdfPreview.zoomLevel}
          disabled={!pdfPath}
          value={zoomValue}
          onChange={(e) => {
            const v = e.target.value
            if (v === "width" || v === "page") fitTo(v)
            else setScale(percentToScale(Number(v)))
          }}
        >
          <option value="width">{t.pdfPreview.fitWidth}</option>
          <option value="page">{t.pdfPreview.fitPage}</option>
          {fitMode === "manual" && !presetValues.includes(zoomValue) && (
            <option value={zoomValue}>{percent}%</option>
          )}
          {ZOOM_PRESETS.map((p) => (
            <option key={p} value={String(p)}>
              {p}%
            </option>
          ))}
        </select>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={zoomIn}
          disabled={!pdfPath}
          title={`${t.pdfPreview.zoomIn} (Ctrl++)`}
          aria-label={t.pdfPreview.zoomIn}
        >
          <Icon icon={ZoomIn} size={14} />
        </button>
        <button
          type="button"
          className={`pdf-toolbar-btn${fitMode === "width" ? " active" : ""}`}
          onClick={() => fitTo("width")}
          disabled={!pdfPath}
          title={`${t.pdfPreview.fitWidth} (Ctrl+0)`}
          aria-label={t.pdfPreview.fitWidth}
          aria-pressed={fitMode === "width"}
        >
          <Icon icon={ArrowLeftRight} size={14} />
        </button>
        <button
          type="button"
          className={`pdf-toolbar-btn${fitMode === "page" ? " active" : ""}`}
          onClick={() => fitTo("page")}
          disabled={!pdfPath}
          title={t.pdfPreview.fitPage}
          aria-label={t.pdfPreview.fitPage}
          aria-pressed={fitMode === "page"}
        >
          <Icon icon={StretchVertical} size={14} />
        </button>
        <span className="pdf-toolbar-divider" />
        <button
          type="button"
          className={`pdf-toolbar-btn${findOpen ? " active" : ""}`}
          onClick={() => (findOpen ? closeFind() : openFind())}
          disabled={!pdfPath}
          title={`${t.pdfPreview.find} (Ctrl+F)`}
          aria-label={t.pdfPreview.find}
          aria-pressed={findOpen}
        >
          <Icon icon={Search} size={14} />
        </button>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={openExternally}
          disabled={!pdfPath}
          title={t.pdfPreview.openExternal}
          aria-label={t.pdfPreview.openExternal}
        >
          <Icon icon={ExternalLink} size={14} />
        </button>
      </div>
      {findOpen && (
        <div className="pdf-findbar" role="search">
          <Icon icon={Search} size={14} />
          <input
            ref={findInputRef}
            className="pdf-find-input"
            type="search"
            placeholder={t.pdfPreview.findPlaceholder}
            aria-label={t.pdfPreview.find}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                stepMatch(e.shiftKey ? -1 : 1)
              } else if (e.key === "Escape") {
                e.preventDefault()
                closeFind()
              }
            }}
          />
          <span className="pdf-find-count" aria-live="polite">
            {!query.trim()
              ? ""
              : matches.length > 0
                ? t.pdfPreview.findCount(Math.max(1, activeMatch + 1), matches.length) +
                  (searching ? "…" : "")
                : searching
                  ? t.pdfPreview.findSearching
                  : t.pdfPreview.findNone}
          </span>
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={() => stepMatch(-1)}
            disabled={matches.length === 0}
            title={`${t.pdfPreview.findPrevious} (Shift+Enter)`}
            aria-label={t.pdfPreview.findPrevious}
          >
            <Icon icon={ChevronUp} size={14} />
          </button>
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={() => stepMatch(1)}
            disabled={matches.length === 0}
            title={`${t.pdfPreview.findNext} (Enter)`}
            aria-label={t.pdfPreview.findNext}
          >
            <Icon icon={ChevronDown} size={14} />
          </button>
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={closeFind}
            title={t.pdfPreview.findClose}
            aria-label={t.pdfPreview.findClose}
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
      )}
      <div
        className="pdf-pages"
        ref={containerRef}
        tabIndex={0}
        aria-label={t.pdfPreview.title}
        onClick={handlePagesClick}
      >
        {!pdfPath && <div className="pdf-empty">{t.pdfPreview.noPdf}</div>}
        {pdfPath && loading && <div className="pdf-empty">{t.pdfPreview.loading}</div>}
        {pdfPath && error && (
          <div className="pdf-error">
            {t.pdfPreview.error}: {error}
          </div>
        )}
        <PdfPageList sheets={sheets} pageLabel={t.pdfPreview.page} />
      </div>
    </div>
  )
}
