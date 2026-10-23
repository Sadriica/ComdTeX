// Incremental, non-blocking vault label scan.
//
// The per-file regex scan (`scanFileLabels`) is pure and lives in
// structuralLabels.ts. This module adds:
//   - a per-path cache, so only files whose content changed are rescanned;
//   - sequence numbers, so a result that is no longer the latest request is
//     dropped instead of overwriting newer state;
//   - a pluggable backend: a Web Worker when available, otherwise the same
//     scan run synchronously (vitest, jsdom, restricted webviews).

import {
  buildLabelIndex,
  scanFileLabels,
  type FileLabelScan,
  type StructuralLabelIndex,
} from "./structuralLabels"

export interface LabelScanFile {
  path: string
  name: string
  content: string
}

/** Scans a batch of files; may be asynchronous (worker) or immediate. */
export type LabelScanBackend = (files: LabelScanFile[]) => Promise<FileLabelScan[]>

export const syncLabelBackend: LabelScanBackend = (files) =>
  Promise.resolve(files.map(scanFileLabels))

interface CacheEntry {
  name: string
  content: string
  scan: FileLabelScan
}

export class LabelScanner {
  private cache = new Map<string, CacheEntry>()
  private seq = 0
  /** Number of files sent to the backend by the most recent `update` call. */
  lastScannedCount = 0

  constructor(private backend: LabelScanBackend = syncLabelBackend) {}

  /**
   * Scan `files`, rescanning only those whose name or content differ from the
   * cached copy. Resolves with the index, or null when a newer `update` call
   * started before this one finished (its result is stale and must be ignored).
   */
  async update(files: LabelScanFile[]): Promise<StructuralLabelIndex | null> {
    const mySeq = ++this.seq
    const changed = files.filter((file) => {
      const hit = this.cache.get(file.path)
      return !hit || hit.name !== file.name || hit.content !== file.content
    })
    this.lastScannedCount = changed.length
    const scans = changed.length > 0 ? await this.backend(changed) : []
    if (mySeq !== this.seq) return null

    changed.forEach((file, i) => {
      this.cache.set(file.path, { name: file.name, content: file.content, scan: scans[i] })
    })
    const live = new Set(files.map((file) => file.path))
    for (const path of [...this.cache.keys()]) if (!live.has(path)) this.cache.delete(path)

    return buildLabelIndex(files.map((file) => this.cache.get(file.path)!.scan))
  }

  /** Invalidate in-flight updates (e.g. on unmount). */
  cancel() {
    this.seq++
  }
}

// ── Worker backend ───────────────────────────────────────────────────────────

export interface LabelWorkerRequest {
  id: number
  files: LabelScanFile[]
}
export interface LabelWorkerResponse {
  id: number
  scans: FileLabelScan[]
}

/** Wrap a Worker as a backend. Falls back to the sync scan if the worker errors. */
export function createWorkerBackend(worker: Worker): LabelScanBackend {
  let nextId = 1
  const pending = new Map<
    number,
    { resolve: (s: FileLabelScan[]) => void; files: LabelScanFile[] }
  >()
  worker.onmessage = (event: MessageEvent<LabelWorkerResponse>) => {
    const entry = pending.get(event.data.id)
    if (!entry) return
    pending.delete(event.data.id)
    entry.resolve(event.data.scans)
  }
  worker.onerror = () => {
    for (const [id, entry] of [...pending]) {
      pending.delete(id)
      entry.resolve(entry.files.map(scanFileLabels))
    }
  }
  return (files) =>
    new Promise((resolve) => {
      const id = nextId++
      pending.set(id, { resolve, files })
      try {
        worker.postMessage({ id, files } satisfies LabelWorkerRequest)
      } catch {
        pending.delete(id)
        resolve(files.map(scanFileLabels))
      }
    })
}

/** Create the default backend: a module worker when supported, else sync. */
export function createDefaultLabelBackend(): LabelScanBackend {
  if (typeof Worker === "undefined") return syncLabelBackend
  try {
    const worker = new Worker(new URL("./labelScan.worker.ts", import.meta.url), { type: "module" })
    return createWorkerBackend(worker)
  } catch {
    return syncLabelBackend
  }
}
