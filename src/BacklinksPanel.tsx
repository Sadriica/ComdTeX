import { useState, useEffect } from "react"
import type { FileNode, SearchResult } from "./types"
import { flatFiles } from "./wikilinks"
import { useT } from "./i18n"
import { renderEmptyMessage } from "./emptyStateMessage"

interface BacklinksPanelProps {
  currentFile: { name: string; path: string } | null
  onOpenFile: (node: FileNode, line?: number) => void
  tree: FileNode[]
  /** The vault's own search, which reads through the mtime-cached index. */
  onSearch: (query: string) => Promise<SearchResult[]>
}

export default function BacklinksPanel({ currentFile, onOpenFile, tree, onSearch }: BacklinksPanelProps) {
  const t = useT()
  const [backlinks, setBacklinks] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  // Who links here is a search for `[[name]]`, so it goes through the vault's
  // index: every file this panel needs was already read for search, and an
  // unchanged file is never read again. Reading the whole vault from disk on
  // every file switch (what this did before) duplicated that work and scaled
  // with the vault, not with the answer.
  useEffect(() => {
    if (!currentFile) { setBacklinks([]); return }
    const baseName = currentFile.name.replace(/\.[^.]+$/, "")
    let cancelled = false
    setLoading(true)
    onSearch(`[[${baseName}]]`)
      .then((results) => {
        if (cancelled) return
        setBacklinks(results.filter((r) => r.filePath !== currentFile.path))
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Backlinks scan failed", err)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [currentFile, onSearch])

  if (!currentFile) {
    return <div className="tree-empty">{t.backlinks.noFile}</div>
  }

  return (
    <div className="backlinks-panel">
      <div className="backlinks-header">
        {loading ? t.backlinks.searching : t.backlinks.links(backlinks.length)}
      </div>
      {backlinks.length === 0 && !loading && (
        <div className="panel-empty-rich">
          <div className="panel-empty-icon" aria-hidden="true">{t.emptyStates.backlinksIcon}</div>
          <p className="panel-empty-message">{renderEmptyMessage(t.emptyStates.backlinksMessage)}</p>
        </div>
      )}
      {Object.entries(
        backlinks.reduce((acc, b) => {
          ;(acc[b.filePath] ??= []).push(b)
          return acc
        }, {} as Record<string, SearchResult[]>)
      ).map(([filePath, hits]) => {
        const node = flatFiles(tree).find((f) => f.path === filePath)
        if (!node) return null
        return (
          <div key={filePath} className="search-group">
            <div className="search-file" onClick={() => onOpenFile(node, hits[0]?.line)}>
              <span>{hits[0].fileName}</span>
              <span className="search-count">{hits.length}</span>
            </div>
            {hits.map((h, i) => (
              <div key={i} className="search-hit" onClick={() => onOpenFile(node, h.line)}>
                <span className="search-line">{h.line}</span>
                <span className="search-content">{h.content}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
