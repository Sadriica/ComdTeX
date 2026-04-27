/**
 * Cross-platform path utilities.
 *
 * `pathJoin` is async and uses @tauri-apps/api/path (IPC) so the platform
 * decides the correct separator. `pathBasename` and `pathDirname` are
 * synchronous string helpers that handle both `/` and `\` so they can be
 * used safely in render code, components, and pure utility paths without
 * crossing the IPC boundary.
 *
 * `displayBasename` is kept as a thin alias of `pathBasename` for readability
 * at call sites where the value is shown to the user.
 */
import { join } from "@tauri-apps/api/path"

export { join as pathJoin }

/**
 * Return the last segment of a path. Handles both `/` and `\` separators.
 *
 *   pathBasename("a/b/c.md")    → "c.md"
 *   pathBasename("a\\b\\c.md")  → "c.md"
 *   pathBasename("c.md")        → "c.md"
 *   pathBasename("")            → ""
 */
export function pathBasename(path: string): string {
  if (!path) return ""
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts.length === 0 ? path : parts[parts.length - 1]
}

/**
 * Return everything before the last separator. Handles both `/` and `\`.
 * Returns "" if the path has no separator.
 *
 *   pathDirname("a/b/c.md")    → "a/b"
 *   pathDirname("a\\b\\c.md")  → "a\\b"
 *   pathDirname("c.md")        → ""
 */
export function pathDirname(path: string): string {
  if (!path) return ""
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  if (idx < 0) return ""
  return path.slice(0, idx)
}

/** Display-only alias of `pathBasename`. */
export const displayBasename = pathBasename
