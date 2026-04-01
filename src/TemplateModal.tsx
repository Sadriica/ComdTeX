import { useState } from "react"
import { TEMPLATES } from "./templates"
import { useT } from "./i18n"

interface TemplateModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, content: string) => void
}

export default function TemplateModal({ open, onClose, onCreate }: TemplateModalProps) {
  const t = useT()
  const [selectedId, setSelectedId] = useState(TEMPLATES[0].id)
  const [name, setName] = useState("")

  if (!open) return null

  const template = TEMPLATES.find((tpl) => tpl.id === selectedId) ?? TEMPLATES[0]

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const fileName = trimmed.endsWith(".md") || trimmed.endsWith(".tex") ? trimmed : `${trimmed}.md`
    onCreate(fileName, template.content)
    setName("")
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.templateModal.title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body template-body">
          <div className="template-grid">
            {TEMPLATES.map((tpl) => {
              const tplT = t.templates[tpl.id]
              return (
                <button
                  key={tpl.id}
                  className={`template-card${selectedId === tpl.id ? " selected" : ""}`}
                  onClick={() => setSelectedId(tpl.id)}
                >
                  <span className="template-icon">{tpl.icon}</span>
                  <span className="template-name">{tplT?.name ?? tpl.name}</span>
                  <span className="template-desc">{tplT?.description ?? tpl.description}</span>
                </button>
              )
            })}
          </div>
          <div className="template-filename-row">
            <label className="template-filename-label">{t.templateModal.filenameLabel}</label>
            <input
              className="template-filename-input"
              placeholder={t.templateModal.filenamePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>{t.templateModal.cancel}</button>
          <button className="btn-create" onClick={handleCreate} disabled={!name.trim()}>{t.templateModal.create}</button>
        </div>
      </div>
    </div>
  )
}
