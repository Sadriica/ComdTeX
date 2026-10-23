import { describe, it, expect } from "vitest"
import { layoutGraph, mulberry32, boundsOf, type LayoutRequest } from "./graphLayout"
import { LayoutRunner, syncLayoutBackend } from "./graphLayoutClient"
import { perfBudget } from "./perfBudget"

/** Seeded scale-free-ish graph: each node links to up to `m` earlier nodes. */
function randomGraph(n: number, m: number, seed = 7): LayoutRequest {
  const rnd = mulberry32(seed)
  const ids = Array.from({ length: n }, (_, i) => `/v/n${i}.md`)
  const seen = new Set<string>()
  const flat: number[] = []
  for (let i = 1; i < n; i++) {
    for (let k = 0; k < m; k++) {
      // Squaring the random number favours low indices, which makes hubs.
      const j = Math.floor(rnd() * rnd() * i)
      const key = `${j}-${i}`
      if (j !== i && !seen.has(key)) {
        seen.add(key)
        flat.push(i, j)
      }
    }
  }
  return { ids, edges: Uint32Array.from(flat) }
}

function meanLink(req: LayoutRequest, pos: Float32Array): number {
  let sum = 0
  const m = req.edges.length / 2
  for (let e = 0; e < m; e++) {
    const a = req.edges[2 * e]
    const b = req.edges[2 * e + 1]
    sum += Math.hypot(pos[2 * a] - pos[2 * b], pos[2 * a + 1] - pos[2 * b + 1])
  }
  return sum / m
}

describe("layoutGraph", () => {
  it("handles empty and single-node graphs", () => {
    expect(layoutGraph({ ids: [], edges: new Uint32Array(0) }).pos.length).toBe(0)
    const one = layoutGraph({ ids: ["a"], edges: new Uint32Array(0) })
    expect(one.pos.length).toBe(2)
    expect(one.converged).toBe(true)
  })

  it("is deterministic for a given input", () => {
    const a = layoutGraph(randomGraph(300, 2))
    const b = layoutGraph(randomGraph(300, 2))
    expect(Array.from(b.pos)).toEqual(Array.from(a.pos))
    expect(b.ticks).toBe(a.ticks)
  })

  it("converges before the tick cap and produces finite coordinates", () => {
    const r = layoutGraph(randomGraph(400, 2))
    expect(r.converged).toBe(true)
    expect(r.ticks).toBeGreaterThan(20)
    expect(r.ticks).toBeLessThanOrEqual(320)
    expect(Array.from(r.pos).every(Number.isFinite)).toBe(true)
  })

  it("pulls linked nodes together and keeps nodes apart", () => {
    const req = randomGraph(200, 2)
    const r = layoutGraph(req)
    const b = boundsOf(r.pos)!
    const width = Math.max(b.maxX - b.minX, b.maxY - b.minY)
    expect(meanLink(req, r.pos)).toBeLessThan(width / 4)
    let minDist = Infinity
    for (let i = 0; i < 200; i++)
      for (let j = i + 1; j < 200; j++)
        minDist = Math.min(
          minDist,
          Math.hypot(r.pos[2 * i] - r.pos[2 * j], r.pos[2 * i + 1] - r.pos[2 * j + 1]),
        )
    expect(minDist).toBeGreaterThan(0.05)
  })

  it("spreads disconnected nodes instead of stacking them", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `n${i}`)
    const r = layoutGraph({ ids, edges: new Uint32Array(0) })
    const b = boundsOf(r.pos)!
    expect(b.maxX - b.minX).toBeGreaterThan(30)
  })

  it("warm start: a new note leaves the other nodes where they were", () => {
    const base = randomGraph(300, 2)
    const first = layoutGraph(base)
    const ids = [...base.ids, "/v/new.md"]
    const edges = Uint32Array.from([...base.edges, 300, 5, 300, 17])
    const prev = new Float32Array(2 * ids.length).fill(NaN)
    prev.set(first.pos)
    const second = layoutGraph({ ids, edges, prev })
    const b = boundsOf(first.pos)!
    const width = Math.max(b.maxX - b.minX, b.maxY - b.minY)
    let worst = 0
    for (let i = 0; i < 300; i++) {
      worst = Math.max(
        worst,
        Math.hypot(
          second.pos[2 * i] - first.pos[2 * i],
          second.pos[2 * i + 1] - first.pos[2 * i + 1],
        ),
      )
    }
    expect(worst).toBeLessThan(width * 0.08)
    // The newcomer lands next to what it links to, not across the canvas.
    const d = Math.hypot(second.pos[600] - first.pos[10], second.pos[601] - first.pos[11])
    expect(d).toBeLessThan(width * 0.25)
    expect(second.ticks).toBeLessThan(first.ticks)
  })

  it("warm start with nothing changed is a near no-op", () => {
    const req = randomGraph(150, 2)
    const first = layoutGraph(req)
    const again = layoutGraph({ ...req, prev: first.pos })
    let worst = 0
    for (let i = 0; i < first.pos.length; i++)
      worst = Math.max(worst, Math.abs(again.pos[i] - first.pos[i]))
    expect(worst).toBeLessThan(2)
  })

  it("lays out 2,000 nodes / 6,000 edges inside a CI-safe budget (sync path)", () => {
    const req = randomGraph(2000, 3)
    expect(req.edges.length / 2).toBeGreaterThan(4500)
    const t0 = performance.now()
    const r = layoutGraph(req)
    const ms = performance.now() - t0
    expect(r.converged).toBe(true)
    expect(Array.from(r.pos).every(Number.isFinite)).toBe(true)
    // Far under a second on a laptop; the budget is deliberately loose for CI.
    expect(ms).toBeLessThan(perfBudget(8000))
  }, 20000)
})

describe("LayoutRunner", () => {
  it("drops results superseded by a newer request", async () => {
    const runner = new LayoutRunner(syncLayoutBackend)
    const a = runner.run(randomGraph(30, 2, 1))
    const b = runner.run(randomGraph(40, 2, 2))
    expect(await a).toBeNull()
    const res = await b
    expect(res?.pos.length).toBe(80)
  })
})
