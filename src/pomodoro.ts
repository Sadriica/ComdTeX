// Pure, dependency-free Pomodoro timer state machine + writing-session stats.
//
// NO React, NO Date.now() inside transition functions: callers pass `now`
// (epoch ms) so every transition is deterministic and unit-testable. The React
// panel (FocusTimerPanel.tsx) owns the ticking via setInterval and feeds the
// current time in.

export type Phase = "work" | "break" | "longBreak"

/** Configurable durations (in minutes) + the long-break cadence. */
export interface PomodoroConfig {
  workMin: number
  breakMin: number
  longBreakMin: number
  /** A long break replaces the short break after this many completed work phases. */
  cyclesBeforeLongBreak: number
}

export interface PomodoroState {
  phase: Phase
  /** Whole seconds left in the current phase. */
  remainingSec: number
  /** Whether the timer is actively counting down. */
  running: boolean
  /** Completed work phases since the timer was created/reset. */
  completedWork: number
}

/** Duration of a phase, in seconds, for the given config. */
export function phaseDurationSec(phase: Phase, config: PomodoroConfig): number {
  switch (phase) {
    case "work":      return config.workMin * 60
    case "break":     return config.breakMin * 60
    case "longBreak": return config.longBreakMin * 60
  }
}

/** A fresh, paused timer sitting at the start of a work phase. */
export function createState(config: PomodoroConfig): PomodoroState {
  return {
    phase: "work",
    remainingSec: phaseDurationSec("work", config),
    running: false,
    completedWork: 0,
  }
}

/** Decide the phase that follows the one that just finished. */
export function nextPhase(state: PomodoroState, config: PomodoroConfig): Phase {
  if (state.phase === "work") {
    // The work phase we just finished is the (completedWork + 1)-th one.
    const completed = state.completedWork + 1
    return completed % config.cyclesBeforeLongBreak === 0 ? "longBreak" : "break"
  }
  // Any break (short or long) returns to work.
  return "work"
}

/**
 * Advance the timer to the phase that follows the current one. Returns the new
 * state. `completedWork` only increments when a *work* phase ends. The new
 * phase starts paused — callers decide whether to auto-start it.
 */
export function advancePhase(state: PomodoroState, config: PomodoroConfig): PomodoroState {
  const phase = nextPhase(state, config)
  const completedWork = state.phase === "work" ? state.completedWork + 1 : state.completedWork
  return {
    phase,
    remainingSec: phaseDurationSec(phase, config),
    running: false,
    completedWork,
  }
}

/** Result of a tick: the new state plus whether the current phase just completed. */
export interface TickResult {
  state: PomodoroState
  /** True on the tick that drains the current phase to zero. */
  phaseCompleted: boolean
}

/**
 * Advance the timer by `elapsedSec` whole seconds. When the phase drains to
 * zero it transitions to the next phase (paused) and flags `phaseCompleted` so
 * the UI can fire a toast/notification.
 *
 * A paused timer never advances.
 */
export function tick(state: PomodoroState, elapsedSec: number, config: PomodoroConfig): TickResult {
  if (!state.running || elapsedSec <= 0) {
    return { state, phaseCompleted: false }
  }
  const remaining = state.remainingSec - elapsedSec
  if (remaining > 0) {
    return { state: { ...state, remainingSec: remaining }, phaseCompleted: false }
  }
  // Phase finished — move to the next one (paused).
  return { state: advancePhase(state, config), phaseCompleted: true }
}

export function start(state: PomodoroState): PomodoroState {
  return { ...state, running: true }
}

export function pause(state: PomodoroState): PomodoroState {
  return { ...state, running: false }
}

/** Reset back to a fresh paused work phase, clearing the cycle count. */
export function reset(config: PomodoroConfig): PomodoroState {
  return createState(config)
}

/** mm:ss formatting for the remaining-seconds display. */
export function formatClock(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

// ── Writing-session stats ────────────────────────────────────────────────────

export interface WritingSession {
  /** Epoch ms when the session began. */
  startedAt: number
  /** Word count captured when the session began. */
  baselineWords: number
}

export interface SessionStats {
  /** Net words written since the session began (can be negative on deletes). */
  wordsWritten: number
  /** Whole seconds elapsed since the session began. */
  elapsedSec: number
  /** Words per minute over the elapsed time (0 until at least one second). */
  wpm: number
}

/** Begin a writing session at `now` with the current document word count. */
export function startSession(now: number, currentWords: number): WritingSession {
  return { startedAt: now, baselineWords: currentWords }
}

/**
 * Compute live stats for a session given the current time and word count.
 * `wpm` is rounded; it is 0 until at least one full second has elapsed to avoid
 * a divide-by-tiny spike at the very start of a session.
 */
export function sessionStats(session: WritingSession, now: number, currentWords: number): SessionStats {
  const wordsWritten = currentWords - session.baselineWords
  const elapsedSec = Math.max(0, Math.floor((now - session.startedAt) / 1000))
  const wpm = elapsedSec >= 1 ? Math.round((wordsWritten / elapsedSec) * 60) : 0
  return { wordsWritten, elapsedSec, wpm }
}
