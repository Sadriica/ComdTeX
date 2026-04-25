import { useState, useEffect } from "react"
import type { FileNode, SearchResult } from "./types"
import { readTextFile } from "@tauri-apps/plugin-fs"
import { flatFiles } from "./wikilinks"
import { useT } from "./i18n"

interface BacklinksPanelProps {
  currentFile: { name: string; path: string } | null
  onOpenFile: (node: FileNode, line?: number) => void
  tree: FileNode[]
}

export default function BacklinksPanel({ currentFile, onOpenFile, tree }: BacklinksPanelProps) {
  const t = useT()
  const [backlinks, setBacklinks] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!currentFile) { setBacklinks([]); return }

    const baseName = currentFile.name.replace(/\.[^.]+$/, "")
    const pattern = `[[${baseName}]]`
    const patternLower = pattern.toLowerCase()

    setLoading(true)
    const files = flatFiles(tree).filter((f) => f.path !== currentFile.path)
    let cancelled = false

    Promise.all(
      files.map(async (f) => {
        try {
          const content = await readTextFile(f.path)
          const results: SearchResult[] = []
          content.split("\n").forEach((line, i) => {
            if (line.toLowerCase().includes(patternLower)) {
              results.push({ filePath: f.path, fileName: f.name, line: i + 1, content: line.trim() })
            }
          })
          return results
        } catch { return [] }
      })
    ).then((all) => {
      if (cancelled) return
      setBacklinks(all.flat())
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setLoading(false)
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.path, tree])

  if (!currentFile) {
    return <div className="tree-empty">{t.backlinks.noFile}</div>
  }

  return (
    <div className="backlinks-panel">
      <div className="backlinks-header">
        {loading ? t.backlinks.searching : t.backlinks.links(backlinks.length)}
      </div>
      {backlinks.length === 0 && !loading && (
        <div className="tree-empty">{t.backlinks.noLinks}</div>
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
