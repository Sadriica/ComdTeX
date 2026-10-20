/**
 * Pure model behind the canvas graph: the scene (typed arrays the renderer
 * and hit-testing share), the viewport maths, the spatial index and the local
 * subgraph. No DOM here, so all of it is unit-testable.
 */
import { boundsOf } from "./graphLayout"

export interface SceneNode {
  id: string
  label: string
  /** Index into the categorical palette (folder). */
  group: number
  /** Total connections in the whole vault. */
  degree: number
  /** True when the node is filtered out by search / tag (drawn dimmed). */
  dim: boolean
}

export interface GraphScene {
  n: number
  ids: string[]
  labels: string[]
  index: Map<string, number>
  /** Displayed world positions (animated towards the layout). */
  x: Float32Array
  y: Float32Array
  group: Uint8Array
  dim: Uint8Array
  degree: Uint32Array
  baseR: Float32Array
  /** Flat edge pairs of node indices. */
  edges: Uint32Array
  adjStart: Uint32Array
  adjList: Uint32Array
  /** Node indices sorted by degree, highest first (ties by index). */
  byDegree: Uint32Array
}

export interface View {
  /** Screen = world * k + (x, y), in CSS pixels. */
  x: number
  y: number
  k: number
}

export const MIN_ZOOM = 0.04
export const MAX_ZOOM = 8

export function clampZoom(k: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k))
}

/** Radius in world units before zoom compensation. */
export function baseRadius(degree: number): number {
  return 3 + Math.min(8, Math.sqrt(degree) * 1.8)
}

/** Radius in CSS pixels at zoom `k`: grows slowly with zoom, never vanishes. */
export function screenRadius(base: number, k: number): number {
  return base * Math.max(0.6, Math.min(1.6, Math.pow(k, 0.4)))
}

export function buildScene(
  nodes: SceneNode[],
  edgePairs: [string, string][],
  posOf: (id: string) => [number, number] | undefined,
): GraphScene {
  const n = nodes.length
  const index = new Map<string, number>()
  nodes.forEach((nd, i) => index.set(nd.id, i))
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const group = new Uint8Array(n)
  const dim = new Uint8Array(n)
  const degree = new Uint32Array(n)
  const baseR = new Float32Array(n)
  nodes.forEach((nd, i) => {
    const p = posOf(nd.id)
    x[i] = p ? p[0] : 0
    y[i] = p ? p[1] : 0
    group[i] = nd.group
    dim[i] = nd.dim ? 1 : 0
    degree[i] = nd.degree
    baseR[i] = baseRadius(nd.degree)
  })
  const flat: number[] = []
  for (const [a, b] of edgePairs) {
    const ia = index.get(a)
    const ib = index.get(b)
    if (ia !== undefined && ib !== undefined && ia !== ib) flat.push(ia, ib)
  }
  const edges = Uint32Array.from(flat)
  const deg = new Uint32Array(n)
  for (let i = 0; i < edges.length; i++) deg[edges[i]]++
  const adjStart = new Uint32Array(n + 1)
  for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + deg[i]
  const fill = adjStart.slice(0, n)
  const adjList = new Uint32Array(adjStart[n])
  for (let i = 0; i < edges.length; i += 2) {
    adjList[fill[edges[i]]++] = edges[i + 1]
    adjList[fill[edges[i + 1]]++] = edges[i]
  }
  const byDegree = Uint32Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => degree[b] - degree[a] || a - b,
  )
  return {
    n,
    ids: nodes.map((nd) => nd.id),
    labels: nodes.map((nd) => nd.label),
    index,
    x,
    y,
    group,
    dim,
    degree,
    baseR,
    edges,
    adjStart,
    adjList,
    byDegree,
  }
}

export function neighboursOf(scene: GraphScene, i: number): Uint32Array {
  return scene.adjList.subarray(scene.adjStart[i], scene.adjStart[i + 1])
}

/** Ids within `depth` hops of `center` (center included), via an adjacency map. */
export function localNeighbourhood(
  adjacency: Map<string, Set<string>>,
  center: string,
  depth: number,
): Set<string> {
  const seen = new Set<string>([center])
  let frontier = [center]
  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of adjacency.get(id) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  return seen
}

