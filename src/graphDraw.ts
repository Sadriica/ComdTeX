/**
 * Canvas 2D drawing for the graph. Reads a `GraphScene` and a `View`, never
 * touches React. One call is one frame: batched paths per style, viewport
 * culling, greedy label placement.
 */
import { neighboursOf, screenRadius, type GraphScene, type View } from "./graphScene"

export interface Palette {
  fg: string
  fgMuted: string
  border: string
  accent: string
  bg: string
  viz: string[]
  /** Resolved `--font-ui` stack. */
  font: string
}

export interface FrameState {
  w: number
  h: number
  /** Hovered or keyboard-highlighted node index, or -1. */
  hover: number
  /** Active note index, or -1. */
  active: number
}

const FALLBACK_FONT = "system-ui, sans-serif"
const MAX_LABEL_CHARS = 24

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

/** How many non-priority labels the zoom level can afford. */
export function labelBudget(k: number): number {
  if (k < 0.25) return 5
  if (k < 0.5) return 14
  if (k < 0.9) return 34
  if (k < 1.6) return 80
  return 200
}

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

function overlaps(a: Rect, list: Rect[]): boolean {
  for (const b of list) {
    if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) return true
  }
  return false
}

/** Indices to label, in priority order. Pure, so it is testable without a canvas. */
export function labelCandidates(
  scene: GraphScene,
  st: Pick<FrameState, "hover" | "active">,
  k: number,
): { priority: number[]; rest: number[] } {
  const priority: number[] = []
  const seen = new Set<number>()
  const add = (i: number) => {
    if (i >= 0 && !seen.has(i)) {
      seen.add(i)
      priority.push(i)
    }
  }
  add(st.hover)
  if (st.hover >= 0) {
    const nb = Array.from(neighboursOf(scene, st.hover)).sort(
      (a, b) => scene.degree[b] - scene.degree[a] || a - b,
    )
    for (const i of nb.slice(0, 40)) add(i)
  }
  add(st.active)
  const rest: number[] = []
  const budget = labelBudget(k)
  for (const i of scene.byDegree) {
    if (rest.length >= budget) break
    if (!seen.has(i) && scene.degree[i] > 0) rest.push(i)
  }
  // A graph with no links still deserves a few names.
  if (rest.length === 0 && priority.length === 0) {
    for (let i = 0; i < Math.min(scene.n, Math.min(budget, 12)); i++) rest.push(i)
  }
  return { priority, rest }
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  scene: GraphScene,
  view: View,
  pal: Palette,
  st: FrameState,
): void {
  const { w, h } = st
  ctx.clearRect(0, 0, w, h)
  const n = scene.n
  if (n === 0) return
  const { x, y } = scene
  const k = view.k
  const hovering = st.hover >= 0
  const isNb = new Uint8Array(n)
  if (hovering) {
    for (const j of neighboursOf(scene, st.hover)) isNb[j] = 1
    isNb[st.hover] = 1
  }

  // Edges, three batches: faint, dimmed-by-filter handled as faint, highlighted.
  const m = scene.edges.length / 2
  const baseAlpha = Math.max(0.1, Math.min(0.4, 500 / Math.max(m, 1)))
  ctx.lineCap = "round"
  ctx.strokeStyle = pal.fgMuted
  ctx.lineWidth = 1
  ctx.globalAlpha = hovering ? baseAlpha * 0.35 : baseAlpha
  ctx.beginPath()
  for (let e = 0; e < m; e++) {
    const a = scene.edges[2 * e]
    const b = scene.edges[2 * e + 1]
    if (hovering && (a === st.hover || b === st.hover)) continue
    if (scene.dim[a] && scene.dim[b]) continue
    const ax = x[a] * k + view.x
    const ay = y[a] * k + view.y
    const bx = x[b] * k + view.x
    const by = y[b] * k + view.y
    if ((ax < 0 && bx < 0) || (ax > w && bx > w) || (ay < 0 && by < 0) || (ay > h && by > h))
      continue
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
  }
  ctx.stroke()
  if (hovering) {
    ctx.strokeStyle = pal.accent
    ctx.lineWidth = 1.6
    ctx.globalAlpha = 0.95
    ctx.beginPath()
    for (const j of neighboursOf(scene, st.hover)) {
      ctx.moveTo(x[st.hover] * k + view.x, y[st.hover] * k + view.y)
      ctx.lineTo(x[j] * k + view.x, y[j] * k + view.y)
    }
    ctx.stroke()
  }

  // Nodes, batched by (group, faded) so a frame is a handful of fills.
  const groups = pal.viz.length
  for (let pass = 0; pass < 2; pass++) {
    const faded = pass === 0
    for (let g = 0; g < groups; g++) {
      ctx.beginPath()
      let any = false
      for (let i = 0; i < n; i++) {
        if (scene.group[i] % groups !== g) continue
        const isFaded = scene.dim[i] === 1 || (hovering && !isNb[i])
        if (isFaded !== faded) continue
        const r = screenRadius(scene.baseR[i], k)
        const px = x[i] * k + view.x
        const py = y[i] * k + view.y
        if (px < -r || px > w + r || py < -r || py > h + r) continue
        ctx.moveTo(px + r, py)
        ctx.arc(px, py, r, 0, Math.PI * 2)
        any = true
      }
      if (!any) continue
      ctx.globalAlpha = faded ? 0.2 : 0.92
      ctx.fillStyle = pal.viz[g]
      ctx.fill()
    }
  }

  // Active and hovered rings.
  ctx.globalAlpha = 1
  const ring = (i: number, color: string, width: number, extra: number) => {
    if (i < 0 || i >= n) return
    const r = screenRadius(scene.baseR[i], k) + extra
    ctx.beginPath()
    ctx.arc(x[i] * k + view.x, y[i] * k + view.y, r, 0, Math.PI * 2)
    ctx.lineWidth = width
    ctx.strokeStyle = color
    ctx.stroke()
  }
  ring(st.active, pal.accent, 2.5, 3)
  if (st.hover !== st.active) ring(st.hover, pal.fg, 1.5, 2)

  // Labels.
  const px = 11
  ctx.font = `${px}px ${pal.font || FALLBACK_FONT}`
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.lineJoin = "round"
  ctx.lineWidth = 3.5
  ctx.strokeStyle = pal.bg
  const placed: Rect[] = []
  const { priority, rest } = labelCandidates(scene, st, k)
  const drawLabel = (i: number, force: boolean) => {
    const r = screenRadius(scene.baseR[i], k)
    const cx = x[i] * k + view.x
    const cy = y[i] * k + view.y
    if (cx < -40 || cx > w + 40 || cy < -20 || cy > h + 20) return
    const text = truncate(scene.labels[i], i === st.hover ? 40 : MAX_LABEL_CHARS)
    const tw = ctx.measureText(text).width
    const rect: Rect = {
      x0: cx - tw / 2 - 2,
      x1: cx + tw / 2 + 2,
      y0: cy + r + 2,
      y1: cy + r + 2 + px + 2,
    }
    if (!force && overlaps(rect, placed)) return
    placed.push(rect)
    const isFocus = i === st.hover || i === st.active
    ctx.globalAlpha = scene.dim[i] && !isFocus ? 0.35 : 1
    ctx.fillStyle = isFocus ? pal.fg : pal.fgMuted
    ctx.strokeText(text, cx, cy + r + 3)
    ctx.fillText(text, cx, cy + r + 3)
  }
  for (const i of priority) drawLabel(i, i === st.hover || i === st.active)
  for (const i of rest) drawLabel(i, false)
  ctx.globalAlpha = 1
}

