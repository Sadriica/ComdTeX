import { useState, useEffect, useRef } from "react"
import type { FileNode } from "./types"
import { useT } from "./i18n"

export interface PaletteCommand {
  id: string
  label: string
  description?: string
  action: () => void
}

interface PaletteItem {
  kind: "file" | "command" | "recent"
  label: string
  description?: string
  action: () => void
}

function fuzzy(query: string, text: string): boolean {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

function flatFiles(tree: FileNode[]): FileNode[] {
  const out: FileNode[] = []
  const collect = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === "file") out.push(n)
      if (n.children) collect(n.children)
    }
  }
  collect(tree)
  return out
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  files: FileNode[]
  commands: PaletteCommand[]
  onOpenFile: (node: FileNode) => void
  recentFiles?: { path: string; name: string }[]
  onOpenRecent?: (path: string) => void
}

export default function CommandPalette({ open, onClose, files, commands, onOpenFile, recentFiles, onOpenRecent }: CommandPaletteProps) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    // Intentional: reset input and selection each time the palette opens.
    setQuery("") // eslint-disable-line react-hooks/set-state-in-effect
    setSelected(0)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  if (!open) return null

  const allFiles = flatFiles(files)

  // When no query: prepend recent files; otherwise search all
  const recentItems: PaletteItem[] = !query && recentFiles && onOpenRecent
    ? recentFiles.map((r) => ({
        kind: "recent" as const,
        label: r.name,
        description: r.path,
        action: () => { onOpenRecent(r.path); onClose() },
      }))
    : []

  const items: PaletteItem[] = [
    ...recentItems,
    ...allFiles
      .filter((f) => !query || fuzzy(query, f.name))
      .map((f) => ({
        kind: "file" as const,
        label: f.name,
        description: f.path,
        action: () => { onOpenFile(f); onClose() },
      })),
    ...commands
      .filter((c) => !query || fuzzy(query, c.label))
      .map((c) => ({
        kind: "command" as const,
        label: c.label,
        description: c.description,
        action: () => { c.action(); onClose() },
      })),
  ]

  const clampedSelected = Math.min(selected, Math.max(0, items.length - 1))

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === "Enter" && items[clampedSelected]) items[clampedSelected].action()
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={t.palette.placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
          onKeyDown={handleKey}
        />
        <div className="palette-list">
          {items.length === 0 && (
            <div className="palette-empty">{t.palette.noResults}</div>
          )}
          {items.map((item, i) => (
            <button
              key={i}
              className={`palette-item ${i === clampedSelected ? "palette-item-selected" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onMouseDown={() => item.action()}
            >
              <span className={`palette-kind ${item.kind === "file" ? "palette-kind-file" : item.kind === "recent" ? "palette-kind-recent" : "palette-kind-cmd"}`}>
                {item.kind === "file" ? "M" : item.kind === "recent" ? "⏱" : "⌘"}
              </span>
              <span className="palette-label">{item.label}</span>
              {item.description && (
                <span className="palette-desc">{item.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
