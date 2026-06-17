import { describe, it, expect } from "vitest"
import {
  type PomodoroConfig,
  createState,
  nextPhase,
  advancePhase,
  tick,
  start,
  pause,
  reset,
  phaseDurationSec,
  formatClock,
  startSession,
  sessionStats,
} from "./pomodoro"

const CONFIG: PomodoroConfig = {
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLongBreak: 4,
}

describe("createState", () => {
  it("starts paused at the beginning of a work phase", () => {
    const s = createState(CONFIG)
    expect(s.phase).toBe("work")
    expect(s.running).toBe(false)
    expect(s.completedWork).toBe(0)
    expect(s.remainingSec).toBe(25 * 60)
  })
})

describe("phaseDurationSec", () => {
  it("converts configured minutes to seconds per phase", () => {
    expect(phaseDurationSec("work", CONFIG)).toBe(1500)
    expect(phaseDurationSec("break", CONFIG)).toBe(300)
    expect(phaseDurationSec("longBreak", CONFIG)).toBe(900)
  })
})

describe("nextPhase", () => {
  it("work → break before the long-break cadence", () => {
    const s = createState(CONFIG) // completedWork 0 → next is the 1st
    expect(nextPhase(s, CONFIG)).toBe("break")
  })

  it("work → longBreak on the Nth completed cycle", () => {
    const s = { ...createState(CONFIG), completedWork: 3 } // next is the 4th
    expect(nextPhase(s, CONFIG)).toBe("longBreak")
  })

  it("break → work", () => {
    const s = { ...createState(CONFIG), phase: "break" as const }
    expect(nextPhase(s, CONFIG)).toBe("work")
  })

  it("longBreak → work", () => {
    const s = { ...createState(CONFIG), phase: "longBreak" as const }
    expect(nextPhase(s, CONFIG)).toBe("work")
  })
})

describe("advancePhase", () => {
  it("increments completedWork only when leaving work", () => {
    const afterWork = advancePhase(createState(CONFIG), CONFIG)
    expect(afterWork.phase).toBe("break")
    expect(afterWork.completedWork).toBe(1)
    expect(afterWork.running).toBe(false)
    expect(afterWork.remainingSec).toBe(300)

    const afterBreak = advancePhase(afterWork, CONFIG)
    expect(afterBreak.phase).toBe("work")
    expect(afterBreak.completedWork).toBe(1) // unchanged when leaving a break
    expect(afterBreak.remainingSec).toBe(1500)
  })
})

describe("tick", () => {
  it("does nothing while paused", () => {
    const s = createState(CONFIG)
    const r = tick(s, 10, CONFIG)
    expect(r.state).toBe(s)
    expect(r.phaseCompleted).toBe(false)
  })

  it("counts down a running phase", () => {
    const s = start(createState(CONFIG))
    const r = tick(s, 30, CONFIG)
    expect(r.state.remainingSec).toBe(1500 - 30)
    expect(r.state.running).toBe(true)
    expect(r.phaseCompleted).toBe(false)
  })

  it("flags completion and transitions when the phase drains to zero", () => {
    const s = { ...start(createState(CONFIG)), remainingSec: 5 }
    const r = tick(s, 5, CONFIG)
    expect(r.phaseCompleted).toBe(true)
    expect(r.state.phase).toBe("break")
    expect(r.state.running).toBe(false)
    expect(r.state.completedWork).toBe(1)
  })

  it("transitions even when elapsed overshoots the remaining time", () => {
    const s = { ...start(createState(CONFIG)), remainingSec: 3 }
    const r = tick(s, 100, CONFIG)
    expect(r.phaseCompleted).toBe(true)
    expect(r.state.phase).toBe("break")
  })
})

describe("work → break → work cycling and long break", () => {
  it("drives a full four-cycle run into a long break", () => {
    // Run work phases to completion one at a time, ticking each phase down.
    let s = start(createState(CONFIG))

    const completePhase = () => {
      const r = tick(s, s.remainingSec, CONFIG)
      s = r.state
      return r.phaseCompleted
    }

    // Cycle 1: work → break → work
    expect(completePhase()).toBe(true)
    expect(s.phase).toBe("break")
    expect(s.completedWork).toBe(1)
    s = start(s)
    expect(completePhase()).toBe(true)
    expect(s.phase).toBe("work")

    // Cycle 2
    s = start(s)
    completePhase()
    expect(s.completedWork).toBe(2)
    expect(s.phase).toBe("break")
    s = start(s); completePhase()

    // Cycle 3
    s = start(s)
    completePhase()
    expect(s.completedWork).toBe(3)
    expect(s.phase).toBe("break")
    s = start(s); completePhase()

    // Cycle 4 — fourth completed work phase yields a LONG break.
    s = start(s)
    completePhase()
    expect(s.completedWork).toBe(4)
    expect(s.phase).toBe("longBreak")
    expect(s.remainingSec).toBe(900)
  })
})

describe("start / pause / reset", () => {
  it("toggles running and reset clears progress", () => {
    let s = start(createState(CONFIG))
    expect(s.running).toBe(true)
    s = pause(s)
    expect(s.running).toBe(false)
    s = { ...start(createState(CONFIG)), completedWork: 2, remainingSec: 10 }
    const fresh = reset(CONFIG)
    expect(fresh.completedWork).toBe(0)
    expect(fresh.running).toBe(false)
    expect(fresh.phase).toBe("work")
    expect(fresh.remainingSec).toBe(1500)
  })
})

describe("formatClock", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatClock(0)).toBe("00:00")
    expect(formatClock(5)).toBe("00:05")
    expect(formatClock(65)).toBe("01:05")
    expect(formatClock(1500)).toBe("25:00")
  })

  it("clamps negatives to zero", () => {
    expect(formatClock(-10)).toBe("00:00")
  })
})

describe("writing-session stats", () => {
  const t0 = 1_000_000_000_000 // arbitrary fixed epoch ms

  it("computes words written as current minus baseline", () => {
    const sess = startSession(t0, 100)
    const stats = sessionStats(sess, t0 + 60_000, 160)
    expect(stats.wordsWritten).toBe(60)
    expect(stats.elapsedSec).toBe(60)
    expect(stats.wpm).toBe(60)
  })

  it("computes wpm over the elapsed minutes", () => {
    const sess = startSession(t0, 0)
    // 200 words in 5 minutes → 40 wpm
    const stats = sessionStats(sess, t0 + 5 * 60_000, 200)
    expect(stats.wpm).toBe(40)
  })

  it("reports zero wpm before a full second has elapsed", () => {
    const sess = startSession(t0, 50)
    const stats = sessionStats(sess, t0 + 500, 80)
    expect(stats.elapsedSec).toBe(0)
    expect(stats.wpm).toBe(0)
    expect(stats.wordsWritten).toBe(30)
  })

  it("handles deletions as negative words written", () => {
    const sess = startSession(t0, 100)
    const stats = sessionStats(sess, t0 + 60_000, 80)
    expect(stats.wordsWritten).toBe(-20)
    expect(stats.wpm).toBe(-20)
  })
})
