import { useCallback, useEffect, useRef, useState } from "react"
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
  startSession,
} from "./pomodoro"

/**
 * Word-count rule shared with the StatusBar live count, so the writing-session
 * delta is measured on the same scale (plain prose; code/math stripped out).
 */
export function wordCount(text: string): number {
  const stripped = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]+?\$/g, "")
  return stripped.trim() ? stripped.trim().split(/\s+/).length : 0
}

export interface FocusTimer {
  timer: PomodoroState
  session: WritingSession | null
  /** `Date.now()` of the last tick — drives the live session stats clock. */
  now: number
  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
}

/**
 * Pomodoro + writing-session state, lifted out of `FocusTimerPanel` into
 * `AppContent` so the timer KEEPS RUNNING while the panel is closed. The panel
 * is rendered conditionally (`sidebarMode === "focusTimer"`); when it owned the
 * interval, switching to another panel (e.g. the AI assistant) unmounted it and
 * reset the timer. Here the clock ticks at the app level and the phase-completion
 * toast fires regardless of which panel is open.
 *
 * The interval is armed ONLY while the timer is running or a session is open, so
 * an idle timer costs nothing (no per-second re-render of AppContent).
 */
export function useFocusTimer(config: PomodoroConfig, content: string): FocusTimer {
  const t = useT()
  const [timer, setTimer] = useState<PomodoroState>(() => createState(config))
  const [session, setSession] = useState<WritingSession | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Latest content/config/t for the interval closure without re-arming on every
  // keystroke or language change. Updated in an effect (not during render) per
  // the project's "no ref writes during render" lint rule; the useRef args seed
  // the correct initial values, so the interval always reads current data.
  const contentRef = useRef(content)
  const configRef = useRef(config)
  const tRef = useRef(t)
  useEffect(() => {
    contentRef.current = content
    configRef.current = config
    tRef.current = t
  })
  // Wall-clock timestamp of the previous tick, so the timer advances by REAL
  // elapsed seconds (background tabs get throttled; a fixed 1s decrement drifts).
  // Initialised to 0 and stamped with Date.now() inside the effect when the
  // interval arms — never read before that, so the placeholder is never used.
  const lastTickRef = useRef(0)

  const phaseLabel = useCallback((phase: Phase): string =>
    phase === "work" ? tRef.current.focusTimer.phaseWork
      : phase === "break" ? tRef.current.focusTimer.phaseBreak
        : tRef.current.focusTimer.phaseLongBreak, [])

  // Tick the running timer + refresh the session clock. Armed only when there's
  // something live to advance.
  const active = timer.running || session !== null
  useEffect(() => {
    if (!active) return
    lastTickRef.current = Date.now()
    const id = setInterval(() => {
      const ts = Date.now()
      setNow(ts)
      const elapsedSec = Math.max(1, Math.round((ts - lastTickRef.current) / 1000))
      lastTickRef.current = ts
      setTimer((prev) => {
        const { state, phaseCompleted } = tick(prev, elapsedSec, configRef.current)
        if (phaseCompleted) {
          // The phase that just finished is the one we were *in* before the tick.
          showToast(tRef.current.focusTimer.phaseDone(phaseLabel(prev.phase)), "info")
        }
        return state
      })
    }, 1000)
    return () => clearInterval(id)
  }, [active, phaseLabel])

  // When the user edits durations (and the timer is idle), reflect them on the
  // clock immediately. A running timer is left alone until reset.
  useEffect(() => {
    setTimer((prev) => (prev.running ? prev : reset(configRef.current)))
  }, [config.workMin, config.breakMin, config.longBreakMin, config.cyclesBeforeLongBreak])

  const startTimer = useCallback(() => {
    setTimer((prev) => start(prev))
    // Begin (or keep) a writing session anchored to the current word count.
    setSession((prev) => prev ?? startSession(Date.now(), wordCount(contentRef.current)))
  }, [])

  const pauseTimer = useCallback(() => setTimer((prev) => pause(prev)), [])

  const resetTimer = useCallback(() => {
    setTimer(reset(configRef.current))
    setSession(null)
  }, [])

  return { timer, session, now, startTimer, pauseTimer, resetTimer }
}
