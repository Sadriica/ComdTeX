/**
 * Whole-vault document sources for the panels that read every note (the
 * wikilink graph, the task list).
 *
 * Disk content comes from the shared `VaultSearchIndex` (mtime-gated, so an
 * unchanged file is never re-read); open tabs are layered on top so unsaved
 * edits always win over what is on disk.
 */
import { useEffect, useMemo, useState } from "react"
import type { SourceFile } from "./generators"
import type { SearchCandidate, VaultSearchIndex } from "./searchIndex"

/** Loads editor-format content of every vault text file, keyed by path. */
export type LoadDiskSources = (isCancelled: () => boolean) => Promise<Map<string, string>>

const DEFAULT_CONCURRENCY = 16

/**
 * Sync every candidate through the index (stat, then read only when the mtime
 * changed) and return path -> editor content. Unreadable files are skipped.
 * Insertion order follows `candidates`.
 */
export async function loadDiskSources(
  index: VaultSearchIndex,
  candidates: SearchCandidate[],
  opts: { isCancelled?: () => boolean; concurrency?: number } = {},
): Promise<Map<string, string>> {
  const results: (string | undefined)[] = new Array(candidates.length)
  const workers = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY)
  let next = 0
  const run = async () => {
    while (next < candidates.length) {
      if (opts.isCancelled?.()) return
      const i = next++
      const c = candidates[i]
      try {
        const mtime = await c.getMtime()
        if (mtime === undefined) continue
        const entry = await index.syncFile(c.path, mtime, c.readContent)
        results[i] = entry.content
      } catch {
        // unreadable or vanished: leave it out
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, candidates.length) }, run))
  const out = new Map<string, string>()
  candidates.forEach((c, i) => {
    const content = results[i]
    if (content !== undefined) out.set(c.path, content)
  })
  return out
}

/** Disk sources with open tabs on top: a tab's (possibly unsaved) text wins. */
export function mergeSources(
  disk: ReadonlyMap<string, string> | null,
  openTabs: readonly { path: string; content: string }[],
): SourceFile[] {
  const tabContent = new Map(openTabs.map((tab) => [tab.path, tab.content]))
  const out: SourceFile[] = []
  if (disk) {
    for (const [path, content] of disk) {
      out.push({ path, content: tabContent.get(path) ?? content })
    }
  }
  for (const tab of openTabs) {
    if (!disk || !disk.has(tab.path)) out.push({ path: tab.path, content: tab.content })
  }
  return out
}

/**
 * Lazily load the vault's disk sources and merge open tabs over them.
 *
 * Reloads (cheap: a stat per file, reads only for changed mtimes) when `load`
 * changes (the tree changed), when the SET of open tab paths changes (a closed
 * tab's saved text must come from disk now), or when `reloadKey` changes (a
 * write that bypassed the tabs). Typing never reloads: edits only change the
 * merge. The caller mounts this only while the panel is visible.
 */
export function useVaultSources(
  load: LoadDiskSources,
  openTabs: readonly { path: string; content: string }[],
  reloadKey = 0,
): { sources: SourceFile[]; loading: boolean } {
  const [disk, setDisk] = useState<Map<string, string> | null>(null)
  const pathsKey = openTabs.map((tab) => tab.path).join("\0")

  useEffect(() => {
    let cancelled = false
    load(() => cancelled)
      .then((m) => {
        if (!cancelled) setDisk(m)
      })
      .catch(() => {
        if (!cancelled) setDisk(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [load, pathsKey, reloadKey])

  const sources = useMemo(() => mergeSources(disk, openTabs), [disk, openTabs])
  return { sources, loading: disk === null }
}
