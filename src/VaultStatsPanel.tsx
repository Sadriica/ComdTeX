import { useMemo, useState } from "react"
import type { OpenFile, FileNode } from "./types"
import { flatFiles } from "./wikilinks"
import { useT } from "./i18n"
import ContextMenu from "./ContextMenu"
import { showToast } from "./toastService"

interface BrokenLink {
  file: string
  path: string
  link: string
  line: number
}

interface Stats {
  fileCount: number
  openCount: number
  wordCount: number
  wikilinkCount: number
  brokenLinks: BrokenLink[]
  equationCount: number
  figureCount: number
  citationCount: number
  tagCount: number
}

function computeStats(tree: FileNode[], openTabs: OpenFile[], wikiNames: Set<string>): Stats {
  const allFiles = flatFiles(tree)
  let words = 0, wikilinks = 0, equations = 0, figures = 0, citations = 0
  const tags = new Set<string>()
  const brokenLinks: BrokenLink[] = []

  for (const tab of openTabs) {
    const text = tab.content
    // Word count (strip code blocks and math)
    const stripped = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\$\$[\s\S]*?\$\$/g, "")
      .replace(/\$[^$\n]+?\$/g, "")
    words += stripped.trim() ? stripped.trim().split(/\s+/).length : 0

    // Wikilinks — track per-line so we can jump to the broken link
    const wikiRe = /\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]/g
    const lines = text.split("\n")
    lines.forEach((lineText, idx) => {
      wikiRe.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = wikiRe.exec(lineText)) !== null) {
        wikilinks++
        const target = m[1].trim().toLowerCase()
        if (!wikiNames.has(target)) {
          brokenLinks.push({
            file: tab.name,
            path: tab.path,
            link: m[1].trim(),
            line: idx + 1,
          })
        }
      }
    })

    // Equations $$...$$
    const eqRe = /\$\$[\s\S]+?\$\$/g
    equations += (text.match(eqRe) ?? []).length

    // Figures ![...](...)
    const figRe = /!\[[^\]]*\]\([^)]*\)/g
    figures += (text.match(figRe) ?? []).length

    // Citations [@key]
    const citeRe = /\[@[\w:.-]+\]/g
    citations += (text.match(citeRe) ?? []).length

    // Tags from frontmatter + inline #tag
    const tagRe = /(?:^|\s)#([\w/-]+)/gm
    let tm: RegExpExecArray | null
    while ((tm = tagRe.exec(text)) !== null) tags.add(tm[1])
  }

  return {
    fileCount: allFiles.length,
    openCount: openTabs.length,
    wordCount: words,
    wikilinkCount: wikilinks,
    brokenLinks,
    equationCount: equations,
    figureCount: figures,
    citationCount: citations,
    tagCount: tags.size,
  }
}

const Row = ({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) => (
  <div className={`stats-row${accent ? " stats-accent" : ""}`}>
    <span className="stats-label">{label}</span>
    <span className="stats-value">{value}</span>
  </div>
)

interface VaultStatsPanelProps {
  tree: FileNode[]
  openTabs: OpenFile[]
  wikiNames: Set<string>
  onOpenFile?: (path: string, line?: number) => void
  onCreateNote?: (name: string) => Promise<void>
  onRemoveLink?: (path: string, line: number, link: string) => Promise<void>
}

export default function VaultStatsPanel({
  tree,
  openTabs,
  wikiNames,
  onOpenFile,
  onCreateNote,
  onRemoveLink,
}: VaultStatsPanelProps) {
  const t = useT()
  const stats = useMemo(
    () => computeStats(tree, openTabs, wikiNames),
    [tree, openTabs, wikiNames]
  )

  const [menuFor, setMenuFor] = useState<BrokenLink | null>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const openMenu = (b: BrokenLink, x: number, y: number) => {
    setMenuFor(b)
    setMenuPos({ x, y })
  }

  const handleOpen = (b: BrokenLink) => {
    if (onOpenFile) onOpenFile(b.path, b.line)
  }

  const handleCreateNote = async (b: BrokenLink) => {
    if (!onCreateNote) return
    try {
      await onCreateNote(b.link)
      showToast(t.brokenLinks.noteCreated(b.link), "success")
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error")
    }
  }

  const handleRemoveLink = async (b: BrokenLink) => {
    if (!onRemoveLink) return
    try {
      await onRemoveLink(b.path, b.line, b.link)
      showToast(t.brokenLinks.linkRemoved, "success")
    } catch (e) {
      showToast(t.brokenLinks.removeLinkError(e instanceof Error ? e.message : String(e)), "error")
    }
  }

  return (
    <div className="stats-panel">
      <div className="stats-section">
        <div className="stats-section-title">{t.stats.vault}</div>
        <Row label={t.stats.files}    value={stats.fileCount} />
        <Row label={t.stats.open}     value={stats.openCount} />
        <Row label={t.stats.words}    value={stats.wordCount.toLocaleString()} />
        <Row label={t.stats.tags}     value={stats.tagCount} />
      </div>
      <div className="stats-section">
        <div className="stats-section-title">{t.stats.content}</div>
        <Row label={t.stats.equations}  value={stats.equationCount} />
        <Row label={t.stats.figures}    value={stats.figureCount} />
        <Row label={t.stats.citations}  value={stats.citationCount} />
        <Row label={t.stats.wikilinks}  value={stats.wikilinkCount} />
      </div>
      {stats.brokenLinks.length > 0 && (
        <div className="stats-section stats-broken">
          <div className="stats-section-title stats-broken-title">
            ⚠ {t.stats.broken(stats.brokenLinks.length)}
          </div>
          {stats.brokenLinks.map((b, i) => (
            <div
              key={`${b.path}:${b.line}:${b.link}:${i}`}
              role="button"
              tabIndex={0}
              className="stats-broken-item"
              onClick={() => handleOpen(b)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  handleOpen(b)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(b, e.clientX, e.clientY)
              }}
            >
              <span className="stats-broken-link">[[{b.link}]]</span>
              <span className="stats-broken-file">{b.file}</span>
            </div>
          ))}
        </div>
      )}
      {menuFor && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuFor(null)}
          items={[
            {
              label: t.brokenLinks.createNote(menuFor.link),
              action: () => handleCreateNote(menuFor),
              disabled: !onCreateNote,
            },
            {
              label: t.brokenLinks.removeLink,
              action: () => handleRemoveLink(menuFor),
              danger: true,
              disabled: !onRemoveLink,
            },
            {
              label: t.brokenLinks.ignore,
              action: () => { /* close only */ },
            },
          ]}
        />
      )}
    </div>
  )
}
