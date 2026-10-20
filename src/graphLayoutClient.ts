/**
 * Runs `layoutGraph` off the main thread. Same shape as `labelScanner.ts`: a
 * pluggable backend (module Web Worker, or the pure function on the calling
 * thread when Workers do not exist, as in vitest), and request ids so a slow
 * layout can never overwrite a newer one.
 */
import { layoutGraph, type LayoutRequest, type LayoutResult } from "./graphLayout"

export type LayoutBackend = (request: LayoutRequest) => Promise<LayoutResult>

export interface LayoutWorkerRequest {
  id: number
  request: LayoutRequest
}
export interface LayoutWorkerResponse {
  id: number
  result: LayoutResult
}

export const syncLayoutBackend: LayoutBackend = (request) =>
  new Promise((resolve) => resolve(layoutGraph(request)))

/** Wrap a Worker as a backend. Falls back to the sync layout if the worker errors. */
export function createLayoutWorkerBackend(worker: Worker): LayoutBackend {
  let seq = 0
  const pending = new Map<number, { resolve: (r: LayoutResult) => void; request: LayoutRequest }>()
  worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
    const entry = pending.get(event.data.id)
    if (!entry) return
    pending.delete(event.data.id)
    entry.resolve(event.data.result)
  }
  worker.onerror = () => {
    const stuck = [...pending.values()]
    pending.clear()
    for (const p of stuck) p.resolve(layoutGraph(p.request))
  }
  return (request) =>
    new Promise((resolve) => {
      const id = ++seq
      pending.set(id, { resolve, request })
      try {
        // The request is structured-cloned; the caller keeps its arrays.
        worker.postMessage({ id, request } satisfies LayoutWorkerRequest)
      } catch {
        pending.delete(id)
        resolve(layoutGraph(request))
      }
    })
}

export function createDefaultLayoutBackend(): LayoutBackend {
  if (typeof Worker === "undefined") return syncLayoutBackend
  try {
    const worker = new Worker(new URL("./graphLayout.worker.ts", import.meta.url), {
      type: "module",
    })
    return createLayoutWorkerBackend(worker)
  } catch {
    return syncLayoutBackend
  }
}

let defaultBackend: LayoutBackend | null = null

/** One shared worker for the app; created on first use. */
export function getLayoutBackend(): LayoutBackend {
  if (!defaultBackend) defaultBackend = createDefaultLayoutBackend()
  return defaultBackend
}

/**
 * Latest-wins layout runner: `run` resolves with the result, or null when a
 * newer request superseded it.
 */
export class LayoutRunner {
  private seq = 0
  constructor(private backend: LayoutBackend = getLayoutBackend()) {}
  async run(request: LayoutRequest): Promise<LayoutResult | null> {
    const mine = ++this.seq
    const result = await this.backend(request)
    return mine === this.seq ? result : null
  }
  cancel() {
    this.seq++
  }
}
