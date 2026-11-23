import { useMemo, useRef, useId } from "react"
import { createPortal } from "react-dom"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"
import { Icon, X } from "./icons"
import { showToast } from "./toastService"

export interface ReviewComparison {
  round: number
  fileName: string
  /** The note compared with the round, as CriticMarkup. */
  markup: string
  /** False when some part could not be written as marks (see reviewRounds.ts). */
  exact: boolean
}

/**
 * Read-only view of a note compared with a review round. The text is the
 * CriticMarkup `diffToCriticMarkup` produced, rendered by the preview pipeline
 * (so additions, deletions and math look as they do in the preview). Nothing
 * here edits the note.
 */
export default function ReviewCompareDialog({
  comparison,
  renderHtml,
  onClose,
}: {
  comparison: ReviewComparison
  renderHtml: (markdown: string) => string
  onClose: () => void
}) {
  const g = useT().git.review
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(ref, true, onClose)
  const html = useMemo(() => renderHtml(comparison.markup), [renderHtml, comparison.markup])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(comparison.markup)
      showToast(g.copied, "success")
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal modal-review"
        ref={ref}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{g.dialogTitle(comparison.round, comparison.fileName)}</h2>
          <button className="modal-close" onClick={onClose} aria-label={g.close} title={g.close}>
            <Icon icon={X} size={14} />
          </button>
        </div>
        <div className="modal-body">
          <p className="review-legend">{g.legend}</p>
          {!comparison.exact && <p className="review-inexact">{g.inexact}</p>}
          <div
            className="preview-content review-compare-body"
            // Sanitized by `renderHtml` (renderMarkdown + sanitizeRenderedHtml).
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={copy}>
            {g.copy}
          </button>
          <button className="btn-create" onClick={onClose}>
            {g.close}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
