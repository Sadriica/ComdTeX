import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  MAX_DAYS,
  addToDay,
  dayKey,
  dayStats,
  loadHistory,
  parseHistory,
  recentTotals,
  saveHistory,
  serializeHistory,
  type StatsHistory,
} from "./writingStats"
import { STORAGE_KEYS } from "./storageKeys"

const delta = (words: number, activeSec = 0, pomodoros = 0) => ({ words, activeSec, pomodoros })

/** `n` consecutive dates starting at 2024-01-01 (UTC math, formatted by hand). */
function dates(n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2024, 0, 1 + i))
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

describe("dayKey", () => {
  it("formats local dates as zero-padded YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 2, 5, 23, 59).getTime())).toBe("2026-03-05")
    expect(dayKey(new Date(2026, 11, 31, 0, 0).getTime())).toBe("2026-12-31")
  })
})

describe("serialize / parse", () => {
  it("round-trips a history", () => {
    const h: StatsHistory = [
      { date: "2026-10-18", words: 120, activeSec: 600, pomodoros: 1 },
      { date: "2026-10-19", words: 40, activeSec: 90, pomodoros: 0 },
    ]
    expect(parseHistory(serializeHistory(h))).toEqual(h)
  })

  it("returns empty for null, empty, garbage and wrong shapes", () => {
    expect(parseHistory(null)).toEqual([])
    expect(parseHistory("")).toEqual([])
    expect(parseHistory("{not json")).toEqual([])
    expect(parseHistory("42")).toEqual([])
    expect(parseHistory("null")).toEqual([])
    expect(parseHistory(JSON.stringify([1, 2]))).toEqual([])
    expect(parseHistory(JSON.stringify({ v: 1, days: "x" }))).toEqual([])
  })

  it("rejects an unknown version", () => {
    const raw = JSON.stringify({
      v: 99,
      days: [{ date: "2026-01-01", words: 1, activeSec: 1, pomodoros: 1 }],
    })
    expect(parseHistory(raw)).toEqual([])
  })

  it("drops invalid entries but keeps the valid ones", () => {
    const raw = JSON.stringify({
      v: 1,
      days: [
        { date: "2026-01-01", words: 10, activeSec: 5, pomodoros: 0 },
        { date: "yesterday", words: 10, activeSec: 5, pomodoros: 0 },
        { date: "2026-01-02", words: -4, activeSec: 5, pomodoros: 0 },
        { date: "2026-01-03", words: "9", activeSec: 5, pomodoros: 0 },
        { date: "2026-01-04", words: Infinity, activeSec: 5, pomodoros: 0 },
        { date: "2026-01-05", words: 1 },
        null,
        "x",
        { date: "2026-01-06", words: 7.9, activeSec: 3, pomodoros: 2 },
      ],
    })
    expect(parseHistory(raw)).toEqual([
      { date: "2026-01-01", words: 10, activeSec: 5, pomodoros: 0 },
      { date: "2026-01-06", words: 7, activeSec: 3, pomodoros: 2 },
    ])
  })

  it("sorts by date and merges duplicate dates", () => {
    const raw = JSON.stringify({
      v: 1,
      days: [
        { date: "2026-02-02", words: 5, activeSec: 50, pomodoros: 1 },
        { date: "2026-02-01", words: 9, activeSec: 10, pomodoros: 0 },
        { date: "2026-02-02", words: 8, activeSec: 20, pomodoros: 0 },
      ],
    })
    expect(parseHistory(raw)).toEqual([
      { date: "2026-02-01", words: 9, activeSec: 10, pomodoros: 0 },
      { date: "2026-02-02", words: 8, activeSec: 50, pomodoros: 1 },
    ])
  })

  it("caps an oversized stored history to the newest days", () => {
    const all = dates(MAX_DAYS + 20)
    const raw = JSON.stringify({
      v: 1,
      days: all.map((date) => ({ date, words: 1, activeSec: 1, pomodoros: 0 })),
    })
    const parsed = parseHistory(raw)
    expect(parsed).toHaveLength(MAX_DAYS)
    expect(parsed[0].date).toBe(all[20])
    expect(parsed[parsed.length - 1].date).toBe(all[all.length - 1])
  })
})

