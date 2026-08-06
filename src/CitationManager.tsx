import { useState, useEffect } from "react"
import type { BibEntry } from "./bibtex"
import { parseBibtex } from "./bibtex"
import {
  fetchBibtexForDoi,
  fetchBibtexFromAds,
  fetchBibtexFromInspire,
  isAdsBibcode,
  parseInspireInput,
} from "./doiFetch"
import { getSecret } from "./secretStore"
import { searchZotero, fetchZoteroBibtex, type ZoteroItem } from "./zotero"
import { showToast } from "./toastService"
import { useT } from "./i18n"

interface CitationManagerProps {
  open: boolean
  bibMap: Map<string, BibEntry>
  onSave: (bibtexString: string) => void
  /** Persist the current entry set immediately without closing the modal
   *  (used by "Add by DOI" so the fetched entry hits references.bib at once). */
  onPersist: (bibtexString: string) => void | Promise<void>
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
  onPersist,
  onClose,
}: CitationManagerProps) {
  const t = useT()
  const [entries, setEntries] = useState<Map<string, BibEntry>>(new Map(bibMap))
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [doi, setDoi] = useState("")
  const [fetching, setFetching] = useState(false)
  // ── Zotero import state ───────────────────────────────────────────────────
  const [zoteroQuery, setZoteroQuery] = useState("")
  const [zoteroResults, setZoteroResults] = useState<ZoteroItem[] | null>(null)
  const [zoteroSearching, setZoteroSearching] = useState(false)
  const [zoteroFetching, setZoteroFetching] = useState(false)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntries(new Map(bibMap))
      setForm(DEFAULT_FORM)
      setError(null)
      setDeleteConfirm(null)
      setDoi("")
      setFetching(false)
      setZoteroQuery("")
      setZoteroResults(null)
      setZoteroSearching(false)
      setZoteroFetching(false)
    }
  }, [open, bibMap])

  if (!open) return null

  const venueLabel = (type: string): string => {
    if (type === "article") return t.citationManager.venueJournal
    if (type === "inproceedings") return t.citationManager.venueBooktitle
    return t.citationManager.venueSource
  }

  const handleAdd = () => {
    const key = form.key.trim()
    if (!key) {
      setError(t.citationManager.keyRequired)
      return
    }
    if (entries.has(key)) {
      setError(t.citationManager.keyExists(key))
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

  // ── Add by DOI / arXiv ────────────────────────────────────────────────────
  // On-demand network fetch ONLY: runs when the user clicks this button. No
  // automatic/background requests; ComdTeX stays offline until invoked here.
  const handleFetchDoi = async () => {
    const query = doi.trim()
    if (!query || fetching) return
    setFetching(true)
    try {
      // The identifier decides the source: astronomers paste an ADS
      // bibcode, physicists an INSPIRE recid or arXiv id, everyone else a
      // DOI. All three publish BibTeX, so one box resolves them all.
      let bibtex: string
      if (isAdsBibcode(query)) {
        const token = await getSecret("ads_token")
        if (!token) { showToast(t.citationManager.adsTokenMissing, "error", 8000); return }
        bibtex = await fetchBibtexFromAds(query, token)
      } else {
        const inspire = parseInspireInput(query)
        // A bare arXiv id still prefers DOI resolution (CrossRef/DataCite);
        // INSPIRE only owns explicit recids and its own URLs.
        if (inspire && inspire.kind === "recid") {
          bibtex = await fetchBibtexFromInspire(inspire)
        } else {
          bibtex = (await fetchBibtexForDoi(query)).bibtex
        }
      }
      // Validate it parses with the existing BibTeX parser.
      const parsed = parseBibtex(bibtex)
      if (parsed.size === 0) { showToast(t.citationManager.doiError, "error"); return }
      const [key, entry] = [...parsed.entries()][0]
      if (entries.has(key)) { showToast(t.citationManager.doiExists(key), "info"); return }
      const next = new Map(entries).set(key, entry)
      setEntries(next)
      setDoi("")
      // Persist to references.bib immediately and refresh the in-memory bib map.
      await onPersist(serializeBibtex(next))
      showToast(t.citationManager.doiSuccess(key), "success")
    } catch {
      showToast(t.citationManager.doiError, "error")
    } finally {
      setFetching(false)
    }
  }

  // ── Import from Zotero (local HTTP API) ───────────────────────────────────
  // On-demand ONLY: requires Zotero (ideally with the Better BibTeX plugin)
  // running locally. No network calls happen until the user searches/imports;
  // ComdTeX stays offline otherwise. Reuses the SAME parse-validate +
  // dedupe-by-key + onPersist path as "Add by DOI" so behavior is consistent.
  const handleZoteroSearch = async () => {
    const q = zoteroQuery.trim()
    if (!q || zoteroSearching) return
    setZoteroSearching(true)
    setZoteroResults(null)
    try {
      const results = await searchZotero(q)
      setZoteroResults(results)
    } catch {
      setZoteroResults(null)
      showToast(t.citationManager.zoteroUnavailable, "error")
    } finally {
      setZoteroSearching(false)
    }
  }

  /** Fetch BibTeX for the given citekeys and append using the DOI append path. */
  const importZoteroKeys = async (citekeys: string[]) => {
    if (citekeys.length === 0 || zoteroFetching) return
    setZoteroFetching(true)
    try {
      const bibtex = await fetchZoteroBibtex(citekeys)
      const parsed = parseBibtex(bibtex)
      if (parsed.size === 0) { showToast(t.citationManager.zoteroUnavailable, "error"); return }
      // Dedupe by key, mirroring the "Add by DOI" path.
      let next = new Map(entries)
      let added = 0
      let lastDup: string | null = null
      for (const [key, entry] of parsed) {
        if (next.has(key)) { lastDup = key; continue }
        next = new Map(next).set(key, entry)
        added++
      }
      if (added === 0) {
        showToast(t.citationManager.zoteroDuplicate(lastDup ?? citekeys[0]), "info")
        return
      }
      setEntries(next)
      // Persist to references.bib immediately and refresh the in-memory bib map.
      await onPersist(serializeBibtex(next))
      showToast(t.citationManager.zoteroImported(added), "success")
    } catch {
      showToast(t.citationManager.zoteroUnavailable, "error")
    } finally {
      setZoteroFetching(false)
    }
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
          <span className="cit-manager-title">{t.citationManager.title}</span>
          <button className="cit-manager-close" onClick={onClose} title={t.citationManager.close}>×</button>
        </div>

        {/* Body */}
        <div className="cit-manager-body">
          {/* Entry list */}
          <div className="cit-list">
            {entries.size === 0 && (
              <div style={{ padding: "16px 12px", color: "#555", fontSize: 12 }}>
                {t.citationManager.noEntries}
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
                      {f.title || <em style={{ color: "#555" }}>{t.citationManager.noTitle}</em>}
                    </div>
                    <div className="cit-item-meta">
                      {[f.author, f.year].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <button
                    className="cit-delete-btn"
                    title={deleteConfirm === key ? t.citationManager.confirmDelete : t.citationManager.deleteEntry}
                    onClick={() => handleDelete(key)}
                    style={deleteConfirm === key ? { color: "#f48771" } : undefined}
                  >
                    {deleteConfirm === key ? "✓" : "✕"}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Add by DOI / arXiv (on-demand network fetch) */}
          <div className="cit-add-form" style={{ borderBottom: "1px solid #2a2a2a", paddingBottom: 8 }}>
            <div className="cit-add-form-row">
              <input
                placeholder={t.citationManager.doiPlaceholder}
                value={doi}
                onChange={e => setDoi(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleFetchDoi() }}
                disabled={fetching}
                style={{ flex: 1 }}
              />
              <button
                className="cit-add-btn"
                onClick={handleFetchDoi}
                disabled={fetching || !doi.trim()}
                style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}
              >
                {fetching ? t.citationManager.doiFetching : t.citationManager.doiAdd}
              </button>
            </div>
          </div>

          {/* Import from Zotero (on-demand local HTTP API; requires Zotero running) */}
          <div className="cit-add-form" style={{ borderBottom: "1px solid #2a2a2a", paddingBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2, fontWeight: 600 }}>
              {t.citationManager.zoteroHeading}
            </div>
            <div className="cit-add-form-row">
              <input
                placeholder={t.citationManager.zoteroPlaceholder}
                value={zoteroQuery}
                onChange={e => setZoteroQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleZoteroSearch() }}
                disabled={zoteroSearching || zoteroFetching}
                style={{ flex: 1 }}
              />
              <button
                className="cit-add-btn"
                onClick={handleZoteroSearch}
                disabled={zoteroSearching || zoteroFetching || !zoteroQuery.trim()}
                style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}
              >
                {zoteroSearching ? t.citationManager.zoteroSearching : t.citationManager.zoteroSearch}
              </button>
            </div>

            {zoteroResults !== null && zoteroResults.length === 0 && !zoteroSearching && (
              <div style={{ padding: "4px 2px", color: "#777", fontSize: 12 }}>
                {t.citationManager.zoteroNoResults}
              </div>
            )}

            {zoteroResults !== null && zoteroResults.length > 0 && (
              <>
                <div className="cit-add-form-row" style={{ justifyContent: "flex-end" }}>
                  <button
                    className="cit-add-btn"
                    onClick={() => importZoteroKeys(zoteroResults.map(r => r.citekey))}
                    disabled={zoteroFetching}
                    style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}
                  >
                    {zoteroFetching ? t.citationManager.zoteroFetching : t.citationManager.zoteroImportAll}
                  </button>
                </div>
                <div className="cit-list" style={{ maxHeight: 160, overflowY: "auto" }}>
                  {zoteroResults.map(r => (
                    <div key={r.citekey} className="cit-item">
                      <div className="cit-item-info">
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span className="cit-item-key">{r.citekey}</span>
                        </div>
                        <div className="cit-item-title" title={r.title}>
                          {r.title || <em style={{ color: "#555" }}>{t.citationManager.noTitle}</em>}
                        </div>
                        <div className="cit-item-meta">
                          {[r.author, r.year].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <button
                        className="cit-add-btn"
                        title={t.citationManager.zoteroHeading}
                        onClick={() => importZoteroKeys([r.citekey])}
                        disabled={zoteroFetching}
                        style={{ flex: "0 0 auto" }}
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Add entry form */}
          <div className="cit-add-form">
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2, fontWeight: 600 }}>
              {t.citationManager.addEntry}
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
                placeholder={t.citationManager.keyPlaceholder}
                value={form.key}
                onChange={e => updateForm("key", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                style={{ flex: "0 0 auto", minWidth: 100, maxWidth: 140 }}
              />
              <input
                placeholder={t.citationManager.yearPlaceholder}
                value={form.year}
                onChange={e => updateForm("year", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                style={{ flex: "0 0 auto", minWidth: 60, maxWidth: 80 }}
              />
            </div>
            <div className="cit-add-form-row">
              <input
                placeholder={t.citationManager.titlePlaceholder}
                value={form.title}
                onChange={e => updateForm("title", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
              />
            </div>
            <div className="cit-add-form-row">
              <input
                placeholder={t.citationManager.authorPlaceholder}
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
                {t.citationManager.add}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cit-manager-footer">
          <button className="cit-cancel-btn" onClick={onClose}>{t.citationManager.cancel}</button>
          <button className="cit-save-btn" onClick={handleSave}>{t.citationManager.save}</button>
        </div>
      </div>
    </div>
  )
}
