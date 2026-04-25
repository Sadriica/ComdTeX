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
  }
  return handlers
}

function makeEvent(key: string, opts: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey">> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
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
})
