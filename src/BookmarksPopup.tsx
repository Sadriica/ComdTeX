import { useRef, useId } from "react"
import { useT } from "./i18n"
import { Bookmark, Icon, X } from "./icons"
import { useFocusTrap } from "./useFocusTrap"
import { renderEmptyMessage } from "./emptyStateMessage"

interface Bookmark {
  slot: number
  line: number
}

interface BookmarksPopupProps {
  open: boolean
  bookmarks: Bookmark[]
  onGoTo: (line: number) => void
  onRemove: (slot: number) => void
  onClose: () => void
}

export default function BookmarksPopup({
  open,
  bookmarks,
  onGoTo,
  onRemove,
  onClose,
}: BookmarksPopupProps) {
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
          <span id={titleId}>{t.app.bookmarks}</span>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t.titleBar.close}
            title={t.titleBar.close}
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
        <div className="modal-body">
          {bookmarks.length === 0 && (
            <div className="panel-empty-rich">
              <div className="panel-empty-icon" aria-hidden="true">
                <Icon icon={Bookmark} size={16} />
              </div>
              <p className="panel-empty-message">
                {renderEmptyMessage(t.emptyStates.bookmarksMessage)}
              </p>
            </div>
          )}
          {bookmarks.map(({ slot, line }) => (
            <div key={slot} className="bookmark-item">
              <span className="bookmark-slot" title={`Ctrl+Shift+${slot}`}>
                Ctrl+Shift+{slot}
              </span>
              <button
                className="bookmark-line"
                onClick={() => {
                  onGoTo(line)
                  onClose()
                }}
              >
                {t.app.line} {line}
              </button>
              <button
                className="bookmark-remove"
                onClick={() => onRemove(slot)}
                title={t.app.removeBookmark}
                aria-label={t.app.removeBookmark}
              >
                <Icon icon={X} size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