// ── Palette from CSS variables ───────────────────────────────────────────────

const NEUTRAL_VIZ = [
  "rgb(110 160 200)",
  "rgb(110 190 160)",
  "rgb(210 150 110)",
  "rgb(210 190 110)",
  "rgb(180 130 200)",
  "rgb(130 190 215)",
  "rgb(200 170 110)",
  "rgb(130 170 120)",
]

/**
 * Resolve the design tokens to concrete colours. A probe element does the
 * resolving, so `color-mix()`, `oklch()`, `light-dark()` and nested `var()` all
 * end up as something a canvas understands.
 */
export function readPalette(host: HTMLElement): Palette {
  const probe = document.createElement("span")
  probe.style.display = "none"
  host.appendChild(probe)
  const resolve = (name: string, fallback: string): string => {
    probe.style.color = ""
    probe.style.color = `var(${name}, ${fallback})`
    return getComputedStyle(probe).color || fallback
  }
  const cs = getComputedStyle(host)
  const font = cs.getPropertyValue("--font-ui").trim() || cs.fontFamily || FALLBACK_FONT
  const pal: Palette = {
    fg: resolve("--fg", "rgb(230 230 230)"),
    fgMuted: resolve("--fg-muted", "rgb(160 160 160)"),
    border: resolve("--border", "rgb(80 80 80)"),
    accent: resolve("--accent", "rgb(120 170 220)"),
    bg: resolve("--bg-surface", "rgb(30 30 30)"),
    viz: NEUTRAL_VIZ.map((f, i) => resolve(`--viz-${i + 1}`, f)),
    font,
  }
  host.removeChild(probe)
  return pal
}
