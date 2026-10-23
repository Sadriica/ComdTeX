import { useState, type CSSProperties } from "react"
import { useT } from "./i18n"
import { ChevronDown, ChevronRight, Icon } from "./icons"
import {
  type Phase,
  type PomodoroConfig,
  formatClock,
  phaseDurationSec,
  sessionStats,
} from "./pomodoro"
import { dayKey, dayStats, recentTotals } from "./writingStats"
import { type FocusTimer, wordCount } from "./useFocusTimer"

const Row = ({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) => (
  <div className={`ft-row${accent ? " ft-accent" : ""}`}>
    <span className="ft-label">{label}</span>
    <span className="ft-value">{value}</span>
  </div>
)

// Small stat tile: a value over its label.
const Tile = ({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) => (
  <div className={`ft-tile${accent ? " ft-accent" : ""}`}>
    <span className="ft-tile-value">{value}</span>
    <span className="ft-tile-label">{label}</span>
  </div>
)

// Editable number row for a Pomodoro duration (clamped to 1–180).
const DurRow = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) => (
  <label className="ft-row focus-timer-dur-row">
    <span className="ft-label">{label}</span>
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

export default function FocusTimerPanel({
  content,
  config,
  wordGoal,
  onConfigChange,
  focusTimer,
}: FocusTimerPanelProps) {
  const t = useT()
  const { timer, session, now, history, startTimer, pauseTimer, resetTimer } = focusTimer
  const [showSettings, setShowSettings] = useState(false)

  const phaseLabel = (phase: Phase): string =>
    phase === "work"
      ? t.focusTimer.phaseWork
      : phase === "break"
        ? t.focusTimer.phaseBreak
        : t.focusTimer.phaseLongBreak

  const stats = session ? sessionStats(session, now, wordCount(content)) : null
  // Daily goal tracks today's persisted total, so it survives an app restart.
  const today = dayKey(now)
  const todayTotals = dayStats(history, today)
  const weekTotals = recentTotals(history, today, 7)
  const goalWords = todayTotals.words
  // Progress through the current phase, for the ring around the clock.
  const phaseTotal = phaseDurationSec(timer.phase, config)
  const phasePct =
    phaseTotal > 0
      ? Math.min(100, Math.max(0, Math.round((1 - timer.remainingSec / phaseTotal) * 100)))
      : 0
  const goalPct =
    wordGoal > 0 ? Math.min(100, Math.round((Math.max(0, goalWords) / wordGoal) * 100)) : 0

  return (
    <div className="ft-panel focus-timer-panel">
      <div className="ft-section focus-timer-clock-section">
        <div
          className="focus-timer-ring"
          role="progressbar"
          aria-label={phaseLabel(timer.phase)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={phasePct}
          style={{ "--ft-progress": phasePct } as CSSProperties}
        >
          <div className="focus-timer-ring-inner">
            <div className="focus-timer-phase">{phaseLabel(timer.phase)}</div>
            <div className="focus-timer-clock">{formatClock(timer.remainingSec)}</div>
          </div>
        </div>
        <div className="focus-timer-controls">
          {timer.running ? (
            <button className="focus-timer-btn" onClick={pauseTimer}>
              {t.focusTimer.pause}
            </button>
          ) : (
            <button className="focus-timer-btn focus-timer-btn-primary" onClick={startTimer}>
              {t.focusTimer.start}
            </button>
          )}
          <button className="focus-timer-btn" onClick={resetTimer}>
            {t.focusTimer.reset}
          </button>
        </div>
        <Row label={t.focusTimer.cycles} value={timer.completedWork} />
        <button
          className="focus-timer-settings-toggle"
          onClick={() => setShowSettings((s) => !s)}
          aria-expanded={showSettings}
        >
          {t.focusTimer.durations}{" "}
          <Icon icon={showSettings ? ChevronDown : ChevronRight} size={14} />
        </button>
        {showSettings && (
          <div className="focus-timer-durations">
            <DurRow
              label={t.focusTimer.workMin}
              value={config.workMin}
              onChange={(v) => onConfigChange({ workMin: v })}
            />
            <DurRow
              label={t.focusTimer.breakMin}
              value={config.breakMin}
              onChange={(v) => onConfigChange({ breakMin: v })}
            />
            <DurRow
              label={t.focusTimer.longBreakMin}
              value={config.longBreakMin}
              onChange={(v) => onConfigChange({ longBreakMin: v })}
            />
            <DurRow
              label={t.focusTimer.cyclesLabel}
              value={config.cyclesBeforeLongBreak}
              onChange={(v) => onConfigChange({ cyclesBeforeLongBreak: v })}
            />
          </div>
        )}
      </div>

      <div className="ft-section">
        <div className="ft-section-title">{t.focusTimer.session}</div>
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
        <div className="ft-section-title">{t.focusTimer.today}</div>
        <div className="ft-tiles">
          <Tile label={t.focusTimer.wordsToday} value={todayTotals.words} accent />
          <Tile label={t.focusTimer.activeToday} value={formatClock(todayTotals.activeSec)} />
          <Tile label={t.focusTimer.pomodorosToday} value={todayTotals.pomodoros} />
          <Tile label={t.focusTimer.wordsLast7Days} value={weekTotals.words} />
        </div>
        {wordGoal > 0 && (
          <div className="ft-row ft-goal" title={`${Math.max(0, goalWords)}/${wordGoal}`}>
            <span className="ft-label">{t.focusTimer.goalProgress}</span>
            <span className="ft-goal-bar">
              <span
                className={`ft-goal-fill${goalWords >= wordGoal ? " completed" : ""}`}
                style={{ width: `${goalPct}%` }}
              />
            </span>
            <span className="ft-value">
              {Math.max(0, goalWords)}/{wordGoal}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
