import { useT } from "./i18n"

interface StatusBarProps {
  mode: "md" | "tex" | null
  line: number
  col: number
  content: string
  isDirty: boolean
  macroCount: number
  selectedWords?: number
  wordGoal?: number
  onGoToLine?: (line: number) => void
  /** "wasm" | "local" — which TeX engine is preferred for PDF export. */
  texEngine?: "wasm" | "local"
  /** "compiling" briefly displaces the engine label while a build is running. */
  texEngineState?: "idle" | "initializing" | "compiling"
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function charCount(text: string): number {
  return text.length
}

function readingMinutes(text: string): number {
  const wc = wordCount(text)
  return Math.max(1, Math.ceil(wc / 200))
}

export default function StatusBar({ mode, line, col, content, isDirty, macroCount, selectedWords, wordGoal, onGoToLine, texEngine, texEngineState }: StatusBarProps) {
  const t = useT()
  const wc = wordCount(content)
  const showTexEngine = texEngine !== undefined || (texEngineState && texEngineState !== "idle")
  const texEngineLabel =
    texEngineState && texEngineState !== "idle"
      ? t.statusBar.texEngineCompiling
      : texEngine === "wasm"
        ? t.statusBar.texEngineWasm
        : t.statusBar.texEngineLocal
  return (
    <div className="status-bar">
      <span className="status-left">
        {isDirty && <span className="status-dirty">●</span>}
        {mode && <span className="status-mode">{mode === "tex" ? t.statusBar.modeTex : t.statusBar.modeMarkdown}</span>}
        {showTexEngine && (
          <span
            className="status-item status-tex-engine"
            title={t.statusBar.texEngineTitle}
            data-state={texEngineState ?? "idle"}
          >
            {texEngineLabel}
          </span>
        )}
      </span>
      <span className="status-right">
        {macroCount > 0 && (
          <span className="status-item" title={t.statusBar.macrosLoaded}>{t.statusBar.macros(macroCount)}</span>
        )}
        {selectedWords != null && selectedWords > 0 ? (
          <span className="status-item status-selection" title={t.statusBar.selectionTitle}>
            {t.statusBar.selectedWords(selectedWords)}
          </span>
        ) : wordGoal && wordGoal > 0 ? (
          <span className="status-item status-goal" title={t.statusBar.wordGoalTitle(wc, wordGoal)}>
            <span className="status-goal-bar">
              <span
                className={`status-goal-fill${wc >= wordGoal ? " completed" : ""}`}
                style={{ width: `${Math.min(100, Math.round(wc / wordGoal * 100))}%` }}
              />
            </span>
            {wc}/{wordGoal}
          </span>
        ) : (
          <span className="status-item">{t.statusBar.words(wc)}</span>
        )}
        <span className="status-item status-readtime" title={t.statusBar.readingTimeTitle}>
          ~{readingMinutes(content)} min
        </span>
        <span className="status-item">{t.statusBar.chars(charCount(content))}</span>
        <button
          className="status-item status-position"
          onClick={() => onGoToLine?.(line)}
          title={t.statusBar.goToLineTitle}
        >
          {t.statusBar.ln} {line}, {t.statusBar.col} {col}
        </button>
      </span>
    </div>
  )
}
