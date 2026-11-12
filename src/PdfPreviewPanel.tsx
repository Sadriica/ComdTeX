import { useCallback, useEffect, useRef, useState } from "react"
import "./styles/vendor-pdfjs.css"
import { useT } from "./i18n"
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Highlighter,
  Icon,
  ImagePlus,
  PenLine,
  Redo2,
  Save,
  Search,
  StretchVertical,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "./icons"
import { parseSyncTex, inverseSync, type SyncTexData } from "./synctex"
import { showToast } from "./toastService"
import { installStreamIterator } from "./streamIterator"
import {
  highlightAt,
  loadHighlights,
  saveHighlightsFor,
  vaultRelative,
  type PdfHighlight,
} from "./pdfHighlights"

// pdf.js 6 reads text with `for await` over a ReadableStream, which the
// WebKitGTK of the Linux AppImage (2.50) lacks; see streamIterator.ts.
installStreamIterator()

type PdfJsModule = typeof import("pdfjs-dist")
type ViewerModule = typeof import("pdfjs-dist/web/pdf_viewer.mjs")
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy
type PDFViewer = InstanceType<ViewerModule["PDFViewer"]>
type EventBus = InstanceType<ViewerModule["EventBus"]>

let pdfJsPromise: Promise<{ pdf: PdfJsModule; viewer: ViewerModule }> | null = null
async function loadPdfJs(): Promise<{ pdf: PdfJsModule; viewer: ViewerModule }> {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const pdf = await import("pdfjs-dist")
      try {
        // Vite-friendly worker path. new URL(...) works in both Vite dev and
        // production builds and is how the upstream pdfjs-dist docs recommend
        // wiring the worker for ESM bundlers.
        const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
        pdf.GlobalWorkerOptions.workerSrc = workerUrl
      } catch {
        // Test environments without a worker URL: pdf.js warns and the panel
        // shows its error message instead of crashing.
      }
      // The viewer module expects the core library on globalThis.pdfjsLib.
      ;(globalThis as unknown as { pdfjsLib?: PdfJsModule }).pdfjsLib = pdf
      const viewer = await import("pdfjs-dist/web/pdf_viewer.mjs")
      return { pdf, viewer }
    })()
  }
  return pdfJsPromise
}

export interface PdfPreviewPanelProps {
  /** Absolute path to the PDF, or null if no PDF is available. */
  pdfPath: string | null
  /**
   * Optional callback fired when the user clicks on a page (with no editing
   * tool active). The page number is 1-indexed. (x, y) are in PDF user-space
   * (origin bottom-left). `nearestText` is the closest text snippet on that
   * page (heading-based synctex shim); `sync` is set only with real SyncTeX.
   */
  onClickSource?: (
    page: number,
    x: number,
    y: number,
    nearestText: string,
    sync?: { file: string; line: number },
  ) => void
  /** Uncompressed SyncTeX text emitted alongside the PDF, when available. */
  synctex?: string | null
  /** Forward-sync request: scroll to `page` (`seq` re-fires the same page). */
  focusPage?: { page: number; seq: number } | null
  /** Invert colours for dark themes. */
  invert?: boolean
  /**
   * The PDF fills the editor area (a PDF tab). Its keyboard shortcuts (Ctrl +/-,
   * Ctrl+0, Ctrl+F, Ctrl+S) then apply without hovering it; the side panel only
   * takes them while the pointer or the focus is inside it.
   */
  primary?: boolean
  /** The open vault: highlights saved by 1.34.2 live in it (read and removed only). */
  vaultPath?: string | null
}

/** pdf.js editor modes the toolbar offers (AnnotationEditorType values). */
const EDITOR = { NONE: 0, FREETEXT: 3, HIGHLIGHT: 9, STAMP: 13, INK: 15 } as const
type EditorMode = (typeof EDITOR)[keyof typeof EDITOR]

/** AnnotationEditorParamsType values used here. */
const PARAM = { FREETEXT_COLOR: 12, INK_COLOR: 21, HIGHLIGHT_COLOR: 31 }

