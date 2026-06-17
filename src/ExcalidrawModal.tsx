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

export default function ExcalidrawModal({ open, sceneB64, theme, onSave, onClose }: ExcalidrawModalProps) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState<ExcalidrawAPI | null>(null)
  useFocusTrap(ref, open, onClose)

  // Recompute initialData only when the incoming scene changes, so typing in the
  // canvas doesn't reset it.
  const initialData = useMemo(() => decodeScene(sceneB64), [sceneB64])

  // The modal is conditionally mounted by the parent, so the component fully
  // remounts on each open — `api` always starts fresh, no manual reset needed.

  const handleSave = useCallback(() => {
    if (!api) { onClose(); return }
    const b64 = encodeScene(api.getSceneElements(), api.getAppState(), api.getFiles())
    onSave(b64)
  }, [api, onSave, onClose])

  if (!open) return null

  return (
    <div className="excalidraw-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="excalidraw-modal" ref={ref} role="dialog" aria-modal="true" aria-label={t.excalidraw.modalTitle}>
        <div className="excalidraw-modal-header">
          <span className="excalidraw-modal-title">{t.excalidraw.modalTitle}</span>
          <div className="excalidraw-modal-actions">
            <button className="excalidraw-modal-cancel" onClick={onClose}>{t.excalidraw.cancel}</button>
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
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
