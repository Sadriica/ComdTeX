import { useMemo } from "react"
import { useT } from "./i18n"
import { providerLabel, type CloudSyncInfo } from "./cloudSync"

interface StatusBarProps {
  mode: "md" | "tex" | "pdf" | "typ" | null
  line: number
  col: number
  content: string
  isDirty: boolean
  macroCount: number
  selectedWords?: number
  wordGoal?: number
  onGoToLine?: (line: number) => void
  /** "wasm" | "local": which TeX engine is preferred for PDF export. */
  texEngine?: "wasm" | "local"
  /** "compiling" briefly displaces the engine label while a build is running. */
  texEngineState?: "idle" | "initializing" | "compiling"
  /** Cloud-sync provider that owns the current vault, if any. */
  cloudSync?: CloudSyncInfo | null
  /** Click handler for the sync badge: typically opens the conflicts panel. */
  onCloudSyncClick?: () => void
  /** Number of unresolved conflict files; turns the badge into a warning. */
  cloudConflictCount?: number
  /** Reading speed used for the "~N min" estimate. Configurable in Settings. */
  readingWpm?: number
  /** Shows a cancellable-looking progress chip while the AI fills {{?}} gaps. */
  fillingGaps?: boolean
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function charCount(text: string): number {
  return text.length
}

export default function StatusBar({ mode, line, col, content, isDirty, macroCount, selectedWords, wordGoal, onGoToLine, texEngine, texEngineState, cloudSync, onCloudSyncClick, cloudConflictCount, readingWpm = 200, fillingGaps = false }: StatusBarProps) {
  const t = useT()
  // Memoized so the cursor moving (line/col change every keystroke) doesn't
  // re-run these O(n) document scans; they only recompute when `content` (the
  // debounced preview content) actually changes.
  const { wc, cc, readMin } = useMemo(() => {
    const w = wordCount(content)
    // Guard the divisor: a settings field the user can clear would otherwise
    // produce Infinity/NaN minutes.
    const wpm = readingWpm > 0 ? readingWpm : 200
    return { wc: w, cc: charCount(content), readMin: Math.max(1, Math.ceil(w / wpm)) }
  }, [content, readingWpm])
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
        {mode && <span className="status-mode">{mode === "tex" ? t.statusBar.modeTex : mode === "pdf" ? "PDF" : mode === "typ" ? "Typst" : t.statusBar.modeMarkdown}</span>}
        {showTexEngine && (
          <span
            className="status-item status-tex-engine"
            title={t.statusBar.texEngineTitle}
            data-state={texEngineState ?? "idle"}
          >
            {texEngineLabel}
          </span>
        )}
        {cloudSync && (() => {
          const label = providerLabel(cloudSync.provider)
          const hasConflicts = (cloudConflictCount ?? 0) > 0
          return (
            <button
              className="status-item status-cloud-sync"
              data-provider={cloudSync.provider}
              data-conflicts={hasConflicts ? "true" : "false"}
              title={t.cloudSync.statusBadgeTitle(label, cloudSync.rootPath)}
              onClick={onCloudSyncClick}
            >
              {hasConflicts ? "⚠ " : "☁ "}
              {t.cloudSync.statusBadge(label)}
              {hasConflicts && ` (${cloudConflictCount})`}
            </button>
          )
        })()}
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
        {fillingGaps && (
          <span className="status-item status-ai-busy" aria-live="polite">
            <span className="status-ai-spinner" aria-hidden="true">⟳</span> {t.aiGaps.working}
          </span>
        )}
        <span className="status-item status-readtime" title={t.statusBar.readingTimeTitle}>
          ~{readMin} min
        </span>
        <span className="status-item">{t.statusBar.chars(cc)}</span>
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
