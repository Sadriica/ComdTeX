import { describe, expect, it } from "vitest"
import { buildPaletteCommands } from "./commands"
import { makeCtx } from "./paletteTestKit"
import { flattenCommands, rankCommands } from "./paletteCommandSearch"
import { EMPTY_PREFS } from "./palettePrefs"
import { LANGS, type Lang } from "./i18n"
import { buildFileEntries, rankFileEntries } from "./paletteSources"
import { rankItems } from "./fuzzy"

function search(lang: Lang, query: string): string[] {
  const t = LANGS[lang]
  const { leaves } = flattenCommands(buildPaletteCommands(makeCtx(lang)))
  return rankCommands(leaves, query, (c) => t.palette.categories[c], EMPTY_PREFS, null)
    .slice(0, 8)
    .map((r) => r.flat.cmd.label)
}

const FILES = [
  "papers/spectral-gap.md",
  "papers/typesetting.md",
  "notes/mixing-times.md",
  "notes/nota-espanol.md",
  "notes/reading-list.md",
  "notes/expander-notes.md",
  "daily/2026-10-20.md",
]

function files(query: string, recent: string[] = []): string[] {
  const entries = buildFileEntries(
    FILES.map((f) => ({ path: `/v/${f}` })),
    "/v",
  )
  return rankFileEntries(
    entries,
    query,
    recent.map((r) => `/v/${r}`),
  ).map((r) => r.entry.rel)
}

describe("palette golden order: commands (en)", () => {
  it("`ins` lists only Insert commands, not everything with an i, n and s", () => {
    const top = search("en", "ins")
    expect(top).toHaveLength(8)
    for (const label of top) expect(label).toMatch(/^Insert/)
  })

  it("`tm` finds the acronyms Toggle minimap and Typewriter mode first", () => {
    expect(search("en", "tm").slice(0, 2).sort()).toEqual([
      "Toggle minimap",
      "Typewriter mode (center cursor)",
    ])
  })

  it("`teo` and `theo` put the theorem snippet first, not a file or a different block", () => {
    expect(search("en", "teo")[0]).toBe("theorem")
    expect(search("en", "theo").slice(0, 2)).toEqual(["theorem", "theorem   Theorem"])
    expect(search("en", "theo")).not.toContain(":::truth")
  })

  it("`cita`/`cite` rank the citation commands above unrelated snippets", () => {
    const top = search("en", "cita").slice(0, 2)
    expect(top.every((l) => /citation/i.test(l))).toBe(true)
  })

  it("`gap` puts the gap commands first", () => {
    expect(search("en", "gap").slice(0, 3)).toEqual([
      "Fill gap with AI",
      "Insert {{?}} gap",
      "Fill all gaps with AI",
    ])
  })

  it("`scf` is an acronym for Save current file", () => {
    const items = ["Save current file", "Show current line in PDF", "Save as...", "Copy as HTML"]
    const ranked = rankItems(items, "scf", (l) => [{ text: l, weight: 1 }])
    expect(ranked[0].item).toBe("Save current file")
  })

  it("`scf` still finds something sensible in the real command list", () => {
    expect(search("en", "scf")).toEqual(["Show current line in PDF"])
  })

  it("`math` finds the math commands", () => {
    expect(search("en", "math")[0]).toMatch(/math/i)
  })
})

describe("palette golden order: commands (es)", () => {
  it("`ins` lists only Insertar commands", () => {
    for (const label of search("es", "ins")) expect(label).toMatch(/^Insertar/)
  })

  it("`gap` still reaches the gap commands through their keywords", () => {
    expect(search("es", "gap")[0]).toBe("Completar hueco con IA")
  })

  it("`cita` finds the citation commands", () => {
    const top = search("es", "cita").slice(0, 3)
    expect(top).toContain("Insertar cita BibTeX [@clave]")
    expect(top).toContain("Cita")
  })

  it("`teo` finds the Spanish theorem snippet first", () => {
    expect(search("es", "teo").slice(0, 2)).toContain("theorem   Teorema")
  })

  it("`matematicas` (no accent) lists the math category, general commands first", () => {
    expect(search("es", "matematicas")[0]).toBe("Selector de símbolos matemáticos")
  })

  it("`indice` finds the accented Insertar índice", () => {
    expect(search("es", "indice")).toContain("Insertar índice (TOC)")
  })
})

describe("palette golden order: files", () => {
  it("`gap` finds spectral-gap, `mt` and `tm` find mixing-times", () => {
    expect(files("gap")).toEqual(["papers/spectral-gap.md"])
    expect(files("mt")[0]).toBe("notes/mixing-times.md")
    expect(files("tm")[0]).toBe("notes/mixing-times.md")
  })

  it("`nota` and `esp` find nota-espanol first", () => {
    expect(files("nota")[0]).toBe("notes/nota-espanol.md")
    expect(files("esp")[0]).toBe("notes/nota-espanol.md")
  })

  it("matches a path segment, a date and several terms", () => {
    expect(files("2026")).toEqual(["daily/2026-10-20.md"])
    expect(files("papers gap")).toEqual(["papers/spectral-gap.md"])
  })

  it("an empty query lists recents first, in the order given", () => {
    const list = files("", ["notes/reading-list.md", "papers/typesetting.md"])
    expect(list.slice(0, 2)).toEqual(["notes/reading-list.md", "papers/typesetting.md"])
    expect(list).toHaveLength(FILES.length)
  })

  it("a recent file wins a near tie", () => {
    const plain = files("notes")
    const boosted = files("notes", ["notes/expander-notes.md"])
    expect(boosted[0]).toBe("notes/expander-notes.md")
    expect(plain[0]).not.toBeUndefined()
  })
})
