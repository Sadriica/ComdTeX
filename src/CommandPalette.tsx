import { useState, useEffect, useRef, type ReactNode } from "react"
import type { FileNode } from "./types"
import { useT } from "./i18n"

export type PaletteCategory =
  | "Edición" | "Insertar" | "Matemáticas" | "Vista"
  | "Exportar" | "IA" | "Vault" | "Navegación"

export interface PaletteCommand {
  id: string
  label: string
  /** Optional shortcut hint shown as a right-aligned chip. */
  shortcut?: string
  /** Legacy field — still rendered as a dim description when present. */
  description?: string
  /** Extra hidden terms used only for search. */
  keywords?: string[]
  category?: PaletteCategory
  icon?: ReactNode
  /** Leaf commands run `action`; parents drill into `children`. */
  action?: () => void
  children?: PaletteCommand[]
}

interface PaletteItem {
  kind: "file" | "command" | "recent" | "back"
  label: string
  shortcut?: string
  description?: string
  icon?: ReactNode
  category?: PaletteCategory
  hasChildren?: boolean
  action: () => void
}

// Monochrome folder icon (inline SVG with currentColor — emoji folder glyphs
// render coloured in WebKitGTK, the same bug that forced the settings gear to SVG).
const FolderIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-0.15em" }}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
)

// Monochrome AI sparkle (inline SVG with currentColor — the ✦/✨-style glyphs
// render coloured in WebKitGTK, the same bug as the folder/gear icons).
const SparkleIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-0.15em" }}>
    <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
  </svg>
)

