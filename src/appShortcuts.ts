export interface ShortcutActionHandlers {
  toggleFocusMode: () => void
  exitFocusMode: () => void
  openCommandPalette: () => void
  openQuickSwitcher: () => void
  togglePreview: () => void
  toggleBookmark: () => void
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
}

export interface ShortcutContext {
  focusMode: boolean
  isTextInputTarget: boolean
}

export function handleGlobalShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "preventDefault">,
  context: ShortcutContext,
  handlers: ShortcutActionHandlers,
) {
  const key = event.key.toLowerCase()

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

  // Bookmarks: Ctrl+Shift+1-9 to toggle, Ctrl+1-9 to go to
  if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
    const num = parseInt(key)
    if (num >= 1 && num <= 9) {
      event.preventDefault()
      handlers.toggleBookmark()
      return true
    }
  }

  return false
}
