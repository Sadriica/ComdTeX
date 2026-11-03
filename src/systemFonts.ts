import { invoke } from "@tauri-apps/api/core"
import type { SystemFont } from "./fontChoices"

let cache: Promise<SystemFont[]> | null = null

/**
 * Fonts installed on the system, via the `list_system_fonts` Tauri command.
 * Scanned once and cached for the session. Outside Tauri (browser, e2e) or on
 * any failure it resolves to an empty list, so pickers show curated fonts only.
 */
export function loadSystemFonts(): Promise<SystemFont[]> {
  if (!cache) {
    cache = (async () => {
      try {
        const list = await invoke<SystemFont[]>("list_system_fonts")
        return Array.isArray(list) ? list.filter((f) => f && typeof f.name === "string") : []
      } catch {
        return []
      }
    })()
  }
  return cache
}

/** Test hook: forget the cached scan. */
export function resetSystemFontsCache(): void {
  cache = null
}