/** Marker colours, as pdf.js expects them (name=hex), and the pen colours. */
const HIGHLIGHT_COLORS = { yellow: "#FFFF98", green: "#53FFBC", blue: "#80EBFF", pink: "#FFCBE6" }
const PEN_COLORS = { black: "#000000", red: "#E5383B", navy: "#1C6DD0", forest: "#2B9348" }
type MarkerName = keyof typeof HIGHLIGHT_COLORS
type PenName = keyof typeof PEN_COLORS
type ColorName = MarkerName | PenName

/** The levels offered in the zoom menu, in percent (100% = printed size). */
const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300, 400]

/** FindState from pdf_viewer: FOUND, NOT_FOUND, WRAPPED, PENDING. */
const FIND_NOT_FOUND = 1
const FIND_PENDING = 3

/** Annotations are written into the PDF this long after the last change. */
const AUTOSAVE_MS = 1500

/**
 * PDF viewer, as a side panel or as a whole tab, built on pdf.js's own viewer
 * (virtualised pages, text layer, find controller, annotation editors). The
 * toolbar is ComdTeX's; annotations (highlights, text, drawings, images) are
 * written into the PDF file itself, so every reader shows them.
 */
export default function PdfPreviewPanel({
  pdfPath,
  onClickSource,
  synctex,
  focusPage,
  invert = false,
  primary = false,
  vaultPath = null,
}: PdfPreviewPanelProps) {
  const t = useT()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerDivRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<PDFViewer | null>(null)
  const busRef = useRef<EventBus | null>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const pointerInsideRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [scaleValue, setScaleValue] = useState("page-width")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<EditorMode>(EDITOR.NONE)
  const [marker, setMarker] = useState<MarkerName>("yellow")
  const [pen, setPen] = useState<PenName>("black")
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving">("clean")

  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [findCount, setFindCount] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  })
  const [findState, setFindState] = useState<number | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)

  const syncData = useCallback((): SyncTexData | null => {
    if (!synctex) return null
    try {
      const d = parseSyncTex(synctex)
      return d.boxes.length > 0 ? d : null
    } catch {
      return null
    }
  }, [synctex])

  // Highlights saved by 1.34.2 in the vault, drawn on rendered pages.
  const legacyRef = useRef<PdfHighlight[]>([])
  const drawLegacy = useCallback((pageNumber: number) => {
    const pageDiv = viewerRef.current?.getPageView(pageNumber - 1)?.div as HTMLElement | undefined
    if (!pageDiv) return
    pageDiv.querySelector(":scope > .pdf-legacy-highlights")?.remove()
    const mine = legacyRef.current.filter((h) => h.page === pageNumber)
    if (!mine.length) return
    const layer = document.createElement("div")
    layer.className = "pdf-legacy-highlights"
    layer.setAttribute("aria-hidden", "true")
    for (const h of mine) {
      for (const [x, y, w, hh] of h.rects) {
        const mark = document.createElement("div")
        mark.className = `pdf-hl pdf-hl-${h.color}`
        mark.style.left = `calc(var(--total-scale-factor) * ${x}px)`
        mark.style.top = `calc(var(--total-scale-factor) * ${y}px)`
        mark.style.width = `calc(var(--total-scale-factor) * ${w}px)`
        mark.style.height = `calc(var(--total-scale-factor) * ${hh}px)`
        layer.append(mark)
      }
    }
    // Before the text layer, so the text above stays selectable.
    const text = pageDiv.querySelector(":scope > .textLayer")
    if (text) pageDiv.insertBefore(layer, text)
    else pageDiv.append(layer)
  }, [])

  // ── Viewer setup (once) ──────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false
    ;(async () => {
      const { viewer: lib } = await loadPdfJs()
      const container = containerRef.current
      const viewerDiv = viewerDivRef.current
      if (disposed || !container || !viewerDiv) return
      const eventBus = new lib.EventBus()
      const linkService = new lib.PDFLinkService({ eventBus })
      const findController = new lib.PDFFindController({ eventBus, linkService })
      const viewer = new lib.PDFViewer({
        container,
        viewer: viewerDiv,
        eventBus,
        linkService,
        findController,
        // No language: pdf.js uses its built-in English strings, no fetch.
        l10n: new lib.GenericL10n(undefined),
        annotationEditorMode: EDITOR.NONE,
        annotationEditorHighlightColors: Object.entries(HIGHLIGHT_COLORS)
          .map(([name, hex]) => `${name}=${hex}`)
          .join(","),
        // Bigger canvases cost paint time for no visible gain.
        maxCanvasPixels: 2 ** 24,
        // The sheets get the app's own shadow (components/pdf.css).
        removePageBorders: true,
      })
      linkService.setViewer(viewer)
      viewerRef.current = viewer
      busRef.current = eventBus

      eventBus.on("pagesinit", () => {
        viewer.currentScaleValue = "page-width"
      })
      eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) =>
        setCurrentPage(pageNumber),
      )
      eventBus.on(
        "scalechanging",
        ({ scale: s, presetValue }: { scale: number; presetValue?: string }) => {
          setScale(s)
          setScaleValue(presetValue ?? String(s))
        },
      )
      eventBus.on("annotationeditormodechanged", ({ mode: m }: { mode: number }) =>
        setMode((m === -1 ? EDITOR.NONE : m) as EditorMode),
      )
      eventBus.on(
        "editingstateschanged",
        ({
          details,
        }: {
          details: { hasSomethingToUndo?: boolean; hasSomethingToRedo?: boolean }
        }) => {
          if (details.hasSomethingToUndo !== undefined) setCanUndo(details.hasSomethingToUndo)
          if (details.hasSomethingToRedo !== undefined) setCanRedo(details.hasSomethingToRedo)
        },
      )
      eventBus.on(
        "updatefindmatchescount",
        ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
          setFindCount(matchesCount),
      )
      eventBus.on(
        "updatefindcontrolstate",
        ({
          state,
          matchesCount,
        }: {
          state: number
          matchesCount?: { current: number; total: number }
        }) => {
          setFindState(state)
          if (matchesCount) setFindCount(matchesCount)
        },
      )
      eventBus.on("pagerendered", ({ pageNumber }: { pageNumber: number }) =>
        drawLegacy(pageNumber),
      )
      setReady(true)
    })().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      disposed = true
      viewerRef.current?.cleanup()
      viewerRef.current = null
      busRef.current = null
    }
  }, [drawLegacy])

  // ── Saving annotations into the PDF ──────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Whether the open document has annotations not yet written to the file.
  const dirtyRef = useRef(false)
  const savingRef = useRef<Promise<void> | null>(null)
  const pathRef = useRef(pdfPath)

  const save = useCallback(async () => {
    const doc = docRef.current
    const path = pathRef.current
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    if (!doc || !path || !dirtyRef.current) return
    // One save at a time; a change during a save schedules the next one.
    if (savingRef.current) await savingRef.current
    setSaveState("saving")
    const run = (async () => {
      try {
        const bytes = await doc.saveDocument()
        const { writeFile } = await import("@tauri-apps/plugin-fs")
        await writeFile(path, bytes)
        doc.annotationStorage.resetModified()
        dirtyRef.current = false
        setSaveState("clean")
      } catch (err) {
        setSaveState("dirty")
        showToast(
          t.pdfPreview.saveFailed(err instanceof Error ? err.message : String(err)),
          "error",
        )
      }
    })()
    savingRef.current = run
    await run
    savingRef.current = null
  }, [t])

  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  // ── Loading a document ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return
    const viewer = viewerRef.current
    if (!viewer) return
    let cancelled = false
    const previous = docRef.current
    // Unsaved annotations of the previous PDF are written before it goes.
    const flush = previous && dirtyRef.current ? saveRef.current() : Promise.resolve()
    setError(null)
    setPageCount(0)
    setCurrentPage(1)
    setSaveState("clean")
    setCanUndo(false)
    setCanRedo(false)
    setFindCount({ current: 0, total: 0 })
    setFindState(null)

    setLoading(!!pdfPath)
    ;(async () => {
      try {
        await flush
        pathRef.current = pdfPath
        if (!pdfPath) {
          viewer.setDocument(null as unknown as PDFDocumentProxy)
          previous?.loadingTask.destroy().catch(() => {})
          docRef.current = null
          return
        }
        const { pdf } = await loadPdfJs()
        let url = pdfPath
        try {
          url = (await import("@tauri-apps/api/core")).convertFileSrc(pdfPath)
        } catch {
          /* not in Tauri */
        }
        const doc = await pdf.getDocument({ url }).promise
        if (cancelled) {
          doc.loadingTask.destroy().catch(() => {})
          return
        }
        viewer.setDocument(doc)
        ;(viewer.linkService as unknown as { setDocument(d: PDFDocumentProxy): void }).setDocument(
          doc,
        )
        previous?.loadingTask.destroy().catch(() => {})
        docRef.current = doc
        setPageCount(doc.numPages)
        dirtyRef.current = false
        ;(doc.annotationStorage as unknown as { onSetModified: () => void }).onSetModified = () => {
          dirtyRef.current = true
          setSaveState("dirty")
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfPath, ready])

  // Write pending annotations when the panel goes away.
  useEffect(
    () => () => {
      const doc = docRef.current
      const done = doc && dirtyRef.current ? saveRef.current() : Promise.resolve()
      void done.finally(() => doc?.loadingTask.destroy().catch(() => {}))
    },
    [],
  )

  // ── Navigation and zoom ──────────────────────────────────────────────────
  const goToPage = useCallback((n: number) => {
    const viewer = viewerRef.current
    if (!viewer || !viewer.pagesCount) return
    viewer.currentPageNumber = Math.min(viewer.pagesCount, Math.max(1, Math.round(n)))
  }, [])

  useEffect(() => {
    if (!focusPage || !pageCount) return
    goToPage(focusPage.page)
  }, [focusPage, pageCount, goToPage])

  const setZoom = useCallback((value: string) => {
    const viewer = viewerRef.current
    if (viewer?.pagesCount) viewer.currentScaleValue = value
  }, [])
  const zoomIn = useCallback(() => viewerRef.current?.increaseScale(), [])
  const zoomOut = useCallback(() => viewerRef.current?.decreaseScale(), [])

  // Ctrl+wheel and touchpad pinch (Ctrl+wheel to the webview) zoom around the
  // pointer. The root carries data-gesture-optout, so the app-wide Ctrl+wheel
  // font zoom stays out.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let pending = 1
    let origin: [number, number] = [0, 0]
    let frame = 0
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      origin = [e.clientX, e.clientY]
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 0.5 : 0.0025
      pending *= Math.exp(-e.deltaY * unit)
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          const factor = pending
          pending = 1
          viewerRef.current?.updateScale({ scaleFactor: factor, origin, drawingDelay: 300 })
        })
      }
    }
    container.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      container.removeEventListener("wheel", onWheel)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  // ── Annotation tools ─────────────────────────────────────────────────────
  // Editor parameters travel on the event bus, as in pdf.js's own toolbar.
  const applyColor = useCallback((tool: EditorMode, markerName: MarkerName, penName: PenName) => {
    const bus = busRef.current
    if (!bus) return
    if (tool === EDITOR.HIGHLIGHT) {
      bus.dispatch("switchannotationeditorparams", {
        source: null,
        type: PARAM.HIGHLIGHT_COLOR,
        value: HIGHLIGHT_COLORS[markerName],
      })
    } else if (tool === EDITOR.FREETEXT || tool === EDITOR.INK) {
      bus.dispatch("switchannotationeditorparams", {
        source: null,
        type: tool === EDITOR.FREETEXT ? PARAM.FREETEXT_COLOR : PARAM.INK_COLOR,
        value: PEN_COLORS[penName],
      })
    }
  }, [])

  const toggleTool = useCallback(
    (tool: EditorMode) => {
      const viewer = viewerRef.current
      if (!viewer?.pagesCount) return
      const next = mode === tool ? EDITOR.NONE : tool
      viewer.annotationEditorMode = { mode: next }
      // The new tool starts with the colour last picked for its kind.
      requestAnimationFrame(() => applyColor(next, marker, pen))
    },
    [mode, marker, pen, applyColor],
  )

  const pickColor = useCallback(
    (name: ColorName) => {
      if (name in HIGHLIGHT_COLORS) {
        setMarker(name as MarkerName)
        applyColor(mode, name as MarkerName, pen)
      } else {
        setPen(name as PenName)
        applyColor(mode, marker, name as PenName)
      }
    },
    [mode, marker, pen, applyColor],
  )

  const editingAction = useCallback((name: "undo" | "redo") => {
    busRef.current?.dispatch("editingaction", { source: null, name })
  }, [])

  // ── Search ───────────────────────────────────────────────────────────────
  const dispatchFind = useCallback((again: boolean, previous = false) => {
    busRef.current?.dispatch("find", {
      source: null,
      type: again ? "again" : "",
      query: findInputRef.current?.value ?? "",
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    })
  }, [])

  useEffect(() => {
    if (!findOpen) return
    const timer = setTimeout(() => dispatchFind(false), 150)
    return () => clearTimeout(timer)
  }, [query, findOpen, dispatchFind])

  const openFind = useCallback(() => {
    setFindOpen(true)
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }, [])

  const closeFind = useCallback(() => {
    setFindOpen(false)
    busRef.current?.dispatch("findbarclose", { source: null })
    containerRef.current?.focus({ preventScroll: true })
  }, [])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  // Captured on window so they win over the app's own Ctrl +/- (font size),
  // Ctrl+F and Ctrl+S, but only while this viewer is the thing being used.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pdfPath || e.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      const root = rootRef.current
      const inside = !!root && root.contains(document.activeElement)
      if (!(primary || inside || pointerInsideRef.current)) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
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
        setZoom("page-width")
      } else if (mod && !e.shiftKey && key === "f") {
        take()
        openFind()
      } else if (mod && !e.shiftKey && key === "s") {
        take()
        void saveRef.current()
      } else if ((e.key === "F3" || (mod && key === "g")) && findOpen) {
        take()
        dispatchFind(true, e.shiftKey)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [pdfPath, primary, zoomIn, zoomOut, setZoom, openFind, findOpen, dispatchFind])

  // ── Highlights saved by 1.34.2 (in the vault) ────────────────────────────
  // That version kept highlights in .comdtex-pdf-highlights.json. They are
  // still drawn (under the text) and can be removed; new ones go in the PDF.
  const relPath = pdfPath && vaultPath ? vaultRelative(pdfPath, vaultPath) : null
  const [legacyMenu, setLegacyMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    legacyRef.current = []
    if (!vaultPath || !relPath || !pageCount) return
    void loadHighlights(vaultPath).then((file) => {
      if (cancelled) return
      legacyRef.current = file.files[relPath] ?? []
      for (let i = 1; i <= pageCount; i++) drawLegacy(i)
    })
    return () => {
      cancelled = true
    }
  }, [vaultPath, relPath, pageCount, drawLegacy])

  const removeLegacy = useCallback(
    (id: string) => {
      setLegacyMenu(null)
      const h = legacyRef.current.find((x) => x.id === id)
      legacyRef.current = legacyRef.current.filter((x) => x.id !== id)
      if (h) drawLegacy(h.page)
      if (vaultPath && relPath) {
        saveHighlightsFor(vaultPath, relPath, legacyRef.current).catch(() => {})
      }
    },
    [vaultPath, relPath, drawLegacy],
  )

  useEffect(() => {
    if (!legacyMenu) return
    const close = () => setLegacyMenu(null)
    const container = containerRef.current
    container?.addEventListener("scroll", close, { passive: true })
    window.addEventListener("keydown", close)
    return () => {
      container?.removeEventListener("scroll", close)
      window.removeEventListener("keydown", close)
    }
  }, [legacyMenu])

  // ── Clicks on a page: legacy highlight menu, else click to source ────────
  const handlePagesClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      setLegacyMenu(null)
      if (mode !== EDITOR.NONE) return
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) return
      const target = e.target as Element
      const pageDiv = target.closest<HTMLElement>(".page[data-page-number]")
      const viewer = viewerRef.current
      const doc = docRef.current
      if (!pageDiv || !viewer || !doc) return
      // A link or an annotation handles its own click.
      if (
        target.closest(".annotationLayer a, .annotationLayer section, .annotationEditorLayer > *")
      )
        return
      const pageNum = Number(pageDiv.dataset.pageNumber)
      const view = viewer.getPageView(pageNum - 1)
      if (!view) return
      const rect = pageDiv.getBoundingClientRect()
      const localX = e.clientX - rect.left - pageDiv.clientLeft
      const localY = e.clientY - rect.top - pageDiv.clientTop

      if (legacyRef.current.length) {
        const pts = view.viewport.scale
        const hit = highlightAt(legacyRef.current, pageNum, localX / pts, localY / pts)
        const root = rootRef.current?.getBoundingClientRect()
        if (hit && root) {
          setLegacyMenu({
            id: hit.id,
            x: Math.min(Math.max(8, e.clientX - root.left - 60), root.width - 160),
            y: Math.min(e.clientY - root.top + 12, root.height - 48),
          })
          return
        }
      }

      if (!onClickSource) return
      try {
        const [pdfX, pdfY] = view.viewport.convertToPdfPoint(localX, localY)
        let nearestText = ""
        try {
          const tc = await (await doc.getPage(pageNum)).getTextContent()
          let best = Infinity
          for (const item of tc.items) {
            if (!("transform" in item) || !("str" in item) || !item.str.trim()) continue
            const dx = item.transform[4] - pdfX
            const dy = item.transform[5] - pdfY
            const d = dx * dx + dy * dy
            if (d < best) {
              best = d
              nearestText = item.str.trim()
            }
          }
        } catch {
          // ignore text-extraction errors
        }
        let sync: { file: string; line: number } | undefined
        const data = syncData()
        if (data) {
          const height = view.viewport.viewBox[3] - view.viewport.viewBox[1]
          const hit = inverseSync(data, pageNum, pdfX, height - pdfY)
          if (hit) sync = { file: hit.file, line: hit.line }
        }
        onClickSource(pageNum, pdfX, pdfY, nearestText, sync)
      } catch {
        // ignore
      }
    },
    [mode, onClickSource, syncData],
  )

  const openExternally = useCallback(() => {
    if (!pdfPath) return
    void (async () => {
      // Pending annotations first, so the other reader sees them.
      if (dirtyRef.current) await saveRef.current()
      const { openPath } = await import("@tauri-apps/plugin-opener")
      await openPath(pdfPath)
    })().catch(() => {})
  }, [pdfPath])

  const commitPageDraft = () => {
    if (pageDraft !== null && pageDraft !== "") {
      const n = Number(pageDraft)
      if (Number.isFinite(n) && n !== currentPage) goToPage(n)
    }
    setPageDraft(null)
  }

  const percent = Math.round(scale * 100)
  const fitted = scaleValue === "page-width" || scaleValue === "page-fit"
  const zoomValue = fitted ? scaleValue : String(percent)
  const hasDoc = !!pdfPath && pageCount > 0
  const toolColors: ColorName[] =
    mode === EDITOR.HIGHLIGHT
      ? (Object.keys(HIGHLIGHT_COLORS) as MarkerName[])
      : mode === EDITOR.INK || mode === EDITOR.FREETEXT
        ? (Object.keys(PEN_COLORS) as PenName[])
        : []
  const activeColor: ColorName = mode === EDITOR.HIGHLIGHT ? marker : pen

  const toolButton = (tool: EditorMode, icon: typeof Highlighter, label: string) => (
    <button
      type="button"
      className={`pdf-toolbar-btn${mode === tool ? " active" : ""}`}
      onClick={() => toggleTool(tool)}
      disabled={!hasDoc}
      title={label}
      aria-label={label}
      aria-pressed={mode === tool}
    >
      <Icon icon={icon} size={14} />
    </button>
  )

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
          disabled={!hasDoc || currentPage <= 1}
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
            disabled={!hasDoc}
            value={pageDraft ?? (hasDoc ? String(currentPage) : "")}
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
          <span className="pdf-page-total">/ {hasDoc ? pageCount : "…"}</span>
        </span>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={() => goToPage(currentPage + 1)}
          disabled={!hasDoc || currentPage >= pageCount}
          title={t.pdfPreview.nextPage}
          aria-label={t.pdfPreview.nextPage}
        >
          <Icon icon={ChevronRight} size={14} />
        </button>
        <span className="pdf-toolbar-divider" />
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={zoomOut}
          disabled={!hasDoc}
          title={`${t.pdfPreview.zoomOut} (Ctrl+-)`}
          aria-label={t.pdfPreview.zoomOut}
        >
          <Icon icon={ZoomOut} size={14} />
        </button>
        <select
          className="pdf-zoom-select"
          aria-label={t.pdfPreview.zoomLevel}
          title={t.pdfPreview.zoomLevel}
          disabled={!hasDoc}
          value={zoomValue}
          onChange={(e) => {
            const v = e.target.value
            setZoom(v === "page-width" || v === "page-fit" ? v : String(Number(v) / 100))
          }}
        >
          <option value="page-width">{t.pdfPreview.fitWidth}</option>
          <option value="page-fit">{t.pdfPreview.fitPage}</option>
          {!fitted && !ZOOM_PRESETS.includes(percent) && (
            <option value={String(percent)}>{percent}%</option>
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
          disabled={!hasDoc}
          title={`${t.pdfPreview.zoomIn} (Ctrl++)`}
          aria-label={t.pdfPreview.zoomIn}
        >
          <Icon icon={ZoomIn} size={14} />
        </button>
        <button
          type="button"
          className={`pdf-toolbar-btn${scaleValue === "page-width" ? " active" : ""}`}
          onClick={() => setZoom("page-width")}
          disabled={!hasDoc}
          title={`${t.pdfPreview.fitWidth} (Ctrl+0)`}
          aria-label={t.pdfPreview.fitWidth}
          aria-pressed={scaleValue === "page-width"}
        >
          <Icon icon={ArrowLeftRight} size={14} />
        </button>
        <button
          type="button"
          className={`pdf-toolbar-btn${scaleValue === "page-fit" ? " active" : ""}`}
          onClick={() => setZoom("page-fit")}
          disabled={!hasDoc}
          title={t.pdfPreview.fitPage}
          aria-label={t.pdfPreview.fitPage}
          aria-pressed={scaleValue === "page-fit"}
        >
          <Icon icon={StretchVertical} size={14} />
        </button>
        <span className="pdf-toolbar-divider" />
        {toolButton(EDITOR.HIGHLIGHT, Highlighter, t.pdfPreview.toolHighlight)}
        {toolButton(EDITOR.FREETEXT, Type, t.pdfPreview.toolText)}
        {toolButton(EDITOR.INK, PenLine, t.pdfPreview.toolDraw)}
        {toolButton(EDITOR.STAMP, ImagePlus, t.pdfPreview.toolImage)}
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={() => editingAction("undo")}
          disabled={!canUndo}
          title={`${t.pdfPreview.undo} (Ctrl+Z)`}
          aria-label={t.pdfPreview.undo}
        >
          <Icon icon={Undo2} size={14} />
        </button>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={() => editingAction("redo")}
          disabled={!canRedo}
          title={`${t.pdfPreview.redo} (Ctrl+Y)`}
          aria-label={t.pdfPreview.redo}
        >
          <Icon icon={Redo2} size={14} />
        </button>
        <button
          type="button"
          className={`pdf-toolbar-btn pdf-save-btn${saveState !== "clean" ? " pending" : ""}`}
          onClick={() => void save()}
          disabled={!hasDoc || saveState === "clean"}
          title={
            saveState === "saving"
              ? t.pdfPreview.saving
              : saveState === "dirty"
                ? `${t.pdfPreview.save} (Ctrl+S)`
                : t.pdfPreview.saved
          }
          aria-label={t.pdfPreview.save}
        >
          <Icon icon={Save} size={14} />
        </button>
        <span className="pdf-toolbar-sep" />
        <button
          type="button"
          className={`pdf-toolbar-btn${findOpen ? " active" : ""}`}
          onClick={() => (findOpen ? closeFind() : openFind())}
          disabled={!hasDoc}
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
      {toolColors.length > 0 && (
        <div
          className="pdf-toolbar pdf-tool-options"
          role="toolbar"
          aria-label={t.pdfPreview.toolColor}
        >
          <span className="pdf-tool-hint">
            {mode === EDITOR.HIGHLIGHT
              ? t.pdfPreview.hintHighlight
              : mode === EDITOR.FREETEXT
                ? t.pdfPreview.hintText
                : t.pdfPreview.hintDraw}
          </span>
          {toolColors.map((name) => (
            <button
              key={name}
              type="button"
              className={`pdf-hl-swatch pdf-swatch-${name}${activeColor === name ? " active" : ""}`}
              title={t.pdfPreview.colors[name]}
              aria-label={`${t.pdfPreview.toolColor}: ${t.pdfPreview.colors[name]}`}
              aria-pressed={activeColor === name}
              onClick={() => pickColor(name)}
            />
          ))}
        </div>
      )}
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
                dispatchFind(true, e.shiftKey)
              } else if (e.key === "Escape") {
                e.preventDefault()
                closeFind()
              }
            }}
          />
          <span className="pdf-find-count" aria-live="polite">
            {!query.trim()
              ? ""
              : findCount.total > 0
                ? t.pdfPreview.findCount(Math.max(1, findCount.current), findCount.total)
                : findState === FIND_PENDING || findState === null
                  ? t.pdfPreview.findSearching
                  : findState === FIND_NOT_FOUND
                    ? t.pdfPreview.findNone
                    : ""}
          </span>
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={() => dispatchFind(true, true)}
            disabled={findCount.total === 0}
            title={`${t.pdfPreview.findPrevious} (Shift+Enter)`}
            aria-label={t.pdfPreview.findPrevious}
          >
            <Icon icon={ChevronUp} size={14} />
          </button>
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={() => dispatchFind(true)}
            disabled={findCount.total === 0}
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
      <div className="pdf-pages">
        {!pdfPath && <div className="pdf-empty">{t.pdfPreview.noPdf}</div>}
        {pdfPath && loading && <div className="pdf-empty">{t.pdfPreview.loading}</div>}
        {pdfPath && error && (
          <div className="pdf-error">
            {t.pdfPreview.error}: {error}
          </div>
        )}
        {/* pdf.js's viewer needs an absolutely positioned scroll container. */}
        <div
          ref={containerRef}
          className={`pdf-viewer-container${mode !== EDITOR.NONE ? " editing" : ""}`}
          tabIndex={0}
          aria-label={t.pdfPreview.title}
          onClick={handlePagesClick}
        >
          <div ref={viewerDivRef} className="pdfViewer" />
        </div>
      </div>
      {legacyMenu && (
        <div
          className="pdf-hl-menu"
          role="toolbar"
          aria-label={t.pdfPreview.highlightMenu}
          style={{ left: legacyMenu.x, top: legacyMenu.y }}
        >
          <button
            type="button"
            className="pdf-hl-menu-btn"
            onClick={() => removeLegacy(legacyMenu.id)}
          >
            <Icon icon={Trash2} size={14} />
            {t.pdfPreview.removeHighlight}
          </button>
        </div>
      )}
    </div>
  )
}
