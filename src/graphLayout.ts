/**
 * Force-directed graph layout, pure and deterministic.
 *
 * Repulsion uses a Barnes-Hut quadtree (O(n log n) per tick), links are
 * springs, a weak gravity keeps disconnected components together, and the
 * simulation cools (alpha decay) until it converges or hits the tick cap.
 *
 * The same module runs inside `graphLayout.worker.ts` and, as a fallback,
 * on the calling thread (vitest, environments without Workers). Positions of
 * nodes that already had one (`prev`) are kept as the starting point, so
 * adding a note moves the rest of the graph very little.
 */

export interface LayoutRequest {
  /** Node ids, in a stable order. The result is aligned with this array. */
  ids: string[]
  /** Flat pairs of node indices: [a0, b0, a1, b1, ...]. */
  edges: Uint32Array
  /** Optional warm start: [x0, y0, x1, y1, ...], NaN for nodes without one. */
  prev?: Float32Array
}

export interface LayoutResult {
  /** [x0, y0, x1, y1, ...] aligned with `ids`. */
  pos: Float32Array
  ticks: number
  converged: boolean
}

export interface LayoutOptions {
  linkDistance: number
  charge: number
  gravity: number
  theta: number
  velocityDecay: number
  alphaMin: number
  alphaDecay: number
  maxTicks: number
  /** Mean displacement per tick (world units) below which the layout is settled. */
  settle: number
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  linkDistance: 30,
  charge: 30,
  gravity: 0.06,
  theta: 0.9,
  velocityDecay: 0.6,
  alphaMin: 0.002,
  alphaDecay: 0.0228,
  maxTicks: 320,
  settle: 0.004,
}

/** FNV-1a hash of a string, as an unsigned 32 bit integer. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Small seeded PRNG (mulberry32), returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Compressed adjacency (CSR) of an undirected edge list. */
function buildAdjacency(n: number, edges: Uint32Array) {
  const deg = new Uint32Array(n)
  for (let i = 0; i < edges.length; i += 2) {
    deg[edges[i]]++
    deg[edges[i + 1]]++
  }
  const start = new Uint32Array(n + 1)
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i]
  const fill = start.slice(0, n)
  const nbr = new Uint32Array(start[n])
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i]
    const b = edges[i + 1]
    nbr[fill[a]++] = b
    nbr[fill[b]++] = a
  }
  return { deg, start, nbr }
}

/**
 * Starting positions. Nodes with a previous position keep it; the others
 * start next to the average of their already placed neighbours (so a new note
 * appears beside the notes it links to) or on a deterministic spiral.
 */
export function initialPositions(
  req: LayoutRequest,
  opts: LayoutOptions = DEFAULT_LAYOUT,
): { pos: Float32Array; placed: number } {
  const { ids, edges, prev } = req
  const n = ids.length
  const pos = new Float32Array(2 * n)
  const have = new Uint8Array(n)
  let placed = 0
  let cx = 0
  let cy = 0
  if (prev && prev.length === 2 * n) {
    for (let i = 0; i < n; i++) {
      const x = prev[2 * i]
      const y = prev[2 * i + 1]
      if (Number.isFinite(x) && Number.isFinite(y)) {
        pos[2 * i] = x
        pos[2 * i + 1] = y
        have[i] = 1
        placed++
        cx += x
        cy += y
      }
    }
  }
  if (placed > 0) {
    cx /= placed
    cy /= placed
  }
  const { start, nbr } = buildAdjacency(n, edges)
  const L = opts.linkDistance
  let spiral = 0
  const unplaced = n - placed
  // Spiral radius grows with sqrt(count) so cold starts are already roughly
  // the right size.
  for (let i = 0; i < n; i++) {
    if (have[i]) continue
    const rnd = mulberry32(hashString(ids[i]))
    let sx = 0
    let sy = 0
    let c = 0
    for (let k = start[i]; k < start[i + 1]; k++) {
      const j = nbr[k]
      if (have[j]) {
        sx += pos[2 * j]
        sy += pos[2 * j + 1]
        c++
      }
    }
    if (c > 0) {
      const a = rnd() * Math.PI * 2
      pos[2 * i] = sx / c + Math.cos(a) * L * 0.5
      pos[2 * i + 1] = sy / c + Math.sin(a) * L * 0.5
    } else {
      const r = L * 0.9 * Math.sqrt(0.5 + spiral + (placed > 0 ? placed * 0.1 : 0))
      const a = spiral * GOLDEN_ANGLE
      pos[2 * i] = cx + Math.cos(a) * r + (rnd() - 0.5)
      pos[2 * i + 1] = cy + Math.sin(a) * r + (rnd() - 0.5)
      spiral++
    }
    have[i] = 1
  }
  void unplaced
  return { pos, placed }
}

