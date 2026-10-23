import { useId, useRef, useState } from "react"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"
import { Icon, X } from "./icons"

export interface TextPromptRequest {
  title: string
  label: string
  initial?: string
  /** A textarea instead of a single line; Ctrl+Enter confirms. */
  multiline?: boolean
}

interface TextPromptModalProps {
  request: TextPromptRequest | null
  /** `null` when the dialog was cancelled. */
  onResult: (value: string | null) => void
}

/**
 * The app's own replacement for `window.prompt`: native prompts are blocked or
 * ugly in Tauri webviews. Same modal recipe as the other dialogs (focus trap,
 * Escape, labelled dialog); an empty value cannot be confirmed.
 */
export default function TextPromptModal({ request, onResult }: TextPromptModalProps) {
  if (!request) return null
  // Remounts per request, so the field always starts from `initial`.
  return <PromptDialog key={request.title + request.label} request={request} onResult={onResult} />
}

function PromptDialog({
  request,
  onResult,
}: {
  request: TextPromptRequest
  onResult: (value: string | null) => void
}) {
  const t = useT()
  const [value, setValue] = useState(request.initial ?? "")
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const fieldId = useId()
  useFocusTrap(modalRef, true, () => onResult(null))

  const trimmed = value.trim()
  const confirm = () => {
    if (trimmed) onResult(trimmed)
  }

  return (
    <div className="modal-overlay" onMouseDown={() => onResult(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal"
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span id={titleId}>{request.title}</span>
          <button
            className="modal-close"
            onClick={() => onResult(null)}
            aria-label={t.templateModal.closeAriaLabel}
            title={t.templateModal.closeAriaLabel}
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
        <div className="modal-body">
          <label className="prompt-label" htmlFor={fieldId}>
            {request.label}
          </label>
          {request.multiline ? (
            <textarea
              id={fieldId}
              className="template-content-input prompt-field"
              rows={4}
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  confirm()
                }
              }}
            />
          ) : (
            <input
              id={fieldId}
              className="template-filename-input prompt-field"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  confirm()
                }
              }}
            />
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={() => onResult(null)}>
            {t.naming.cancel}
          </button>
          <button className="btn-create" onClick={confirm} disabled={!trimmed}>
            {t.naming.ok}
          </button>
        </div>
      </div>
    </div>
  )
}
