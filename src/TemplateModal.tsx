import { useRef, useState, useId } from "react"
import {
  loadCustomTemplates,
  saveCustomTemplate,
  TEMPLATES,
  processTemplateVariables,
} from "./templates"
import { useT } from "./i18n"
import {
  BookOpen,
  File,
  FileCode,
  FileText,
  FlaskConical,
  Icon,
  Library,
  Newspaper,
  Notebook,
  Pencil,
  Sigma,
  X,
  type LucideIcon,
} from "./icons"

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  file: File,
  "file-text": FileText,
  "file-code": FileCode,
  notebook: Notebook,
  pencil: Pencil,
  sigma: Sigma,
  "flask-conical": FlaskConical,
  "book-open": BookOpen,
  newspaper: Newspaper,
  library: Library,
}
import { useFocusTrap } from "./useFocusTrap"
import { displayDestination, finalName, nameProblemText, validateName } from "./fileNaming"

/** A folder the new file can go in; `rel` is "" for the vault root. */
export interface TemplateFolder {
  path: string
  rel: string
  /** Names already inside it (for the "already exists" check). */
  names: string[]
}

interface TemplateModalProps {
  open: boolean
  onClose: () => void
  /** `name` carries its extension; `parentDir` is the chosen folder. */
  onCreate: (name: string, content: string, parentDir: string) => void
  folders: TemplateFolder[]
  /** Folder preselected when the dialog opens (the shared target-folder rule). */
  defaultFolder: string
}

export default function TemplateModal({
  open,
  onClose,
  onCreate,
  folders,
  defaultFolder,
}: TemplateModalProps) {
  const t = useT()
  const [customTemplates, setCustomTemplates] = useState(() => loadCustomTemplates())
  const [selectedId, setSelectedId] = useState(TEMPLATES[0].id)
  const [name, setName] = useState("")
  const [pickedFolder, setPickedFolder] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [templateContent, setTemplateContent] = useState(
    "---\ntitle: {{title}}\ndate: {{date}}\ntags: []\n---\n\n# {{title}}\n",
  )
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = () => {
    setPickedFolder(null)
    onClose()
  }
  useFocusTrap(modalRef, open, close)

  if (!open) return null

  const allTemplates = [...TEMPLATES, ...customTemplates]
  const template = allTemplates.find((tpl) => tpl.id === selectedId) ?? allTemplates[0]

  const folderPath = pickedFolder ?? defaultFolder
  const folder = folders.find((f) => f.path === folderPath) ?? folders[0]
  const typed = name.trim()
  const problem = typed && folder ? validateName(typed, "file", folder.names) : null
  const fileName = finalName(typed, "file")
  const destination = typed && folder ? displayDestination(folder.rel, fileName) : null
  const canCreate = !!typed && !problem && !!folder

  const handleCreate = () => {
    if (!canCreate || !folder) return
    onCreate(fileName, processTemplateVariables(template.content, fileName), folder.path)
    setName("")
    setPickedFolder(null)
    onClose()
  }

  const handleSaveTemplate = () => {
    const trimmed = templateName.trim()
    if (!trimmed || !templateContent.trim()) return
    const updated = saveCustomTemplate({
      name: trimmed,
      description: templateDescription.trim() || t.templateModal.defaultDescription,
      icon: "file-text",
      content: templateContent,
    })
    setCustomTemplates(updated)
    setSelectedId(updated[updated.length - 1].id)
    setEditingTemplate(false)
    setTemplateName("")
    setTemplateDescription("")
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal modal-wide"
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span id={titleId}>{t.templateModal.title}</span>
          <button
            className="modal-close"
            onClick={close}
            aria-label={t.templateModal.closeAriaLabel}
            title={t.templateModal.closeAriaLabel}
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
        <div className="modal-body template-body">
          <div className="template-actions-row">
            <button
              className="template-create-toggle"
              onClick={() => setEditingTemplate((v) => !v)}
            >
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
              <div className="template-vars-hint">
                {t.templateModal.variablesHint}: {"{{title}}"}, {"{{filename}}"}, {"{{date}}"},{" "}
                {"{{date:formatted}}"}, {"{{year}}"}, {"{{time}}"}, {"{{datetime}}"}, {"{{author}}"}
              </div>
              <button
                className="btn-create"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || !templateContent.trim()}
              >
                {t.templateModal.saveTemplate}
              </button>
            </div>
          ) : (
            <>
              {[
                {
                  label: t.templateModal.sectionBasics,
                  items: allTemplates.filter((tpl) => tpl.category !== "journal"),
                },
                {
                  label: t.templateModal.sectionJournals,
                  items: allTemplates.filter((tpl) => tpl.category === "journal"),
                },
              ]
                .filter((section) => section.items.length > 0)
                .map((section) => (
                  <div key={section.label}>
                    <div className="template-section-label">{section.label}</div>
                    <div className="template-grid">
                      {section.items.map((tpl) => {
                        const tplT = t.templates[tpl.id]
                        return (
                          <button
                            key={tpl.id}
                            className={`template-card${selectedId === tpl.id ? " selected" : ""}`}
                            onClick={() => setSelectedId(tpl.id)}
                          >
                            <span className="template-icon" aria-hidden="true">
                              <Icon icon={TEMPLATE_ICONS[tpl.icon] ?? FileText} size={16} />
                            </span>
                            <span className="template-name">{tplT?.name ?? tpl.name}</span>
                            <span className="template-desc">
                              {tplT?.description ?? tpl.description}
                            </span>
                            {tpl.custom && (
                              <span className="template-custom-badge">
                                {t.templateModal.customBadge}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
        {!editingTemplate && (
          <div className="template-name-block">
            <div className="template-filename-row">
              <label className="template-filename-label" htmlFor="template-folder">
                {t.templateModal.folderLabel}
              </label>
              <select
                id="template-folder"
                className="template-filename-input"
                value={folder?.path ?? ""}
                onChange={(e) => setPickedFolder(e.target.value)}
              >
                {folders.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.rel || t.templateModal.folderRoot}
                  </option>
                ))}
              </select>
            </div>
            <div className="template-filename-row">
              <label className="template-filename-label" htmlFor="template-filename">
                {t.templateModal.filenameLabel}
              </label>
              <input
                id="template-filename"
                className="template-filename-input"
                placeholder={t.templateModal.filenamePlaceholder}
                value={name}
                aria-invalid={problem ? true : undefined}
                aria-describedby="template-destination"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div
              id="template-destination"
              className={`template-destination${problem ? " template-destination-error" : ""}`}
              aria-live="polite"
            >
              {problem
                ? nameProblemText(t.naming.problems, problem, fileName)
                : destination
                  ? t.naming.newNoteDestination(destination)
                  : ""}
            </div>
          </div>
        )}
        <div className="modal-footer">
          <button className="btn-cancel" onClick={close}>
            {t.templateModal.cancel}
          </button>
          <button
            className="btn-create"
            onClick={handleCreate}
            disabled={editingTemplate || !canCreate}
          >
            {t.templateModal.create}
          </button>
        </div>
      </div>
    </div>
  )
}
