import { useMemo, useState } from "react"
import type { Comment } from "./comments"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"

export type CommentsFilter = "all" | "unresolved" | "resolved"

interface CommentsPanelProps {
  comments: Comment[]
  /** Used to convert relative comment paths into absolute editor targets. */
  vaultPath: string | null
  /** Absolute path of the file currently focused in the editor (if any). */
  activeFilePath: string | null
  onJumpTo: (absolutePath: string, line: number) => void
  onAdd: () => void
  onToggleResolved: (id: string) => void
  onDelete: (id: string) => void
  onEditBody: (id: string, body: string) => void
}

function resolveAbsolute(filePath: string, vaultPath: string | null): string {
  if (!vaultPath) return filePath
  if (filePath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(filePath)) return filePath
  const normVault = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "")
  return `${normVault}/${filePath}`
}

export default function CommentsPanel({
  comments,
  vaultPath,
  activeFilePath,
  onJumpTo,
  onAdd,
  onToggleResolved,
  onDelete,
  onEditBody,
}: CommentsPanelProps) {
  const t = useT()
  const [filter, setFilter] = useState<CommentsFilter>("all")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftBody, setDraftBody] = useState("")

  const visible = useMemo(() => {
    if (filter === "all") return comments
    if (filter === "resolved") return comments.filter((c) => c.resolved)
    return comments.filter((c) => !c.resolved)
  }, [comments, filter])

  const groups = useMemo(() => {
    const map = new Map<string, Comment[]>()
    for (const c of visible) {
      const arr = map.get(c.filePath) ?? []
      arr.push(c)
      map.set(c.filePath, arr)
    }
    // Sort comments inside each group by line so the user reads top-to-bottom.
    for (const arr of map.values()) arr.sort((a, b) => a.line - b.line)
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [visible])

  const startEdit = (c: Comment) => {
    setEditingId(c.id)
    setDraftBody(c.body)
  }

  const commitEdit = () => {
    if (editingId) onEditBody(editingId, draftBody)
    setEditingId(null)
    setDraftBody("")
  }

  return (
    <div className="comments-panel">
      <div className="comments-header">
        <span className="comments-summary">
          {comments.length === 0 ? t.comments.noComments : t.comments.count(comments.length)}
        </span>
        <button
          className="comments-add-btn"
          onClick={onAdd}
          aria-label={t.comments.addAriaLabel}
          title={t.comments.addAriaLabel}
        >
          + {t.comments.addAtCursor}
        </button>
      </div>

      <div className="comments-filters" role="tablist" aria-label={t.comments.filterAriaLabel}>
        {(["all", "unresolved", "resolved"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`comments-filter${filter === f ? " active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {t.comments[f]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="panel-empty">
          {filter === "all"
            ? t.comments.noComments
            : filter === "resolved"
            ? t.comments.noResolved
            : t.comments.noUnresolved}
        </div>
      ) : (
        groups.map(([filePath, items]) => {
          const absolute = resolveAbsolute(filePath, vaultPath)
          const isActive = activeFilePath === absolute
          return (
            <div key={filePath} className="comments-file-group">
              <div className={`comments-file-name${isActive ? " active" : ""}`}>
                {displayBasename(filePath)}
              </div>
              {items.map((c) => (
                <div
                  key={c.id}
                  className={`comments-item${c.resolved ? " resolved" : ""}`}
                  data-comment-id={c.id}
                >
                  <div className="comments-item-meta">
                    <button
                      className="comments-jump"
                      onClick={() => onJumpTo(absolute, c.line)}
                      title={t.comments.jumpTitle(c.line)}
                    >
                      {t.comments.atLine(c.line)}
                    </button>
                    <label className="comments-resolved-toggle">
                      <input
                        type="checkbox"
                        checked={c.resolved}
                        onChange={() => onToggleResolved(c.id)}
                        aria-label={c.resolved ? t.comments.markUnresolved : t.comments.markResolved}
                      />
                      <span>{c.resolved ? t.comments.resolved : t.comments.unresolved}</span>
                    </label>
                    <button
                      className="comments-delete"
                      onClick={() => onDelete(c.id)}
                      aria-label={t.comments.deleteAriaLabel}
                      title={t.comments.deleteAriaLabel}
                    >
                      ×
                    </button>
                  </div>
                  {c.lineSnippet && (
                    <div className="comments-snippet" title={c.lineSnippet}>
                      {c.lineSnippet}
                    </div>
                  )}
                  {editingId === c.id ? (
                    <div className="comments-edit">
                      <textarea
                        className="comments-edit-input"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        autoFocus
                        rows={3}
                      />
                      <div className="comments-edit-actions">
                        <button className="comments-edit-save" onClick={commitEdit}>
                          {t.comments.save}
                        </button>
                        <button
                          className="comments-edit-cancel"
                          onClick={() => {
                            setEditingId(null)
                            setDraftBody("")
                          }}
                        >
                          {t.comments.cancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="comments-body"
                      onClick={() => startEdit(c)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && startEdit(c)}
                      title={t.comments.editTitle}
                    >
                      {c.body || <em className="comments-empty-body">{t.comments.emptyBody}</em>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })
      )}
    </div>
  )
}