/** Viewport that fits all positions inside a `w` x `h` box with padding. */
export function fitView(
  x: Float32Array,
  y: Float32Array,
  w: number,
  h: number,
  pad = 28,
  maxK = 2.2,
): View {
  const n = x.length
  const interleaved = new Float32Array(2 * n)
  for (let i = 0; i < n; i++) {
    interleaved[2 * i] = x[i]
    interleaved[2 * i + 1] = y[i]
  }
  const b = boundsOf(interleaved)
  if (!b || w <= 0 || h <= 0) return { x: w / 2, y: h / 2, k: 1 }
  const bw = Math.max(b.maxX - b.minX, 1)
  const bh = Math.max(b.maxY - b.minY, 1)
  const k = clampZoom(Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh, maxK))
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return { x: w / 2 - cx * k, y: h / 2 - cy * k, k }
}

/** Zoom by `factor` keeping the world point under (px, py) fixed. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const k = clampZoom(view.k * factor)
  const f = k / view.k
  return { k, x: px - (px - view.x) * f, y: py - (py - view.y) * f }
}

export function worldToScreen(view: View, wx: number, wy: number): [number, number] {
  return [wx * view.k + view.x, wy * view.k + view.y]
}

export function screenToWorld(view: View, sx: number, sy: number): [number, number] {
  return [(sx - view.x) / view.k, (sy - view.y) / view.k]
}

// ── Spatial index (uniform grid) for hit-testing ─────────────────────────────

export class SpatialGrid {
  private cells = new Map<number, number[]>()
  private cell: number

  constructor(
    private x: Float32Array,
    private y: Float32Array,
    cell = 32,
  ) {
    this.cell = cell
    for (let i = 0; i < x.length; i++) {
      const key = this.key(Math.floor(x[i] / cell), Math.floor(y[i] / cell))
      const list = this.cells.get(key)
      if (list) list.push(i)
      else this.cells.set(key, [i])
    }
  }

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768)
  }

  /**
   * The node nearest to (wx, wy) whose own reach (world units) covers the
   * point, or -1. `reach(i)` is the hit radius of node i; `maxReach` bounds it.
   */
  nearest(wx: number, wy: number, reach: (i: number) => number, maxReach: number): number {
    const c = this.cell
    const x0 = Math.floor((wx - maxReach) / c)
    const x1 = Math.floor((wx + maxReach) / c)
    const y0 = Math.floor((wy - maxReach) / c)
    const y1 = Math.floor((wy + maxReach) / c)
    let best = -1
    let bestScore = Infinity
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.key(cx, cy))
        if (!list) continue
        for (const i of list) {
          const dx = this.x[i] - wx
          const dy = this.y[i] - wy
          const d = Math.sqrt(dx * dx + dy * dy)
          const r = reach(i)
          if (d <= r) {
            // Prefer the node whose centre is closest relative to its size.
            const score = d / r
            if (score < bestScore || (score === bestScore && i < best)) {
              best = i
              bestScore = score
            }
          }
        }
      }
    }
    return best
  }
}

/** Hit-test in screen space: node under (sx, sy) or -1. */
export function hitTest(
  scene: GraphScene,
  grid: SpatialGrid,
  view: View,
  sx: number,
  sy: number,
  slop = 3,
): number {
  const [wx, wy] = screenToWorld(view, sx, sy)
  const reach = (i: number) => (screenRadius(scene.baseR[i], view.k) + slop) / view.k
  const maxReach = (screenRadius(14, view.k) + slop) / view.k
  return grid.nearest(wx, wy, reach, maxReach)
}

// ── Folders ──────────────────────────────────────────────────────────────────

/** Longest shared directory of a set of file paths ("" when none). */
export function commonDir(paths: string[]): string {
  if (paths.length === 0) return ""
  const split = paths.map((p) => p.replace(/\\/g, "/").split("/").slice(0, -1))
  let prefix = split[0]
  for (const parts of split.slice(1)) {
    let i = 0
    while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i++
    prefix = prefix.slice(0, i)
    if (prefix.length === 0) break
  }
  return prefix.join("/")
}

/** First folder under `root` that holds `path`, or "" for files directly in root. */
export function topLevelFolder(path: string, root: string): string {
  const p = path.replace(/\\/g, "/")
  const rest = root && p.startsWith(root + "/") ? p.slice(root.length + 1) : p
  const slash = rest.indexOf("/")
  return slash < 0 ? "" : rest.slice(0, slash)
}
