import { describe, expect, it } from "vitest"
import { buildFileEntries, rankFileEntries } from "./paletteSources"
import { perfBudget } from "./perfBudget"

/**
 * Typing in the files palette ranks the whole vault on every keystroke. Past
 * ~15k files the folded-text cache used to overflow and was rebuilt on each
 * keystroke (274-420 ms at 20k files). The bound is generous (the warm cost is
 * a fraction of it) so this only fails on that kind of cliff, not on a slow CI.
 */
function makeFiles(n: number) {
  const words = ["spectral", "gap", "mixing", "notes", "papers", "expander", "walk", "graph"]
  return Array.from({ length: n }, (_, i) => {
    const w = (k: number) => words[(i * 7 + k * 3) % words.length]
    return { path: `/v/${w(0)}/${w(1)}-${i % 97}/${w(2)}-${w(3)}-${i}.md` }
  })
}

describe("files palette at 20k files", () => {
  it("keeps keystrokes fast once the first one has warmed the entries", () => {
    const entries = buildFileEntries(makeFiles(20000), "/v")
    const typed = ["s", "sp", "spe", "spec", "spect", "spectr", "spectra", "spectral g"]
    const times: number[] = []
    for (const q of typed) {
      const t0 = performance.now()
      const out = rankFileEntries(entries, q, [])
      times.push(performance.now() - t0)
      expect(out.length).toBeGreaterThan(0)
    }
    const warm = times.slice(1)
    const avg = warm.reduce((a, b) => a + b, 0) / warm.length
    expect(avg, `per-keystroke ms: ${times.map((t) => Math.round(t)).join(", ")}`).toBeLessThan(
      perfBudget(200),
    )
    // Coverage instrumentation can make the eight passes take tens of seconds.
  }, 60_000)
})
