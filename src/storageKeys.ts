/**
 * Single source of truth for every `localStorage` (and `sessionStorage`) key
 * ComdTeX uses. Values here are exact string literals already persisted on
 * disk in users' browsers/webviews — DO NOT change any value, only the
 * semantic name on the left. Changing a value orphans existing user data
 * (the app would silently stop finding it under the old key).
 *
 * Historical bug this file fixes: two pairs of *different* modules each
 * declared a local `const XXX_KEY = "..."` with the **same identifier** but
 * **different string values** (`RECENT_KEY` in `App.tsx` vs `useVault.ts`,
 * `ACTIVE_KEY` in `useVault.ts` vs `useAiSession.ts`). That's harmless today
 * only because each pair lived in separate module scopes, but it's a latent
 * foot-gun for anyone refactoring or extracting shared code. Naming every key
 * uniquely here removes the ambiguity.
 *
 * Note: `comdtex_secret_<name>` (a *dynamic*, prefixed namespace used by
 * `secretStore.ts` as a keychain fallback) is intentionally NOT modeled as a
 * fixed constant here — see `SECRET_FALLBACK_PREFIX` below for collision
 * documentation only. `secretStore.ts` itself is out of scope for this
 * refactor and keeps its own internal `FALLBACK_PREFIX` constant.
 */

export const STORAGE_KEYS = {
  // ── useVault.ts ──────────────────────────────────────────────────────────
  /** Absolute path of the currently open vault folder. Owner: useVault.ts */
  VAULT_PATH: "comdtex_vault",
  /** JSON array of open tab paths. Owner: useVault.ts */
  TABS: "comdtex_tabs",
  /** Path of the currently active tab. Owner: useVault.ts.
   *  NOT the same key as AI_ACTIVE_CONVERSATION below (historical collision:
   *  both were named `ACTIVE_KEY` in their respective files). */
  TABS_ACTIVE: "comdtex_active",
  /** JSON map of unsaved draft contents, keyed by path (crash recovery). Owner: useVault.ts */
  DRAFTS: "comdtex_drafts",
  /** JSON array of recently opened vault folder paths (max 5). Owner: useVault.ts.
   *  NOT the same key as RECENT_FILES below (historical collision: both were
   *  named `RECENT_KEY` in their respective files). */
  RECENT_VAULTS: "comdtex_recent_vaults",
  /** JSON array of recently closed tab paths, for reopen (max 20). Owner: useVault.ts */
  CLOSED_TABS: "comdtex_closed_tabs",

  // ── App.tsx ──────────────────────────────────────────────────────────────
  /** JSON array of recently opened file paths across the vault (max 10). Owner: App.tsx.
   *  See RECENT_VAULTS above for the historical name collision this resolves. */
  RECENT_FILES: "comdtex_recent",
  /** JSON map of bookmarked lines, keyed by an internal id. Owner: App.tsx */
  BOOKMARKS: "comdtex_bookmarks",
  /** JSON map of last cursor position per file path. Owner: App.tsx */
  CURSOR_POSITIONS: "comdtex_cursor_positions",
  /** JSON array of optional-dependency names the user dismissed the warning banner for. Owner: App.tsx */
  DEPS_DISMISSED: "comdtex_deps_dismissed",
  /** "1" once the user dismisses the "move vault into cloud folder" suggestion banner.
   *  Written/removed from BOTH App.tsx (dismiss) and SettingsModal.tsx (reset-hints
   *  action) — dual call sites are intentional (out of scope to consolidate ownership),
   *  but both now reference this single constant to remove value-drift risk. */
  CLOUD_BANNER_DISMISSED: "comdtex_cloud_banner_dismissed",
  /** JSON `{width,height,x,y,maximized}` snapshot of the last window geometry. Owner: App.tsx */
  WINDOW_STATE: "comdtex_window_state",
  /** "true" once the first-run onboarding tour has been shown/dismissed. Owner: App.tsx */
  ONBOARDING_SEEN: "comdtex_onboarding_seen",

  // ── useSettings.ts ───────────────────────────────────────────────────────
  /** JSON blob of all persisted app settings (never includes `aiApiKey` — see secretStore.ts). Owner: useSettings.ts */
  SETTINGS: "comdtex_settings",

  // ── useAiSession.ts ──────────────────────────────────────────────────────
  /** JSON array of saved AI chat conversations (capped at 50). Owner: useAiSession.ts */
  AI_CONVERSATIONS: "comdtex_ai_conversations",
  /** Id of the active AI conversation. Owner: useAiSession.ts.
   *  See TABS_ACTIVE above for the historical name collision this resolves. */
  AI_ACTIVE_CONVERSATION: "comdtex_ai_active",
  /** Draft AI chat input text. Stored in `sessionStorage` (not `localStorage`) —
   *  per-session only, intentionally not kept across app restarts. Owner: useAiSession.ts */
  AI_INPUT_DRAFT: "comdtex_ai_input",

  // ── templates.ts ─────────────────────────────────────────────────────────
  /** JSON array of user-created custom document templates. Owner: templates.ts */
  CUSTOM_TEMPLATES: "comdtex.customTemplates",
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
