import { describe, expect, it, vi } from "vitest"
import { handleGlobalShortcut, type ShortcutActionHandlers } from "./appShortcuts"

function makeHandlers() {
  const handlers: ShortcutActionHandlers = {
    toggleFocusMode: vi.fn(),
    exitFocusMode: vi.fn(),
    openCommandPalette: vi.fn(),
    openQuickSwitcher: vi.fn(),
    togglePreview: vi.fn(),
    toggleBookmark: vi.fn(),
    goToBookmark: vi.fn(),
    showBookmarks: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    openHelp: vi.fn(),
    saveAs: vi.fn(),
    openVault: vi.fn(),
    nextTab: vi.fn(),
    prevTab: vi.fn(),
    closeTab: vi.fn(),
    reopenTab: vi.fn(),
    openAiPanel: vi.fn(),
    insertToc: vi.fn(),
    toggleOutline: vi.fn(),
  }
  return handlers
}

function makeEvent(
  key: string,
  opts: Partial<Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">> = {},
) {
  return {
    key,
    // Default `code` to the physical digit/letter key for the given `key`.
    code: /^[0-9]$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...opts,
  }
}

describe("handleGlobalShortcut", () => {
  it("maps Ctrl+Shift+S to saveAs", () => {
    const handlers = makeHandlers()
    const event = makeEvent("S", { ctrlKey: true, shiftKey: true })
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: false }, handlers)
    expect(handled).toBe(true)
    expect(handlers.saveAs).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it("maps Ctrl+O to openVault", () => {
    const handlers = makeHandlers()
    const event = makeEvent("o", { ctrlKey: true })
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: false }, handlers)
    expect(handled).toBe(true)
    expect(handlers.openVault).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it("maps Ctrl+; to quick switcher", () => {
    const handlers = makeHandlers()
    const event = makeEvent(";", { ctrlKey: true })
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: false }, handlers)
    expect(handled).toBe(true)
    expect(handlers.openQuickSwitcher).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it("does not open help from text inputs", () => {
    const handlers = makeHandlers()
    const event = makeEvent("?")
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: true }, handlers)
    expect(handled).toBe(false)
    expect(handlers.openHelp).not.toHaveBeenCalled()
  })

  it("maps Ctrl+Shift+B to showBookmarks", () => {
    const handlers = makeHandlers()
    const event = makeEvent("B", { ctrlKey: true, shiftKey: true })
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: false }, handlers)
    expect(handled).toBe(true)
    expect(handlers.showBookmarks).toHaveBeenCalledTimes(1)
  })

  it("maps Ctrl+Shift+3 to toggleBookmark(3)", () => {
    const handlers = makeHandlers()
    const event = makeEvent("3", { ctrlKey: true, shiftKey: true })
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: false }, handlers)
    expect(handled).toBe(true)
    expect(handlers.toggleBookmark).toHaveBeenCalledWith(3)
    expect(handlers.goToBookmark).not.toHaveBeenCalled()
  })

  it("uses event.code so Shift+digit works even when event.key is punctuation", () => {
    // US-QWERTY: Shift+3 produces key '#', but code is still 'Digit3'.
    const handlers = makeHandlers()
    const event = makeEvent("#", { ctrlKey: true, shiftKey: true, code: "Digit3" })
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: false }, handlers)
    expect(handled).toBe(true)
    expect(handlers.toggleBookmark).toHaveBeenCalledWith(3)
  })

  it("maps Ctrl+Alt+3 to goToBookmark(3)", () => {
    const handlers = makeHandlers()
    const event = makeEvent("3", { ctrlKey: true, altKey: true })
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: false }, handlers)
    expect(handled).toBe(true)
    expect(handlers.goToBookmark).toHaveBeenCalledWith(3)
    expect(handlers.toggleBookmark).not.toHaveBeenCalled()
  })

  it("does NOT fire bookmarks on bare Ctrl/Cmd+3 (reserved for macOS tab nav)", () => {
    const handlers = makeHandlers()
    const event = makeEvent("3", { metaKey: true })
    const handled = handleGlobalShortcut(event, { focusMode: false, isTextInputTarget: false }, handlers)
    expect(handled).toBe(false)
    expect(handlers.goToBookmark).not.toHaveBeenCalled()
    expect(handlers.toggleBookmark).not.toHaveBeenCalled()
  })
})
