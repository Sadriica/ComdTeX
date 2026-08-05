import { useRef, useState } from "react"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"
import { displayBasename } from "./pathUtils"
import { loadCustomTemplates, TEMPLATES } from "./templates"
import { serializeFrontmatter, extractFrontmatter, type FrontmatterData } from "./frontmatter"
import type { FolderRules, GeneratedFileRule, GeneratorType } from "./folderRules"

interface FolderRulesModalProps {
  /** Absolute path of the folder being configured; null closes the modal. */
  dirPath: string | null
  /** The folder's own rules, or null when it has none yet. */
  rules: FolderRules | null
  onClose: () => void
  onSave: (dirPath: string, rules: FolderRules) => void
}

const GENERATOR_TYPES: GeneratorType[] = ["tasks", "calendar", "index"]

/** Default filename suggested when adding a generated file of each type. */
const DEFAULT_FILENAMES: Record<GeneratorType, string> = {
  tasks: "_tareas.md",
  calendar: "_calendario.md",
  index: "_indice.md",
}

/**
 * Editor for a folder's `.comdtex-folder.json`.
 *
 * Frontmatter is edited as raw YAML rather than a key/value grid: the values are
 * arbitrary (lists, dates, nested strings) and a grid would quietly flatten
 * anything it did not model.
 */
export default function FolderRulesModal(props: FolderRulesModalProps) {
  // Remount per folder rather than syncing state in an effect: the form is
  // seeded from `rules`, and a key change is the honest way to say "this is a
  // different form now" (no stale-render flash, no cascading setState).
  if (!props.dirPath) return null
  return <FolderRulesForm key={props.dirPath} {...props} />
}

function FolderRulesForm({ dirPath, rules, onClose, onSave }: FolderRulesModalProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, dirPath !== null, onClose)

  const [defaultTemplate, setDefaultTemplate] = useState(rules?.defaultTemplate ?? "")
  const [filenamePattern, setFilenamePattern] = useState(rules?.filenamePattern ?? "")
  const [generated, setGenerated] = useState<GeneratedFileRule[]>(rules?.generated ?? [])
  const [frontmatterYaml, setFrontmatterYaml] = useState(() =>
    rules?.frontmatter && Object.keys(rules.frontmatter).length > 0
      // serializeFrontmatter emits the --- fences; the textarea shows the body.
      ? serializeFrontmatter(rules.frontmatter).replace(/^---\n/, "").replace(/\n---$/, "")
      : "",
  )

  if (!dirPath) return null

  const templates = [...TEMPLATES, ...loadCustomTemplates()]

  const handleSave = () => {
    let frontmatter: FrontmatterData | undefined
    const yaml = frontmatterYaml.trim()
    if (yaml) {
      // Round-trip through the real parser so what is stored is exactly what the
      // app will later read back: no bespoke YAML handling in this component.
      frontmatter = extractFrontmatter(`---\n${yaml}\n---\n`)?.data
    }
    onSave(dirPath, {
      version: 1,
      defaultTemplate: defaultTemplate || undefined,
      filenamePattern: filenamePattern.trim() || undefined,
      frontmatter: frontmatter && Object.keys(frontmatter).length > 0 ? frontmatter : undefined,
      generated: generated.length > 0 ? generated : undefined,
    })
    onClose()
  }

  const addGenerated = () => {
    setGenerated((g) => [...g, { file: DEFAULT_FILENAMES.tasks, type: "tasks", scope: "folder" }])
  }

  const updateGenerated = (index: number, patch: Partial<GeneratedFileRule>) => {
    setGenerated((g) => g.map((rule, i) => {
      if (i !== index) return rule
      const next = { ...rule, ...patch }
      // Changing the type while the filename is still the previous default is
      // almost certainly not intentional; follow it along.
      if (patch.type && rule.file === DEFAULT_FILENAMES[rule.type]) {
        next.file = DEFAULT_FILENAMES[patch.type]
      }
      return next
    }))
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" ref={modalRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.folderRules.title(displayBasename(dirPath))}</span>
          <button className="modal-close" onClick={onClose} aria-label={t.folderRules.close}>✕</button>
        </div>

        <div className="modal-body folder-rules-body">
          <p className="folder-rules-intro">{t.folderRules.intro}</p>

          <label className="folder-rules-field">
            <span>{t.folderRules.defaultTemplate}</span>
            <select value={defaultTemplate} onChange={(e) => setDefaultTemplate(e.target.value)}>
              <option value="">{t.folderRules.noTemplate}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{t.templates[tpl.id]?.name ?? tpl.name}</option>
              ))}
            </select>
          </label>

          <label className="folder-rules-field">
            <span>{t.folderRules.filenamePattern}</span>
            <input
              type="text"
              value={filenamePattern}
              placeholder="{{date:YYYY-MM-DD}}-{{title}}"
              onChange={(e) => setFilenamePattern(e.target.value)}
            />
            <small>{t.folderRules.filenameHint}</small>
          </label>

          <label className="folder-rules-field">
            <span>{t.folderRules.frontmatter}</span>
            <textarea
              rows={5}
              value={frontmatterYaml}
              placeholder={"materia: Álgebra II\ntags: [\"algebra\"]"}
              onChange={(e) => setFrontmatterYaml(e.target.value)}
            />
            <small>{t.folderRules.frontmatterHint}</small>
          </label>

          <div className="folder-rules-field">
            <span>{t.folderRules.generatedFiles}</span>
            <small>{t.folderRules.generatedHint}</small>
            {generated.map((rule, i) => (
              <div className="folder-rules-generated-row" key={i}>
                <input
                  type="text"
                  value={rule.file}
                  aria-label={t.folderRules.generatedFileName}
                  onChange={(e) => updateGenerated(i, { file: e.target.value })}
                />
                <select
                  value={rule.type}
                  aria-label={t.folderRules.generatedType}
                  onChange={(e) => updateGenerated(i, { type: e.target.value as GeneratorType })}
                >
                  {GENERATOR_TYPES.map((type) => (
                    <option key={type} value={type}>{t.folderRules.generatorNames[type]}</option>
                  ))}
                </select>
                <select
                  value={rule.scope}
                  aria-label={t.folderRules.generatedScope}
                  onChange={(e) => updateGenerated(i, { scope: e.target.value as "folder" | "vault" })}
                >
                  <option value="folder">{t.folderRules.scopeFolder}</option>
                  <option value="vault">{t.folderRules.scopeVault}</option>
                </select>
                <button
                  className="folder-rules-remove"
                  aria-label={t.folderRules.removeGenerated}
                  onClick={() => setGenerated((g) => g.filter((_, n) => n !== i))}
                >✕</button>
              </div>
            ))}
            <button className="folder-rules-add" onClick={addGenerated}>{t.folderRules.addGenerated}</button>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>{t.folderRules.cancel}</button>
          <button className="btn-create" onClick={handleSave}>{t.folderRules.save}</button>
        </div>
      </div>
    </div>
  )
}