// ── Barnes-Hut quadtree over typed arrays ────────────────────────────────────

const MAX_DEPTH = 28

class QuadTree {
  cap: number
  size = 0
  mass: Float32Array
  sx: Float64Array
  sy: Float64Array
  ox: Float64Array
  oy: Float64Array
  half: Float64Array
  body: Int32Array
  child: Int32Array

  constructor(n: number) {
    this.cap = 8 * n + 256
    this.mass = new Float32Array(this.cap)
    this.sx = new Float64Array(this.cap)
    this.sy = new Float64Array(this.cap)
    this.ox = new Float64Array(this.cap)
    this.oy = new Float64Array(this.cap)
    this.half = new Float64Array(this.cap)
    this.body = new Int32Array(this.cap)
    this.child = new Int32Array(4 * this.cap)
  }

  private alloc(ox: number, oy: number, half: number): number {
    const id = this.size++
    this.mass[id] = 0
    this.sx[id] = 0
    this.sy[id] = 0
    this.ox[id] = ox
    this.oy[id] = oy
    this.half[id] = half
    this.body[id] = -1
    const c = 4 * id
    this.child[c] = this.child[c + 1] = this.child[c + 2] = this.child[c + 3] = -1
    return id
  }

  private quadrant(node: number, x: number, y: number): number {
    return (x >= this.ox[node] ? 1 : 0) + (y >= this.oy[node] ? 2 : 0)
  }

  private childFor(node: number, q: number): number {
    let c = this.child[4 * node + q]
    if (c < 0) {
      const h = this.half[node] / 2
      c = this.alloc(this.ox[node] + (q & 1 ? h : -h), this.oy[node] + (q & 2 ? h : -h), h)
      this.child[4 * node + q] = c
    }
    return c
  }

