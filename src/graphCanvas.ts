/**
 * Imperative controller for the graph canvas: sizing (ResizeObserver +
 * devicePixelRatio), pan / zoom, hover and click hit-testing, animation, and
 * the frame loop. React hands it a scene and callbacks and never re-renders
 * for pointer movement.
 */
import { drawGraph, readPalette, type Palette } from "./graphDraw"
import {
  SpatialGrid,
  fitView,
  hitTest,
  zoomAt,
  clampZoom,
  type GraphScene,
  type View,
} from "./graphScene"

export interface GraphCanvasCallbacks {
  onOpen: (id: string) => void
  /** Called when the hovered node changes (id or null). Not a React state path. */
  onHover?: (id: string | null) => void
}

const TWEEN_MS = 280
const VIEW_MS = 260

function reducedMotion(): boolean {
  try {
    return typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  } catch {
    return false
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

export class GraphCanvas {
  private ctx: CanvasRenderingContext2D | null = null
  private scene: GraphScene | null = null
  private grid: SpatialGrid | null = null
  private view: View = { x: 0, y: 0, k: 1 }
  private w = 0
  private h = 0
  private dpr = 1
  private palette: Palette | null = null
  private hover = -1
  private highlight = -1
  private active = -1
  private activeId: string | null = null
  private pendingFit = false
  private viewReady = false
  /** True once the user panned or zoomed; a resize then keeps their view. */
  private userMoved = false
  private snapNextFit = false
  private raf = 0
  private destroyed = false
  private ro: ResizeObserver | null = null
  private drag: { sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null
  private tween: {
    t0: number
    fx: Float32Array
    fy: Float32Array
    tx: Float32Array
    ty: Float32Array
  } | null = null
  private viewTween: { t0: number; from: View; to: View } | null = null
  /** Milliseconds the last frame took to draw (for the visual harness and tests). */
  lastFrameMs = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
    private cb: GraphCanvasCallbacks,
  ) {
    try {
      this.ctx = canvas.getContext("2d")
    } catch {
      this.ctx = null
    }
    canvas.addEventListener("pointerdown", this.onPointerDown)
    canvas.addEventListener("pointermove", this.onPointerMove)
    canvas.addEventListener("pointerup", this.onPointerUp)
    canvas.addEventListener("pointercancel", this.onPointerCancel)
    canvas.addEventListener("pointerleave", this.onPointerLeave)
    canvas.addEventListener("dblclick", this.onDblClick)
    canvas.addEventListener("wheel", this.onWheel, { passive: false })
    canvas.addEventListener("keydown", this.onKeyDown)
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.measure())
      this.ro.observe(host)
    }
    this.measure()
    this.refreshPalette()
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    const c = this.canvas
    c.removeEventListener("pointerdown", this.onPointerDown)
    c.removeEventListener("pointermove", this.onPointerMove)
    c.removeEventListener("pointerup", this.onPointerUp)
    c.removeEventListener("pointercancel", this.onPointerCancel)
    c.removeEventListener("pointerleave", this.onPointerLeave)
    c.removeEventListener("dblclick", this.onDblClick)
    c.removeEventListener("wheel", this.onWheel)
    c.removeEventListener("keydown", this.onKeyDown)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get currentView(): View {
    return this.view
  }

  refreshPalette() {
    try {
      this.palette = readPalette(this.host)
    } catch {
      this.palette = null
    }
    this.schedule()
  }

  /**
   * Swap the scene. Nodes present in the previous scene glide from where they
   * were (unless the user prefers reduced motion, then the final layout is
   * drawn at once).
   */
  setScene(next: GraphScene, opts: { fit: boolean }) {
    const prev = this.scene
    const tx = Float32Array.from(next.x)
    const ty = Float32Array.from(next.y)
    this.tween = null
    if (prev && !reducedMotion()) {
      const fx = new Float32Array(next.n)
      const fy = new Float32Array(next.n)
      let moves = false
      for (let i = 0; i < next.n; i++) {
        const j = prev.index.get(next.ids[i])
        if (j === undefined) {
          fx[i] = tx[i]
          fy[i] = ty[i]
        } else {
          fx[i] = prev.x[j]
          fy[i] = prev.y[j]
          if (Math.abs(fx[i] - tx[i]) > 0.5 || Math.abs(fy[i] - ty[i]) > 0.5) moves = true
        }
      }
      if (moves) {
        next.x.set(fx)
        next.y.set(fy)
        this.tween = { t0: performance.now(), fx, fy, tx, ty }
      }
    }
    this.scene = next
    this.grid = new SpatialGrid(tx, ty)
    this.hover = -1
    this.highlight = -1
    this.active = this.activeId ? (next.index.get(this.activeId) ?? -1) : -1
    if (opts.fit) this.pendingFit = true
    this.applyPendingFit()
    this.schedule()
  }

  setActive(id: string | null) {
    this.activeId = id
    this.active = id && this.scene ? (this.scene.index.get(id) ?? -1) : -1
    this.schedule()
  }

  /** Highlight a node as if hovered (keyboard path through the neighbour list). */
  setHighlight(id: string | null) {
    this.highlight = id && this.scene ? (this.scene.index.get(id) ?? -1) : -1
    this.schedule()
  }

  requestFit() {
    this.pendingFit = true
    this.applyPendingFit()
  }

  centerOn(id: string) {
    const s = this.scene
    const i = s ? s.index.get(id) : undefined
    if (!s || i === undefined) return
    const tx = this.tween ? this.tween.tx[i] : s.x[i]
    const ty = this.tween ? this.tween.ty[i] : s.y[i]
    const k = clampZoom(Math.max(this.view.k, 1.2))
    this.userMoved = true
    this.moveView({ k, x: this.w / 2 - tx * k, y: this.h / 2 - ty * k })
  }

  /** Index of the node under a CSS-pixel point relative to the canvas, or -1. */
  hitAt(sx: number, sy: number): number {
    if (!this.scene || !this.grid || this.tween) return -1
    return hitTest(this.scene, this.grid, this.view, sx, sy)
  }

  // ── Sizing and fitting ─────────────────────────────────────────────────────

  private measure() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    if (w === this.w && h === this.h && dpr === this.dpr) return
    const first = this.w === 0
    this.w = w
    this.h = h
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(w * dpr))
    this.canvas.height = Math.max(1, Math.round(h * dpr))
    if (this.scene && w > 0 && (first || !this.userMoved)) {
      this.pendingFit = true
      this.snapNextFit = !first
    }
    this.applyPendingFit()
    this.schedule()
  }

  private applyPendingFit() {
    const s = this.scene
    if (!this.pendingFit || !s || this.w <= 0 || this.h <= 0) return
    this.pendingFit = false
    this.userMoved = false
    const x = this.tween ? this.tween.tx : s.x
    const y = this.tween ? this.tween.ty : s.y
    const snap = this.snapNextFit
    this.snapNextFit = false
    this.moveView(fitView(x, y, this.w, this.h), snap)
  }

  private moveView(to: View, snap = false) {
    if (snap || reducedMotion() || this.w === 0 || !this.scene || !this.viewReady) {
      this.view = to
      this.viewTween = null
      this.viewReady = this.w > 0
    } else {
      this.viewTween = { t0: performance.now(), from: { ...this.view }, to }
    }
    this.schedule()
  }

  // ── Frame loop ─────────────────────────────────────────────────────────────

  private schedule() {
    if (this.destroyed || this.raf) return
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (this.destroyed) return
    let animating = false
    const s = this.scene
    if (this.tween && s) {
      const t = (now - this.tween.t0) / TWEEN_MS
      const e = easeOut(t)
      const { fx, fy, tx, ty } = this.tween
      for (let i = 0; i < s.n; i++) {
        s.x[i] = fx[i] + (tx[i] - fx[i]) * e
        s.y[i] = fy[i] + (ty[i] - fy[i]) * e
      }
      if (t >= 1) {
        s.x.set(tx)
        s.y.set(ty)
        this.tween = null
      } else animating = true
    }
    if (this.viewTween) {
      const t = (now - this.viewTween.t0) / VIEW_MS
      const e = easeOut(t)
      const { from, to } = this.viewTween
      this.view = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        k: from.k + (to.k - from.k) * e,
      }
      if (t >= 1) {
        this.view = to
        this.viewTween = null
      } else animating = true
    }
    this.draw()
    if (animating) this.schedule()
  }

  private draw() {
    const ctx = this.ctx
    const s = this.scene
    if (!ctx || !s || !this.palette || this.w === 0) return
    const t0 = performance.now()
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    drawGraph(ctx, s, this.view, this.palette, {
      w: this.w,
      h: this.h,
      hover: this.highlight >= 0 ? this.highlight : this.hover,
      active: this.active,
    })
    this.lastFrameMs = performance.now() - t0
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  private setHover(i: number) {
    if (i === this.hover) return
    this.hover = i
    this.canvas.style.cursor = i >= 0 ? "pointer" : "grab"
    this.cb.onHover?.(i >= 0 && this.scene ? this.scene.ids[i] : null)
    this.schedule()
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    this.drag = { sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, moved: false }
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events have no active pointer */
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag
    if (d) {
      const dx = e.clientX - d.sx
      const dy = e.clientY - d.sy
      if (!d.moved && Math.hypot(dx, dy) < 4) return
      if (!d.moved) {
        d.moved = true
        this.canvas.style.cursor = "grabbing"
        this.viewTween = null
        this.setHover(-1)
      }
      this.userMoved = true
      this.view = { ...this.view, x: d.vx + dx, y: d.vy + dy }
      this.schedule()
      return
    }
    const [sx, sy] = this.local(e)
    this.setHover(this.hitAt(sx, sy))
  }

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag
    this.drag = null
    try {
      this.canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* not captured */
    }
    if (!d) return
    if (d.moved) {
      this.canvas.style.cursor = "grab"
      return
    }
    const [sx, sy] = this.local(e)
    const i = this.hitAt(sx, sy)
    if (i >= 0 && this.scene) this.cb.onOpen(this.scene.ids[i])
  }

  private onPointerCancel = () => {
    this.drag = null
    this.canvas.style.cursor = "grab"
  }

  private onPointerLeave = () => {
    if (!this.drag) this.setHover(-1)
  }

  private onDblClick = (e: MouseEvent) => {
    const [sx, sy] = this.local(e)
    const i = this.hitAt(sx, sy)
    if (i >= 0 && this.scene) this.centerOn(this.scene.ids[i])
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    // ctrl+wheel is how browsers report a touchpad pinch; its deltas are small.
    const unit = e.deltaMode === 1 ? 16 : 1
    const speed = e.ctrlKey ? 0.012 : 0.0016
    const factor = Math.exp(-e.deltaY * unit * speed)
    const [sx, sy] = this.local(e)
    this.viewTween = null
    this.userMoved = true
    this.view = zoomAt(this.view, factor, sx, sy)
    this.schedule()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const cx = this.w / 2
    const cy = this.h / 2
    const pan = 48
    let handled = true
    switch (e.key) {
      case "+":
      case "=":
        this.view = zoomAt(this.view, 1.25, cx, cy)
        break
      case "-":
      case "_":
        this.view = zoomAt(this.view, 0.8, cx, cy)
        break
      case "0":
        this.requestFit()
        break
      case "ArrowLeft":
        this.view = { ...this.view, x: this.view.x + pan }
        break
      case "ArrowRight":
        this.view = { ...this.view, x: this.view.x - pan }
        break
      case "ArrowUp":
        this.view = { ...this.view, y: this.view.y + pan }
        break
      case "ArrowDown":
        this.view = { ...this.view, y: this.view.y - pan }
        break
      case "Enter":
        if (this.activeId) this.cb.onOpen(this.activeId)
        break
      default:
        handled = false
    }
    if (handled) {
      e.preventDefault()
      if (e.key !== "0" && e.key !== "Enter") {
        this.viewTween = null
        this.userMoved = true
      }
      this.schedule()
    }
  }
}
