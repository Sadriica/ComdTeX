import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react"
import { useFocusTrap } from "./useFocusTrap"
import { useT } from "./i18n"
import "@excalidraw/excalidraw/index.css"

// Lazy-load the ~18MB Excalidraw engine into its OWN chunk so it never lands in
// the initial bundle. The chunk is only fetched when the modal first opens.
const Excalidraw = lazy(async () => {
  const mod = await import("@excalidraw/excalidraw")
  return { default: mod.Excalidraw }
})

// `ExcalidrawImperativeAPI` and scene types are intentionally loose here to keep
// the heavy type graph out of the static import surface.
type ExcalidrawAPI = {
  getSceneElements: () => readonly unknown[]
  getAppState: () => Record<string, unknown>
  getFiles: () => Record<string, unknown>
}

type Scene = {
  elements?: unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
} | null

/** Decode a base64 scene string into Excalidraw initialData (or null if empty/bad). */
function decodeScene(sceneB64: string): Scene {
  if (!sceneB64) return null
  try {
    const json = decodeURIComponent(escape(atob(sceneB64)))
    const parsed = JSON.parse(json)
    return {
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      // Drop view-only/transient appState that shouldn't be restored verbatim.
      appState: { ...(parsed.appState ?? {}), collaborators: undefined },
      files: parsed.files ?? {},
    }
  } catch {
    return null
  }
}

/** Serialize the live scene to compact single-line base64 JSON. */
function encodeScene(elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>): string {
  // Keep only the appState fields worth persisting; drop the noisy/transient rest.
  const slim: Record<string, unknown> = {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
  }
  const payload = JSON.stringify({ type: "excalidraw", version: 2, elements, appState: slim, files })
  return btoa(unescape(encodeURIComponent(payload)))
}

export interface ExcalidrawModalProps {
  open: boolean
  sceneB64: string
  theme: "light" | "dark"
  onSave: (sceneB64: string) => void
  onClose: () => void
}

/** Cheap edit signature: Excalidraw bumps each element's `version` on any real
 *  modification (move, resize, delete → isDeleted+bump), while selection-only
 *  changes leave versions untouched, so this never false-positives on clicks. */
function sceneSignature(elements: readonly unknown[]): string {
  return elements
    .map((el) => {
      const e = el as { id?: string; version?: number }
      return `${e.id}:${e.version}`
    })
    .join("|")
}

export default function ExcalidrawModal({ open, sceneB64, theme, onSave, onClose }: ExcalidrawModalProps) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState<ExcalidrawAPI | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Baseline captured on the FIRST onChange (after Excalidraw restores/normalizes
  // the loaded scene): comparing against the raw initialData would flag the
  // normalization itself as an edit.
  const baselineRef = useRef<string | null>(null)

  // Recompute initialData only when the incoming scene changes, so typing in the
  // canvas doesn't reset it.
  const initialData = useMemo(() => decodeScene(sceneB64), [sceneB64])

  // The modal is conditionally mounted by the parent, so the component fully
  // remounts on each open: `api` always starts fresh, no manual reset needed.

  const handleSave = useCallback(() => {
    if (!api) { onClose(); return }
    const b64 = encodeScene(api.getSceneElements(), api.getAppState(), api.getFiles())
    onSave(b64)
  }, [api, onSave, onClose])

  // Every close path (Esc, overlay click, Cancel) funnels through here: with
  // unsaved edits it asks save/discard/keep-editing instead of silently
  // dropping the drawing.
  const requestClose = useCallback(() => {
    const current = api?.getSceneElements()
    const dirty =
      current !== undefined &&
      baselineRef.current !== null &&
      sceneSignature(current) !== baselineRef.current
    if (dirty) setConfirmOpen(true)
    else onClose()
  }, [api, onClose])

  useFocusTrap(ref, open, requestClose)

  if (!open) return null

  return (
    // data-gesture-optout: the canvas zooms/pans itself; app-level touchpad
    // gestures (Ctrl+wheel/pinch → app font zoom) must not double-fire here.
    <div className="excalidraw-modal-overlay" data-gesture-optout="" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}>
      <div className="excalidraw-modal" ref={ref} role="dialog" aria-modal="true" aria-label={t.excalidraw.modalTitle}>
        <div className="excalidraw-modal-header">
          <span className="excalidraw-modal-title">{t.excalidraw.modalTitle}</span>
          <div className="excalidraw-modal-actions">
            <button className="excalidraw-modal-cancel" onClick={requestClose}>{t.excalidraw.cancel}</button>
            <button className="excalidraw-modal-save" onClick={handleSave}>{t.excalidraw.save}</button>
          </div>
        </div>
        <div className="excalidraw-modal-canvas">
          <Suspense fallback={<div className="excalidraw-modal-loading">{t.excalidraw.loading}</div>}>
            <Excalidraw
              theme={theme}
              // Loose-typed scene; Excalidraw's strict initialData type rejects our
              // generic Record shape, so cast at the boundary.
              initialData={(initialData ?? undefined) as never}
              excalidrawAPI={(a: unknown) => setApi(a as ExcalidrawAPI)}
              onChange={(elements: readonly unknown[]) => {
                if (baselineRef.current === null) baselineRef.current = sceneSignature(elements)
              }}
            />
          </Suspense>
        </div>
        {confirmOpen && (
          <div className="excalidraw-confirm-overlay">
            <div className="excalidraw-confirm" role="alertdialog" aria-label={t.excalidraw.unsavedPrompt}>
              <p className="excalidraw-confirm-text">{t.excalidraw.unsavedPrompt}</p>
              <div className="excalidraw-confirm-actions">
                <button className="excalidraw-modal-save" onClick={handleSave}>{t.excalidraw.save}</button>
                <button className="excalidraw-confirm-discard" onClick={onClose}>{t.excalidraw.discard}</button>
                <button className="excalidraw-modal-cancel" onClick={() => setConfirmOpen(false)}>{t.excalidraw.keepEditing}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
