// Finding a setting without knowing which tab it lives in.
//
// Settings holds 34 options across seven tabs, and the tabs are grouped by
// what the option belongs to, not by the word someone has in their head. A
// person looking for "autosave" should not have to open Editor, Preview and
// General to discover it. This is the list the search box reads: one entry
// per option, with the tab it lives in and its own label.
//
// `settingsIndex.guard.test.ts` fails if an option is added to the modal and
// not to this list, which is the only way this stays true over time.

import type { T } from "./i18n"

export type SettingsSectionId =
  | "general" | "editor" | "preview" | "dailyNotes" | "pdf" | "sync" | "ai"

export interface SettingsEntry {
  /** The settings key the row edits; also its `data-setting` anchor. */
  id: string
  section: SettingsSectionId
  label: (t: T) => string
}

export const SETTINGS_INDEX: SettingsEntry[] = [
  { id: "language", section: "general", label: (t) => t.settings.language },
  { id: "theme", section: "general", label: (t) => t.settings.theme },
  { id: "touchpadGestures", section: "general", label: (t) => t.settings.touchpadGestures },

  { id: "fontSize", section: "editor", label: (t) => t.settings.editorFont },
  { id: "autoSaveMs", section: "editor", label: (t) => t.settings.autosave },
  { id: "wordGoal", section: "editor", label: (t) => t.settings.wordGoal },
  { id: "vimMode", section: "editor", label: (t) => t.settings.vimMode },
  { id: "typewriterMode", section: "editor", label: (t) => t.settings.typewriterMode },
  { id: "wordWrap", section: "editor", label: (t) => t.settings.wordWrap },
  { id: "minimapEnabled", section: "editor", label: (t) => t.settings.minimap },
  { id: "spellcheck", section: "editor", label: (t) => t.settings.spellcheck },
  { id: "listContinuation", section: "editor", label: (t) => t.settings.listContinuation },
  { id: "autoFoldExcalidraw", section: "editor", label: (t) => t.settings.autoFoldExcalidraw },
  { id: "readingWpm", section: "editor", label: (t) => t.settings.readingWpm },

  { id: "previewFontSize", section: "preview", label: (t) => t.settings.previewFont },
  { id: "previewVisible", section: "preview", label: (t) => t.settings.previewVisible },
  { id: "syncScroll", section: "preview", label: (t) => t.settings.syncScroll },
  { id: "mathPreview", section: "preview", label: (t) => t.settings.mathPreview },
  { id: "previewTheme", section: "preview", label: (t) => t.settings.previewTheme },

  { id: "dailyNotesEnabled", section: "dailyNotes", label: (t) => t.settings.dailyNotesEnabled },
  { id: "dailyNotesFolder", section: "dailyNotes", label: (t) => t.settings.dailyNotesFolder },
  { id: "dailyNotesTemplate", section: "dailyNotes", label: (t) => t.settings.dailyNotesTemplate },

  { id: "useWasmTex", section: "pdf", label: (t) => t.settings.useWasmTex },
  { id: "texliveUrl", section: "pdf", label: (t) => t.settings.texliveUrl },
  { id: "autoRebuildPdf", section: "pdf", label: (t) => t.settings.autoRebuildPdf },

  { id: "cloudSyncBannerEnabled", section: "sync", label: (t) => t.cloudSync.settings.bannerEnabled },
  { id: "cloudSyncDetectEnabled", section: "sync", label: (t) => t.cloudSync.settings.detectEnabled },

  { id: "aiEnabled", section: "ai", label: (t) => t.aiSettings.enabled },
  { id: "aiProviderId", section: "ai", label: (t) => t.aiSettings.provider },
  { id: "aiBaseUrl", section: "ai", label: (t) => t.aiSettings.baseUrl },
  { id: "aiModel", section: "ai", label: (t) => t.aiSettings.model },
  { id: "aiApiKey", section: "ai", label: (t) => t.aiSettings.apiKey },
  { id: "aiCliCommand", section: "ai", label: (t) => t.aiSettings.cliCommand },
  { id: "aiWarmupEnabled", section: "ai", label: (t) => t.aiSettings.warmup },
]

/**
 * Options matching what was typed, by label. The description under each
 * option is deliberately NOT searched: it would match half the list on a
 * common word and turn the results into noise.
 */
export function findSettings(query: string, t: T): SettingsEntry[] {
  const q = normalize(query)
  if (!q) return []
  return SETTINGS_INDEX.filter((entry) => normalize(entry.label(t)).includes(q))
}

/** Accent-insensitive, like the sidebar panels' own filter. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}
