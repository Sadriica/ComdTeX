import { useCallback, useMemo, useState } from "react"
import { save } from "@tauri-apps/plugin-dialog"
import { writeTextFileAtomic } from "./atomicWrite"
import {
  scanVaultKeepMarks,
  groupByCategory,
  categoriesOf,
  formatGlossary,
  UNCATEGORIZED,
  type KeepEntry,
} from "./keepMarks"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"
import { renderEmptyMessage } from "./emptyStateMessage"
import { showToast } from "./toastService"

interface KeepPanelProps {
  files: { path: string; name: string; content: string }[]
  onOpenFile: (path: string, line?: number) => void
}

/**
 * Vault-wide collector for keep marks (`^^texto^^` / `^^def: texto^^`), grouped
 * by category. Same shape as LabelsPanel / TagPanel: `files` is App.tsx's
 * already-resident `vaultFiles` (the vault text cache overlaid with live tab
 * content), so the scan is pure in-memory work with no disk I/O, and it only
 * runs while this panel is actually mounted.
 *
 * The panel is the source of truth: it re-derives from `files` on every render
 * pass, so it can never drift from the documents. The glossary is written only
 * when the user asks for it; nothing is auto-written to the vault.
 */
export default function KeepPanel({ files, onOpenFile }: KeepPanelProps) {
  const t = useT()
  const kp = t.keepPanel
  const [filter, setFilter] = useState("")
  const [category, setCategory] = useState<string>("all")

  const entries = useMemo(() => scanVaultKeepMarks(files), [files])
  const categories = useMemo(() => categoriesOf(entries), [entries])

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return entries.filter((entry) => {
      if (category !== "all" && (entry.category ?? UNCATEGORIZED) !== category) return false
      if (!needle) return true
      return entry.text.toLowerCase().includes(needle) ||
        (entry.category ?? "").toLowerCase().includes(needle) ||
        entry.fileName.toLowerCase().includes(needle)
    })
  }, [entries, filter, category])

  const grouped = useMemo(() => groupByCategory(visible), [visible])
  const visibleCategories = useMemo(() => categoriesOf(visible), [visible])

  const handleExport = useCallback(async () => {
    const path = await save({
      title: kp.exportDialogTitle,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: "glosario.md",
    })
    if (!path) return
    await writeTextFileAtomic(path, formatGlossary(entries, {
      title: kp.glossaryTitle,
      uncategorized: kp.uncategorized,
    }))
    showToast(kp.exported, "success")
  }, [entries, kp])

  if (entries.length === 0) {
    return (
      <div className="keep-panel">
        <div className="panel-header">
          <span className="panel-header-title">{kp.title}</span>
          <span className="panel-header-actions">0</span>
        </div>
        <div className="panel-empty-rich">
          <div className="panel-empty-icon" aria-hidden="true">{kp.emptyIcon}</div>
          <p className="panel-empty-message">{renderEmptyMessage(kp.emptyMessage)}</p>
        </div>
      </div>
    )
  }

  const categoryLabel = (key: string) => (key === UNCATEGORIZED ? kp.uncategorized : key)

  return (
    <div className="keep-panel">
      <div className="panel-header">
        <span className="panel-header-title">{kp.title}</span>
        <span className="panel-header-actions">{kp.count(entries.length)}</span>
      </div>
      <div className="keep-controls">
        <input
          className="tag-filter"
          placeholder={kp.filterPlaceholder}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="tag-filter tag-type-filter"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">{kp.allCategories}</option>
          {categories.map((key) => (
            <option key={key} value={key}>{categoryLabel(key)}</option>
          ))}
        </select>
      </div>
      <div className="keep-actions">
        <button type="button" className="keep-export-btn" onClick={() => void handleExport()}>
          {kp.exportGlossary}
        </button>
      </div>
      <div className="keep-list">
        {visibleCategories.map((key) => (
          <div key={key} className="keep-section">
            <div className="keep-section-title">
              {categoryLabel(key)}
              <span className="keep-section-count">{grouped.get(key)?.length ?? 0}</span>
            </div>
            {(grouped.get(key) ?? []).map((entry: KeepEntry, i) => (
              <button
                key={`${entry.filePath}-${entry.index}-${i}`}
                type="button"
                className="keep-item"
                onClick={() => onOpenFile(entry.filePath, entry.line)}
                title={`${displayBasename(entry.filePath)}:${entry.line}`}
              >
                <span className="keep-item-text">{entry.text}</span>
                <span className="keep-item-file">{displayBasename(entry.filePath)}:{entry.line}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
