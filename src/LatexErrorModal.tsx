import { useT } from "./i18n"
import type { LatexDiagnostic } from "./latexErrors"

interface LatexErrorModalProps {
  diagnostics: LatexDiagnostic[]
  onClose: () => void
}

export default function LatexErrorModal({ diagnostics, onClose }: LatexErrorModalProps) {
  const t = useT()

  return (
    <div className="latex-err-overlay" onClick={onClose}>
      <div className="latex-err-modal" onClick={(e) => e.stopPropagation()}>
        <div className="latex-err-header">
          <h3>{t.latexErrors.title}</h3>
          <button className="latex-err-close" onClick={onClose} aria-label={t.latexErrors.close}>×</button>
        </div>
        <div className="latex-err-body">
          {diagnostics.length === 0 ? (
            <p style={{ color: "#aaa", margin: 0 }}>{t.latexErrors.noDetails}</p>
          ) : (
            diagnostics.map((diag, idx) => (
              <div key={idx} className={`latex-diag ${diag.severity}`}>
                <div className="latex-diag-title">
                  {diag.severity === "error" ? "● " : "⚠ "}
                  {diag.severity === "error" ? t.latexErrors.errorLabel : t.latexErrors.warningLabel}
                  {diag.line !== undefined && ` (${t.latexErrors.line} ${diag.line})`}
                </div>
                <div>{diag.message}</div>
                {diag.context && (
                  <div>
                    <span style={{ color: "#aaa", fontSize: "0.85em" }}>{t.latexErrors.context}: </span>
                    <code className="latex-diag-context">{diag.context}</code>
                  </div>
                )}
                {diag.suggestion && (
                  <div className="latex-diag-suggestion">{diag.suggestion}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
