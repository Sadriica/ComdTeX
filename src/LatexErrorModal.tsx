import { useRef, useId } from "react"
import { useT } from "./i18n"
import { CircleX, Icon, TriangleAlert, X } from "./icons"
import { useFocusTrap } from "./useFocusTrap"
import type { LatexDiagnostic } from "./latexErrors"

interface LatexErrorModalProps {
  diagnostics: LatexDiagnostic[]
  onClose: () => void
}

export default function LatexErrorModal({ diagnostics, onClose }: LatexErrorModalProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // The modal is mounted only while open; the trap focuses it, closes on Escape
  // and gives focus back to whatever opened it.
  useFocusTrap(modalRef, true, onClose)

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal modal-wide"
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span id={titleId}>{t.latexErrors.title}</span>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t.latexErrors.close}
            title={t.latexErrors.close}
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
        <div className="modal-body">
          {diagnostics.length === 0 ? (
            <p className="latex-err-empty">{t.latexErrors.noDetails}</p>
          ) : (
            diagnostics.map((diag, idx) => (
              <div key={idx} className={`latex-diag ${diag.severity}`}>
                <div className="latex-diag-title">
                  {diag.severity === "error" ? (
                    <Icon icon={CircleX} size={14} />
                  ) : (
                    <Icon icon={TriangleAlert} size={14} />
                  )}{" "}
                  {diag.severity === "error"
                    ? t.latexErrors.errorLabel
                    : t.latexErrors.warningLabel}
                  {diag.line !== undefined && ` (${t.latexErrors.line} ${diag.line})`}
                </div>
                <div>{diag.message}</div>
                {diag.context && (
                  <div>
                    <span className="latex-diag-context-label">{t.latexErrors.context}: </span>
                    <code className="latex-diag-context">{diag.context}</code>
                  </div>
                )}
                {diag.suggestion && <div className="latex-diag-suggestion">{diag.suggestion}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
