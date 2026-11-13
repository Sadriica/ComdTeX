import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import "./styles/vendor-pdfjs.css"
import { useT } from "./i18n"
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Ellipsis,
  ExternalLink,
  Highlighter,
  Icon,
  ImagePlus,
  ListTree,
  MessageSquare,
  PenLine,
  Printer,
  Quote,
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
import {
  ANNOTATION_TYPE,
  annotationsMarkdown,
  kindOf,
  notePathFor,
  quadBoxes,
  quoteMarkdown,
  rgbToHex,
  sortEntries,
  textInBoxes,
  type PdfAnnotationEntry,
  type TextItemLike,
} from "./pdfAnnotations"
import { commentText, PdfCommentManager, type CommentTarget } from "./pdfCommentManager"
import { caretInTextLayer } from "./pdfTextSnap"
import ContextMenu, { type ContextMenuItem } from "./ContextMenu"

const PdfAnnotationsList = lazy(() => import("./PdfAnnotationsList"))

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
  /** A note was written (the exported annotations): refresh the tree and open it. */
  onNoteCreated?: (path: string) => void
}

/** An annotation editor as this file uses it (pdf.js keeps the class private). */
interface LiveEditor extends CommentTarget {
  uid: string
  pageIndex: number
  annotationElementId: string | null
  deleted?: boolean
  isEmpty(): boolean
  serialize(isForCopying?: boolean): Record<string, unknown> | null
  remove(): void
}

function isLiveEditor(v: unknown): v is LiveEditor {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as LiveEditor).serialize === "function" &&
    typeof (v as LiveEditor).uid === "string"
  )
}

/** A saved annotation, as pdf.js's getAnnotationsByType reports it. */
interface SavedAnnotation {
  id: string
  annotationType: number
  pageIndex: number
  rect: [number, number, number, number]
  color?: ArrayLike<number> | null
  quadPoints?: ArrayLike<number> | null
  contentsObj?: { str?: string } | null
  it?: string | null
}

const ANNOTATION_TYPES = new Set<number>(Object.values(ANNOTATION_TYPE))

/**
 * Sets a comment through pdf.js (the editor or popup stores and saves it);
 * null removes it.
 */
function setTargetComment(target: CommentTarget, text: string | null): void {
  target.comment = text
}

/** File name of a path, either separator. */
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

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
/** How many groups of toolbar buttons can move into the More tools menu. */
const OVERFLOW_LEVELS = 6

/** True when some visible toolbar item sits on a second row. */
function toolbarWraps(bar: HTMLElement): boolean {
  let top = Infinity
  let bottom = -Infinity
  for (const child of bar.children) {
    const r = child.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    top = Math.min(top, r.top)
    bottom = Math.max(bottom, r.top)
  }
  // Items on one row differ in top only by their height difference (a few px).
  return bottom - top > 12
}

/** The toolbar classes that hide every button up to `level`. */
function overflowClasses(level: number): string {
  let classes = ""
  for (let i = 1; i <= level; i++) classes += ` overflow-${i}`
  return classes
}

