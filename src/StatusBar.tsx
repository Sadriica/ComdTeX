import { useT } from "./i18n"

interface StatusBarProps {
  mode: "md" | "tex" | null
  line: number
  col: number
  content: string
  isDirty: boolean
  macroCount: number
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function charCount(text: string): number {
  return text.length
}

export default function StatusBar({ mode, line, col, content, isDirty, macroCount }: StatusBarProps) {
  const t = useT()
  return (
    <div className="status-bar">
      <span className="status-left">
        {isDirty && <span className="status-dirty">●</span>}
        {mode && <span className="status-mode">{mode === "tex" ? t.statusBar.modeTex : t.statusBar.modeMarkdown}</span>}
      </span>
      <span className="status-right">
        {macroCount > 0 && (
          <span className="status-item" title={t.statusBar.macrosLoaded}>{t.statusBar.macros(macroCount)}</span>
        )}
        <span className="status-item">{t.statusBar.words(wordCount(content))}</span>
        <span className="status-item">{t.statusBar.chars(charCount(content))}</span>
        <span className="status-item">{t.statusBar.ln} {line}, {t.statusBar.col} {col}</span>
      </span>
    </div>
  )
}
