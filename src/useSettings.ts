import type { Lang } from "./i18n"

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
   * API key. Stored in localStorage for the MVP.
   * TODO (phase 2): move to OS keychain (Tauri plugin) instead of localStorage.
   */
  aiApiKey: string
  /** Command line for the local agent CLI bridge (e.g. "opencode run" or "claude -p"). */
  aiCliCommand: string

  // ── Cloud sync (BYO cloud, Option A) ───────────────────────────────────────
  /** Show the cloud-sync banner/hints (e.g. "move vault into synced folder"). */
  cloudSyncBannerEnabled: boolean
  /** Detect cloud-sync conflict copies + show the sync StatusBar indicator. */
  cloudSyncDetectEnabled: boolean
}

const DEFAULTS: Settings = {
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
  cloudSyncBannerEnabled: true,
  cloudSyncDetectEnabled: true,
}

const KEY = "comdtex_settings"

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    localStorage.removeItem(KEY)
    return DEFAULTS
  }
}

import { useState, useCallback } from "react"

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { settings, update }
}
