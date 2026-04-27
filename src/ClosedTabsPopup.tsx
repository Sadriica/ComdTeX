import { useRef } from "react"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"

interface ClosedTabsPopupProps {
  open: boolean
  paths: string[]
  onSelect: (path: string) => void
  onClose: () => void
}

export default function ClosedTabsPopup({ open, paths, onSelect, onClose }: ClosedTabsPopupProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  const isOpen = open && paths.length > 0
  useFocusTrap(modalRef, isOpen, onClose)

  if (!open) return null

  if (paths.length === 0) return null

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" ref={modalRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.vault.recentlyClosed}</span>
          <button className="modal-close" onClick={onClose} aria-label={t.titleBar.close}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: "300px", overflowY: "auto" }}>
          {paths.map((path) => (
            <button
              key={path}
              className="closed-tab-item"
              onClick={() => { onSelect(path); onClose() }}
            >
              <span className="closed-tab-icon">📄</span>
              <span className="closed-tab-name">{displayBasename(path)}</span>
              <span className="closed-tab-path">{path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
