import { describe, expect, it, vi } from "vitest"
import { handleGlobalShortcut, type ShortcutActionHandlers } from "./appShortcuts"

function makeHandlers() {
  const handlers: ShortcutActionHandlers = {
    toggleFocusMode: vi.fn(),
    exitFocusMode: vi.fn(),
    openCommandPalette: vi.fn(),
    openFilesPalette: vi.fn(),
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
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: false },
      handlers,
    )
    expect(handled).toBe(true)
    expect(handlers.saveAs).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it("maps Ctrl+O to openVault", () => {
    const handlers = makeHandlers()
    const event = makeEvent("o", { ctrlKey: true })
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: false },
      handlers,
    )
    expect(handled).toBe(true)
    expect(handlers.openVault).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it("maps Ctrl+; to the files palette", () => {
    const handlers = makeHandlers()
    const event = makeEvent(";", { ctrlKey: true })
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: false },
      handlers,
    )
    expect(handled).toBe(true)
    expect(handlers.openFilesPalette).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it("does not open help from text inputs", () => {
    const handlers = makeHandlers()
    const event = makeEvent("?")
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: true },
      handlers,
    )
    expect(handled).toBe(false)
    expect(handlers.openHelp).not.toHaveBeenCalled()
  })

  it("maps Ctrl+Shift+B to showBookmarks", () => {
    const handlers = makeHandlers()
    const event = makeEvent("B", { ctrlKey: true, shiftKey: true })
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: false },
      handlers,
    )
    expect(handled).toBe(true)
    expect(handlers.showBookmarks).toHaveBeenCalledTimes(1)
  })

  it("maps Ctrl+Shift+3 to toggleBookmark(3)", () => {
    const handlers = makeHandlers()
    const event = makeEvent("3", { ctrlKey: true, shiftKey: true })
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: false },
      handlers,
    )
    expect(handled).toBe(true)
    expect(handlers.toggleBookmark).toHaveBeenCalledWith(3)
    expect(handlers.goToBookmark).not.toHaveBeenCalled()
  })

  it("uses event.code so Shift+digit works even when event.key is punctuation", () => {
    // US-QWERTY: Shift+3 produces key '#', but code is still 'Digit3'.
    const handlers = makeHandlers()
    const event = makeEvent("#", { ctrlKey: true, shiftKey: true, code: "Digit3" })
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: false },
      handlers,
    )
    expect(handled).toBe(true)
    expect(handlers.toggleBookmark).toHaveBeenCalledWith(3)
  })

  it("maps Ctrl+Alt+3 to goToBookmark(3)", () => {
    const handlers = makeHandlers()
    const event = makeEvent("3", { ctrlKey: true, altKey: true })
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: false },
      handlers,
    )
    expect(handled).toBe(true)
    expect(handlers.goToBookmark).toHaveBeenCalledWith(3)
    expect(handlers.toggleBookmark).not.toHaveBeenCalled()
  })

  it("does NOT fire bookmarks on bare Ctrl/Cmd+3 (reserved for macOS tab nav)", () => {
    const handlers = makeHandlers()
    const event = makeEvent("3", { metaKey: true })
    const handled = handleGlobalShortcut(
      event,
      { focusMode: false, isTextInputTarget: false },
      handlers,
    )
    expect(handled).toBe(false)
    expect(handlers.goToBookmark).not.toHaveBeenCalled()
    expect(handlers.toggleBookmark).not.toHaveBeenCalled()
  })
})

