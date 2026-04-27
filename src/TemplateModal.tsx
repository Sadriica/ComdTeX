import { useRef, useState } from "react"
import { loadCustomTemplates, saveCustomTemplate, TEMPLATES, processTemplateVariables } from "./templates"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"

interface TemplateModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, content: string) => void
}

export default function TemplateModal({ open, onClose, onCreate }: TemplateModalProps) {
  const t = useT()
  const [customTemplates, setCustomTemplates] = useState(() => loadCustomTemplates())
  const [selectedId, setSelectedId] = useState(TEMPLATES[0].id)
  const [name, setName] = useState("")
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [templateContent, setTemplateContent] = useState("---\ntitle: {{title}}\ndate: {{date}}\ntags: []\n---\n\n# {{title}}\n")
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, open, onClose)

  if (!open) return null

  const allTemplates = [...TEMPLATES, ...customTemplates]
  const template = allTemplates.find((tpl) => tpl.id === selectedId) ?? allTemplates[0]

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const fileName = trimmed.endsWith(".md") || trimmed.endsWith(".tex") ? trimmed : `${trimmed}.md`
    onCreate(fileName, processTemplateVariables(template.content, fileName))
    setName("")
    onClose()
  }

  const handleSaveTemplate = () => {
    const trimmed = templateName.trim()
    if (!trimmed || !templateContent.trim()) return
    const updated = saveCustomTemplate({
      name: trimmed,
      description: templateDescription.trim() || t.templateModal.defaultDescription,
      icon: "◇",
      content: templateContent,
    })
    setCustomTemplates(updated)
    setSelectedId(updated[updated.length - 1].id)
    setEditingTemplate(false)
    setTemplateName("")
    setTemplateDescription("")
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" ref={modalRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.templateModal.title}</span>
          <button className="modal-close" onClick={onClose} aria-label={t.templateModal.closeAriaLabel}>✕</button>
        </div>
        <div className="modal-body template-body">
          <div className="template-actions-row">
            <button className="template-create-toggle" onClick={() => setEditingTemplate((v) => !v)}>
              {editingTemplate ? t.templateModal.useTemplates : t.templateModal.createTemplate}
            </button>
          </div>
          {editingTemplate ? (
            <div className="template-editor">
              <input
                className="template-filename-input"
                placeholder={t.templateModal.namePlaceholder}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <input
                className="template-filename-input"
                placeholder={t.templateModal.descriptionPlaceholder}
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
              />
              <textarea
                className="template-content-input"
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                rows={12}
              />
              <div className="template-vars-hint">{t.templateModal.variablesHint}: {"{{title}}"}, {"{{filename}}"}, {"{{date}}"}, {"{{date:formatted}}"}, {"{{year}}"}, {"{{time}}"}, {"{{datetime}}"}, {"{{author}}"}</div>
              <button className="btn-create" onClick={handleSaveTemplate} disabled={!templateName.trim() || !templateContent.trim()}>
                {t.templateModal.saveTemplate}
              </button>
            </div>
          ) : (
          <>
          <div className="template-grid">
            {allTemplates.map((tpl) => {
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
                  {tpl.custom && <span className="template-custom-badge">{t.templateModal.customBadge}</span>}
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
          </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>{t.templateModal.cancel}</button>
          <button className="btn-create" onClick={handleCreate} disabled={editingTemplate || !name.trim()}>{t.templateModal.create}</button>
        </div>
      </div>
    </div>
  )
}
