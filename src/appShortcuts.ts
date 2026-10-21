export interface ShortcutActionHandlers {
  toggleFocusMode: () => void
  exitFocusMode: () => void
  /** Ctrl+Shift+P: the palette in commands mode. */
  openCommandPalette: () => void
  /** Ctrl+P and Ctrl+;: the palette in files mode. */
  openFilesPalette: () => void
  togglePreview: () => void
  toggleBookmark: (slot: number) => void
  /** Returns false when the slot is empty (the key press is then left alone). */
  goToBookmark: (slot: number) => boolean | void
  showBookmarks: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  openHelp: () => void
  saveAs: () => void
  openVault: () => void
  nextTab: () => void
  prevTab: () => void
  closeTab: () => void
  reopenTab: () => void
  openAiPanel: () => void
  insertToc: () => void
  toggleOutline: () => void
}

export interface ShortcutContext {
  focusMode: boolean
  isTextInputTarget: boolean
}

/**
 * True while a modal dialog (`aria-modal="true"`, which every dialog in the
 * app sets) is open and `event` should not reach the global shortcuts. The
 * palette, marked `data-palette`, keeps its own open shortcuts (Ctrl+P,
 * Ctrl+Shift+P, F1) alive so they switch its mode; every other key, and every
 * key over any other modal, is the modal's.
 */
export function modalBlocksShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  root: ParentNode = document,
): boolean {
  const modals = Array.from(root.querySelectorAll('[aria-modal="true"]'))
  if (modals.length === 0) return false
  const onlyPalette = modals.every((m) => m.hasAttribute("data-palette"))
  if (!onlyPalette) return true
  const key = event.key?.toLowerCase() ?? ""
  const paletteKey =
    (key === "p" && (event.ctrlKey || event.metaKey) && !event.altKey) ||
    (event.key === "F1" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
  return !paletteKey
}

/**
 * AltGr: Windows/WebView2 reports it as Ctrl+Alt, so a Spanish AltGr+1 (`|`),
 * German AltGr+7 (`{`) or French AltGr+3 (`#`) looks like Ctrl+Alt+Digit.
 * True when the event is a typed character rather than a shortcut:
 * `getModifierState("AltGraph")`, or Ctrl+Alt (no Meta) producing a single
 * printable character other than the shortcut's own key.
 */
export function isAltGrCharacter(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey"> & {
    getModifierState?: (key: string) => boolean
  },
  ownKey?: string,
): boolean {
  if (event.getModifierState?.("AltGraph")) return true
  if (!event.ctrlKey || !event.altKey || event.metaKey) return false
  const k = event.key
  if (typeof k !== "string" || k.length !== 1) return false
  return ownKey === undefined || k.toLowerCase() !== ownKey.toLowerCase()
}

