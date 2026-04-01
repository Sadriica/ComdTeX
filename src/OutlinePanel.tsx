import { useMemo } from "react"
import type * as monaco from "monaco-editor"
import { useT } from "./i18n"

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
}

export default function OutlinePanel({ content, editorRef }: OutlinePanelProps) {
  const t = useT()
  const headings = useMemo(() => parseHeadings(content), [content])

  if (headings.length === 0) {
    return <div className="tree-empty">{t.outline.noHeadings}</div>
  }

  const jump = (line: number) => {
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
    editor.focus()
  }

  return (
    <div className="outline-panel">
      {headings.map((h, i) => (
        <button
          key={i}
          className="outline-item"
          style={{ paddingLeft: 8 + (h.level - 1) * 14 }}
          onClick={() => jump(h.line)}
          title={t.outline.lineTitle(h.line)}
        >
          <span className="outline-level">H{h.level}</span>
          <span className="outline-text">{h.text}</span>
        </button>
      ))}
    </div>
  )
}
