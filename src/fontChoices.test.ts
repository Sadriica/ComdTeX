import { describe, expect, it } from "vitest"
import {
  CURATED,
  DEFAULT_EDITOR_STACK,
  buildStack,
  fontOverrideCss,
  pickInstalled,
  presetValue,
  quoteFamily,
  sanitizeFontValue,
  systemValue,
} from "./fontChoices"
import { DEFAULTS, sanitizeFonts } from "./useSettings"

describe("buildStack", () => {
  it("returns null for the default and for garbage", () => {
    expect(buildStack("ui", "default")).toBeNull()
    expect(buildStack("ui", undefined)).toBeNull()
    expect(buildStack("ui", "bogus")).toBeNull()
    expect(buildStack("ui", "preset:nope")).toBeNull()
    expect(buildStack("ui", "system:")).toBeNull()
  })

  it("resolves a preset by role", () => {
    expect(buildStack("editor", presetValue("fira-code"))).toContain('"Fira Code"')
    expect(buildStack("editor", presetValue("jetbrains"))).toBe(DEFAULT_EDITOR_STACK)
    // a preset id from another role does not resolve
    expect(buildStack("ui", presetValue("fira-code"))).toBeNull()
  })

  it("quotes an installed family and appends the role fallback", () => {
    expect(buildStack("editor", systemValue("Iosevka Term"))).toBe(
      '"Iosevka Term", ui-monospace, monospace',
    )
    expect(buildStack("preview", systemValue("Crimson Pro"))).toBe('"Crimson Pro", serif')
    expect(buildStack("ui", systemValue("Cantarell"))).toBe('"Cantarell", system-ui, sans-serif')
  })

  it("escapes quotes and backslashes in family names", () => {
    expect(quoteFamily('A"B\\C')).toBe('"A\\"B\\\\C"')
  })
})

describe("curated lists", () => {
  it("has unique ids and non-empty stacks per role", () => {
    for (const list of Object.values(CURATED)) {
      expect(new Set(list.map((p) => p.id)).size).toBe(list.length)
      for (const p of list) expect(p.stack.length).toBeGreaterThan(0)
    }
  })
})

describe("sanitizeFontValue", () => {
  it("keeps valid values and falls back to default otherwise", () => {
    expect(sanitizeFontValue("ui", "preset:inter")).toBe("preset:inter")
    expect(sanitizeFontValue("ui", "system:Cantarell")).toBe("system:Cantarell")
    expect(sanitizeFontValue("ui", "system:  ")).toBe("default")
    expect(sanitizeFontValue("ui", "preset:gone")).toBe("default")
    expect(sanitizeFontValue("ui", 42)).toBe("default")
  })
})

describe("pickInstalled", () => {
  const fonts = [
    { name: "Fira Code", monospace: true },
    { name: "Cantarell", monospace: false },
    { name: "cantarell", monospace: false },
    { name: "Iosevka", monospace: true },
  ]
  it("keeps only monospace for the editor and drops curated duplicates", () => {
    expect(pickInstalled("editor", fonts).map((f) => f.name)).toEqual(["Iosevka"])
  })
  it("lists all, deduped, for other roles", () => {
    expect(pickInstalled("ui", fonts).map((f) => f.name)).toEqual([
      "Fira Code",
      "Cantarell",
      "Iosevka",
    ])
  })
})

describe("fontOverrideCss", () => {
  it("is empty without an override and targets --font-ui with one", () => {
    expect(fontOverrideCss(null)).toBe("")
    expect(fontOverrideCss("Foo, sans-serif")).toContain("--font-ui: Foo, sans-serif;")
  })
})

describe("settings defaults and migration", () => {
  it("defaults every typeface to the current look", () => {
    expect(DEFAULTS.uiFontFamily).toBe("default")
    expect(DEFAULTS.editorFontFamily).toBe("default")
    expect(DEFAULTS.previewFontFamily).toBe("default")
  })

  it("repairs invalid stored values and keeps valid ones", () => {
    const out = sanitizeFonts({
      ...DEFAULTS,
      uiFontFamily: "weird",
      editorFontFamily: "system:Iosevka",
      previewFontFamily: "preset:eb-garamond",
    })
    expect(out.uiFontFamily).toBe("default")
    expect(out.editorFontFamily).toBe("system:Iosevka")
    expect(out.previewFontFamily).toBe("preset:eb-garamond")
  })

  it("treats settings saved by an older build (keys missing) as default", () => {
    const out = sanitizeFonts({
      ...DEFAULTS,
      uiFontFamily: undefined as unknown as string,
    })
    expect(out.uiFontFamily).toBe("default")
  })
})
