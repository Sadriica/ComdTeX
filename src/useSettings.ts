import type { Lang } from "./i18n"
import { STORAGE_KEYS } from "./storageKeys"

export interface Settings {
  fontSize: number
  previewFontSize: number
  autoSaveMs: number
  theme: "vs-dark" | "vs" | "hc-black"
  vimMode: boolean
  typewriterMode: boolean
  previewVisible: boolean
  language: Lang
  wordGoal: number  // 0 = no goal
  touchpadGestures: boolean
  previewTheme: "dark" | "light" | "same"
  mathPreview: boolean
  wordWrap: boolean
  minimapEnabled: boolean
  spellcheck: boolean
  syncScroll: boolean
  dailyNotesEnabled: boolean
  dailyNotesFolder: string
  dailyNotesTemplate: string
  autoRebuildPdf: boolean
  /**
   * If true, PDF compilation tries the bundled WASM LaTeX engine before
   * falling back to a locally-installed `tectonic` / `xelatex` / `pdflatex`.
   * Falls back automatically if the WASM engine is unavailable in the build.
   */
  useWasmTex: boolean
  /**
   * TeX package server the WASM engine downloads missing `.sty`/`.cls`/font
   * files from (SwiftLaTeX texlive-server layout). The default public server
   * has a history of outages — this lets users point at a mirror.
   */
  texliveUrl: string
  /** Focus & Writing Session (Pomodoro) durations, in minutes. */
  pomodoroWorkMin: number
  pomodoroBreakMin: number
  pomodoroLongBreakMin: number
  /** A long break replaces the short break after this many completed work cycles. */
  pomodoroCyclesBeforeLongBreak: number

  // ── AI assistant (BYO key, optional) ───────────────────────────────────────
  /** Master switch. When false ComdTeX is 100% offline — no AI network at all. */
  aiEnabled: boolean
  /** Provider preset id: "anthropic" | "openai" | "gemini" | "openai-compatible" | "cli". */
  aiProviderId: string
  /** Base URL for the openai-compatible preset (DeepSeek, Ollama, LM Studio…). */
  aiBaseUrl: string
  /** Model id (e.g. "claude-3-5-sonnet-latest", "gpt-4o-mini", "gemini-1.5-flash"). */
  aiModel: string
  /**
   * API key. Kept in memory here for backwards-compatible consumer access,
   * but persisted in the OS keychain (via `secretStore.ts`) rather than in
   * the `comdtex_settings` localStorage blob — see `useSettings()` below.
   */
  aiApiKey: string
  /** Command line for the local agent CLI bridge (e.g. "opencode run" or "claude -p"). */
  aiCliCommand: string
  /** Send a tiny preflight request when the chat opens to warm up the connection
   *  / CLI process, so the first real message feels faster. Only fires when AI is
   *  enabled and configured. */
  aiWarmupEnabled: boolean

  // ── Cloud sync (BYO cloud, Option A) ───────────────────────────────────────
  /** Show the cloud-sync banner/hints (e.g. "move vault into synced folder"). */
  /** Words per minute used for the status-bar reading-time estimate. */
  readingWpm: number
  /** Collapse `:::excalidraw` blocks the first time a file is opened. */
  autoFoldExcalidraw: boolean
  /** Continue lists, task items, quotes and table rows when pressing Enter. */
  listContinuation: boolean
  cloudSyncBannerEnabled: boolean
  /** Detect cloud-sync conflict copies + show the sync StatusBar indicator. */
  cloudSyncDetectEnabled: boolean
}

/**
 * Factory defaults. Exported so tests can build a valid `Settings` by spreading
 * these and overriding what they care about — a hand-written literal has to be
 * updated every time a setting is added, which is churn with no coverage value.
 */
export const DEFAULTS: Settings = {
  fontSize: 15,
  previewFontSize: 15,
  autoSaveMs: 800,
  theme: "vs-dark",
  vimMode: false,
  typewriterMode: false,
  previewVisible: true,
  language: "es",
  wordGoal: 0,
  touchpadGestures: true,
  previewTheme: "same",
  mathPreview: true,
  wordWrap: true,
  minimapEnabled: false,
  spellcheck: false,
  syncScroll: true,
  dailyNotesEnabled: true,
  dailyNotesFolder: "daily",
  dailyNotesTemplate: "# {{date:YYYY-MM-DD}}\n\n## Tasks\n\n- [ ] \n\n## Notes\n\n",
  autoRebuildPdf: false,
  useWasmTex: true,
  texliveUrl: "https://texlive2.swiftlatex.com/",
  pomodoroWorkMin: 25,
  pomodoroBreakMin: 5,
  pomodoroLongBreakMin: 15,
  pomodoroCyclesBeforeLongBreak: 4,
  aiEnabled: false,
  aiProviderId: "anthropic",
  aiBaseUrl: "",
  aiModel: "",
  aiApiKey: "",
  aiCliCommand: "",
  aiWarmupEnabled: true,
  readingWpm: 200,
  autoFoldExcalidraw: true,
  listContinuation: true,
  cloudSyncBannerEnabled: true,
  cloudSyncDetectEnabled: true,
}

const KEY = STORAGE_KEYS.SETTINGS
const AI_API_KEY_SECRET = "aiApiKey"

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    localStorage.removeItem(KEY)
    return DEFAULTS
  }
}

/**
 * `aiApiKey` must never be written to the `comdtex_settings` localStorage
 * blob — it is persisted separately via the OS keychain (`secretStore.ts`).
 * This strips it before every `localStorage.setItem(KEY, ...)` call.
 */
function withoutApiKey(settings: Settings): Omit<Settings, "aiApiKey"> {
  const { aiApiKey: _aiApiKey, ...rest } = settings
  return rest
}

import { useState, useCallback, useEffect, useRef } from "react"
import { getSecret, setSecret } from "./secretStore"

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)
  const hydrated = useRef(false)

  // One-time migration + async rehydration on mount: move any legacy
  // plaintext `aiApiKey` (from older builds that persisted it in
  // localStorage) into the keychain, strip it from the settings JSON, and
  // load whatever key is currently in the keychain (or the localStorage
  // fallback inside secretStore.ts) into in-memory state.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const raw = localStorage.getItem(KEY)
      let legacyKey = ""
      try {
        legacyKey = raw ? (JSON.parse(raw).aiApiKey ?? "") : ""
      } catch {
        legacyKey = ""
      }

      if (legacyKey) {
        await setSecret(AI_API_KEY_SECRET, legacyKey)
      }

      // Always strip aiApiKey from the persisted blob, whether or not it
      // was present (defends against future accidental writes too).
      try {
        const current = localStorage.getItem(KEY)
        if (current) {
          const parsed = JSON.parse(current)
          if ("aiApiKey" in parsed) {
            delete parsed.aiApiKey
            localStorage.setItem(KEY, JSON.stringify(parsed))
          }
        }
      } catch {
        // ignore — non-fatal
      }

      const keychainKey = legacyKey || (await getSecret(AI_API_KEY_SECRET)) || ""

      hydrated.current = true
      if (!cancelled && keychainKey) {
        setSettings((prev) => ({ ...prev, aiApiKey: keychainKey }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      localStorage.setItem(KEY, JSON.stringify(withoutApiKey(next)))

      if (Object.prototype.hasOwnProperty.call(partial, "aiApiKey") && hydrated.current) {
        // Fire-and-forget: mirror the new key to the OS keychain. Errors
        // are handled inside secretStore.ts (falls back to localStorage).
        void setSecret(AI_API_KEY_SECRET, next.aiApiKey)
      }

      return next
    })
  }, [])

  return { settings, update }
}