export function handleGlobalShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "preventDefault"
  > & { getModifierState?: (key: string) => boolean },
  context: ShortcutContext,
  handlers: ShortcutActionHandlers,
) {
  const key = event.key?.toLowerCase() ?? ""
  // Physical digit (1–9) of the key, layout-independent. Using `event.code`
  // avoids the US-keyboard trap where Shift+3 yields `event.key === "#"`.
  const digitMatch = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)
  const digit = digitMatch ? parseInt(digitMatch[1]) : null

  if (event.key === "F11") {
    event.preventDefault()
    handlers.toggleFocusMode()
    return true
  }
  if (event.key === "Escape" && context.focusMode) {
    handlers.exitFocusMode()
    return true
  }
  // F1: the commands palette from anywhere (the editor binds it itself).
  if (event.key === "F1" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    event.preventDefault()
    handlers.openCommandPalette()
    return true
  }
  // Every Ctrl+Alt binding below shares one rule: a typed AltGr character is
  // never a shortcut. Plain AltGraph events are rejected up front.
  if (event.getModifierState?.("AltGraph")) return false
  // VS Code layout: Ctrl+P files, Ctrl+Shift+P commands, Ctrl+Alt+P preview.
  // `event.code` for the Alt variant: with Alt held, macOS reports `key` as "π".
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === "p") {
    event.preventDefault()
    handlers.openFilesPalette()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && key === "p") {
    event.preventDefault()
    handlers.openCommandPalette()
    return true
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.altKey &&
    !event.shiftKey &&
    event.code === "KeyP" &&
    !isAltGrCharacter(event, "p")
  ) {
    event.preventDefault()
    handlers.togglePreview()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "s") {
    event.preventDefault()
    handlers.saveAs()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === "o") {
    event.preventDefault()
    handlers.openVault()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) {
    event.preventDefault()
    handlers.zoomIn()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "-") {
    event.preventDefault()
    handlers.zoomOut()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "0") {
    event.preventDefault()
    handlers.resetZoom()
    return true
  }
  if (event.key === "?" && !event.ctrlKey && !event.metaKey && !context.isTextInputTarget) {
    handlers.openHelp()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && key === "tab") {
    event.preventDefault()
    if (event.shiftKey) {
      handlers.prevTab()
    } else {
      handlers.nextTab()
    }
    return true
  }
  if ((event.ctrlKey || event.metaKey) && key === "w") {
    event.preventDefault()
    handlers.closeTab()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "t") {
    event.preventDefault()
    handlers.reopenTab()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === ";") {
    event.preventDefault()
    handlers.openFilesPalette()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "b") {
    event.preventDefault()
    handlers.showBookmarks()
    return true
  }
  // Ctrl/Cmd+Shift+A: open the AI assistant panel.
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "a") {
    event.preventDefault()
    handlers.openAiPanel()
    return true
  }
  // Ctrl/Cmd+Shift+O: insert a table of contents at the cursor.
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "o") {
    event.preventDefault()
    handlers.insertToc()
    return true
  }
  // Ctrl/Cmd+Shift+E: toggle the document outline panel.
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "e") {
    event.preventDefault()
    handlers.toggleOutline()
    return true
  }

  // Bookmarks (digit slots 1–9):
  //   Ctrl/Cmd+Shift+N      → set/clear slot N at the cursor line
  //   Ctrl/Cmd+Alt+N        → jump to slot N
  // Go-to uses Alt rather than bare Ctrl/Cmd+N because on macOS Cmd+1–9 is the
  // near-universal tab/window switcher; hijacking it would fight muscle memory.
  if (digit !== null && (event.ctrlKey || event.metaKey)) {
    if (event.shiftKey && !event.altKey) {
      event.preventDefault()
      handlers.toggleBookmark(digit)
      return true
    }
    if (event.altKey && !event.shiftKey && !isAltGrCharacter(event, String(digit))) {
      // Only swallow the key when a bookmark was there to jump to.
      if (handlers.goToBookmark(digit) === false) return false
      event.preventDefault()
      return true
    }
  }

  return false
}

// ── Registry ────────────────────────────────────────────────────────────────
// ONE list of every shortcut the app advertises. The palette, the help dialog
// and the menus read their key labels from here, and `appShortcuts.test.ts`
// fails when it drifts from `handleGlobalShortcut` (every `global` entry must
// fire its handler) or from the palette (every `commandId` must exist).

export interface AppShortcut {
  /** Stable id, also the i18n-free key the help dialog looks entries up by. */
  id: string
  /** Display form: "Ctrl+Shift+P". Shown exactly as written on every platform (macOS also accepts Cmd for Ctrl, but labels stay "Ctrl"). */
  keys: string
  /** Palette command that shows this chip. */
  commandId?: string
  /**
   * `global`: handled by `handleGlobalShortcut` (the test fires it).
   * `editor`: bound on the Monaco editor, or by another window listener in
   * App.tsx; not testable here, but still the one place the label lives.
   */
  source: "global" | "editor"
  /** For `global`: the handler it must call. */
  handler?: keyof ShortcutActionHandlers
}

