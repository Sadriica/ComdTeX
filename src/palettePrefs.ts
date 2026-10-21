import { STORAGE_KEYS } from "./storageKeys"

/**
 * What the palette remembers about the user: the last commands run (with a use
 * count, so a frequent one outranks a one-off) and the commands they pinned.
 * Pure functions over a plain object plus a thin load/save pair, so the policy
 * is testable without a DOM.
 */

export const MAX_RECENT_COMMANDS = 8
/** More pins than this is a corrupted or runaway list, not a choice. */
export const MAX_PINNED = 50
/** A pin whose command was missing on this many palette openings is dropped. */
export const STALE_PIN_OPENINGS = 5

export interface RecentCommand {
  id: string
  /** How many times it has run while it stayed in the recent list. */
  count: number
}

export interface PalettePrefs {
  v: 1
  /** Most recent first. */
  recent: RecentCommand[]
  pinned: string[]
  /** Openings each pin has gone missing for, in a row (absent: none). */
  stale?: Record<string, number>
}

export const EMPTY_PREFS: PalettePrefs = { v: 1, recent: [], pinned: [] }

export function recordCommandUse(prefs: PalettePrefs, id: string): PalettePrefs {
  const prior = prefs.recent.find((r) => r.id === id)
  const entry: RecentCommand = { id, count: (prior?.count ?? 0) + 1 }
  const rest = prefs.recent.filter((r) => r.id !== id)
  return { ...prefs, recent: [entry, ...rest].slice(0, MAX_RECENT_COMMANDS) }
}

export function togglePinned(prefs: PalettePrefs, id: string): PalettePrefs {
  const pinned = prefs.pinned.includes(id)
    ? prefs.pinned.filter((p) => p !== id)
    : [...prefs.pinned, id].slice(-MAX_PINNED)
  return { ...prefs, pinned }
}

/**
 * Notes which pinned commands no longer exist and forgets the ones missing for
 * STALE_PIN_OPENINGS openings in a row (a command that is merely unavailable
 * for a moment, like one tied to an open vault, comes back and resets). Returns
 * the same object when nothing changed.
 */
export function prunePinned(prefs: PalettePrefs, exists: (id: string) => boolean): PalettePrefs {
  const stale: Record<string, number> = {}
  const pinned: string[] = []
  let changed = false
  for (const id of prefs.pinned) {
    if (exists(id)) {
      pinned.push(id)
      if (prefs.stale?.[id]) changed = true
      continue
    }
    const n = (prefs.stale?.[id] ?? 0) + 1
    changed = true
    if (n >= STALE_PIN_OPENINGS) continue
    pinned.push(id)
    stale[id] = n
  }
  if (!changed) return prefs
  return { ...prefs, pinned, stale: Object.keys(stale).length ? stale : undefined }
}

/** Ranking boost for a command: frequent and recent ones float up. */
export function usageBoost(prefs: PalettePrefs, id: string): number {
  const idx = prefs.recent.findIndex((r) => r.id === id)
  if (idx < 0) return 0
  const recency = (MAX_RECENT_COMMANDS - idx) * 0.75
  const frequency = Math.min(8, Math.log2(1 + prefs.recent[idx].count) * 2)
  return recency + frequency
}

/** Defensive parse: any malformed piece is dropped, never thrown. */
export function parsePrefs(raw: string | null): PalettePrefs {
  if (!raw) return EMPTY_PREFS
  try {
    const data = JSON.parse(raw) as Partial<PalettePrefs> | null
    if (!data || typeof data !== "object") return EMPTY_PREFS
    const recent = Array.isArray(data.recent)
      ? data.recent
          .filter(
            (r): r is RecentCommand =>
              !!r && typeof r.id === "string" && typeof r.count === "number" && r.count > 0,
          )
          .slice(0, MAX_RECENT_COMMANDS)
      : []
    const pinned = Array.isArray(data.pinned)
      ? [...new Set(data.pinned.filter((p): p is string => typeof p === "string"))].slice(
          0,
          MAX_PINNED,
        )
      : []
    const stale: Record<string, number> = {}
    if (data.stale && typeof data.stale === "object") {
      for (const id of pinned) {
        const n = (data.stale as Record<string, unknown>)[id]
        if (typeof n === "number" && n > 0) stale[id] = Math.min(n, STALE_PIN_OPENINGS)
      }
    }
    return { v: 1, recent, pinned, ...(Object.keys(stale).length ? { stale } : {}) }
  } catch {
    return EMPTY_PREFS
  }
}

export function loadPalettePrefs(): PalettePrefs {
  try {
    return parsePrefs(localStorage.getItem(STORAGE_KEYS.PALETTE_PREFS))
  } catch {
    return EMPTY_PREFS
  }
}

export function savePalettePrefs(prefs: PalettePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PALETTE_PREFS, JSON.stringify(prefs))
  } catch {
    /* storage full or blocked: the palette still works, it just forgets */
  }
}
