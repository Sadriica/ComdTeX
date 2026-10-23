import { describe, it, expect } from "vitest"
import {
  SpatialGrid,
  buildScene,
  clampZoom,
  commonDir,
  fitView,
  hitTest,
  localNeighbourhood,
  neighboursOf,
  screenRadius,
  screenToWorld,
  topLevelFolder,
  worldToScreen,
  zoomAt,
  type SceneNode,
} from "./graphScene"
import { labelCandidates, labelBudget } from "./graphDraw"

const node = (id: string, degree = 0): SceneNode => ({
  id,
  label: id,
  group: 0,
  degree,
  dim: false,
})

function smallScene() {
  const nodes = [node("a", 2), node("b", 1), node("c", 1), node("d", 0)]
  const pos: Record<string, [number, number]> = {
    a: [0, 0],
    b: [100, 0],
    c: [0, 100],
    d: [200, 200],
  }
  return buildScene(
    nodes,
    [
      ["a", "b"],
      ["a", "c"],
    ],
    (id) => pos[id],
  )
}

describe("buildScene", () => {
  it("builds adjacency and degree ordering", () => {
    const s = smallScene()
    expect(Array.from(neighboursOf(s, 0)).sort()).toEqual([1, 2])
    expect(Array.from(neighboursOf(s, 3))).toEqual([])
    expect(s.byDegree[0]).toBe(0)
  })

  it("ignores edges to unknown nodes and self loops", () => {
    const s = buildScene(
      [node("a"), node("b")],
      [
        ["a", "zzz"],
        ["a", "a"],
        ["a", "b"],
      ],
      () => [0, 0],
    )
    expect(s.edges.length).toBe(2)
  })
})

describe("hit-testing", () => {
  const s = smallScene()
  const grid = new SpatialGrid(s.x, s.y)
  const view = { x: 50, y: 50, k: 1 }

  it("finds the node under the pointer through the view transform", () => {
    const [sx, sy] = worldToScreen(view, 100, 0)
    expect(hitTest(s, grid, view, sx + 1, sy - 1)).toBe(1)
    expect(hitTest(s, grid, view, sx + 200, sy)).toBe(-1)
  })

  it("misses empty space and respects zoom", () => {
    expect(hitTest(s, grid, view, 400, 400)).toBe(-1)
    const zoomed = { x: 0, y: 0, k: 3 }
    const [sx, sy] = worldToScreen(zoomed, 0, 100)
    expect(hitTest(s, grid, zoomed, sx, sy + 2)).toBe(2)
    expect(hitTest(s, grid, zoomed, sx + 40, sy)).toBe(-1)
  })

  it("picks the closest of two overlapping nodes", () => {
    const sc = buildScene([node("p", 4), node("q", 4)], [], (id) => (id === "p" ? [0, 0] : [6, 0]))
    const g = new SpatialGrid(sc.x, sc.y)
    expect(hitTest(sc, g, { x: 0, y: 0, k: 1 }, 5, 0)).toBe(1)
    expect(hitTest(sc, g, { x: 0, y: 0, k: 1 }, 1, 0)).toBe(0)
  })

  it("stays fast on 2,000 nodes", () => {
    const nodes = Array.from({ length: 2000 }, (_, i) => node(`n${i}`, i % 5))
    const big = buildScene(nodes, [], (id) => {
      const i = Number(id.slice(1))
      return [(i % 50) * 20, Math.floor(i / 50) * 20]
    })
    const bg = new SpatialGrid(big.x, big.y)
    const v = { x: 0, y: 0, k: 1 }
    const t0 = performance.now()
    for (let i = 0; i < 1000; i++) hitTest(big, bg, v, (i * 7) % 1000, (i * 13) % 800)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(hitTest(big, bg, v, 40, 20)).toBe(52)
  })
})

describe("view maths", () => {
  it("screen and world are inverse", () => {
    const v = { x: 12, y: -5, k: 2.5 }
    const [sx, sy] = worldToScreen(v, 3, 4)
    const [wx, wy] = screenToWorld(v, sx, sy)
    expect(wx).toBeCloseTo(3)
    expect(wy).toBeCloseTo(4)
  })

  it("zoomAt keeps the point under the cursor fixed and clamps", () => {
    const v = { x: 10, y: 20, k: 1 }
    const z = zoomAt(v, 2, 100, 100)
    expect(screenToWorld(z, 100, 100)[0]).toBeCloseTo(screenToWorld(v, 100, 100)[0])
    expect(zoomAt(v, 1e9, 0, 0).k).toBe(clampZoom(1e9))
  })

  it("fitView centres and contains the graph", () => {
    const x = Float32Array.from([-100, 100, 0])
    const y = Float32Array.from([-50, 50, 0])
    const v = fitView(x, y, 300, 200)
    for (let i = 0; i < 3; i++) {
      const [sx, sy] = worldToScreen(v, x[i], y[i])
      expect(sx).toBeGreaterThanOrEqual(0)
      expect(sx).toBeLessThanOrEqual(300)
      expect(sy).toBeGreaterThanOrEqual(0)
      expect(sy).toBeLessThanOrEqual(200)
    }
    expect(worldToScreen(v, 0, 0)[0]).toBeCloseTo(150)
  })

  it("keeps node radius readable at any zoom", () => {
    expect(screenRadius(5, 0.01)).toBeGreaterThanOrEqual(3)
    expect(screenRadius(5, 100)).toBeLessThanOrEqual(8)
  })
})

describe("local neighbourhood", () => {
  const adj = new Map<string, Set<string>>([
    ["a", new Set(["b"])],
    ["b", new Set(["a", "c"])],
    ["c", new Set(["b", "d"])],
    ["d", new Set(["c"])],
  ])
  it("expands by depth", () => {
    expect([...localNeighbourhood(adj, "a", 1)].sort()).toEqual(["a", "b"])
    expect([...localNeighbourhood(adj, "a", 2)].sort()).toEqual(["a", "b", "c"])
    expect([...localNeighbourhood(adj, "zz", 2)]).toEqual(["zz"])
  })
})

describe("folders", () => {
  it("colours by the first folder under the vault root", () => {
    const paths = ["/v/a.md", "/v/math/x.md", "/v/math/deep/y.md", "/v/bio/z.md"]
    const root = commonDir(paths)
    expect(root).toBe("/v")
    expect(paths.map((p) => topLevelFolder(p, root))).toEqual(["", "math", "math", "bio"])
  })
  it("a vault whose notes all sit in one folder has no root-level folder", () => {
    expect(commonDir(["/v/n/a.md", "/v/n/b.md"])).toBe("/v/n")
  })
})

describe("labels", () => {
  it("labels the hovered node, its neighbours and the active note first", () => {
    const s = smallScene()
    const { priority } = labelCandidates(s, { hover: 1, active: 3 }, 1)
    expect(priority[0]).toBe(1)
    expect(priority).toContain(0)
    expect(priority).toContain(3)
  })
  it("shows fewer labels when zoomed out", () => {
    expect(labelBudget(0.1)).toBeLessThan(labelBudget(1))
    expect(labelBudget(1)).toBeLessThan(labelBudget(3))
  })
})
