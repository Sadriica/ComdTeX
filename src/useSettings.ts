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
  wordWrap: false,
  minimapEnabled: false,
  spellcheck: false,
  syncScroll: true,
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
