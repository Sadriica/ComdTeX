import { describe, it, expect } from "vitest"
import { STORAGE_KEYS } from "./storageKeys"

describe("storageKeys", () => {
  it("has no two semantic names mapping to the same string value", () => {
    const entries = Object.entries(STORAGE_KEYS)
    const seen = new Map<string, string>()
    for (const [name, value] of entries) {
      const clashing = seen.get(value)
      expect(
        clashing,
        `Key value "${value}" is used by both "${clashing}" and "${name}" — ` +
          `this collision is exactly what storageKeys.ts exists to prevent.`,
      ).toBeUndefined()
      seen.set(value, name)
    }
  })

  it("matches the frozen snapshot of on-disk key values (a value change here orphans real user data)", () => {
    expect(STORAGE_KEYS).toEqual({
      VAULT_PATH: "comdtex_vault",
      TABS: "comdtex_tabs",
      TABS_ACTIVE: "comdtex_active",
      DRAFTS: "comdtex_drafts",
      RECENT_VAULTS: "comdtex_recent_vaults",
      CLOSED_TABS: "comdtex_closed_tabs",
      RECENT_FILES: "comdtex_recent",
      BOOKMARKS: "comdtex_bookmarks",
      CURSOR_POSITIONS: "comdtex_cursor_positions",
      DEPS_DISMISSED: "comdtex_deps_dismissed",
      CLOUD_BANNER_DISMISSED: "comdtex_cloud_banner_dismissed",
      WINDOW_STATE: "comdtex_window_state",
      ONBOARDING_SEEN: "comdtex_onboarding_seen",
      SETTINGS: "comdtex_settings",
      AI_CONVERSATIONS: "comdtex_ai_conversations",
      AI_ACTIVE_CONVERSATION: "comdtex_ai_active",
      AI_INPUT_DRAFT: "comdtex_ai_input",
      CUSTOM_TEMPLATES: "comdtex.customTemplates",
    })
  })

  it("does not overlap the secretStore.ts fallback namespace prefix (comdtex_secret_)", () => {
    for (const value of Object.values(STORAGE_KEYS)) {
      expect(value.startsWith("comdtex_secret_")).toBe(false)
    }
  })
})