// Default per-category glyph (reused for commands that omit their own icon).
const CATEGORY_ICON: Record<PaletteCategory, ReactNode> = {
  "Edición": "✎",
  "Insertar": "＋",
  "Matemáticas": "∑",
  "Vista": "▦",
  "Exportar": "⇪",
  "IA": SparkleIcon,
  "Vault": FolderIcon,
  "Navegación": "⇄",
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

function commandMatches(query: string, command: PaletteCommand, categoryLabel?: string): boolean {
  if (!query) return true
  const terms = [
    command.label,
    command.description,
    command.shortcut,
    categoryLabel,
    ...(command.keywords ?? []),
  ].filter(Boolean) as string[]
  return terms.some((term) => fuzzy(query, term))
}

function flattenCommands(commands: PaletteCommand[]): PaletteCommand[] {
  const out: PaletteCommand[] = []
  const visit = (items: PaletteCommand[], inheritedCategory?: PaletteCategory) => {
    for (const item of items) {
      const category = item.category ?? inheritedCategory
      if (item.children?.length) visit(item.children, category)
      if (item.action) out.push({ ...item, category })
    }
  }
  visit(commands)
  return out
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
  // Drill-in stack: each entry is a parent command whose `children` we're showing.
  const [stack, setStack] = useState<PaletteCommand[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    // Intentional: reset input, selection and drill-stack each time it opens.
    setQuery("") // eslint-disable-line react-hooks/set-state-in-effect
    setSelected(0)
    setStack([])
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  if (!open) return null

  const inSubLevel = stack.length > 0
  const parent = inSubLevel ? stack[stack.length - 1] : null

  const back = () => { setStack((s) => s.slice(0, -1)); setQuery(""); setSelected(0) }
  const drillInto = (cmd: PaletteCommand) => { setStack((s) => [...s, cmd]); setQuery(""); setSelected(0) }

  const allFiles = flatFiles(files)

  // ── Build the item list for the current level ─────────────────────────────
  let items: PaletteItem[] = []

  if (inSubLevel && parent?.children) {
    items = [
      { kind: "back", label: t.palette.back, icon: "←", action: back },
      ...parent.children
        .filter((c) => commandMatches(query, c, c.category ? t.palette.categories[c.category] : parent.category ? t.palette.categories[parent.category] : undefined))
        .map<PaletteItem>((c) => ({
          kind: "command",
          label: c.label,
          shortcut: c.shortcut,
          description: c.description,
          icon: c.icon ?? (c.category ? CATEGORY_ICON[c.category] : undefined),
          category: c.category ?? parent.category,
          hasChildren: !!c.children,
          action: c.children
            ? () => drillInto(c)
            : () => { c.action?.(); onClose() },
        })),
    ]
  } else {
    const recentItems: PaletteItem[] = !query && recentFiles && onOpenRecent
      ? recentFiles.map((r) => ({
          kind: "recent" as const,
          label: r.name,
          description: r.path,
          action: () => { onOpenRecent(r.path); onClose() },
        }))
      : []

    items = [
      ...recentItems,
      ...allFiles
        .filter((f) => !query || fuzzy(query, f.name))
        .map<PaletteItem>((f) => ({
          kind: "file",
          label: f.name,
          description: f.path,
          action: () => { onOpenFile(f); onClose() },
        })),
      ...(query ? flattenCommands(commands) : commands)
        .filter((c) => commandMatches(query, c, c.category ? t.palette.categories[c.category] : undefined))
        .map<PaletteItem>((c) => ({
          kind: "command",
          label: c.label,
          shortcut: c.shortcut ?? c.description,
          icon: c.icon ?? (c.category ? CATEGORY_ICON[c.category] : undefined),
          category: c.category,
          hasChildren: !!c.children,
          action: c.children
            ? () => drillInto(c)
            : () => { c.action?.(); onClose() },
        })),
    ]
  }

  const clampedSelected = Math.min(selected, Math.max(0, items.length - 1))

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (inSubLevel) { e.preventDefault(); back() } else onClose()
      return
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === "Enter" && items[clampedSelected]) { e.preventDefault(); items[clampedSelected].action() }
  }

  // Precompute which rows start a new category (top level, unfiltered only) so
  // we render a header once per consecutive run without mutating during render.
  const showCatAt: boolean[] = []
  {
    let last: PaletteCategory | undefined
    for (const item of items) {
      const show = !inSubLevel && !query && item.kind === "command" && !!item.category && item.category !== last
      if (item.kind === "command") last = item.category
      showCatAt.push(show)
    }
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        {inSubLevel && parent && (
          <div className="palette-breadcrumb">
            <button type="button" className="palette-crumb-back" onMouseDown={(e) => { e.preventDefault(); back() }}>
              ← {t.palette.back}
            </button>
            <span className="palette-crumb-sep">/</span>
            <span className="palette-crumb-here">{parent.label}</span>
          </div>
        )}
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={inSubLevel && parent ? parent.label : t.palette.placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
          onKeyDown={handleKey}
        />
        <div className="palette-list">
          {items.length === 0 && (
            <div className="palette-empty">{t.palette.noResults}</div>
          )}
          {items.map((item, i) => {
            const showCat = showCatAt[i]
            return (
              <div key={i} className="palette-row">
                {showCat && item.category && <div className="palette-cat">{t.palette.categories[item.category]}</div>}
                <button
                  className={`palette-item ${i === clampedSelected ? "palette-item-selected" : ""}`}
                  onMouseEnter={() => setSelected(i)}
                  onMouseDown={() => item.action()}
                >
                  <span className={`palette-kind ${item.kind === "file" ? "palette-kind-file" : item.kind === "recent" ? "palette-kind-recent" : item.kind === "back" ? "palette-kind-back" : "palette-kind-cmd"}`}>
                    {item.icon ?? (item.kind === "file" ? "M" : item.kind === "recent" ? "⏱" : item.kind === "back" ? "←" : "⌘")}
                  </span>
                  <span className="palette-label">{item.label}</span>
                  {item.description && item.kind !== "command" && (
                    <span className="palette-desc">{item.description}</span>
                  )}
                  {item.hasChildren && <span className="palette-chevron">▸</span>}
                  {item.shortcut && !item.hasChildren && (
                    <span className="cmd-shortcut">{item.shortcut}</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
