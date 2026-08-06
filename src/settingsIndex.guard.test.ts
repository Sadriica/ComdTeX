import { describe, expect, it } from "vitest"
import modalSrc from "./SettingsModal.tsx?raw"
import { SETTINGS_INDEX, findSettings } from "./settingsIndex"
import { LANGS } from "./i18n"

// The search box can only find what the index knows about. An option added to
// the modal and not to the index is invisible to search while looking perfectly
// present in its tab, which is worse than no search at all: the user concludes
// the option does not exist. This guard fails the build instead.

const editedKeys = new Set(
  [...modalSrc.matchAll(/onChange\(\{\s*(\w+)/g)]
    .map((m) => m[1])
    // The ADS token is a credential written straight to the keychain, not a
    // setting in the settings object.
    .filter((k) => k !== "ads_token"),
)

describe("the settings search index", () => {
  it("covers every option the modal edits", () => {
    const indexed = new Set(SETTINGS_INDEX.map((e) => e.id))
    const missing = [...editedKeys].filter((k) => !indexed.has(k)).sort()
    expect(missing).toEqual([])
  })

  it("does not list options the modal no longer has", () => {
    const stale = SETTINGS_INDEX.map((e) => e.id).filter((id) => !editedKeys.has(id))
    expect(stale).toEqual([])
  })

  it("anchors every indexed option to a row in the modal", () => {
    // The search jumps by `data-setting`, so the attribute must exist.
    const missing = SETTINGS_INDEX.filter((e) => !modalSrc.includes(`data-setting="${e.id}"`))
    expect(missing.map((e) => e.id)).toEqual([])
  })

  it("gives every option a label in both languages", () => {
    for (const lang of ["es", "en"] as const) {
      for (const entry of SETTINGS_INDEX) {
        expect(entry.label(LANGS[lang]), `${entry.id} in ${lang}`).toBeTruthy()
      }
    }
  })
})

describe("findSettings", () => {
  const t = LANGS.en

  it("finds an option by a word from its label", () => {
    expect(findSettings("autosave", t).map((e) => e.id)).toContain("autoSaveMs")
  })

  it("ignores case and accents, as the panels' filter does", () => {
    const es = LANGS.es
    const hit = findSettings("vista previa", es).map((e) => e.id)
    expect(hit.length).toBeGreaterThan(0)
    expect(findSettings("VISTA PREVIA", es).map((e) => e.id)).toEqual(hit)
  })

  it("returns nothing for an empty query rather than the whole list", () => {
    expect(findSettings("   ", t)).toEqual([])
  })

  it("returns nothing when no option matches", () => {
    expect(findSettings("qwertyuiop", t)).toEqual([])
  })
})
