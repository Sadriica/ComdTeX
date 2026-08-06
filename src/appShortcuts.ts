export interface ShortcutActionHandlers {
  toggleFocusMode: () => void
  exitFocusMode: () => void
  openCommandPalette: () => void
  openQuickSwitcher: () => void
  togglePreview: () => void
  toggleBookmark: (slot: number) => void
  goToBookmark: (slot: number) => void
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

export function handleGlobalShortcut(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "preventDefault">,
  context: ShortcutContext,
  handlers: ShortcutActionHandlers,
) {
  const key = event.key.toLowerCase()
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
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === "p") {
    event.preventDefault()
    handlers.openCommandPalette()
    return true
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "p") {
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
  if ((event.ctrlKey || event.metaKey) && key === ";") {
    event.preventDefault()
    handlers.openQuickSwitcher()
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
    if (event.altKey && !event.shiftKey) {
      event.preventDefault()
      handlers.goToBookmark(digit)
      return true
    }
  }

  return false
}