describe("addToDay", () => {
  it("creates a day and accumulates into it", () => {
    let h = addToDay([], "2026-10-20", delta(50, 60, 0))
    h = addToDay(h, "2026-10-20", delta(25, 30, 1))
    expect(h).toEqual([{ date: "2026-10-20", words: 75, activeSec: 90, pomodoros: 1 }])
  })

  it("does not mutate its input", () => {
    const h: StatsHistory = [{ date: "2026-10-20", words: 1, activeSec: 1, pomodoros: 0 }]
    const copy = JSON.parse(JSON.stringify(h))
    addToDay(h, "2026-10-20", delta(5))
    addToDay(h, "2026-10-21", delta(5))
    expect(h).toEqual(copy)
  })

  it("returns the same reference for an empty or negative delta", () => {
    const h: StatsHistory = [{ date: "2026-10-20", words: 1, activeSec: 1, pomodoros: 0 }]
    expect(addToDay(h, "2026-10-20", delta(0))).toBe(h)
    expect(addToDay(h, "2026-10-20", delta(-5, -1, -1))).toBe(h)
  })

  it("keeps days ordered when a past date is credited", () => {
    let h = addToDay([], "2026-10-20", delta(1))
    h = addToDay(h, "2026-10-18", delta(2))
    expect(h.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-20"])
  })

  it("enforces the day cap, dropping the oldest", () => {
    const all = dates(MAX_DAYS)
    let h: StatsHistory = all.map((date) => ({ date, words: 1, activeSec: 0, pomodoros: 0 }))
    h = addToDay(h, "2030-01-01", delta(3))
    expect(h).toHaveLength(MAX_DAYS)
    expect(h[0].date).toBe(all[1])
    expect(h[h.length - 1]).toEqual({ date: "2030-01-01", words: 3, activeSec: 0, pomodoros: 0 })
  })
})

describe("day rollover", () => {
  it("restores today's totals and starts a new day at zero", () => {
    const h = addToDay([], "2026-10-20", delta(300, 1200, 2))
    expect(dayStats(h, "2026-10-20")).toEqual({
      date: "2026-10-20",
      words: 300,
      activeSec: 1200,
      pomodoros: 2,
    })
    expect(dayStats(h, "2026-10-21")).toEqual({
      date: "2026-10-21",
      words: 0,
      activeSec: 0,
      pomodoros: 0,
    })
  })

  it("crediting after midnight lands on the new day only", () => {
    let h = addToDay([], "2026-10-20", delta(100))
    h = addToDay(h, "2026-10-21", delta(40))
    expect(dayStats(h, "2026-10-20").words).toBe(100)
    expect(dayStats(h, "2026-10-21").words).toBe(40)
  })
})

describe("recentTotals", () => {
  const h: StatsHistory = [
    { date: "2026-10-10", words: 1000, activeSec: 100, pomodoros: 1 },
    { date: "2026-10-14", words: 10, activeSec: 1, pomodoros: 0 },
    { date: "2026-10-20", words: 20, activeSec: 2, pomodoros: 1 },
    { date: "2026-10-21", words: 500, activeSec: 50, pomodoros: 5 },
  ]

  it("sums the window ending at the date, inclusive on both ends", () => {
    expect(recentTotals(h, "2026-10-20", 7)).toEqual({
      date: "2026-10-20",
      words: 30,
      activeSec: 3,
      pomodoros: 1,
    })
    // 2026-10-14 is exactly 6 days before 2026-10-20, so it is inside a 7-day window.
    expect(recentTotals(h, "2026-10-20", 6).words).toBe(20)
  })

  it("is empty when nothing falls in the window", () => {
    expect(recentTotals([], "2026-10-20", 7).words).toBe(0)
  })
})

describe("localStorage persistence", () => {
  beforeEach(() => {
    // The suite runs in node; back localStorage with a small in-memory store.
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  })

  it("saves and loads", () => {
    const h = addToDay([], "2026-10-20", delta(12, 34, 1))
    saveHistory(h)
    expect(loadHistory()).toEqual(h)
  })

  it("loads empty when nothing is stored", () => {
    expect(loadHistory()).toEqual([])
  })

  it("falls back to empty on a corrupted blob", () => {
    localStorage.setItem(STORAGE_KEYS.WRITING_STATS, "<<corrupt>>")
    expect(loadHistory()).toEqual([])
  })
})
