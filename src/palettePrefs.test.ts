import { describe, expect, it } from "vitest"
import {
  EMPTY_PREFS,
  MAX_PINNED,
  MAX_RECENT_COMMANDS,
  STALE_PIN_OPENINGS,
  prunePinned,
  parsePrefs,
  recordCommandUse,
  togglePinned,
  usageBoost,
} from "./palettePrefs"

describe("recent commands", () => {
  it("keeps the last 8, most recent first, counting repeats", () => {
    let prefs = EMPTY_PREFS
    for (let i = 0; i < 12; i++) prefs = recordCommandUse(prefs, `cmd${i}`)
    expect(prefs.recent).toHaveLength(MAX_RECENT_COMMANDS)
    expect(prefs.recent[0].id).toBe("cmd11")
    expect(prefs.recent[prefs.recent.length - 1].id).toBe("cmd4")

    prefs = recordCommandUse(prefs, "cmd8")
    prefs = recordCommandUse(prefs, "cmd8")
    expect(prefs.recent[0]).toEqual({ id: "cmd8", count: 3 })
    expect(prefs.recent.filter((r) => r.id === "cmd8")).toHaveLength(1)
  })

  it("boosts frequent and recent commands", () => {
    let prefs = recordCommandUse(EMPTY_PREFS, "a")
    prefs = recordCommandUse(prefs, "b")
    expect(usageBoost(prefs, "b")).toBeGreaterThan(usageBoost(prefs, "a"))
    expect(usageBoost(prefs, "never")).toBe(0)
    const frequent = recordCommandUse(recordCommandUse(recordCommandUse(prefs, "a"), "a"), "b")
    expect(usageBoost(frequent, "a")).toBeGreaterThan(0)
  })
})

describe("pins", () => {
  it("toggles and keeps order", () => {
    let prefs = togglePinned(EMPTY_PREFS, "x")
    prefs = togglePinned(prefs, "y")
    expect(prefs.pinned).toEqual(["x", "y"])
    expect(togglePinned(prefs, "x").pinned).toEqual(["y"])
  })
})

describe("parsePrefs", () => {
  it("round-trips", () => {
    let prefs = recordCommandUse(EMPTY_PREFS, "save")
    prefs = togglePinned(prefs, "find")
    expect(parsePrefs(JSON.stringify(prefs))).toEqual(prefs)
  })

  it("survives garbage", () => {
    expect(parsePrefs(null)).toEqual(EMPTY_PREFS)
    expect(parsePrefs("not json")).toEqual(EMPTY_PREFS)
    expect(parsePrefs("42")).toEqual(EMPTY_PREFS)
    const odd = parsePrefs(
      JSON.stringify({ recent: [{ id: 1 }, { id: "ok", count: 2 }, null], pinned: ["a", 3, "a"] }),
    )
    expect(odd.recent).toEqual([{ id: "ok", count: 2 }])
    expect(odd.pinned).toEqual(["a"])
  })
})

describe("pin hygiene", () => {
  it("dedupes and caps pins on parse", () => {
    const many = Array.from({ length: MAX_PINNED + 30 }, (_, i) => `c${i % (MAX_PINNED + 20)}`)
    const prefs = parsePrefs(JSON.stringify({ v: 1, recent: [], pinned: ["a", "a", "b", ...many] }))
    expect(new Set(prefs.pinned).size).toBe(prefs.pinned.length)
    expect(prefs.pinned.length).toBeLessThanOrEqual(MAX_PINNED)
    expect(prefs.pinned.slice(0, 2)).toEqual(["a", "b"])
  })

  it("keeps a pin that is only missing briefly and drops one that stays gone", () => {
    let prefs = parsePrefs(JSON.stringify({ v: 1, recent: [], pinned: ["gone", "here"] }))
    const exists = (id: string) => id === "here"
    for (let i = 1; i < STALE_PIN_OPENINGS; i++) {
      prefs = prunePinned(prefs, exists)
      expect(prefs.pinned).toEqual(["gone", "here"])
    }
    // It comes back once: the counter resets.
    const back = prunePinned(prefs, () => true)
    expect(back.stale).toBeUndefined()
    prefs = prunePinned(prefs, exists)
    expect(prefs.pinned).toEqual(["here"])
  })

  it("returns the same object when every pin exists", () => {
    const prefs = togglePinned(EMPTY_PREFS, "x")
    expect(prunePinned(prefs, () => true)).toBe(prefs)
  })
})
