import { useEffect, useMemo, useRef } from "react"
import type * as monaco from "monaco-editor"
import { useT } from "./i18n"
import { computeSectionWordCounts } from "./sectionWordCount"
import { renderEmptyMessage } from "./emptyStateMessage"

interface Heading {
  level: number
  text: string
  line: number
}

function parseHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  content.split("\n").forEach((line, i) => {
    const m = /^(#{1,6})\s+(.+)$/.exec(line)
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i + 1 })
  })
  return headings
}

interface OutlinePanelProps {
  content: string
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
  activeLine?: number
}

export default function OutlinePanel({ content, editorRef, activeLine }: OutlinePanelProps) {
  const t = useT()
  const headings = useMemo(() => parseHeadings(content), [content])
  const sectionCounts = useMemo(() => computeSectionWordCounts(content), [content])
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Active heading: last heading whose start line <= cursor line
  const activeIdx = activeLine != null
    ? headings.reduce((found, h, i) => h.line <= activeLine ? i : found, -1)
    : -1

  // Scroll active heading into view when it changes
  useEffect(() => {
    if (activeIdx >= 0) itemRefs.current[activeIdx]?.scrollIntoView({ block: "nearest" })
  }, [activeIdx])

  if (headings.length === 0) {
    return (
      <div className="panel-empty-rich">
        <div className="panel-empty-icon" aria-hidden="true">{t.emptyStates.outlineIcon}</div>
        <p className="panel-empty-message">{renderEmptyMessage(t.emptyStates.outlineMessage)}</p>
      </div>
    )
  }

  const jump = (line: number) => {
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
    editor.focus()
  }

  const totalWords = [...sectionCounts.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="outline-panel">
      {headings.map((h, i) => {
        const count = sectionCounts.get(h.line)
        return (
          <button
            key={i}
            ref={(el) => { itemRefs.current[i] = el }}
            className={`outline-item${i === activeIdx ? " outline-item-active" : ""}`}
            style={{ paddingLeft: 8 + (h.level - 1) * 14 }}
            onClick={() => jump(h.line)}
            title={t.outline.lineTitle(h.line)}
          >
            <span className="outline-level">H{h.level}</span>
            <span className="outline-text">{h.text}</span>
            {count !== undefined && count > 0 && (
              <span className="outline-word-count">{count}{t.outline.wordsAbbr}</span>
            )}
          </button>
        )
      })}
      {totalWords > 0 && (
        <div className="outline-total-words">
          {t.outline.totalWords}: {totalWords}
        </div>
      )}
    </div>
  )
}
