import { useState, useCallback } from "react"
import type { FrontmatterData } from "./frontmatter"
import { extractFrontmatter, serializeFrontmatter } from "./frontmatter"

interface FrontmatterPanelProps {
  content: string
  onChange: (newContent: string) => void
}

const KNOWN_FIELDS: { key: string; label: string; type: "text" | "tags" | "textarea" }[] = [
  { key: "title",    label: "Título",    type: "text" },
  { key: "author",   label: "Autor/es",  type: "text" },
  { key: "date",     label: "Fecha",     type: "text" },
  { key: "abstract", label: "Abstract",  type: "textarea" },
  { key: "tags",     label: "Tags",      type: "tags" },
]

/** Render a tags value as a comma-separated string for editing. */
function tagsToString(val: unknown): string {
  if (Array.isArray(val)) return val.join(", ")
  return String(val ?? "")
}

/** Parse a comma-separated tags string into an array. */
function stringToTags(s: string): string[] {
  return s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
}

export default function FrontmatterPanel({ content, onChange }: FrontmatterPanelProps) {
  const [newKey, setNewKey] = useState("")
  const [newVal, setNewVal] = useState("")

  const parsed = extractFrontmatter(content)

  const updateField = useCallback((key: string, value: unknown) => {
    const current = extractFrontmatter(content)
    const data: FrontmatterData = current ? { ...current.data } : {}
    if (value === "" || (Array.isArray(value) && value.length === 0)) {
      delete data[key]
    } else {
      data[key] = value
    }
    const yamlBlock = serializeFrontmatter(data)
    const body = current ? current.content : content
    onChange(`${yamlBlock}\n\n${body}`)
  }, [content, onChange])

  const addField = useCallback(() => {
    if (!newKey.trim()) return
    updateField(newKey.trim(), newVal.trim())
    setNewKey("")
    setNewVal("")
  }, [newKey, newVal, updateField])

  const removeField = useCallback((key: string) => {
    updateField(key, "")
  }, [updateField])

  const data: FrontmatterData = parsed?.data ?? {}

  // Collect extra fields not in KNOWN_FIELDS
  const knownKeys = new Set(KNOWN_FIELDS.map((f) => f.key))
  const extraFields = Object.entries(data).filter(([k]) => !knownKeys.has(k))

  return (
    <div className="fm-panel">
      <div className="fm-panel-fields">
        {KNOWN_FIELDS.map(({ key, label, type }) => {
          const val = data[key]
          if (type === "tags") {
            return (
              <div key={key} className="fm-field">
                <label className="fm-label">{label}</label>
                <input
                  className="fm-input"
                  placeholder="tag1, tag2, tag3"
                  value={tagsToString(val)}
                  onChange={(e) => updateField(key, stringToTags(e.target.value))}
                />
              </div>
            )
          }
          if (type === "textarea") {
            return (
              <div key={key} className="fm-field">
                <label className="fm-label">{label}</label>
                <textarea
                  className="fm-textarea"
                  placeholder={`${label}…`}
                  rows={3}
                  value={String(val ?? "")}
                  onChange={(e) => updateField(key, e.target.value)}
                />
              </div>
            )
          }
          return (
            <div key={key} className="fm-field">
              <label className="fm-label">{label}</label>
              <input
                className="fm-input"
                placeholder={label}
                value={String(val ?? "")}
                onChange={(e) => updateField(key, e.target.value)}
              />
            </div>
          )
        })}

        {extraFields.map(([key, val]) => (
          <div key={key} className="fm-field fm-field-extra">
            <label className="fm-label fm-label-extra">{key}</label>
            <input
              className="fm-input"
              value={String(val ?? "")}
              onChange={(e) => updateField(key, e.target.value)}
            />
            <button className="fm-remove" onClick={() => removeField(key)} title="Eliminar campo">×</button>
          </div>
        ))}
      </div>

      <div className="fm-add-field">
        <input
          className="fm-input fm-input-key"
          placeholder="campo"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addField()}
        />
        <input
          className="fm-input fm-input-val"
          placeholder="valor"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addField()}
        />
        <button className="fm-add-btn" onClick={addField} disabled={!newKey.trim()}>+</button>
      </div>
    </div>
  )
}
