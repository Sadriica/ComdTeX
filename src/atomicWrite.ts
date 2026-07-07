/**
 * Atomic text-file writes.
 *
 * `writeTextFile` from `@tauri-apps/plugin-fs` truncates-then-writes the
 * target path directly — a crash or power loss mid-write can leave the
 * user's real file empty or half-written. This module instead writes to a
 * throwaway temp file in the SAME directory, then atomically renames it
 * onto the target path. `rename` (a filesystem move) either fully succeeds
 * or fully fails — there is no in-between truncated state visible at the
 * target path.
 *
 * The temp file's basename is dot-prefixed (`.name.tmp-xxxxxx`) so it reads
 * as a hidden file — `buildTree()` in useVault.ts already filters out any
 * entry whose name starts with "." (see `entry.name.startsWith(".")`), so a
 * stray temp file cannot show up in the FileTree even if a refresh races
 * with the write.
 */
import { writeTextFile, rename, remove } from "@tauri-apps/plugin-fs"
import { pathDirname, pathBasename, pathJoin } from "./pathUtils"

/** Short random suffix for the temp filename — collision-safe enough for a single-user desktop app. */
export function randomSuffix(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Build the hidden temp-file basename for `basename` (the target file's own
 * basename, e.g. "note.md"). Pure/pathless so it's unit-testable without the
 * Tauri fs/path IPC. Dot-prefixed so `buildTree()` in useVault.ts (which
 * skips any entry whose name starts with ".") never surfaces it in the tree.
 */
export function tempFileNameFor(basename: string, suffix: string = randomSuffix()): string {
  return `.${basename}.tmp-${suffix}`
}

/**
 * Write `content` to `path` atomically: write to a hidden temp file in the
 * same directory, then rename it onto `path`. On rename failure the temp
 * file is best-effort removed and the original error is rethrown.
 */
export async function writeTextFileAtomic(path: string, content: string): Promise<void> {
  const dir = pathDirname(path)
  const base = pathBasename(path)
  const tmpName = tempFileNameFor(base)
  const tmpPath = dir ? await pathJoin(dir, tmpName) : tmpName

  await writeTextFile(tmpPath, content)
  try {
    await rename(tmpPath, path)
  } catch (e) {
    try { await remove(tmpPath) } catch { /* best-effort cleanup */ }
    throw e
  }
}
