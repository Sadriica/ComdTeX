import { useState, useCallback } from "react"
import type { FrontmatterData } from "./frontmatter"
import { extractFrontmatter, serializeFrontmatter } from "./frontmatter"
import { useT } from "./i18n"

interface FrontmatterPanelProps {
  content: string
  onChange: (newContent: string) => void
}

const KNOWN_FIELD_KEYS: { key: string; fieldKey: "fieldTitle" | "fieldAuthor" | "fieldDate" | "fieldAbstract" | "fieldTags"; type: "text" | "tags" | "textarea" }[] = [
  { key: "title",    fieldKey: "fieldTitle",    type: "text" },
  { key: "author",   fieldKey: "fieldAuthor",   type: "text" },
  { key: "date",     fieldKey: "fieldDate",     type: "text" },
  { key: "abstract", fieldKey: "fieldAbstract", type: "textarea" },
  { key: "tags",     fieldKey: "fieldTags",     type: "tags" },
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
  const t = useT()
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

  // Collect extra fields not in KNOWN_FIELD_KEYS (also exclude layout fields)
  const LAYOUT_KEYS = new Set(["papersize", "orientation", "headerLeft", "headerCenter", "headerRight", "footerLeft", "footerCenter", "footerRight"])
  const knownKeys = new Set([...KNOWN_FIELD_KEYS.map((f) => f.key), ...LAYOUT_KEYS])
  const extraFields = Object.entries(data).filter(([k]) => !knownKeys.has(k))

  return (
    <div className="fm-panel">
      <div className="fm-panel-fields">
        {KNOWN_FIELD_KEYS.map(({ key, fieldKey, type }) => {
          const label = t.frontmatterPanel[fieldKey]
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
            <button className="fm-remove" onClick={() => removeField(key)} title={t.frontmatterPanel.removeField}>×</button>
          </div>
        ))}
      </div>

      <details className="fm-layout-section">
        <summary>{t.frontmatterPanel.layoutSection}</summary>

        <div className="fm-field">
          <label className="fm-label">{t.frontmatterPanel.paperSize}</label>
          <select
            className="fm-input"
            value={String(data.papersize ?? "")}
            onChange={(e) => updateField("papersize", e.target.value)}
          >
            <option value="">— A4 {t.frontmatterPanel.paperA4.includes("A4") ? "(default)" : ""}</option>
            <option value="a4">{t.frontmatterPanel.paperA4}</option>
            <option value="letter">{t.frontmatterPanel.paperLetter}</option>
            <option value="a5">{t.frontmatterPanel.paperA5}</option>
            <option value="a3">{t.frontmatterPanel.paperA3}</option>
            <option value="legal">{t.frontmatterPanel.paperLegal}</option>
          </select>
        </div>

        <div className="fm-field">
          <label className="fm-label">{t.frontmatterPanel.orientation}</label>
          <select
            className="fm-input"
            value={String(data.orientation ?? "")}
            onChange={(e) => updateField("orientation", e.target.value)}
          >
            <option value="">{t.frontmatterPanel.portrait}</option>
            <option value="landscape">{t.frontmatterPanel.landscape}</option>
          </select>
        </div>

        <div className="fm-field">
          <label className="fm-label">{t.frontmatterPanel.headerLabel}</label>
          <div className="fm-three-col">
            <input
              className="fm-input"
              placeholder={t.frontmatterPanel.left}
              value={String(data.headerLeft ?? "")}
              onChange={(e) => updateField("headerLeft", e.target.value)}
            />
            <input
              className="fm-input"
              placeholder={t.frontmatterPanel.center}
              value={String(data.headerCenter ?? "")}
              onChange={(e) => updateField("headerCenter", e.target.value)}
            />
            <input
              className="fm-input"
              placeholder={t.frontmatterPanel.right}
              value={String(data.headerRight ?? "")}
              onChange={(e) => updateField("headerRight", e.target.value)}
            />
          </div>
        </div>

        <div className="fm-field">
          <label className="fm-label">{t.frontmatterPanel.footerLabel}</label>
          <div className="fm-three-col">
            <input
              className="fm-input"
              placeholder={t.frontmatterPanel.left}
              value={String(data.footerLeft ?? "")}
              onChange={(e) => updateField("footerLeft", e.target.value)}
            />
            <input
              className="fm-input"
              placeholder={t.frontmatterPanel.center}
              value={String(data.footerCenter ?? "")}
              onChange={(e) => updateField("footerCenter", e.target.value)}
            />
            <input
              className="fm-input"
              placeholder={t.frontmatterPanel.right}
              value={String(data.footerRight ?? "")}
              onChange={(e) => updateField("footerRight", e.target.value)}
            />
          </div>
          <p className="fm-hint">{t.frontmatterPanel.headerFooterHint}</p>
        </div>
      </details>

      <div className="fm-add-field">
        <input
          className="fm-input fm-input-key"
          placeholder={t.frontmatterPanel.fieldKeyPlaceholder}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addField()}
        />
        <input
          className="fm-input fm-input-val"
          placeholder={t.frontmatterPanel.fieldValuePlaceholder}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addField()}
        />
        <button className="fm-add-btn" onClick={addField} disabled={!newKey.trim()} title={t.frontmatterPanel.addField} aria-label={t.frontmatterPanel.addField}>+</button>
      </div>
    </div>
  )
}
