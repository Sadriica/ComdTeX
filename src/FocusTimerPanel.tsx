import { useEffect, useRef, useState } from "react"
import { useT } from "./i18n"
import { showToast } from "./toastService"
import {
  type Phase,
  type PomodoroConfig,
  type PomodoroState,
  type WritingSession,
  createState,
  tick,
  start,
  pause,
  reset,
  formatClock,
  startSession,
  sessionStats,
} from "./pomodoro"

// Same word-count rule the StatusBar uses for the live document count, so the
// session word-delta is measured on the same scale (plain prose, code/math
// stripped out).
function wordCount(text: string): number {
  const stripped = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]+?\$/g, "")
  return stripped.trim() ? stripped.trim().split(/\s+/).length : 0
}

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
  /** Active document text — drives the live writing-session word delta. */
  content: string
  /** Pomodoro durations (minutes) from Settings. */
  config: PomodoroConfig
  /** Daily word goal from Settings (0 = no goal). */
  wordGoal: number
  /** Persist an edited duration back to Settings. */
  onConfigChange: (patch: Partial<PomodoroConfig>) => void
}

export default function FocusTimerPanel({ content, config, wordGoal, onConfigChange }: FocusTimerPanelProps) {
  const t = useT()

  const [timer, setTimer] = useState<PomodoroState>(() => createState(config))
  const [showSettings, setShowSettings] = useState(false)
  const [session, setSession] = useState<WritingSession | null>(null)
  // Re-render once per second while a session is open so elapsed/wpm stay live.
  const [now, setNow] = useState(() => Date.now())

  // Latest content/config for the interval closure without re-arming the timer.
  const contentRef = useRef(content)
  contentRef.current = content
  const configRef = useRef(config)
  configRef.current = config
  // Timestamp of the previous tick, so the timer advances by REAL elapsed time
  // rather than a fixed 1s. Browsers throttle background timers, so a fixed
  // decrement under-counts and drifts away from the Date.now()-based session
  // stats; measuring the wall-clock delta keeps both in agreement.
  const lastTickRef = useRef(Date.now())

  const phaseLabel = (phase: Phase): string =>
    phase === "work" ? t.focusTimer.phaseWork
      : phase === "break" ? t.focusTimer.phaseBreak
      : t.focusTimer.phaseLongBreak

  // Single interval: ticks the running timer and refreshes the session clock.
  useEffect(() => {
    const id = setInterval(() => {
      const ts = Date.now()
      setNow(ts)
      // Advance by the measured wall-clock seconds since the last tick (≥1),
      // so a backgrounded/throttled tab catches up instead of losing time.
      const elapsedSec = Math.max(1, Math.round((ts - lastTickRef.current) / 1000))
      lastTickRef.current = ts
      setTimer((prev) => {
        const { state, phaseCompleted } = tick(prev, elapsedSec, configRef.current)
        if (phaseCompleted) {
          // The phase that just finished is the one we were *in* before the tick.
          showToast(t.focusTimer.phaseDone(phaseLabel(prev.phase)), "info")
        }
        return state
      })
    }, 1000)
    return () => clearInterval(id)
    // phaseLabel/t are stable enough for this lifecycle; arm once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When the user edits the durations (and the timer is idle), reflect the new
  // values on the clock immediately. A running timer is left alone until reset.
  useEffect(() => {
    setTimer((prev) => (prev.running ? prev : reset(config)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.workMin, config.breakMin, config.longBreakMin, config.cyclesBeforeLongBreak])

  const handleStart = () => {
    setTimer((prev) => start(prev))
    // Begin (or keep) a writing session anchored to the current word count.
    setSession((prev) => prev ?? startSession(Date.now(), wordCount(contentRef.current)))
  }

  const handlePause = () => setTimer((prev) => pause(prev))

  const handleReset = () => {
    setTimer(reset(config))
    setSession(null)
  }

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
            <button className="focus-timer-btn" onClick={handlePause}>{t.focusTimer.pause}</button>
          ) : (
            <button className="focus-timer-btn focus-timer-btn-primary" onClick={handleStart}>{t.focusTimer.start}</button>
          )}
          <button className="focus-timer-btn" onClick={handleReset}>{t.focusTimer.reset}</button>
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
            <Row label={t.focusTimer.elapsed} value={formatClock(stats.elapsedSec)} />
            <Row label={t.focusTimer.wpm} value={stats.wpm} />
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
