import { useState } from "react"
import { useT } from "./i18n"
import {
  type Phase,
  type PomodoroConfig,
  formatClock,
  sessionStats,
} from "./pomodoro"
import { type FocusTimer, wordCount } from "./useFocusTimer"

const Row = ({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) => (
  <div className={`stats-row${accent ? " stats-accent" : ""}`}>
    <span className="stats-label">{label}</span>
    <span className="stats-value">{value}</span>
  </div>
)

// Editable number row for a Pomodoro duration (clamped to 1–180).
const DurRow = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <label className="stats-row focus-timer-dur-row">
    <span className="stats-label">{label}</span>
    <input
      type="number"
      min={1}
      max={180}
      className="focus-timer-dur-input"
      value={value}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10)
        if (!Number.isNaN(n) && n >= 1 && n <= 180) onChange(n)
      }}
    />
  </label>
)

interface FocusTimerPanelProps {
  /** Active document text: drives the live writing-session word delta. */
  content: string
  /** Pomodoro durations (minutes) from Settings. */
  config: PomodoroConfig
  /** Daily word goal from Settings (0 = no goal). */
  wordGoal: number
  /** Persist an edited duration back to Settings. */
  onConfigChange: (patch: Partial<PomodoroConfig>) => void
  /** Timer/session state, owned by AppContent so it survives this panel
   *  unmounting and keeps ticking in the background (see useFocusTimer). */
  focusTimer: FocusTimer
}

export default function FocusTimerPanel({ content, config, wordGoal, onConfigChange, focusTimer }: FocusTimerPanelProps) {
  const t = useT()
  const { timer, session, now, startTimer, pauseTimer, resetTimer } = focusTimer
  const [showSettings, setShowSettings] = useState(false)

  const phaseLabel = (phase: Phase): string =>
    phase === "work" ? t.focusTimer.phaseWork
      : phase === "break" ? t.focusTimer.phaseBreak
        : t.focusTimer.phaseLongBreak

  const stats = session ? sessionStats(session, now, wordCount(content)) : null
  const goalWords = stats ? stats.wordsWritten : 0
  const goalPct = wordGoal > 0 ? Math.min(100, Math.round((Math.max(0, goalWords) / wordGoal) * 100)) : 0

  return (
    <div className="stats-panel focus-timer-panel">
      <div className="stats-section focus-timer-clock-section">
        <div className="focus-timer-phase">{phaseLabel(timer.phase)}</div>
        <div className="focus-timer-clock">{formatClock(timer.remainingSec)}</div>
        <div className="focus-timer-controls">
          {timer.running ? (
            <button className="focus-timer-btn" onClick={pauseTimer}>{t.focusTimer.pause}</button>
          ) : (
            <button className="focus-timer-btn focus-timer-btn-primary" onClick={startTimer}>{t.focusTimer.start}</button>
          )}
          <button className="focus-timer-btn" onClick={resetTimer}>{t.focusTimer.reset}</button>
        </div>
        <Row label={t.focusTimer.cycles} value={timer.completedWork} />
        <button
          className="focus-timer-settings-toggle"
          onClick={() => setShowSettings((s) => !s)}
          aria-expanded={showSettings}
        >
          {t.focusTimer.durations} {showSettings ? "▾" : "▸"}
        </button>
        {showSettings && (
          <div className="focus-timer-durations">
            <DurRow label={t.focusTimer.workMin} value={config.workMin} onChange={(v) => onConfigChange({ workMin: v })} />
            <DurRow label={t.focusTimer.breakMin} value={config.breakMin} onChange={(v) => onConfigChange({ breakMin: v })} />
            <DurRow label={t.focusTimer.longBreakMin} value={config.longBreakMin} onChange={(v) => onConfigChange({ longBreakMin: v })} />
            <DurRow label={t.focusTimer.cyclesLabel} value={config.cyclesBeforeLongBreak} onChange={(v) => onConfigChange({ cyclesBeforeLongBreak: v })} />
          </div>
        )}
      </div>

      <div className="stats-section">
        <div className="stats-section-title">{t.focusTimer.session}</div>
        {stats ? (
          <>
            <Row label={t.focusTimer.wordsThisSession} value={stats.wordsWritten} accent />
            {/* Peak only earns a row once it differs; otherwise it is noise. */}
            {stats.peakWordsWritten > stats.wordsWritten && (
              <Row label={t.focusTimer.peakWords} value={stats.peakWordsWritten} />
            )}
            <Row label={t.focusTimer.elapsed} value={formatClock(stats.elapsedSec)} />
            <Row label={t.focusTimer.activeTime} value={formatClock(stats.activeSec)} />
            {stats.pausedSec > 0 && (
              <Row label={t.focusTimer.pausedTime} value={formatClock(stats.pausedSec)} />
            )}
            <Row label={t.focusTimer.wpm} value={stats.wpm} />
            <Row label={t.focusTimer.activeWpm} value={stats.activeWpm} />
            <Row label={t.focusTimer.pomodorosDone} value={stats.pomodorosCompleted} />
            {stats.pomodorosCompleted > 0 && (
              <Row label={t.focusTimer.wordsPerPomodoro} value={stats.wordsPerPomodoro} />
            )}
            <Row label={t.focusTimer.filesTouched} value={stats.filesTouched} />
          </>
        ) : (
          <Row label={t.focusTimer.wordsThisSession} value="—" />
        )}
        {wordGoal > 0 && (
          <div className="stats-row status-goal" title={`${Math.max(0, goalWords)}/${wordGoal}`}>
            <span className="stats-label">{t.focusTimer.goalProgress}</span>
            <span className="status-goal-bar">
              <span
                className={`status-goal-fill${goalWords >= wordGoal ? " completed" : ""}`}
                style={{ width: `${goalPct}%` }}
              />
            </span>
            <span className="stats-value">{Math.max(0, goalWords)}/{wordGoal}</span>
          </div>
        )}
      </div>
    </div>
  )
}
