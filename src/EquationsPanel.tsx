import { useMemo } from "react"
import type * as monaco from "monaco-editor"
import { useT } from "./i18n"
import { renderEmptyMessage } from "./emptyStateMessage"

interface Equation {
  number: number
  label: string | null
  preview: string
  line: number
}

function parseEquations(content: string): Equation[] {
  const eqs: Equation[] = []
  let n = 0
  const re = /\$\$([\s\S]+?)\$\$(?:\s*\{#([\w:.-]+)\})?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    n++
    const before = content.slice(0, m.index)
    const line = before.split("\n").length
    const preview = m[1].trim().replace(/\s+/g, " ").slice(0, 55)
    eqs.push({ number: n, label: m[2] ?? null, preview, line })
  }
  return eqs
}

interface EquationsPanelProps {
  content: string
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
}

export default function EquationsPanel({ content, editorRef }: EquationsPanelProps) {
  const t = useT()
  const equations = useMemo(() => parseEquations(content), [content])

  if (equations.length === 0) {
    return (
      <div className="panel-empty-rich">
        <div className="panel-empty-icon" aria-hidden="true">{t.emptyStates.equationsIcon}</div>
        <p className="panel-empty-message">{renderEmptyMessage(t.emptyStates.equationsMessage)}</p>
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

  return (
    <div className="eq-list-panel">
      <div className="panel-header">{t.equations.count(equations.length)}</div>
      {equations.map((eq) => (
        <button
          key={eq.number}
          className="eq-list-item"
          onClick={() => jump(eq.line)}
          title={`${t.equations.lineTitle(eq.line)}${eq.label ? ` — ${eq.label}` : ""}`}
        >
          <span className="eq-list-num">({eq.number})</span>
          {eq.label && <span className="eq-list-label">#{eq.label}</span>}
          <span className="eq-list-preview">{eq.preview}</span>
        </button>
      ))}
    </div>
  )
}