  build(pos: Float32Array, n: number) {
    this.size = 0
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < n; i++) {
      const x = pos[2 * i]
      const y = pos[2 * i + 1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const half = Math.max(maxX - minX, maxY - minY, 1) / 2 + 1
    this.alloc((minX + maxX) / 2, (minY + maxY) / 2, half)
    for (let i = 0; i < n; i++) this.insert(i, pos[2 * i], pos[2 * i + 1], pos)
  }

  private insert(b: number, x: number, y: number, pos: Float32Array) {
    let node = 0
    let depth = 0
    for (;;) {
      if (this.mass[node] === 0) {
        this.mass[node] = 1
        this.sx[node] = x
        this.sy[node] = y
        this.body[node] = b
        return
      }
      const existing = this.body[node]
      if (existing >= 0) {
        // Leaf holding a body. Split unless we cannot (depth or capacity),
        // in which case the bodies are aggregated into this leaf.
        if (depth >= MAX_DEPTH || this.size + 8 >= this.cap) {
          this.mass[node]++
          this.sx[node] += x
          this.sy[node] += y
          return
        }
        this.body[node] = -1
        const q = this.quadrant(node, pos[2 * existing], pos[2 * existing + 1])
        const c = this.childFor(node, q)
        this.mass[c] = 1
        this.sx[c] = pos[2 * existing]
        this.sy[c] = pos[2 * existing + 1]
        this.body[c] = existing
      }
      this.mass[node]++
      this.sx[node] += x
      this.sy[node] += y
      node = this.childFor(node, this.quadrant(node, x, y))
      depth++
    }
  }
}

/** Run the simulation. Deterministic for a given request and options. */
export function layoutGraph(
  req: LayoutRequest,
  options: Partial<LayoutOptions> = {},
): LayoutResult {
  const opts = { ...DEFAULT_LAYOUT, ...options }
  const n = req.ids.length
  if (n === 0) return { pos: new Float32Array(0), ticks: 0, converged: true }
  const { pos, placed } = initialPositions(req, opts)
  if (n === 1) {
    return { pos: new Float32Array([pos[0], pos[1]]), ticks: 0, converged: true }
  }
  const { deg, start, nbr } = buildAdjacency(n, req.edges)
  void start
  void nbr
  const edges = req.edges
  const m = edges.length / 2
  // Warm starts reheat only as much as the newcomers need.
  const newFraction = (n - placed) / n
  let alpha = placed === 0 ? 1 : Math.min(0.5, 0.015 + newFraction * 1.5)
  const vel = new Float64Array(2 * n)
  const tree = new QuadTree(n)
  const stack = new Int32Array(4 * MAX_DEPTH + 8)
  const theta2 = opts.theta * opts.theta
  const decay = 1 - opts.velocityDecay
  const S = opts.charge
  const rnd = mulberry32(0x9e3779b9 ^ n)
  // Link strength / bias per edge, as in d3-force.
  const strength = new Float32Array(m)
  const bias = new Float32Array(m)
  for (let e = 0; e < m; e++) {
    const a = edges[2 * e]
    const b = edges[2 * e + 1]
    strength[e] = 1 / Math.max(1, Math.min(deg[a], deg[b]))
    bias[e] = deg[a] / (deg[a] + deg[b])
  }

  let ticks = 0
  let converged = false
  while (ticks < opts.maxTicks) {
    if (alpha < opts.alphaMin) {
      converged = true
      break
    }
    alpha *= 1 - opts.alphaDecay
    ticks++

    // Links
    for (let e = 0; e < m; e++) {
      const a = edges[2 * e]
      const b = edges[2 * e + 1]
      let dx = pos[2 * b] + vel[2 * b] - pos[2 * a] - vel[2 * a]
      let dy = pos[2 * b + 1] + vel[2 * b + 1] - pos[2 * a + 1] - vel[2 * a + 1]
      if (dx === 0) dx = (rnd() - 0.5) * 1e-3
      if (dy === 0) dy = (rnd() - 0.5) * 1e-3
      const l0 = Math.sqrt(dx * dx + dy * dy)
      const k = ((l0 - opts.linkDistance) / l0) * alpha * strength[e]
      dx *= k
      dy *= k
      const bb = bias[e]
      vel[2 * b] -= dx * bb
      vel[2 * b + 1] -= dy * bb
      vel[2 * a] += dx * (1 - bb)
      vel[2 * a + 1] += dy * (1 - bb)
    }

    // Repulsion (Barnes-Hut)
    tree.build(pos, n)
    for (let i = 0; i < n; i++) {
      const x = pos[2 * i]
      const y = pos[2 * i + 1]
      let vx = 0
      let vy = 0
      let sp = 0
      stack[sp++] = 0
      while (sp > 0) {
        const node = stack[--sp]
        const mass = tree.mass[node]
        if (mass === 0) continue
        const bd = tree.body[node]
        if (bd === i && mass === 1) continue
        const px = tree.sx[node] / mass
        const py = tree.sy[node] / mass
        let dx = px - x
        let dy = py - y
        let d2 = dx * dx + dy * dy
        const w = tree.half[node] * 2
        if (bd >= 0 || (w * w) / (d2 || 1e-9) < theta2) {
          if (d2 < 1) {
            if (dx === 0) dx = (rnd() - 0.5) * 1e-2
            if (dy === 0) dy = (rnd() - 0.5) * 1e-2
            d2 = Math.sqrt(d2 || 1)
            d2 = Math.max(d2, 1)
          }
          const f = (S * alpha * mass) / d2
          vx -= dx * f
          vy -= dy * f
        } else {
          const c = 4 * node
          for (let q = 0; q < 4; q++) {
            const ch = tree.child[c + q]
            if (ch >= 0) stack[sp++] = ch
          }
        }
      }
      vel[2 * i] += vx
      vel[2 * i + 1] += vy
    }

    // Gravity, then integrate
    let moved = 0
    const g = opts.gravity * alpha
    for (let i = 0; i < n; i++) {
      // Unlinked notes have no spring to hold them: pull them in harder so
      // they ring the graph instead of drifting off and shrinking the fit.
      const gi = deg[i] === 0 ? g * 3 : g
      vel[2 * i] -= pos[2 * i] * gi
      vel[2 * i + 1] -= pos[2 * i + 1] * gi
      vel[2 * i] *= decay
      vel[2 * i + 1] *= decay
      pos[2 * i] += vel[2 * i]
      pos[2 * i + 1] += vel[2 * i + 1]
      moved += Math.abs(vel[2 * i]) + Math.abs(vel[2 * i + 1])
    }
    if (ticks > 20 && moved / n < opts.settle) {
      converged = true
      break
    }
  }
  if (!converged) converged = ticks >= opts.maxTicks
  return { pos, ticks, converged }
}

/** Axis-aligned bounds of a position array, or null when empty. */
export function boundsOf(
  pos: ArrayLike<number>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const n = pos.length / 2
  if (n === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const x = pos[2 * i]
    const y = pos[2 * i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}
