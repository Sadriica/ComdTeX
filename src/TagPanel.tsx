import { useMemo, useState } from "react"
import type { OpenFile } from "./types"
import { extractTags } from "./frontmatter"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"

interface TagPanelProps {
  openTabs: OpenFile[]
  onOpenFile: (path: string) => void
}

interface TagEntry {
  tag: string
  files: { path: string; name: string }[]
}

export default function TagPanel({ openTabs, onOpenFile }: TagPanelProps) {
  const t = useT()
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  const tagMap = useMemo(() => {
    const map = new Map<string, { path: string; name: string }[]>()
    for (const tab of openTabs) {
      const tags = extractTags(tab.content)
      for (const tag of tags) {
        if (!map.has(tag)) map.set(tag, [])
        map.get(tag)!.push({ path: tab.path, name: tab.name })
      }
    }
    return map
  }, [openTabs])

  const entries: TagEntry[] = useMemo(() => {
    return [...tagMap.entries()]
      .filter(([tag]) => !filter || tag.includes(filter.toLowerCase()))
      .map(([tag, files]) => ({ tag, files }))
      .sort((a, b) => b.files.length - a.files.length || a.tag.localeCompare(b.tag))
  }, [tagMap, filter])

  if (openTabs.length === 0) {
    return <div className="panel-empty">Abre archivos para ver sus tags</div>
  }

  if (tagMap.size === 0) {
    return (
      <div className="tag-panel">
        <div className="panel-empty">
          <div>Sin tags encontrados</div>
          <div className="tag-hint">Añade tags en frontmatter:<br /><code>tags: [math, analysis]</code><br />o inline: <code>#calculus</code></div>
        </div>
      </div>
    )
  }

  const selectedFiles = selected ? (tagMap.get(selected) ?? []) : []

  return (
    <div className="tag-panel">
      <div className="panel-header">
        <span className="panel-header-title">{t.sidebar.tags}</span>
        <span className="panel-header-actions">{tagMap.size > 0 ? `${tagMap.size}` : ""}</span>
      </div>
      <div className="tag-search-wrap">
        <input
          className="tag-filter"
          placeholder="Filtrar tags…"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setSelected(null) }}
        />
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
                onClick={() => onOpenFile(f.path)}
                title={f.path}
              >
                {displayBasename(f.path)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="tag-list">
          {entries.map(({ tag, files }) => (
            <button
              key={tag}
              className="tag-item"
              onClick={() => setSelected(tag)}
              title={`${files.length} archivo${files.length === 1 ? "" : "s"}`}
            >
              <span className="tag-name">#{tag}</span>
              <span className="tag-count">{files.length}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
