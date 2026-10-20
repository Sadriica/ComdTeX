import { useRef, useId } from "react"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"
import { FileText, Icon, Undo2, X } from "./icons"
import { useFocusTrap } from "./useFocusTrap"
import { renderEmptyMessage } from "./emptyStateMessage"

interface ClosedTabsPopupProps {
  open: boolean
  paths: string[]
  onSelect: (path: string) => void
  onClose: () => void
}

export default function ClosedTabsPopup({ open, paths, onSelect, onClose }: ClosedTabsPopupProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(modalRef, open, onClose)

  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal"
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span id={titleId}>{t.vault.recentlyClosed}</span>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t.titleBar.close}
            title={t.titleBar.close}
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: "300px", overflowY: "auto" }}>
          {paths.length === 0 ? (
            <div className="panel-empty-rich">
              <div className="panel-empty-icon" aria-hidden="true">
                <Icon icon={Undo2} size={16} />
              </div>
              <p className="panel-empty-message">
                {renderEmptyMessage(t.emptyStates.closedTabsMessage)}
              </p>
            </div>
          ) : (
            paths.map((path) => (
              <button
                key={path}
                className="closed-tab-item"
                onClick={() => {
                  onSelect(path)
                  onClose()
                }}
              >
                <span className="closed-tab-icon" aria-hidden="true">
                  <Icon icon={FileText} size={14} />
                </span>
                <span className="closed-tab-name">{displayBasename(path)}</span>
                <span className="closed-tab-path">{path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
