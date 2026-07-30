import { useEffect, useMemo, useRef, useState } from "react"
import type * as monaco from "monaco-editor"
import { useT } from "./i18n"
import PanelSearch, { matchesQuery } from "./PanelSearch"
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
  /** Move the section whose heading is at `fromLine` to before the heading at `toLine`. */
  onReorder?: (fromLine: number, toLine: number) => void
}

export default function OutlinePanel({ content, editorRef, activeLine, onReorder }: OutlinePanelProps) {
  const t = useT()
  const headings = useMemo(() => parseHeadings(content), [content])
  const [query, setQuery] = useState("")
  // Keep each heading's ORIGINAL index: it is the reorder key, so filtering with
  // renumbered indices would move the wrong section.
  const visible = useMemo(
    () => headings
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => matchesQuery(h.text, query)),
    [headings, query],
  )
  const sectionCounts = useMemo(() => computeSectionWordCounts(content), [content])
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Drag-to-reorder state: index of the dragged item and the current drop target.
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  // Guards click-after-drag so reordering does not also trigger navigation.
  const didDragRef = useRef(false)

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
  // Dragging a filtered list would reorder against rows the user cannot see.
  const canReorder = !!onReorder && !query.trim()

  return (
    <div className="outline-panel">
      <PanelSearch
        value={query}
        onChange={setQuery}
        placeholder={t.outline.filterPlaceholder}
        resultCount={{ shown: visible.length, total: headings.length }}
      />
      {visible.map(({ h, i }) => {
        const count = sectionCounts.get(h.line)
        const isDragging = dragIdx === i
        const isDropTarget = dropIdx === i && dragIdx !== i && dragIdx !== null
        return (
          <button
            key={i}
            ref={(el) => { itemRefs.current[i] = el }}
            className={
              "outline-item" +
              (i === activeIdx ? " outline-item-active" : "") +
              (isDragging ? " outline-dragging" : "") +
              (isDropTarget ? " outline-drop-before" : "")
            }
            style={{ paddingLeft: 8 + (h.level - 1) * 14 }}
            draggable={canReorder}
            onClick={() => {
              if (didDragRef.current) { didDragRef.current = false; return }
              jump(h.line)
            }}
            onDragStart={(e) => {
              if (!canReorder) return
              didDragRef.current = true
              setDragIdx(i)
              e.dataTransfer.effectAllowed = "move"
              // Some browsers require data to be set for a drag to begin.
              try { e.dataTransfer.setData("text/plain", String(h.line)) } catch { /* noop */ }
            }}
            onDragOver={(e) => {
              if (!canReorder || dragIdx === null) return
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
              if (dropIdx !== i) setDropIdx(i)
            }}
            onDragLeave={() => {
              if (dropIdx === i) setDropIdx(null)
            }}
            onDrop={(e) => {
              if (!canReorder || dragIdx === null) return
              e.preventDefault()
              const from = headings[dragIdx]
              const to = headings[i]
              if (from && to && from.line !== to.line) onReorder!(from.line, to.line)
              setDragIdx(null)
              setDropIdx(null)
            }}
            onDragEnd={() => {
              setDragIdx(null)
              setDropIdx(null)
              // Clear the click guard shortly after, in case no click followed.
              setTimeout(() => { didDragRef.current = false }, 0)
            }}
            title={canReorder ? `${t.outline.lineTitle(h.line)} — ${t.outline.dragToReorder}` : t.outline.lineTitle(h.line)}
            aria-label={canReorder ? `${h.text} — ${t.outline.dragToReorder}` : h.text}
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