export default function PdfPreviewPanel({
  pdfPath,
  onClickSource,
  synctex,
  focusPage,
  invert = false,
  primary = false,
  vaultPath = null,
  onNoteCreated,
}: PdfPreviewPanelProps) {
  const t = useT()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const [overflowLevel, setOverflowLevel] = useState(0)
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null)
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

  // Comments: the dialog to write one, the popup that shows one.
  const [commentDialog, setCommentDialog] = useState<{
    target: CommentTarget
    text: string
    x: number
    y: number
  } | null>(null)
  const [commentPopup, setCommentPopup] = useState<{
    target: CommentTarget
    text: string
    x: number
    y: number
    pinned: boolean
  } | null>(null)
  const lastPointerRef = useRef<[number, number]>([0, 0])
  // After highlighting from the selection menu the viewer goes back to reading.
  const backToReadingRef = useRef(false)

  // The menu over a text selection (no tool active).
  const [selectionMenu, setSelectionMenu] = useState<{
    x: number
    y: number
    above: boolean
    text: string
    page: number
  } | null>(null)

  // The Annotations panel.
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [annotations, setAnnotations] = useState<PdfAnnotationEntry[]>([])
  const [annotationsLoading, setAnnotationsLoading] = useState(false)
  const editorsRef = useRef(new Map<string, LiveEditor>())

  const [printing, setPrinting] = useState<string | null>(null)

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

  // pdf.js calls the comment manager from inside the viewer; it reaches the
  // current React state through this ref.
  const commentHostRef = useRef({
    openDialog: (_target: CommentTarget, _x: number, _y: number) => {},
    togglePopup: (_target: CommentTarget | null, _visible: boolean, _pinned: boolean) => {},
    changed: () => {},
  })

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
      const commentManager = new PdfCommentManager({
        openDialog: (target, x, y) => commentHostRef.current.openDialog(target, x, y),
        togglePopup: (target, visible, pinned) =>
          commentHostRef.current.togglePopup(target, visible, pinned),
        changed: () => commentHostRef.current.changed(),
      })
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
        // Comments on highlights, text and drawings, through ComdTeX's dialog.
        enableComment: true,
        commentManager,
      } as ConstructorParameters<typeof lib.PDFViewer>[0])
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
      // pdf.js asks its toolbar for a mode change through these events (to
      // highlight a selection, or to edit an annotation on double click).
      // Firefox's viewer app answers them; here the viewer does.
      eventBus.on("showannotationeditorui", ({ mode: m }: { mode: number }) => {
        viewer.annotationEditorMode = { mode: m }
      })
      eventBus.on("switchannotationeditormode", (evt: { mode: number }) => {
        viewer.annotationEditorMode = evt as unknown as typeof viewer.annotationEditorMode
      })
      eventBus.on("annotationeditormodechanged", ({ mode: m }: { mode: number }) => {
        setMode((m === -1 ? EDITOR.NONE : m) as EditorMode)
        setSelectionMenu(null)
        // A highlight made from the selection menu: pdf.js switched to the
        // highlight tool to make it; once it exists, back to reading.
        if (m === EDITOR.HIGHLIGHT && backToReadingRef.current) {
          setTimeout(() => {
            if (!backToReadingRef.current) return
            backToReadingRef.current = false
            viewer.annotationEditorMode = { mode: EDITOR.NONE }
          }, 0)
        }
      })
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

  // Something changed in the document's annotations: write it shortly, and
  // refresh the Annotations panel.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshAnnotationsRef = useRef<() => void>(() => {})
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => refreshAnnotationsRef.current(), 250)
  }, [])
  const markDirty = useCallback(() => {
    if (!docRef.current) return
    dirtyRef.current = true
    setSaveState("dirty")
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS)
    scheduleRefresh()
  }, [scheduleRefresh])

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
        // The bytes are read from disk every time. Through the asset URL the
        // webview could hand back a cached copy from before the annotations
        // were written, and a save from that copy would drop them.
        const { readFile } = await import("@tauri-apps/plugin-fs")
        const data = await readFile(pdfPath)
        if (cancelled) return
        const doc = await pdf.getDocument({ data }).promise
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
        editorsRef.current.clear()
        setAnnotations([])
        ;(doc.annotationStorage as unknown as { onSetModified: () => void }).onSetModified =
          markDirty
        scheduleRefresh()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfPath, ready, markDirty, scheduleRefresh])

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

  // A fitted zoom follows the pane: a window or sidebar resize, or the
  // Annotations panel opening, refits the pages.
  const scaleValueRef = useRef(scaleValue)
  useEffect(() => {
    scaleValueRef.current = scaleValue
  }, [scaleValue])
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    let frame = 0
    let lastWidth = container.clientWidth
    let lastHeight = container.clientHeight
    const observer = new ResizeObserver(() => {
      if (container.clientWidth === lastWidth && container.clientHeight === lastHeight) return
      lastWidth = container.clientWidth
      lastHeight = container.clientHeight
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        const fit = scaleValueRef.current
        const viewer = viewerRef.current
        if (viewer?.pagesCount && (fit === "page-width" || fit === "page-fit")) {
          viewer.currentScaleValue = fit
        }
      })
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
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

  // ── Highlights follow the text ───────────────────────────────────────────
  // With the Highlight tool, pdf.js turns a drag that starts off the glyphs
  // (between words or lines, in a margin) into a freehand marker stroke. Here
  // the marker always follows the text, as in Chrome or Zotero: such a drag
  // starts a text selection instead. Pages without text (scans) keep the
  // freehand marker, the only way to mark them.
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onPointerDown = (e: PointerEvent) => {
      lastPointerRef.current = [e.clientX, e.clientY]
      if (modeRef.current !== EDITOR.HIGHLIGHT) return
      const target = e.target as HTMLElement
      const layer = target.closest<HTMLElement>(".textLayer")
      if (!layer) return
      const offText = target === layer || target.classList.contains("endOfContent")
      if (!offText || e.button !== 0 || !layer.querySelector("span:not(.markedContent)")) return
      const start = caretInTextLayer(layer, e.clientX, e.clientY)
      if (!start) return
      // Neither pdf.js's freehand stroke nor the browser's (empty) selection:
      // the selection is built here, from the text nearest the pointer.
      e.preventDefault()
      e.stopPropagation()
      const sel = window.getSelection()
      if (!sel) return
      sel.setBaseAndExtent(start.node, start.offset, start.node, start.offset)
      const move = (ev: PointerEvent) => {
        const end = caretInTextLayer(layer, ev.clientX, ev.clientY)
        if (end) sel.setBaseAndExtent(start.node, start.offset, end.node, end.offset)
      }
      const stop = () => {
        window.removeEventListener("pointermove", move, true)
        window.removeEventListener("pointerup", stop, true)
        window.removeEventListener("pointercancel", stop, true)
      }
      window.addEventListener("pointermove", move, true)
      window.addEventListener("pointerup", stop, true)
      window.addEventListener("pointercancel", stop, true)
    }
    const onPointerMove = (e: PointerEvent) => {
      lastPointerRef.current = [e.clientX, e.clientY]
    }
    container.addEventListener("pointerdown", onPointerDown, true)
    container.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true)
      container.removeEventListener("pointermove", onPointerMove)
    }
  }, [])

  // ── The selection menu ───────────────────────────────────────────────────
  // Select text with no tool on and a small menu offers the marker colours,
  // a comment, Copy and Copy as quote (with a link back to the page).
  const readSelection = useCallback(() => {
    const container = containerRef.current
    const root = rootRef.current
    const sel = window.getSelection()
    if (!container || !root || !sel || sel.isCollapsed || !sel.rangeCount) return null
    const range = sel.getRangeAt(0)
    const anchor =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement
    if (!anchor || !container.contains(anchor)) return null
    const start =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement
    const pageDiv = start?.closest<HTMLElement>(".page[data-page-number]")
    if (!pageDiv || !start?.closest(".textLayer")) return null
    const text = sel.toString().trim()
    if (!text) return null
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
    if (!rects.length) return null
    const box = root.getBoundingClientRect()
    const top = Math.min(...rects.map((r) => r.top))
    const bottom = Math.max(...rects.map((r) => r.bottom))
    const last = rects[rects.length - 1]
    const above = top - box.top > 64
    return {
      x: Math.min(Math.max(8, last.right - box.left - 120), box.width - 260),
      y: above ? top - box.top - 8 : bottom - box.top + 8,
      above,
      text,
      page: Number(pageDiv.dataset.pageNumber),
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onUp = () => {
      if (modeRef.current !== EDITOR.NONE) return
      // After the browser has settled the selection.
      setTimeout(() => setSelectionMenu(readSelection()), 0)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey && modeRef.current === EDITOR.NONE) setSelectionMenu(readSelection())
    }
    const onSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) setSelectionMenu(null)
    }
    const onScroll = () => setSelectionMenu((m) => (m ? readSelection() : m))
    container.addEventListener("pointerup", onUp)
    container.addEventListener("keyup", onKeyUp)
    container.addEventListener("scroll", onScroll, { passive: true })
    document.addEventListener("selectionchange", onSelectionChange)
    return () => {
      container.removeEventListener("pointerup", onUp)
      container.removeEventListener("keyup", onKeyUp)
      container.removeEventListener("scroll", onScroll)
      document.removeEventListener("selectionchange", onSelectionChange)
    }
  }, [readSelection])

  const highlightSelection = useCallback((color: MarkerName, withComment = false) => {
    const bus = busRef.current
    if (!bus) return
    setMarker(color)
    bus.dispatch("switchannotationeditorparams", {
      source: null,
      type: PARAM.HIGHLIGHT_COLOR,
      value: HIGHLIGHT_COLORS[color],
    })
    backToReadingRef.current = true
    setSelectionMenu(null)
    bus.dispatch("editingaction", {
      source: null,
      name: withComment ? "commentSelection" : "highlightSelection",
    })
  }, [])

  const pdfName = pdfPath ? baseName(pdfPath) : ""

  const copySelection = useCallback(
    (asQuote: boolean) => {
      const menu = selectionMenu
      if (!menu) return
      const text = asQuote
        ? quoteMarkdown(menu.text, pdfName, menu.page, { page: t.pdfPreview.pageAbbrev })
        : menu.text
      void navigator.clipboard.writeText(text).then(
        () => showToast(asQuote ? t.pdfPreview.quoteCopied : t.pdfPreview.copied, "success", 2000),
        () => {},
      )
      setSelectionMenu(null)
    },
    [selectionMenu, pdfName, t],
  )

  // ── Comments ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!commentPopup?.pinned) return
    const close = (e: Event) => {
      const target = e.target as Element | null
      if (target?.closest?.(".pdf-comment-popup, .annotationCommentButton, .comment")) return
      setCommentPopup(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCommentPopup(null)
    window.addEventListener("pointerdown", close, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", close, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [commentPopup?.pinned])

  const placeNear = useCallback((x: number, y: number, width: number, height: number) => {
    const box = rootRef.current?.getBoundingClientRect()
    if (!box) return { x: 8, y: 8 }
    return {
      x: Math.min(Math.max(8, x - box.left), Math.max(8, box.width - width - 8)),
      y: Math.min(Math.max(8, y - box.top + 12), Math.max(8, box.height - height - 8)),
    }
  }, [])

  useEffect(() => {
    commentHostRef.current = {
      openDialog: (target, x, y) => {
        setCommentPopup(null)
        const at = placeNear(x, y, 300, 180)
        setCommentDialog({ target, text: commentText(target), ...at })
      },
      togglePopup: (target, visible, pinned) => {
        if (!target || !visible) {
          setCommentPopup((p) => (p && (!target || p.target === target) ? null : p))
          return
        }
        const text = commentText(target)
        if (!text) return
        const [px, py] = lastPointerRef.current
        setCommentPopup({ target, text, pinned, ...placeNear(px, py, 280, 120) })
      },
      changed: () => markDirty(),
    }
  }, [placeNear, markDirty])

  const closeCommentDialog = useCallback(() => {
    setCommentDialog(null)
    containerRef.current?.focus({ preventScroll: true })
  }, [])

  const saveComment = useCallback(
    (text: string | null) => {
      const dialog = commentDialog
      if (!dialog) return
      try {
        setTargetComment(dialog.target, text && text.trim() ? text.trim() : null)
      } catch (err) {
        showToast(
          t.pdfPreview.saveFailed(err instanceof Error ? err.message : String(err)),
          "error",
        )
      }
      markDirty()
      closeCommentDialog()
    },
    [commentDialog, markDirty, closeCommentDialog, t],
  )

  // ── The Annotations panel ────────────────────────────────────────────────
  const originalsRef = useRef<{ doc: PDFDocumentProxy; list: Promise<SavedAnnotation[]> } | null>(
    null,
  )
  const pageTextRef = useRef<{
    doc: PDFDocumentProxy | null
    pages: Map<number, Promise<TextItemLike[]>>
  }>({
    doc: null,
    pages: new Map(),
  })

  const pageText = useCallback((doc: PDFDocumentProxy, pageIndex: number) => {
    const cache = pageTextRef.current
    if (cache.doc !== doc) {
      cache.doc = doc
      cache.pages = new Map()
    }
    let items = cache.pages.get(pageIndex)
    if (!items) {
      items = doc
        .getPage(pageIndex + 1)
        .then((page) => page.getTextContent())
        .then((tc) => tc.items.filter((i): i is TextItemLike & typeof i => "str" in i))
        .catch(() => [])
      cache.pages.set(pageIndex, items)
    }
    return items
  }, [])

  const collectAnnotations = useCallback(async (): Promise<PdfAnnotationEntry[]> => {
    const doc = docRef.current
    if (!doc) return []
    if (originalsRef.current?.doc !== doc) {
      originalsRef.current = {
        doc,
        list: (
          doc.getAnnotationsByType(ANNOTATION_TYPES, null as unknown as Set<number>) as Promise<
            SavedAnnotation[]
          >
        ).catch(() => []),
      }
    }
    const saved = await originalsRef.current.list
    const byId = new Map<string, PdfAnnotationEntry>()
    for (const a of saved) {
      const kind = kindOf(a.annotationType, a.it)
      if (!kind) continue
      const contents = a.contentsObj?.str ?? ""
      let text = ""
      let comment = contents
      if (kind === "text" || kind === "note") {
        text = contents
        comment = ""
      } else if (kind === "highlight") {
        const boxes = a.quadPoints?.length ? quadBoxes(a.quadPoints) : [a.rect]
        text = textInBoxes(await pageText(doc, a.pageIndex), boxes)
      }
      byId.set(a.id, {
        id: a.id,
        page: a.pageIndex + 1,
        kind,
        color: rgbToHex(a.color),
        text,
        comment,
        rect: [...a.rect] as PdfAnnotationEntry["rect"],
        live: false,
      })
    }

    const editors = new Map<string, LiveEditor>()
    const live: PdfAnnotationEntry[] = []
    const storage = doc.annotationStorage as unknown as Iterable<[string, unknown]>
    for (const [, value] of storage) {
      if (isLiveEditor(value)) {
        const ed = value
        if (ed.deleted) {
          if (ed.annotationElementId) byId.delete(ed.annotationElementId)
          continue
        }
        if (ed.isEmpty()) continue
        const original = ed.annotationElementId ? byId.get(ed.annotationElementId) : undefined
        const s = ed.serialize(false) as {
          annotationType?: number
          pageIndex?: number
          rect?: number[]
          color?: number[]
          quadPoints?: number[] | null
          value?: string
          deleted?: boolean
        } | null
        const comment = (ed.comment as { text?: string; deleted?: boolean } | null) ?? null
        const commentStr = comment && !comment.deleted ? (comment.text ?? "") : ""
        if (!s || s.deleted) {
          // An annotation of the file opened for editing but unchanged.
          if (original && ed.annotationElementId) {
            byId.delete(ed.annotationElementId)
            live.push({
              ...original,
              id: ed.uid,
              live: true,
              comment: commentStr || original.comment,
            })
            editors.set(ed.uid, ed)
          }
          continue
        }
        const kind = kindOf(s.annotationType ?? -1)
        if (!kind || !s.rect) continue
        const pageIndex = s.pageIndex ?? ed.pageIndex
        let text = ""
        if (kind === "text") text = s.value ?? ""
        else if (kind === "highlight") {
          const boxes = s.quadPoints?.length ? quadBoxes(s.quadPoints) : [s.rect]
          text = textInBoxes(await pageText(doc, pageIndex), boxes)
        }
        if (ed.annotationElementId) byId.delete(ed.annotationElementId)
        live.push({
          id: ed.uid,
          page: pageIndex + 1,
          kind,
          color: rgbToHex(s.color) ?? original?.color ?? null,
          text,
          comment: commentStr,
          rect: s.rect.slice(0, 4) as PdfAnnotationEntry["rect"],
          live: true,
        })
        editors.set(ed.uid, ed)
      } else if (value && typeof value === "object" && "popup" in value && "id" in value) {
        // A comment changed on an annotation of the file (its popup).
        const v = value as { id: string; popup?: { deleted?: boolean; contents?: string } }
        const o = byId.get(v.id)
        if (o && v.popup) o.comment = v.popup.deleted ? "" : (v.popup.contents ?? "")
      }
    }
    editorsRef.current = editors
    return sortEntries([...byId.values(), ...live])
  }, [pageText])

  useEffect(() => {
    refreshAnnotationsRef.current = () => {
      if (!annotationsOpen) return
      setAnnotationsLoading(true)
      void collectAnnotations()
        .then(setAnnotations)
        .finally(() => setAnnotationsLoading(false))
    }
    if (annotationsOpen) refreshAnnotationsRef.current()
  }, [annotationsOpen, collectAnnotations])

  const jumpTo = useCallback((entry: PdfAnnotationEntry) => {
    const viewer = viewerRef.current
    if (!viewer?.pagesCount) return
    viewer.scrollPageIntoView({
      pageNumber: entry.page,
      destArray: [null, { name: "XYZ" }, entry.rect[0], entry.rect[3] + 36, null],
      allowNegativeOffset: true,
    })
  }, [])

  const commentOnEntry = useCallback(
    (entry: PdfAnnotationEntry) => {
      const editor = editorsRef.current.get(entry.id)
      if (!editor) return
      jumpTo(entry)
      const box = rootRef.current?.getBoundingClientRect()
      const at = box
        ? placeNear(box.left + box.width / 2 - 150, box.top + 80, 300, 180)
        : { x: 8, y: 8 }
      setCommentDialog({ target: editor, text: commentText(editor), ...at })
    },
    [jumpTo, placeNear],
  )

  const deleteEntry = useCallback(
    (entry: PdfAnnotationEntry) => {
      const editor = editorsRef.current.get(entry.id)
      if (!editor) return
      try {
        editor.remove()
      } catch {
        /* already gone */
      }
      markDirty()
    },
    [markDirty],
  )

  const notesLabels = useCallback(
    () => ({
      page: t.pdfPreview.pageAbbrev,
      title: t.pdfPreview.noteTitle,
      pageHeading: t.pdfPreview.pageHeading,
      kinds: t.pdfPreview.kinds,
      empty: t.pdfPreview.noteEmpty,
    }),
    [t],
  )

  const copyAllMarkdown = useCallback(() => {
    const md = annotationsMarkdown(pdfName, annotations, notesLabels())
    void navigator.clipboard.writeText(md).then(
      () => showToast(t.pdfPreview.markdownCopied, "success", 2000),
      () => {},
    )
  }, [annotations, pdfName, notesLabels, t])

  const exportToNote = useCallback(() => {
    if (!pdfPath) return
    void (async () => {
      const { exists } = await import("@tauri-apps/plugin-fs")
      const { writeTextFileAtomic } = await import("./atomicWrite")
      // Never over an existing note: paper-annotations.md, then -2, -3...
      const first = notePathFor(pdfPath)
      let target = first
      for (let n = 2; await exists(target); n++) target = first.replace(/\.md$/, `-${n}.md`)
      await writeTextFileAtomic(target, annotationsMarkdown(pdfName, annotations, notesLabels()))
      showToast(t.pdfPreview.exported(baseName(target)), "success", 3000)
      onNoteCreated?.(target)
    })().catch((err: unknown) =>
      showToast(
        t.pdfPreview.exportFailed(err instanceof Error ? err.message : String(err)),
        "error",
      ),
    )
  }, [pdfPath, pdfName, annotations, notesLabels, onNoteCreated, t])

  // ── Print ────────────────────────────────────────────────────────────────
  const printAbortRef = useRef<AbortController | null>(null)
  const print = useCallback(() => {
    const doc = docRef.current
    if (!doc || printAbortRef.current) return
    const abort = (printAbortRef.current = new AbortController())
    setPrinting(t.pdfPreview.printing(0, doc.numPages))
    void (async () => {
      const { renderPagesForPrint, printImages } = await import("./pdfPrint")
      const pages = await renderPagesForPrint(
        doc,
        (done, total) => setPrinting(t.pdfPreview.printing(done, total)),
        abort.signal,
      )
      printImages(pages.urls, pages.widthPt, pages.heightPt)
    })()
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        showToast(
          t.pdfPreview.printFailed(err instanceof Error ? err.message : String(err)),
          "error",
        )
      })
      .finally(() => {
        printAbortRef.current = null
        setPrinting(null)
      })
  }, [t])
  useEffect(() => () => printAbortRef.current?.abort(), [])

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

  // The toolbar keeps to one row: when it does not fit, the least-used buttons
  // move into the More tools menu a level at a time (each button's
  // data-overflow). Measured rather than guessed, so a longer Spanish zoom
  // label or a long page count is accounted for.
  const fitToolbar = useCallback(() => {
    const bar = toolbarRef.current
    if (!bar) return
    const keep = bar.className
    let level = 0
    for (; level < OVERFLOW_LEVELS; level++) {
      bar.className = `pdf-toolbar${overflowClasses(level)}`
      if (!toolbarWraps(bar)) break
    }
    bar.className = keep
    setOverflowLevel(level)
    if (level === 0) setMoreMenu(null)
  }, [])
  useLayoutEffect(fitToolbar, [fitToolbar, t, pageCount, hasDoc, zoomValue])
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let width = root.clientWidth
    const observer = new ResizeObserver(() => {
      if (root.clientWidth === width) return
      width = root.clientWidth
      fitToolbar()
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [fitToolbar])
  const closeMoreMenu = useCallback(() => setMoreMenu(null), [])
  // In toolbar order; each entry carries the level at which its button hides.
  const overflowItems: ContextMenuItem[] = (
    [
      [3, t.pdfPreview.previousPage, () => goToPage(currentPage - 1), !hasDoc || currentPage <= 1],
      [
        3,
        t.pdfPreview.nextPage,
        () => goToPage(currentPage + 1),
        !hasDoc || currentPage >= pageCount,
      ],
      [2, t.pdfPreview.zoomOut, zoomOut, !hasDoc],
      [2, t.pdfPreview.zoomIn, zoomIn, !hasDoc],
      [3, t.pdfPreview.fitWidth, () => setZoom("page-width"), !hasDoc],
      [2, t.pdfPreview.fitPage, () => setZoom("page-fit"), !hasDoc],
      [4, t.pdfPreview.undo, () => editingAction("undo"), !canUndo],
      [4, t.pdfPreview.redo, () => editingAction("redo"), !canRedo],
      [6, t.pdfPreview.save, () => void save(), !hasDoc || saveState === "clean"],
      [5, t.pdfPreview.annotations, () => setAnnotationsOpen((o) => !o), !hasDoc],
      [1, t.pdfPreview.print, print, !hasDoc || !!printing],
      [5, t.pdfPreview.find, () => (findOpen ? closeFind() : openFind()), !hasDoc],
      [1, t.pdfPreview.openExternal, openExternally, !pdfPath],
    ] as const
  )
    .filter(([level]) => level <= overflowLevel)
    .map(([, label, action, disabled]) => ({ label, action, disabled }))

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
      className={`pdf-preview-panel${invert ? " inverted" : ""}${annotationsOpen && hasDoc ? " with-annotations" : ""}`}
      data-gesture-optout
      onPointerEnter={() => (pointerInsideRef.current = true)}
      onPointerLeave={() => (pointerInsideRef.current = false)}
    >
      <div
        ref={toolbarRef}
        className={`pdf-toolbar${overflowClasses(overflowLevel)}`}
        role="toolbar"
        aria-label={t.pdfPreview.title}
      >
        <button
          data-overflow="3"
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
          data-overflow="3"
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
          data-overflow="2"
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
          data-overflow="2"
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
          data-overflow="3"
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
          data-overflow="2"
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
          data-overflow="4"
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
          data-overflow="4"
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
          data-overflow="6"
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
          data-overflow="5"
          type="button"
          className={`pdf-toolbar-btn${annotationsOpen ? " active" : ""}`}
          onClick={() => setAnnotationsOpen((o) => !o)}
          disabled={!hasDoc}
          title={t.pdfPreview.annotations}
          aria-label={t.pdfPreview.annotations}
          aria-pressed={annotationsOpen}
        >
          <Icon icon={ListTree} size={14} />
        </button>
        <button
          data-overflow="1"
          type="button"
          className="pdf-toolbar-btn"
          onClick={print}
          disabled={!hasDoc || !!printing}
          title={printing ?? t.pdfPreview.print}
          aria-label={t.pdfPreview.print}
        >
          <Icon icon={Printer} size={14} />
        </button>
        <button
          data-overflow="5"
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
          data-overflow="1"
          type="button"
          className="pdf-toolbar-btn"
          onClick={openExternally}
          disabled={!pdfPath}
          title={t.pdfPreview.openExternal}
          aria-label={t.pdfPreview.openExternal}
        >
          <Icon icon={ExternalLink} size={14} />
        </button>
        <button
          type="button"
          className={`pdf-toolbar-btn pdf-more-btn${moreMenu ? " active" : ""}`}
          // Stop the open menu's outside-click handler from closing it just
          // before this click would reopen it.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            if (moreMenu) return setMoreMenu(null)
            const r = e.currentTarget.getBoundingClientRect()
            setMoreMenu({ x: Math.max(8, r.right - 200), y: r.bottom + 4 })
          }}
          title={t.pdfPreview.moreTools}
          aria-label={t.pdfPreview.moreTools}
          aria-haspopup="menu"
          aria-expanded={!!moreMenu}
        >
          <Icon icon={Ellipsis} size={14} />
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
        {printing && (
          <div className="pdf-print-status" role="status">
            {printing}
          </div>
        )}
        {annotationsOpen && hasDoc && (
          <Suspense fallback={null}>
            <PdfAnnotationsList
              entries={annotations}
              loading={annotationsLoading}
              onJump={jumpTo}
              onComment={commentOnEntry}
              onDelete={deleteEntry}
              onCopyAll={copyAllMarkdown}
              onExport={exportToNote}
              onClose={() => setAnnotationsOpen(false)}
            />
          </Suspense>
        )}
      </div>
      {selectionMenu && (
        <div
          className={`pdf-selection-menu${selectionMenu.above ? " above" : ""}`}
          role="toolbar"
          aria-label={t.pdfPreview.selectionMenu}
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          onPointerDown={(e) => e.preventDefault()}
        >
          {(Object.keys(HIGHLIGHT_COLORS) as MarkerName[]).map((name) => (
            <button
              key={name}
              type="button"
              className={`pdf-hl-swatch pdf-swatch-${name}`}
              title={t.pdfPreview.highlightIn(t.pdfPreview.colors[name])}
              aria-label={t.pdfPreview.highlightIn(t.pdfPreview.colors[name])}
              onClick={() => highlightSelection(name)}
            />
          ))}
          <span className="pdf-toolbar-divider" />
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={() => highlightSelection(marker, true)}
            title={t.pdfPreview.comment}
            aria-label={t.pdfPreview.comment}
          >
            <Icon icon={MessageSquare} size={14} />
          </button>
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={() => copySelection(false)}
            title={t.pdfPreview.copy}
            aria-label={t.pdfPreview.copy}
          >
            <Icon icon={Copy} size={14} />
          </button>
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={() => copySelection(true)}
            title={t.pdfPreview.copyQuote}
            aria-label={t.pdfPreview.copyQuote}
          >
            <Icon icon={Quote} size={14} />
          </button>
        </div>
      )}
      {commentPopup && !commentDialog && (
        <div
          className="pdf-comment-popup"
          role="note"
          style={{ left: commentPopup.x, top: commentPopup.y }}
        >
          <p className="pdf-comment-popup-text">{commentPopup.text}</p>
          {commentPopup.pinned && (
            <div className="pdf-comment-popup-actions">
              <button
                type="button"
                className="pdf-toolbar-btn"
                onClick={() =>
                  commentHostRef.current.openDialog(
                    commentPopup.target,
                    commentPopup.x + (rootRef.current?.getBoundingClientRect().left ?? 0),
                    commentPopup.y + (rootRef.current?.getBoundingClientRect().top ?? 0),
                  )
                }
                title={t.pdfPreview.editComment}
                aria-label={t.pdfPreview.editComment}
              >
                <Icon icon={PenLine} size={14} />
              </button>
              <button
                type="button"
                className="pdf-toolbar-btn"
                onClick={() => setCommentPopup(null)}
                title={t.pdfPreview.findClose}
                aria-label={t.pdfPreview.findClose}
              >
                <Icon icon={X} size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      {commentDialog && (
        <CommentDialog
          key={commentDialog.target.uid ?? "comment"}
          initial={commentDialog.text}
          x={commentDialog.x}
          y={commentDialog.y}
          onSave={(text) => saveComment(text)}
          onDelete={commentDialog.text ? () => saveComment(null) : undefined}
          onCancel={closeCommentDialog}
        />
      )}
      {moreMenu && overflowItems.length > 0 && (
        <ContextMenu x={moreMenu.x} y={moreMenu.y} items={overflowItems} onClose={closeMoreMenu} />
      )}
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

/** The dialog that writes a comment (Ctrl+Enter saves, Escape cancels). */
function CommentDialog({
  initial,
  x,
  y,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: string
  x: number
  y: number
  onSave: (text: string) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.setSelectionRange(initial.length, initial.length)
  }, [initial])
  return (
    <div
      className="pdf-comment-dialog"
      role="dialog"
      aria-label={t.pdfPreview.commentDialog}
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          onSave(text)
        }
      }}
    >
      <textarea
        ref={ref}
        className="pdf-comment-input"
        aria-label={t.pdfPreview.commentDialog}
        placeholder={t.pdfPreview.commentPlaceholder}
        value={text}
        rows={4}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="pdf-comment-dialog-actions">
        {onDelete && (
          <button type="button" className="pdf-comment-btn danger" onClick={onDelete}>
            {t.pdfPreview.deleteComment}
          </button>
        )}
        <span className="pdf-toolbar-sep" />
        <button type="button" className="pdf-comment-btn" onClick={onCancel}>
          {t.pdfPreview.commentCancel}
        </button>
        <button
          type="button"
          className="pdf-comment-btn primary"
          onClick={() => onSave(text)}
          disabled={!text.trim() && !initial}
        >
          {t.pdfPreview.commentSave}
        </button>
      </div>
    </div>
  )
}
