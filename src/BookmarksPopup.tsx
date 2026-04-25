import { useT } from "./i18n"

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

export default function BookmarksPopup({ open, bookmarks, onGoTo, onRemove, onClose }: BookmarksPopupProps) {
  const t = useT()

  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.app.bookmarks}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {bookmarks.length === 0 && (
            <div className="panel-empty">{t.app.noBookmarks}</div>
          )}
          {bookmarks.map(({ slot, line }) => (
            <div key={slot} className="bookmark-item">
              <span className="bookmark-slot" title={`Ctrl+Shift+${slot}`}>Ctrl+Shift+{slot}</span>
              <button className="bookmark-line" onClick={() => { onGoTo(line); onClose() }}>
                {t.app.line} {line}
              </button>
              <button className="bookmark-remove" onClick={() => onRemove(slot)} title={t.app.removeBookmark}>×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}