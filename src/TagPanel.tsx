import { useMemo, useState } from "react"
import { extractDetailedTags } from "./frontmatter"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"
import { renderEmptyMessage } from "./emptyStateMessage"

interface TagPanelProps {
  files: { path: string; name: string; content: string }[]
  onOpenFile: (path: string, line?: number) => void
}

interface TagEntry {
  tag: string
  type: string
  files: { path: string; name: string; line: number; source: "frontmatter" | "inline" }[]
}

export default function TagPanel({ files, onOpenFile }: TagPanelProps) {
  const t = useT()
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")

  const tagMap = useMemo(() => {
    const map = new Map<string, TagEntry>()
    for (const file of files) {
      const tags = extractDetailedTags(file.content)
      for (const entry of tags) {
        if (!map.has(entry.tag)) map.set(entry.tag, { tag: entry.tag, type: entry.type, files: [] })
        map.get(entry.tag)!.files.push({ path: file.path, name: file.name, line: entry.line, source: entry.source })
      }
    }
    return map
  }, [files])

  const tagTypes = useMemo(
    () => ["all", ...new Set([...tagMap.values()].map((entry) => entry.type))].sort(),
    [tagMap],
  )

  const entries: TagEntry[] = useMemo(() => {
    return [...tagMap.values()]
      .filter((entry) => typeFilter === "all" || entry.type === typeFilter)
      .filter((entry) => !filter || entry.tag.includes(filter.toLowerCase()))
      .sort((a, b) => b.files.length - a.files.length || a.tag.localeCompare(b.tag))
  }, [tagMap, filter, typeFilter])

  if (files.length === 0) {
    return (
      <div className="panel-empty-rich">
        <div className="panel-empty-icon" aria-hidden="true">{t.emptyStates.tagsIcon}</div>
        <p className="panel-empty-message">{t.tagPanel.noFiles}</p>
      </div>
    )
  }

  if (tagMap.size === 0) {
    return (
      <div className="tag-panel">
        <div className="panel-empty-rich">
          <div className="panel-empty-icon" aria-hidden="true">{t.emptyStates.tagsIcon}</div>
          <p className="panel-empty-message">{renderEmptyMessage(t.emptyStates.tagsMessage)}</p>
        </div>
      </div>
    )
  }

  const selectedEntry = selected ? tagMap.get(selected) : null
  const selectedFiles = selectedEntry?.files ?? []

  return (
    <div className="tag-panel">
      <div className="panel-header">
        <span className="panel-header-title">{t.sidebar.tags}</span>
        <span className="panel-header-actions">{tagMap.size > 0 ? `${tagMap.size}` : ""}</span>
      </div>
      <div className="tag-search-wrap">
        <input
          className="tag-filter"
          placeholder={t.tagPanel.filterPlaceholder}
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setSelected(null) }}
        />
        <select
          className="tag-filter tag-type-filter"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setSelected(null) }}
          aria-label={t.tagPanel.typeAriaLabel}
        >
          {tagTypes.map((type) => (
            <option key={type} value={type}>{type === "all" ? t.tagPanel.allTypes : type}</option>
          ))}
        </select>
      </div>

      {selected ? (
        <>
          <button className="tag-back" onClick={() => setSelected(null)}>
            ← #{selected}
          </button>
          <div className="tag-file-list">
            {selectedFiles.map((f) => (
              <button
                key={f.path}
                className="tag-file-item"
                onClick={() => onOpenFile(f.path, f.line)}
                title={f.path}
              >
                <span>{displayBasename(f.path)}</span>
                <span className={`tag-source tag-source-${f.source}`}>{f.source === "frontmatter" ? "YAML" : `L${f.line}`}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="tag-list">
          {entries.map(({ tag, type, files }) => (
            <button
              key={tag}
              className="tag-item"
              onClick={() => setSelected(tag)}
              title={t.tagPanel.fileCount(files.length)}
            >
              <span className="tag-name">#{tag}</span>
              <span className="tag-type">{type}</span>
              <span className="tag-count">{files.length}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
