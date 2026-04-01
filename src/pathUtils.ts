/**
 * Cross-platform path utilities.
 * Async versions use @tauri-apps/api/path (IPC).
 * Sync displayBasename is safe for display-only (handles / and \).
 */
import { join, basename, dirname } from "@tauri-apps/api/path"

export { join as pathJoin, basename as pathBasename, dirname as pathDirname }

/** Display-only: extracts the last segment of a path, handling both / and \ */
export function displayBasename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}
