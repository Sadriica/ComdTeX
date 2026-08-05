/**
 * Atomic text-file writes.
 *
 * `writeTextFile` from `@tauri-apps/plugin-fs` truncates-then-writes the
 * target path directly: a crash or power loss mid-write can leave the
 * user's real file empty or half-written. This module instead writes to a
 * throwaway temp file in the SAME directory, then atomically renames it
 * onto the target path. `rename` (a filesystem move) either fully succeeds
 * or fully fails; there is no in-between truncated state visible at the
 * target path.
 *
 * The temp file's basename must NOT begin with a ".": Tauri's fs scope
 * matches paths with glob's `require_literal_leading_dot`, which defaults to
 * `true` on Unix (see tauri-plugin-fs `commands.rs`: `.unwrap_or(cfg!(unix))`).
 * Under that option the `<vault>/**` pattern that `allow_vault_dir` installs
 * does NOT match a component with a leading dot, so a dot-prefixed temp file
 * is rejected with "forbidden path" and every save fails on Linux. Temp names
 * are therefore `name.tmp-xxxxxx`, and `buildTree()` in useVault.ts hides them
 * by matching TEMP_FILE_RE instead of relying on the dotfile filter.
 */
import { writeTextFile, rename, remove } from "@tauri-apps/plugin-fs"
import { pathDirname, pathBasename, pathJoin } from "./pathUtils"

/** Short random suffix for the temp filename: collision-safe enough for a single-user desktop app. */
export function randomSuffix(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Matches a temp file produced by `tempFileNameFor`. `buildTree()` in
 * useVault.ts uses this to keep temp files out of the FileTree when a refresh
 * races with a write.
 */
export const TEMP_FILE_RE = /\.tmp-[0-9a-f]{12}$/

/**
 * Build the temp-file basename for `basename` (the target file's own basename,
 * e.g. "note.md"). Pure/pathless so it's unit-testable without the Tauri
 * fs/path IPC.
 *
 * Any leading dots are stripped: `.comdtex-comments.json` would otherwise
 * yield a temp name that still starts with "." and gets rejected by the fs
 * scope (see the module docblock).
 */
export function tempFileNameFor(basename: string, suffix: string = randomSuffix()): string {
  return `${basename.replace(/^\.+/, "")}.tmp-${suffix}`
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
