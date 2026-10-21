import { describe, expect, it } from "vitest"
import { parseBibtex } from "./bibtex"
import {
  buildFileEntries,
  citationEntries,
  citationInsertEdit,
  createNoteTarget,
  documentOutline,
  parseLineQuery,
  parseNoteQuery,
  parsePaletteInput,
  rankCitations,
  rankFileEntries,
  rankLabels,
  rankOutline,
  referenceText,
  resolveNote,
} from "./paletteSources"
import type { StructuralLabel } from "./structuralLabels"

describe("parsePaletteInput", () => {
  it("a prefix typed first switches the mode and is consumed", () => {
    expect(parsePaletteInput("files", ">save")).toEqual({ mode: "commands", query: "save" })
    expect(parsePaletteInput("files", "@intro")).toEqual({ mode: "outline", query: "intro" })
    expect(parsePaletteInput("files", "#thm")).toEqual({ mode: "labels", query: "thm" })
    expect(parsePaletteInput("files", "[levin")).toEqual({ mode: "cite", query: "levin" })
    expect(parsePaletteInput("files", ":12")).toEqual({ mode: "line", query: "12" })
    expect(parsePaletteInput("files", "?")).toEqual({ mode: "help", query: "" })
  })

  it("only the first character switches: note#heading keeps its #", () => {
    expect(parsePaletteInput("files", "mixing#intro")).toEqual({
      mode: "files",
      query: "mixing#intro",
    })
  })

  it("other modes own their text (a > inside commands is just text)", () => {
    expect(parsePaletteInput("commands", ">x")).toEqual({ mode: "commands", query: ">x" })
    expect(parsePaletteInput("cite", "@levin")).toEqual({ mode: "cite", query: "@levin" })
  })
})

