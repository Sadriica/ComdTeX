import { describe, expect, it, vi } from "vitest"
import {
  APP_SHORTCUTS,
  handleGlobalShortcut,
  shortcutForCommand,
  splitKeys,
  type ShortcutActionHandlers,
} from "./appShortcuts"
import { buildPaletteCommands } from "./commands"
import { makeCtx } from "./paletteTestKit"
import { flattenCommands } from "./paletteCommandSearch"

type Spies = { [K in keyof ShortcutActionHandlers]: ReturnType<typeof vi.fn> }

/** The spies, typed as the handlers they stand in for. */
const asHandlers = (spies: Spies) => spies as unknown as ShortcutActionHandlers

function makeHandlers(): Spies {
  return {
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
}

/** The KeyboardEvent a user pressing `keys` ("Ctrl+Shift+P") would produce. */
function eventFor(keys: string) {
  const parts = splitKeys(keys)
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  const letter = key.length === 1 && /[a-z]/i.test(key)
  return {
    key: mods.includes("Shift") && letter ? key.toUpperCase() : letter ? key.toLowerCase() : key,
    code: letter ? `Key${key.toUpperCase()}` : /^[0-9]$/.test(key) ? `Digit${key}` : key,
    ctrlKey: mods.includes("Ctrl"),
    metaKey: false,
    shiftKey: mods.includes("Shift"),
    altKey: mods.includes("Alt"),
    preventDefault: vi.fn(),
  }
}

// Handlers that are reached by a family of keys or by Escape, documented in
// appShortcuts.ts rather than listed one by one in the registry.
const NOT_IN_REGISTRY = new Set<keyof ShortcutActionHandlers>([
  "exitFocusMode",
  "toggleBookmark",
  "goToBookmark",
])

describe("shortcut registry vs handleGlobalShortcut", () => {
  for (const shortcut of APP_SHORTCUTS.filter((s) => s.source === "global")) {
    it(`${shortcut.keys} fires ${shortcut.handler}`, () => {
      const handlers = makeHandlers()
      const handled = handleGlobalShortcut(
        eventFor(shortcut.keys),
        { focusMode: false, isTextInputTarget: false },
        asHandlers(handlers),
      )
      expect(handled).toBe(true)
      for (const [name, fn] of Object.entries(handlers)) {
        expect(fn).toHaveBeenCalledTimes(name === shortcut.handler ? 1 : 0)
      }
    })
  }

  it("every global handler has a registry entry (a new handler needs a shortcut row)", () => {
    const registered = new Set(APP_SHORTCUTS.map((s) => s.handler))
    for (const name of Object.keys(makeHandlers()) as (keyof ShortcutActionHandlers)[]) {
      if (NOT_IN_REGISTRY.has(name)) continue
      expect(registered.has(name), `${name} has no entry in APP_SHORTCUTS`).toBe(true)
    }
  })

  it("no two shortcuts share the same keys", () => {
    const seen = new Map<string, string>()
    for (const s of APP_SHORTCUTS) {
      expect(seen.get(s.keys), `${s.id} and ${seen.get(s.keys)} both use ${s.keys}`).toBeUndefined()
      seen.set(s.keys, s.id)
    }
  })

  it("follows the VS Code layout: P files, Shift+P commands, Alt+P preview", () => {
    const handlers = makeHandlers()
    const ctx = { focusMode: false, isTextInputTarget: false }
    handleGlobalShortcut(eventFor("Ctrl+P"), ctx, asHandlers(handlers))
    handleGlobalShortcut(eventFor("Ctrl+Shift+P"), ctx, asHandlers(handlers))
    handleGlobalShortcut(eventFor("Ctrl+Alt+P"), ctx, asHandlers(handlers))
    expect(handlers.openFilesPalette).toHaveBeenCalledTimes(1)
    expect(handlers.openCommandPalette).toHaveBeenCalledTimes(1)
    expect(handlers.togglePreview).toHaveBeenCalledTimes(1)
  })
})

describe("shortcut registry vs the palette", () => {
  const { all } = flattenCommands(buildPaletteCommands(makeCtx("en")))

  it("every command id named by the registry exists in the palette", () => {
    for (const s of APP_SHORTCUTS) {
      if (s.commandId)
        expect(all.has(s.commandId), `${s.commandId} is not a palette command`).toBe(true)
    }
  })

  it("the palette shows the registry's keys, never its own", () => {
    for (const s of APP_SHORTCUTS) {
      if (s.commandId) expect(shortcutForCommand(s.commandId)).toBe(s.keys)
    }
    // A command not in the registry has no chip: nothing is hand-typed any more.
    expect(shortcutForCommand("ins:table")).toBeUndefined()
    for (const cmd of all.values()) {
      expect(Object.keys(cmd)).not.toContain("shortcut")
    }
  })

  it("the commands that claimed a shortcut before still show it (Ctrl+Shift+A, Ctrl+Shift+E now too)", () => {
    expect(shortcutForCommand("ai:open")).toBe("Ctrl+Shift+A")
    expect(shortcutForCommand("outline")).toBe("Ctrl+Shift+E")
    expect(shortcutForCommand("save")).toBe("Ctrl+S")
  })
})

describe("splitKeys", () => {
  it("splits into key caps and keeps a literal plus", () => {
    expect(splitKeys("Ctrl+Shift+P")).toEqual(["Ctrl", "Shift", "P"])
    expect(splitKeys("Ctrl++")).toEqual(["Ctrl", "+"])
    expect(splitKeys("?")).toEqual(["?"])
  })
})
