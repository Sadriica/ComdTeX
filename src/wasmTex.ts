// WASM LaTeX engine front-end.
//
// This module exposes a WasmTexEngine class that runs a SwiftLaTeX-style
// engine inside a dedicated Web Worker so that compilation does not block
// the UI. The engine is OPTIONAL: if the runtime artefacts (the engine JS
// glue + WASM binary) are not bundled with the build, the worker reports
// `status: "unavailable"` and callers fall back to local LaTeX.
//
// The runtime artefacts are expected at:
//   /wasm-tex/swiftlatexpdftex.js
//   /wasm-tex/swiftlatexpdftex.wasm    (loaded by the JS glue)
//
// To bundle them, drop them into `public/wasm-tex/` (the Vite static
// directory). The current source tree intentionally does NOT ship the
// binaries — they are large and license-tracked separately.
//
// Public protocol (kept stable so the worker can be swapped):
//   in : { type: "init",    engineUrl?: string }
//        { type: "compile", id: string, tex: string,
//                            mainFile?: string, files?: Record<string, string> }
//        { type: "dispose" }
//   out: { type: "ready" }
//        { type: "progress", id: string, message: string }
//        { type: "result",   id: string, status: "ok" | "error" | "unavailable",
//                            pdf: Uint8Array | null, log: string }
//
// The compile call identifier is used to correlate concurrent requests.

export type WasmTexStatus = "ok" | "error" | "unavailable"

export interface WasmTexResult {
  pdf: Uint8Array | null
  log: string
  status: WasmTexStatus
}

export interface WasmTexCompileOptions {
  /** Logical name of the main TeX file inside the engine memfs. */
  mainFile?: string
  /** Auxiliary files to inject into the engine memfs (path → text content). */
  extraFiles?: Record<string, string>
  /** Receives human-readable progress strings ("loading amsmath", …). */
  onProgress?: (message: string) => void
  /** Abort signal — terminates the worker and rejects with status "error". */
  signal?: AbortSignal
}

export interface WasmTexInitOptions {
  /**
   * Override the URL of the engine glue script. Defaults to
   * "/wasm-tex/swiftlatexpdftex.js". The worker tries to fetch this URL and
   * reports `unavailable` if it 404s. Callers may pass `null` to force the
   * stub path (used for tests).
   */
  engineUrl?: string | null
}

interface PendingCompile {
  resolve: (r: WasmTexResult) => void
  reject: (e: Error) => void
  onProgress?: (message: string) => void
}

/**
 * Construct the worker. Exposed as a swappable factory so tests can inject a
 * mock without spinning up a real Worker. Vite's `new Worker(new URL(..),
 * { type: "module" })` form is required to get a properly bundled module
 * worker.
 */
export type WorkerFactory = () => Worker

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL("./wasmTex.worker.ts", import.meta.url), { type: "module" })

export class WasmTexEngine {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private pending = new Map<string, PendingCompile>()
  private nextId = 1
  private disposed = false

  constructor(private readonly workerFactory: WorkerFactory = defaultWorkerFactory) {}

  /**
   * Boot the engine. Resolves once the worker has signalled readiness.
   * Subsequent calls reuse the same worker instance.
   */
  init(opts: WasmTexInitOptions = {}): Promise<void> {
    if (this.disposed) throw new Error("WasmTexEngine: already disposed")
    if (this.ready) return this.ready
    const worker = this.workerFactory()
    this.worker = worker

    this.ready = new Promise<void>((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        const data = ev.data as { type?: string }
        if (!data || typeof data !== "object") return
        if (data.type === "ready") {
          resolve()
          return
        }
        if (data.type === "init_error") {
          reject(new Error(((data as { error?: string }).error) || "engine init failed"))
          return
        }
      }
      worker.addEventListener("message", onMessage)
      worker.addEventListener("error", (e: ErrorEvent | Event) => {
        const msg = (e as ErrorEvent).message ?? "worker error"
        reject(new Error(msg))
      })
      worker.postMessage({
        type: "init",
        engineUrl: opts.engineUrl === undefined ? "/wasm-tex/swiftlatexpdftex.js" : opts.engineUrl,
      })
    })

