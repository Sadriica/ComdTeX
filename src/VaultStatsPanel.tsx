import { useMemo } from "react"
import type { OpenFile, FileNode } from "./types"
import { flatFiles } from "./wikilinks"
import { useT } from "./i18n"

interface Stats {
  fileCount: number
  openCount: number
  wordCount: number
  wikilinkCount: number
  brokenLinks: { file: string; link: string }[]
  equationCount: number
  figureCount: number
  citationCount: number
  tagCount: number
}

function computeStats(tree: FileNode[], openTabs: OpenFile[], wikiNames: Set<string>): Stats {
  const allFiles = flatFiles(tree)
  let words = 0, wikilinks = 0, equations = 0, figures = 0, citations = 0
  const tags = new Set<string>()
  const brokenLinks: { file: string; link: string }[] = []

  for (const tab of openTabs) {
    const text = tab.content
    // Word count (strip code blocks and math)
    const stripped = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\$\$[\s\S]*?\$\$/g, "")
      .replace(/\$[^$\n]+?\$/g, "")
    words += stripped.trim() ? stripped.trim().split(/\s+/).length : 0

    // Wikilinks
    const wikiRe = /\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]/g
    let m: RegExpExecArray | null
    while ((m = wikiRe.exec(text)) !== null) {
      wikilinks++
      const target = m[1].trim().toLowerCase()
      if (!wikiNames.has(target)) {
        brokenLinks.push({ file: tab.name, link: m[1].trim() })
      }
    }

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
    while ((m = tagRe.exec(text)) !== null) tags.add(m[1])
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
}

export default function VaultStatsPanel({ tree, openTabs, wikiNames }: VaultStatsPanelProps) {
  const t = useT()
  const stats = useMemo(
    () => computeStats(tree, openTabs, wikiNames),
    [tree, openTabs, wikiNames]
  )

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
            <div key={i} className="stats-broken-item">
              <span className="stats-broken-link">[[{b.link}]]</span>
              <span className="stats-broken-file">{b.file}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