describe("AltGr characters are typed, never shortcuts", () => {
  const ctx = { focusMode: false, isTextInputTarget: true }
  // Windows/WebView2 reports AltGr as Ctrl+Alt. `code` is the physical key,
  // `key` the character the layout produced.
  const cases: [string, string, string][] = [
    ["es", "|", "Digit1"],
    ["es", "@", "Digit2"],
    ["es", "#", "Digit3"],
    ["es", "~", "Digit4"],
    ["es", "\u00ac", "Digit6"],
    ["es", "\u20ac", "KeyE"],
    ["de", "{", "Digit7"],
    ["de", "[", "Digit8"],
    ["de", "]", "Digit9"],
    ["fr", "#", "Digit3"],
    ["fr", "{", "Digit4"],
    ["fr", "[", "Digit5"],
    ["fr", "|", "Digit6"],
    ["de", "@", "KeyQ"],
    ["pl", "\u0105", "KeyA"],
  ]
  for (const [layout, ch, code] of cases) {
    it(`${layout} AltGr gives ${ch} (${code}) untouched`, () => {
      const handlers = makeHandlers()
      handlers.goToBookmark = vi.fn(() => true)
      const event = makeEvent(ch, { code, ctrlKey: true, altKey: true })
      expect(handleGlobalShortcut(event, ctx, handlers)).toBe(false)
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(handlers.goToBookmark).not.toHaveBeenCalled()
      expect(handlers.togglePreview).not.toHaveBeenCalled()
    })
  }

  it("rejects the event when the browser says AltGraph is down", () => {
    const handlers = makeHandlers()
    const event = {
      ...makeEvent("1", { code: "Digit1", ctrlKey: true, altKey: true }),
      getModifierState: (k: string) => k === "AltGraph",
    }
    expect(handleGlobalShortcut(event, ctx, handlers)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(handlers.goToBookmark).not.toHaveBeenCalled()
  })

  it("Ctrl+; is not taken when Alt is also down", () => {
    const handlers = makeHandlers()
    const event = makeEvent(";", { code: "Comma", ctrlKey: true, altKey: true })
    expect(handleGlobalShortcut(event, ctx, handlers)).toBe(false)
    expect(handlers.openFilesPalette).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it("Ctrl+Alt+P preview ignores an AltGr character on the P key", () => {
    const handlers = makeHandlers()
    const event = makeEvent("\u00fe", { code: "KeyP", ctrlKey: true, altKey: true })
    expect(handleGlobalShortcut(event, ctx, handlers)).toBe(false)
    expect(handlers.togglePreview).not.toHaveBeenCalled()
  })

  it("the real shortcuts still work: Ctrl+Alt+digit jumps, Ctrl+Alt+P toggles", () => {
    const handlers = makeHandlers()
    handlers.goToBookmark = vi.fn(() => true)
    const jump = makeEvent("3", { code: "Digit3", ctrlKey: true, altKey: true })
    expect(handleGlobalShortcut(jump, ctx, handlers)).toBe(true)
    expect(handlers.goToBookmark).toHaveBeenCalledWith(3)
    expect(jump.preventDefault).toHaveBeenCalledTimes(1)
    const preview = makeEvent("p", { code: "KeyP", ctrlKey: true, altKey: true })
    expect(handleGlobalShortcut(preview, ctx, handlers)).toBe(true)
    expect(handlers.togglePreview).toHaveBeenCalledTimes(1)
    const numpad = makeEvent("5", { code: "Numpad5", ctrlKey: true, altKey: true })
    expect(handleGlobalShortcut(numpad, ctx, handlers)).toBe(true)
    expect(handlers.goToBookmark).toHaveBeenLastCalledWith(5)
  })

  it("does not swallow Ctrl+Alt+digit when the slot has no bookmark", () => {
    const handlers = makeHandlers()
    handlers.goToBookmark = vi.fn(() => false)
    const event = makeEvent("2", { code: "Digit2", ctrlKey: true, altKey: true })
    expect(handleGlobalShortcut(event, ctx, handlers)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it("survives a keydown with no key (autofill)", () => {
    const handlers = makeHandlers()
    const event = { ...makeEvent("a"), key: undefined as unknown as string, code: "" }
    expect(() => handleGlobalShortcut(event, ctx, handlers)).not.toThrow()
  })

  it("F1 opens the commands palette from anywhere", () => {
    const handlers = makeHandlers()
    const event = makeEvent("F1", { code: "F1" })
    expect(handleGlobalShortcut(event, ctx, handlers)).toBe(true)
    expect(handlers.openCommandPalette).toHaveBeenCalledTimes(1)
  })
})