    // Listen for compile results on the same worker, regardless of init outcome.
    worker.addEventListener("message", (ev) => this.dispatch(ev))

    return this.ready
  }

  /**
   * Compile a `.tex` source. Returns `{ pdf, log, status }`. If the engine is
   * unavailable, `status === "unavailable"` and `pdf === null`.
   */
  compile(tex: string, opts: WasmTexCompileOptions = {}): Promise<WasmTexResult> {
    if (this.disposed) throw new Error("WasmTexEngine: already disposed")
    if (!this.worker || !this.ready) {
      throw new Error("WasmTexEngine: init() must be called before compile()")
    }
    const worker = this.worker

    const id = String(this.nextId++)
    return new Promise<WasmTexResult>((resolve, reject) => {
      const onAbort = () => {
        const pending = this.pending.get(id)
        if (pending) {
          this.pending.delete(id)
          pending.reject(new Error("aborted"))
        }
      }
      if (opts.signal) {
        if (opts.signal.aborted) {
          reject(new Error("aborted"))
          return
        }
        opts.signal.addEventListener("abort", onAbort, { once: true })
      }
      this.pending.set(id, {
        resolve: (r) => {
          if (opts.signal) opts.signal.removeEventListener("abort", onAbort)
          resolve(r)
        },
        reject: (e) => {
          if (opts.signal) opts.signal.removeEventListener("abort", onAbort)
          reject(e)
        },
        onProgress: opts.onProgress,
      })

      worker.postMessage({
        type: "compile",
        id,
        tex,
        mainFile: opts.mainFile ?? "main.tex",
        files: opts.extraFiles ?? {},
      })
    })
  }

  /** Tear down the worker. Pending compiles are rejected. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const [, p] of this.pending) p.reject(new Error("disposed"))
    this.pending.clear()
    try { this.worker?.terminate() } catch { /* ignore */ }
    this.worker = null
    this.ready = null
  }

  private dispatch(ev: MessageEvent) {
    const data = ev.data as { type?: string; id?: string }
    if (!data || typeof data !== "object") return
    if (data.type === "progress" && typeof data.id === "string") {
      const pending = this.pending.get(data.id)
      pending?.onProgress?.(((data as { message?: string }).message) || "")
      return
    }
    if (data.type === "result" && typeof data.id === "string") {
      const pending = this.pending.get(data.id)
      if (!pending) return
      this.pending.delete(data.id)
      const payload = data as unknown as {
        status: WasmTexStatus
        pdf: Uint8Array | ArrayBuffer | null
        log: string
      }
      const pdf = payload.pdf == null
        ? null
        : payload.pdf instanceof Uint8Array
          ? payload.pdf
          : new Uint8Array(payload.pdf as ArrayBuffer)
      pending.resolve({ status: payload.status, pdf, log: payload.log ?? "" })
    }
  }
}

// ── Singleton helper ─────────────────────────────────────────────────────────

let shared: WasmTexEngine | null = null

/**
 * Lazily construct a process-wide WasmTexEngine. Most callers only need one
 * engine instance and pay the boot cost once per session.
 */
export function getSharedWasmTexEngine(opts: WasmTexInitOptions = {}): {
  engine: WasmTexEngine
  ready: Promise<void>
} {
  if (!shared) shared = new WasmTexEngine()
  // init() is idempotent — returns the cached promise on subsequent calls.
  const ready = shared.init(opts)
  return { engine: shared, ready }
}

/** For tests. */
export function _resetSharedEngine() {
  if (shared) {
    try { shared.dispose() } catch { /* ignore */ }
  }
  shared = null
}