export const APP_SHORTCUTS: readonly AppShortcut[] = [
  { id: "save", keys: "Ctrl+S", commandId: "save", source: "editor" },
  {
    id: "saveAs",
    keys: "Ctrl+Shift+S",
    commandId: "saveAs",
    source: "global",
    handler: "saveAs",
  },
  { id: "find", keys: "Ctrl+F", commandId: "find", source: "editor" },
  { id: "searchVault", keys: "Ctrl+Shift+F", commandId: "findVault", source: "editor" },
  { id: "bold", keys: "Ctrl+B", commandId: "fmt:bold", source: "editor" },
  { id: "italic", keys: "Ctrl+I", commandId: "fmt:italic", source: "editor" },
  { id: "aiInlineEdit", keys: "Ctrl+K", commandId: "ai:cmdk", source: "editor" },
  { id: "addComment", keys: "Ctrl+Shift+M", commandId: "addComment", source: "editor" },
  { id: "dailyNote", keys: "Ctrl+Shift+D", commandId: "dailyNote", source: "editor" },
  { id: "openVault", keys: "Ctrl+O", source: "global", handler: "openVault" },
  {
    id: "commandPalette",
    keys: "Ctrl+Shift+P",
    source: "global",
    handler: "openCommandPalette",
  },
  {
    id: "commandPaletteF1",
    keys: "F1",
    source: "global",
    handler: "openCommandPalette",
  },
  { id: "quickOpen", keys: "Ctrl+P", source: "global", handler: "openFilesPalette" },
  { id: "quickOpenAlt", keys: "Ctrl+;", source: "global", handler: "openFilesPalette" },
  { id: "togglePreview", keys: "Ctrl+Alt+P", source: "global", handler: "togglePreview" },
  {
    id: "focusMode",
    keys: "F11",
    commandId: "focus",
    source: "global",
    handler: "toggleFocusMode",
  },
  { id: "zoomIn", keys: "Ctrl++", source: "global", handler: "zoomIn" },
  { id: "zoomOut", keys: "Ctrl+-", source: "global", handler: "zoomOut" },
  { id: "resetZoom", keys: "Ctrl+0", source: "global", handler: "resetZoom" },
  { id: "help", keys: "?", commandId: "help", source: "global", handler: "openHelp" },
  { id: "nextTab", keys: "Ctrl+Tab", source: "global", handler: "nextTab" },
  { id: "prevTab", keys: "Ctrl+Shift+Tab", source: "global", handler: "prevTab" },
  { id: "closeTab", keys: "Ctrl+W", source: "global", handler: "closeTab" },
  { id: "reopenTab", keys: "Ctrl+Shift+T", source: "global", handler: "reopenTab" },
  { id: "bookmarks", keys: "Ctrl+Shift+B", source: "global", handler: "showBookmarks" },
  {
    id: "aiPanel",
    keys: "Ctrl+Shift+A",
    commandId: "ai:open",
    source: "global",
    handler: "openAiPanel",
  },
  {
    id: "insertToc",
    keys: "Ctrl+Shift+O",
    commandId: "toc",
    source: "global",
    handler: "insertToc",
  },
  {
    id: "toggleOutline",
    keys: "Ctrl+Shift+E",
    commandId: "outline",
    source: "global",
    handler: "toggleOutline",
  },
  { id: "goBack", keys: "Alt+\u2190", commandId: "goBack", source: "editor" },
  { id: "goForward", keys: "Alt+\u2192", commandId: "goForward", source: "editor" },
]

const BY_COMMAND = new Map(
  APP_SHORTCUTS.filter((s) => s.commandId).map((s) => [s.commandId as string, s.keys]),
)

/** The shortcut label of a palette command, from the registry (never hand-typed). */
export function shortcutForCommand(commandId: string): string | undefined {
  return BY_COMMAND.get(commandId)
}

export function shortcutKeys(id: string): string {
  return APP_SHORTCUTS.find((s) => s.id === id)?.keys ?? ""
}

/** Split "Ctrl+Shift+P" into its key caps for kbd chips ("Ctrl++" keeps the plus). */
export function splitKeys(keys: string): string[] {
  if (keys.endsWith("++")) return [...splitKeys(keys.slice(0, -2)), "+"]
  return keys.split("+").filter(Boolean)
}
