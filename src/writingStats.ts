// Persisted per-day writing statistics.
//
// The live writing session (pomodoro.ts) is in-memory only. This module keeps
// a bounded history of per-day aggregates in localStorage so today's totals
// survive an app restart and a new calendar day starts from zero.
//
// Pure helpers (parse, serialize, addToDay, ...) take plain values so they are
// unit-testable; only loadHistory/saveHistory touch localStorage, and both
// swallow storage errors (private mode, quota, blocked storage).

import { STORAGE_KEYS } from "./storageKeys"

/** Aggregate for one local calendar day. */
export interface DayStats {
  /** Local date as `YYYY-MM-DD`. */
  date: string
  /** Words written that day (peak-based, never negative). */
  words: number
  /** Seconds the focus timer was actually running. */
  activeSec: number
  /** Completed work phases. */
  pomodoros: number
}

/** Days ordered oldest to newest, at most MAX_DAYS entries, one per date. */
export type StatsHistory = DayStats[]

/** Increments to credit to a day. */
export interface DayDelta {
  words: number
  activeSec: number
  pomodoros: number
}

/** History cap: roughly one year of per-day aggregates. */
export const MAX_DAYS = 365

const STORAGE_VERSION = 1
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Local-time `YYYY-MM-DD` for an epoch-ms timestamp. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

function nonNegInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null
}

function parseDay(v: unknown): DayStats | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  if (typeof o.date !== "string" || !DATE_RE.test(o.date)) return null
  const words = nonNegInt(o.words)
  const activeSec = nonNegInt(o.activeSec)
  const pomodoros = nonNegInt(o.pomodoros)
  if (words === null || activeSec === null || pomodoros === null) return null
  return { date: o.date, words, activeSec, pomodoros }
}

/** Sort by date, merge duplicate dates (keeping the larger values), apply the cap. */
function normalize(days: DayStats[]): StatsHistory {
  const byDate = new Map<string, DayStats>()
  for (const d of days) {
    const prev = byDate.get(d.date)
    byDate.set(
      d.date,
      prev
        ? {
            date: d.date,
            words: Math.max(prev.words, d.words),
            activeSec: Math.max(prev.activeSec, d.activeSec),
            pomodoros: Math.max(prev.pomodoros, d.pomodoros),
          }
        : d,
    )
  }
  const sorted = [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
  return sorted.length > MAX_DAYS ? sorted.slice(sorted.length - MAX_DAYS) : sorted
}

export function serializeHistory(history: StatsHistory): string {
  return JSON.stringify({ v: STORAGE_VERSION, days: history })
}

/**
 * Parse a stored blob. Anything unreadable (null, bad JSON, wrong shape or
 * version) yields an empty history; individual invalid entries are dropped.
 */
export function parseHistory(raw: string | null): StatsHistory {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== "object") return []
    const o = data as Record<string, unknown>
    if (o.v !== STORAGE_VERSION || !Array.isArray(o.days)) return []
    const days: DayStats[] = []
    for (const item of o.days) {
      const d = parseDay(item)
      if (d) days.push(d)
    }
    return normalize(days)
  } catch {
    return []
  }
}

/** Credit `delta` to `date`, creating the day if needed. Returns a new history. */
export function addToDay(history: StatsHistory, date: string, delta: DayDelta): StatsHistory {
  const inc = {
    words: Math.max(0, Math.floor(delta.words)),
    activeSec: Math.max(0, Math.floor(delta.activeSec)),
    pomodoros: Math.max(0, Math.floor(delta.pomodoros)),
  }
  if (inc.words === 0 && inc.activeSec === 0 && inc.pomodoros === 0) return history
  const idx = history.findIndex((d) => d.date === date)
  if (idx === -1) return normalize([...history, { date, ...inc }])
  const cur = history[idx]
  const next = history.slice()
  next[idx] = {
    date,
    words: cur.words + inc.words,
    activeSec: cur.activeSec + inc.activeSec,
    pomodoros: cur.pomodoros + inc.pomodoros,
  }
  return next
}

const emptyDay = (date: string): DayStats => ({ date, words: 0, activeSec: 0, pomodoros: 0 })

/** Totals for `date`; zeros when nothing was recorded (a new day starts fresh). */
export function dayStats(history: StatsHistory, date: string): DayStats {
  return history.find((d) => d.date === date) ?? emptyDay(date)
}

/** Sum of the last `days` calendar days ending at `date` (inclusive). */
export function recentTotals(history: StatsHistory, date: string, days: number): DayStats {
  const [y, m, d] = date.split("-").map(Number)
  const start = dayKey(new Date(y, m - 1, d - (days - 1)).getTime())
  const total = emptyDay(date)
  for (const e of history) {
    if (e.date >= start && e.date <= date) {
      total.words += e.words
      total.activeSec += e.activeSec
      total.pomodoros += e.pomodoros
    }
  }
  return total
}

export function loadHistory(): StatsHistory {
  try {
    return parseHistory(localStorage.getItem(STORAGE_KEYS.WRITING_STATS))
  } catch {
    return []
  }
}

export function saveHistory(history: StatsHistory): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WRITING_STATS, serializeHistory(history))
  } catch {
    // Storage unavailable or full: stats stay in memory for this run.
  }
}