describe("files", () => {
  const entries = buildFileEntries(
    [
      { path: "/home/u/vault/papers/spectral-gap.md" },
      { path: "/home/u/vault/notes/mixing-times.md" },
      { path: "/home/u/vault/readme.md" },
    ],
    "/home/u/vault",
  )

  it("computes the vault-relative folder (the QuickSwitcher showed the name twice)", () => {
    const gap = entries[0]
    expect(gap.name).toBe("spectral-gap.md")
    expect(gap.rel).toBe("papers/spectral-gap.md")
    expect(gap.folder).toBe("papers")
    expect(entries[2].folder).toBe("")
  })

  it("normalizes Windows separators", () => {
    const win = buildFileEntries([{ path: "C:\\vault\\win\\note.md" }], "C:\\vault")[0]
    expect(win.rel).toBe("win/note.md")
    expect(win.folder).toBe("win")
  })

  it("empty query: recents first, then the rest alphabetically", () => {
    const ranked = rankFileEntries(entries, "", ["/home/u/vault/readme.md"])
    expect(ranked[0].entry.rel).toBe("readme.md")
    expect(ranked[0].recent).toBe(true)
    expect(ranked.slice(1).map((r) => r.entry.rel)).toEqual([
      "notes/mixing-times.md",
      "papers/spectral-gap.md",
    ])
  })

  it("filters by fuzzy name and path and reports name positions", () => {
    const ranked = rankFileEntries(entries, "mixing", [])
    expect(ranked.map((r) => r.entry.rel)).toEqual(["notes/mixing-times.md"])
    expect(ranked[0].positions).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("parses note#heading and resolves the note ignoring the extension", () => {
    expect(parseNoteQuery("mixing#intro")).toEqual({ note: "mixing", heading: "intro" })
    expect(parseNoteQuery("#intro")).toBeNull()
    expect(parseNoteQuery("plain")).toBeNull()
    expect(resolveNote(entries, "mixing")?.rel).toBe("notes/mixing-times.md")
    expect(resolveNote(entries, "readme.md")?.rel).toBe("readme.md")
    expect(resolveNote(entries, "zzzz")).toBeNull()
  })

  it("builds the create-note target in the current folder, sanitized", () => {
    expect(createNoteTarget("New idea", "notes")).toEqual({
      fileName: "New idea.md",
      folderRel: "notes",
      rel: "notes/New idea.md",
      problem: null,
    })
    expect(createNoteTarget("a/b:c", "")?.fileName).toBe("a-b-c.md")
    expect(createNoteTarget("draft.tex", "x")?.fileName).toBe("draft.tex")
    expect(createNoteTarget("   ", "x")).toBeNull()
    expect(createNoteTarget("refs.bib", "x")?.fileName).toBe("refs.bib")
    expect(createNoteTarget("con", "x")?.problem).toBe("reserved")
    expect(createNoteTarget("ends with dot.", "x")?.problem).toBe("edge")
  })
})

describe("documentOutline", () => {
  const doc = [
    "---",
    "title: T",
    "---",
    "# Intro {#sec:intro}",
    "text",
    ":::theorem[Spectral gap]{#thm:gap}",
    "body",
    ":::",
    "```python",
    "# not a heading",
    "```",
    "$$",
    "# also not a heading",
    "x = 1",
    "$$ {#eq:one}",
    "## Methods",
    ":::proof",
    "p",
    ":::",
  ].join("\n")
  const outline = documentOutline(doc)

  it("finds headings, environments and display-math labels in line order", () => {
    expect(outline.map((e) => `${e.kind}:${e.text}:${e.line}`)).toEqual([
      "heading:Intro:4",
      "env:Spectral gap:6",
      "label:eq:one:15",
      "heading:Methods:16",
      "env:proof:17",
    ])
  })

  it("keeps explicit labels and heading levels", () => {
    expect(outline[0].level).toBe(1)
    expect(outline[0].label).toBe("sec:intro")
    expect(outline[1].label).toBe("thm:gap")
    expect(outline[1].type).toBe("theorem")
  })

  it("ranks by text, label and type", () => {
    expect(rankOutline(outline, "gap")[0].entry.line).toBe(6)
    expect(rankOutline(outline, "eq:one")[0].entry.line).toBe(15)
    expect(rankOutline(outline, "").length).toBe(outline.length)
  })
})

describe("labels", () => {
  const mk = (id: string, filePath: string, line = 1): StructuralLabel => {
    const [kind, ...rest] = id.split(":")
    return {
      id,
      kind: kind as StructuralLabel["kind"],
      name: rest.join(":"),
      filePath,
      fileName: filePath.split("/").pop() ?? filePath,
      line,
      context: `{#${id}}`,
    }
  }
  const labels = [
    mk("thm:cheeger", "/v/notes/other.md"),
    mk("thm:gap", "/v/papers/spectral-gap.md"),
    mk("eq:main", "/v/papers/spectral-gap.md"),
  ]

  it("lists same-file labels first", () => {
    const ranked = rankLabels(labels, "", "/v/papers/spectral-gap.md")
    expect(ranked.map((r) => r.label.id)).toEqual(["eq:main", "thm:gap", "thm:cheeger"])
  })

  it("filters and prefers the current file on a tie", () => {
    const ranked = rankLabels(labels, "thm", "/v/papers/spectral-gap.md")
    expect(ranked[0].label.id).toBe("thm:gap")
    expect(ranked.map((r) => r.label.id)).toContain("thm:cheeger")
  })

  it("references an environment in another file with the cross-file form", () => {
    expect(referenceText(labels[0], "/v/papers/spectral-gap.md", "/v")).toBe(
      "@notes/other@thm:cheeger",
    )
    expect(referenceText(labels[1], "/v/papers/spectral-gap.md", "/v")).toBe("@thm:gap")
    expect(referenceText(labels[2], "/v/notes/other.md", "/v")).toBe("@eq:main")
    const spaced = mk("def:x", "/v/my notes/a b.md")
    expect(referenceText(spaced, "/v/z.md", "/v")).toBe("@[my notes/a b]@def:x")
  })
})

describe("citations", () => {
  const bib = parseBibtex(`
@article{lubotzky1988,
  author = {Lubotzky, Alexander and Phillips, Ralph and Sarnak, Peter},
  title = {Ramanujan graphs},
  year = {1988}
}
@book{levin2017,
  author = {Levin, David A. and Peres, Yuval},
  title = {Markov Chains and Mixing Times},
  year = {2017}
}
@article{alon1986,
  author = {Alon, Noga},
  title = {Eigenvalues and expanders},
  year = {1986}
}`)
  const entries = citationEntries(bib)

  it("builds readable labels", () => {
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]))
    expect(byKey.lubotzky1988.label).toBe("Lubotzky et al. 1988")
    expect(byKey.levin2017.label).toBe("Levin and Peres 2017")
    expect(byKey.alon1986.label).toBe("Alon 1986")
    expect(byKey.levin2017.title).toBe("Markov Chains and Mixing Times")
  })

  it("searches author, title, year and key", () => {
    expect(rankCitations(entries, "sarnak")[0].entry.key).toBe("lubotzky1988")
    expect(rankCitations(entries, "markov")[0].entry.key).toBe("levin2017")
    expect(rankCitations(entries, "1986")[0].entry.key).toBe("alon1986")
    expect(rankCitations(entries, "alon1986")[0].entry.key).toBe("alon1986")
    expect(rankCitations(entries, "")).toHaveLength(3)
  })

  it("inserts [@key] outside a citation", () => {
    expect(citationInsertEdit("See  here", 5, "levin2017")).toEqual({
      startColumn: 5,
      endColumn: 5,
      text: "[@levin2017]",
    })
  })

  it("appends ; @key inside an existing citation", () => {
    const line = "As shown [@alon1986] earlier"
    // cursor between `[@alon1986` and `]`
    const col = line.indexOf("]") + 1
    const edit = citationInsertEdit(line, col, "levin2017")
    expect(edit).toEqual({ startColumn: col, endColumn: col, text: "; @levin2017" })
    // Applying it yields a valid group.
    const applied =
      line.slice(0, edit!.startColumn - 1) + edit!.text + line.slice(edit!.endColumn - 1)
    expect(applied).toBe("As shown [@alon1986; @levin2017] earlier")
  })

  it("appends after a locator note and refuses a duplicate", () => {
    const line = "[@alon1986, p. 3]"
    const edit = citationInsertEdit(line, 6, "levin2017")
    const applied =
      line.slice(0, edit!.startColumn - 1) + edit!.text + line.slice(edit!.endColumn - 1)
    expect(applied).toBe("[@alon1986, p. 3; @levin2017]")
    expect(citationInsertEdit(line, 6, "alon1986")).toBeNull()
  })

  it("treats the cursor just outside the brackets as outside", () => {
    expect(citationInsertEdit("[@a]", 1, "b")?.text).toBe("[@b]")
    expect(citationInsertEdit("[@a]", 5, "b")?.text).toBe("[@b]")
  })
})

describe("parseLineQuery", () => {
  it("parses line and line:column, clamped to the document", () => {
    expect(parseLineQuery("12", 100)).toEqual({ line: 12 })
    expect(parseLineQuery("12:5", 100)).toEqual({ line: 12, column: 5 })
    expect(parseLineQuery("500", 100)).toEqual({ line: 100 })
    expect(parseLineQuery("0", 100)).toEqual({ line: 1 })
    expect(parseLineQuery("abc", 100)).toBeNull()
    expect(parseLineQuery("", 100)).toBeNull()
  })
})
