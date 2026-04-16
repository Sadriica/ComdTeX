import { useState, useEffect } from "react"
import type { BibEntry } from "./bibtex"

interface CitationManagerProps {
  open: boolean
  bibMap: Map<string, BibEntry>
  onSave: (bibtexString: string) => void
  onClose: () => void
}

function serializeBibtex(entries: Map<string, BibEntry>): string {
  return [...entries.entries()]
    .map(([key, entry]) => {
      const fields = Object.entries(entry.fields)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `  ${k} = {${v}}`)
        .join(",\n")
      return `@${entry.type}{${key},\n${fields}\n}`
    })
    .join("\n\n")
}

const ENTRY_TYPES = ["article", "book", "inproceedings", "misc", "phdthesis", "techreport"]

function venueLabel(type: string): string {
  if (type === "article") return "Revista (journal)"
  if (type === "inproceedings") return "Evento (booktitle)"
  return "Booktitle / Fuente"
}

interface FormState {
  type: string
  key: string
  title: string
  author: string
  year: string
  venue: string
}

const DEFAULT_FORM: FormState = {
  type: "article",
  key: "",
  title: "",
  author: "",
  year: "",
  venue: "",
}

export default function CitationManager({
  open,
  bibMap,
  onSave,
  onClose,
}: CitationManagerProps) {
  const [entries, setEntries] = useState<Map<string, BibEntry>>(new Map(bibMap))
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntries(new Map(bibMap))
      setForm(DEFAULT_FORM)
      setError(null)
      setDeleteConfirm(null)
    }
  }, [open, bibMap])

  if (!open) return null

  const handleAdd = () => {
    const key = form.key.trim()
    if (!key) {
      setError("Key requerido")
      return
    }
    if (entries.has(key)) {
      setError(`Key "${key}" ya existe`)
      return
    }
    const venueField = ["article", "inproceedings"].includes(form.type) ? "journal" : "booktitle"
    const fields: Record<string, string> = {
      title: form.title,
      author: form.author,
      year: form.year,
      [venueField]: form.venue,
    }
    setEntries(prev => new Map(prev).set(key, { type: form.type, key, fields }))
    setForm(DEFAULT_FORM)
    setError(null)
  }

  const handleDelete = (key: string) => {
    if (deleteConfirm === key) {
      setEntries(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      setDeleteConfirm(null)
    } else {
      setDeleteConfirm(key)
    }
  }

  const handleSave = () => {
    onSave(serializeBibtex(entries))
    onClose()
  }

  const updateForm = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (error) setError(null)
  }

  return (
    <div
      className="cit-manager-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="cit-manager">
        {/* Header */}
        <div className="cit-manager-header">
          <span className="cit-manager-title">Gestor de Referencias BibTeX</span>
          <button className="cit-manager-close" onClick={onClose} title="Cerrar">×</button>
        </div>

        {/* Body */}
        <div className="cit-manager-body">
          {/* Entry list */}
          <div className="cit-list">
            {entries.size === 0 && (
              <div style={{ padding: "16px 12px", color: "#555", fontSize: 12 }}>
                No hay entradas. Agrega una abajo.
              </div>
            )}
            {[...entries.entries()].map(([key, entry]) => {
              const f = entry.fields
              return (
                <div key={key} className="cit-item">
                  <div className="cit-item-info">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span className="cit-item-key">{key}</span>
                      <span className="cit-type-badge">{entry.type}</span>
                    </div>
                    <div className="cit-item-title" title={f.title ?? ""}>
                      {f.title || <em style={{ color: "#555" }}>Sin título</em>}
                    </div>
                    <div className="cit-item-meta">
                      {[f.author, f.year].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <button
                    className="cit-delete-btn"
                    title={deleteConfirm === key ? "Confirmar eliminación" : "Eliminar entrada"}
                    onClick={() => handleDelete(key)}
                    style={deleteConfirm === key ? { color: "#f48771" } : undefined}
                  >
                    {deleteConfirm === key ? "✓" : "✕"}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Add entry form */}
          <div className="cit-add-form">
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2, fontWeight: 600 }}>
              Agregar entrada
            </div>
            <div className="cit-add-form-row">
              <select
                value={form.type}
                onChange={e => updateForm("type", e.target.value)}
                style={{ flex: "0 0 auto", minWidth: 110 }}
              >
                {ENTRY_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                placeholder="Key *"
                value={form.key}
                onChange={e => updateForm("key", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                style={{ flex: "0 0 auto", minWidth: 100, maxWidth: 140 }}
              />
              <input
                placeholder="Año"
                value={form.year}
                onChange={e => updateForm("year", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                style={{ flex: "0 0 auto", minWidth: 60, maxWidth: 80 }}
              />
            </div>
            <div className="cit-add-form-row">
              <input
                placeholder="Título"
                value={form.title}
                onChange={e => updateForm("title", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
              />
            </div>
            <div className="cit-add-form-row">
              <input
                placeholder="Autor(es)"
                value={form.author}
                onChange={e => updateForm("author", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
              />
              <input
                placeholder={venueLabel(form.type)}
                value={form.venue}
                onChange={e => updateForm("venue", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
              />
            </div>
            <div className="cit-add-form-row">
              {error && <span className="cit-error">{error}</span>}
              <button
                className="cit-add-btn"
                onClick={handleAdd}
                style={{ marginLeft: "auto" }}
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cit-manager-footer">
          <button className="cit-cancel-btn" onClick={onClose}>Cancelar</button>
          <button className="cit-save-btn" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
