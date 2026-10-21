import { beforeEach, describe, expect, it } from "vitest"
import type * as monacoApi from "monaco-editor"
import { scanStructuralLabels } from "../structuralLabels"
import { resolveBlockCloserEnter } from "./blockCloser"
import { COMPLETION_SOURCES } from "./index"
import { clearCsvHeaderCache } from "./csvBlocks"
import { accept, complete, FakeModel, fakeMonaco, labelOf, parseCaret } from "./fakeMonaco"
import { setUiLanguage } from "../docLang"
import { setLatexCommandsForTest } from "./latex"
import { findShorthandCall, getShorthandSignatures, registerSignatureHelp } from "./signature"
import {
  type BibInput,
  setCompletionCsvResolver,
  setCompletionCurrentFile,
  updateBibSuggestions,
  updateLabelIndex,
  updateMacroCompletions,
  updateUserSnippets,
  updateVaultFiles,
} from "./state"
import { isInMath, wantsSuggest } from "./triggers"
import { wikilinksSource } from "./wikilinks"
import { LATEX_COMMANDS } from "../latexCommands"
import { EXPECTED_ARGS } from "../contentLinter"

const ROOT = "/v"
const CURRENT = "/v/papers/spectral-gap.md"

const FILES = [
  { path: CURRENT, name: "spectral-gap.md", ext: "md" },
  { path: "/v/notes/mixing-times.md", name: "mixing-times.md", ext: "md" },
  { path: "/v/notes/intro.md", name: "intro.md", ext: "md" },
  { path: "/v/physics/intro.md", name: "intro.md", ext: "md" },
  { path: "/v/my folder/note.md", name: "note.md", ext: "md" },
  { path: "/v/Álgebra/Teoría.md", name: "Teoría.md", ext: "md" },
  { path: "/v/data/growth.csv", name: "growth.csv", ext: "csv" },
  { path: "/v/other/growth.csv", name: "growth.csv", ext: "csv" },
  { path: "/v/data/rates.csv", name: "rates.csv", ext: "csv" },
]

const CONTENT: Record<string, string> = {
  [CURRENT]: [
    "# Intro {#sec:intro}",
    "",
    ":::theorem[Mixing time]{#thm:mixing}",
    "A walk mixes quickly.",
    ":::",
    "",
    "$$",
    "\\gamma = 1 - \\lambda_2",
    "$$ {#eq:gap}",
    "",
    "## Results",
  ].join("\n"),
  "/v/notes/mixing-times.md": [
    ":::definition[Expander graph]{#def:expander}",
    "A regular graph with a gap.",
    ":::",
    "",
    ":::theorem[Cheeger bound]{#thm:cheeger}",
    "For every cut.",
    ":::",
    "",
    "$$ x^2 $$ {#eq:other}",
    "# Heading One",
    "## Second heading",
  ].join("\n"),
  "/v/my folder/note.md": ":::lemma[Spaces]{#lem:spaced}\nA lemma.\n:::",
  "/v/Álgebra/Teoría.md": ":::proposition[Accents]{#prop:accents}\nA proposition.\n:::",
  "/v/notes/intro.md": "# Notes intro",
  "/v/physics/intro.md": "# Physics intro",
}

const BIB: BibInput[] = [
  {
    key: "levin2017",
    author: "Levin, David A. and Peres, Yuval",
    title: "Markov Chains and Mixing Times",
    year: "2017",
    type: "book",
    fields: { publisher: "AMS" },
  },
  {
    key: "lubotzky1988",
    author: "Lubotzky, Alexander and Phillips, R. and Sarnak, Peter",
    title: "Ramanujan graphs",
    year: "1988",
    type: "article",
    fields: { journal: "Combinatorica", pages: "261-277" },
  },
]

function seed() {
  setUiLanguage("en")
  updateVaultFiles(FILES, ROOT)
  updateLabelIndex(
    scanStructuralLabels(
      Object.entries(CONTENT).map(([path, content]) => ({
        path,
        name: path.split("/").pop() ?? path,
        content,
      })),
    ),
  )
  updateBibSuggestions(BIB)
  updateMacroCompletions([])
  updateUserSnippets([])
  setCompletionCurrentFile(CURRENT)
  setCompletionCsvResolver((target) => {
    if (target.endsWith("growth.csv")) return "year,Population Size,rate\n2000,1,2\n"
    if (target.endsWith("rates.csv")) return "a;b;c\n1;2;3\n"
    return null
  })
  clearCsvHeaderCache()
  setLatexCommandsForTest(LATEX_COMMANDS)
}

/** The current file's own text with one more line at the end (the caret line). */
const doc = (line: string) => `${CONTENT[CURRENT]}\n\n${line}`

const labels = (r: { suggestions: monacoApi.languages.CompletionItem[] }) =>
  r.suggestions.map(labelOf)

beforeEach(seed)

describe("the cascade", () => {
  it("has one source per concern, snippets last", () => {
    expect(COMPLETION_SOURCES.length).toBe(10)
  })
})

describe("wikilinks [[", () => {
  it("suggests the moment [[ is typed, with an empty word", async () => {
    const r = await complete("see [[|")
    expect(labels(r)).toEqual(expect.arrayContaining(["mixing-times", "spectral-gap", "note"]))
  })

  it("does not double the auto-inserted ]] closer", async () => {
    const r = await complete("see [[|]]")
    const item = r.suggestions.find((s) => labelOf(s) === "mixing-times")!
    expect(accept("see [[|]]", item)).toBe("see [[mixing-times]]|")
  })

  it("adds ]] when nothing closes the link", async () => {
    const r = await complete("see [[mix|")
    const item = r.suggestions.find((s) => labelOf(s) === "mixing-times")!
    expect(accept("see [[mix|", item)).toBe("see [[mixing-times]]|")
  })

  it("adds nothing when an alias already closes the link later on the line", async () => {
    const r = await complete("[[mix||alias]]")
    const item = r.suggestions.find((s) => labelOf(s) === "mixing-times")!
    expect(accept("[[mix||alias]]", item)).toBe("[[mixing-times||alias]]")
  })

  it("shows the folder and writes the shortest unique path for a shared name", async () => {
    const r = await complete("[[intro|]]")
    const intros = r.suggestions.filter((s) => labelOf(s) === "intro")
    expect(intros).toHaveLength(2)
    const inserted = intros.map((s) => accept("[[intro|]]", s)).sort()
    expect(inserted).toEqual(["[[notes/intro]]|", "[[physics/intro]]|"])
    const folders = intros.map((s) => (s.label as { description?: string }).description).sort()
    expect(folders).toEqual(["notes", "physics"])
  })

  it("inserts the bare name for a unique note", async () => {
    const r = await complete("[[spec|]]")
    const item = r.suggestions.find((s) => labelOf(s) === "spectral-gap")!
    expect(accept("[[spec|]]", item)).toBe("[[spectral-gap]]|")
  })

  it("ranks notes from the current folder first", async () => {
    const r = await complete("[[|]]")
    const order = r.suggestions.map((s) => s.detail)
    expect(order[0]).toBe("papers/spectral-gap")
  })

  it("completes the headings of a note after #", async () => {
    const r = await complete("[[mixing-times#|]]")
    expect(labels(r)).toEqual(["Heading One", "Second heading"])
    expect(accept("[[mixing-times#|]]", r.suggestions[1])).toBe("[[mixing-times#Second heading]]|")
  })

  it("answers nothing for an alias being typed", async () => {
    const { model, position } = parseCaret("[[note|al|]]".replace("|al|", "|al"))
    const env = {
      monaco: fakeMonaco,
      model,
      position,
      line: model.getLineContent(1),
      before: "[[note|",
      after: "al]]",
    }
    expect(wikilinksSource(env)).toBeNull()
  })
})

describe("citations [@", () => {
  it("suggests on [@ with an empty word and does not double the closer", async () => {
    const r = await complete("as in [@|]")
    expect(labels(r)).toEqual(["levin2017", "lubotzky1988"])
    expect(accept("as in [@|]", r.suggestions[0])).toBe("as in [@levin2017|]")
  })

  it("adds ] when the bracket is not closed", async () => {
    const r = await complete("as in [@lev|")
    expect(accept("as in [@lev|", r.suggestions[0])).toBe("as in [@levin2017|]")
  })

  it("finds an entry by author, title and year, not only by key", async () => {
    expect(labels(await complete("[@peres|]"))).toEqual(["levin2017"])
    expect(labels(await complete("[@ramanujan|]"))).toEqual(["lubotzky1988"])
    expect(labels(await complete("[@1988|]"))).toEqual(["lubotzky1988"])
    const r = await complete("[@peres|]")
    expect(r.suggestions[0].filterText).toContain("Markov Chains and Mixing Times")
  })

  it("shows author summary, title and a markdown card", async () => {
    const r = await complete("[@|]")
    const levin = r.suggestions.find((s) => labelOf(s) === "levin2017")!
    expect((levin.label as { description?: string }).description).toBe("Levin & Peres 2017")
    expect(levin.detail).toBe("Markov Chains and Mixing Times")
    const doc = (levin.documentation as { value: string }).value
    expect(doc).toContain("**Markov Chains and Mixing Times**")
    expect(doc).toContain("AMS")
    const lub = r.suggestions.find((s) => labelOf(s) === "lubotzky1988")!
    expect((lub.label as { description?: string }).description).toBe("Lubotzky et al. 1988")
    expect((lub.documentation as { value: string }).value).toContain("*Combinatorica*")
  })

  it("completes the next key after ; and after , @", async () => {
    const semi = await complete("[@levin2017; @|]")
    expect(labels(semi)).toContain("lubotzky1988")
    expect(accept("[@levin2017; @|]", semi.suggestions[0])).toBe("[@levin2017; @levin2017|]")
    const bare = await complete("[@levin2017; |]")
    expect(accept("[@levin2017; |]", bare.suggestions[0])).toBe("[@levin2017; @levin2017|]")
    const comma = await complete("[@levin2017, p. 3, @lub|]")
    expect(labels(comma)).toEqual(["lubotzky1988"])
  })

  it("leaves a locator alone: no suggestions while typing p. 3", async () => {
    const r = await complete("[@levin2017, p|")
    // Not a citation context: the fall-through source stays silent for one letter.
    expect(labels(r)).not.toContain("levin2017")
  })
})

describe("labels @kind:", () => {
  it("lists same-file labels first, in document order, on @thm:", async () => {
    const r = await complete(doc("by @thm:|"))
    expect(labels(r)).toEqual(["mixing", "cheeger"])
    expect(r.suggestions[0].sortText! < r.suggestions[1].sortText!).toBe(true)
  })

  it("inserts a bare reference for a label of this file", async () => {
    const r = await complete(doc("by @thm:|"))
    expect(accept("by @thm:|", r.suggestions[0])).toBe("by @thm:mixing|")
  })

  it("inserts @path@kind:name for an environment of another file", async () => {
    const r = await complete(doc("by @thm:|"))
    const other = r.suggestions.find((s) => labelOf(s) === "cheeger")!
    expect(accept("by @thm:|", other)).toBe("by @notes/mixing-times@thm:cheeger|")
  })

  it("uses the @[...]@ form for a path with spaces", async () => {
    const r = await complete(doc("@lem:|"))
    expect(accept("@lem:|", r.suggestions[0])).toBe("@[my folder/note]@lem:spaced|")
  })

  it("brackets a path with accents, which the renderer cannot read bare", async () => {
    const r = await complete(doc("@prop:|"))
    expect(accept("@prop:|", r.suggestions[0])).toBe("@[Álgebra/Teoría]@prop:accents|")
    const path = await complete("@Álg|")
    const item = path.suggestions.find((s) => labelOf(s) === "Álgebra/Teoría")!
    expect(accept("@Álg|", item)).toBe("@[Álgebra/Teoría]@|")
    // Typing inside the bracket form completes the label after it.
    const kinds = await complete("@[Álgebra/Teoría]@|")
    expect(labels(kinds)).toEqual(["prop:"])
    const names = await complete("@[Álgebra/Teoría]@prop:|")
    expect(labels(names)).toEqual(["accents"])
  })

  it("replaces the rest of the label past the caret, not the punctuation after it", async () => {
    const sentence = doc("see @thm:| Next.")
    const r = await complete(sentence)
    expect(accept(sentence, r.suggestions[0])).toBe(doc("see @thm:mixing| Next."))
    const dash = doc("a @thm:|-style proof")
    expect(accept(dash, (await complete(dash)).suggestions[0])).toBe(
      doc("a @thm:mixing|-style proof"),
    )
    const period = doc("so @thm:mi|xing.")
    expect(accept(period, (await complete(period)).suggestions[0])).toBe(doc("so @thm:mixing|."))
    // A label that continues past the caret is still replaced as a whole.
    const inner = doc("so @thm:mi|xing-two.")
    expect(accept(inner, (await complete(inner)).suggestions[0])).toBe(doc("so @thm:mixing|."))
  })

  it("does the same after a cross-file path", async () => {
    const text = "see @notes/mixing-times@thm:|."
    const r = await complete(text)
    expect(accept(text, r.suggestions[0])).toBe("see @notes/mixing-times@thm:cheeger|.")
  })

  it("never offers an equation, figure, table or section of another file", async () => {
    const eq = await complete(doc("@eq:|"))
    expect(labels(eq)).toEqual(["gap"])
    const sec = await complete(doc("@sec:|"))
    expect(labels(sec)).toEqual(["intro"])
  })

  it("narrows by the typed prefix and by the environment title", async () => {
    expect(labels(await complete(doc("@thm:chee|")))).toEqual(["cheeger"])
    expect(labels(await complete(doc("@thm:bound|")))).toEqual(["cheeger"])
  })

  it("accepts the kind aliases (@theorem: -> @thm:)", async () => {
    const r = await complete(doc("@theorem:|"))
    expect(accept("@theorem:|", r.suggestions[0])).toBe("@thm:mixing|")
  })

  it("shows the environment title and number, and the equation number", async () => {
    const thm = (await complete(doc("@thm:|"))).suggestions[0]
    expect((thm.label as { description?: string }).description).toBe("Theorem 1 · Mixing time")
    const eq = (await complete(doc("@eq:|"))).suggestions[0]
    expect((eq.label as { description?: string }).description).toBe("Equation (1)")
  })

  it("sees a label typed a second ago, before the vault scan catches up", async () => {
    const r = await complete(
      [":::lemma[Fresh]{#lem:fresh}", "text", ":::", "see @lem:|"].join("\n"),
    )
    expect(labels(r)).toContain("fresh")
    expect(labels(r)[0]).toBe("fresh")
  })

  it("does not treat the inner @def: of a cross-file reference as a local one", async () => {
    const r = await complete("see @notes/mixing-times@def:|")
    expect(labels(r)).toEqual(["expander"])
    expect(accept("see @notes/mixing-times@def:|", r.suggestions[0])).toBe(
      "see @notes/mixing-times@def:expander|",
    )
    // The same text with a path that holds no definitions offers nothing, not local labels.
    expect(labels(await complete("see @papers/spectral-gap@def:|"))).toEqual([])
  })

  it("completes the kinds available in the named note after @path@", async () => {
    const r = await complete("@notes/mixing-times@|")
    expect(labels(r).sort()).toEqual(["def:", "thm:"])
    expect(r.suggestions[0].command?.id).toBe("editor.action.triggerSuggest")
    expect(
      accept(
        "@notes/mixing-times@|",
        r.suggestions.find((s) => labelOf(s) === "def:")!,
      ),
    ).toBe("@notes/mixing-times@def:|")
  })

  it("completes vault paths on @ + letters and re-triggers for the kind", async () => {
    const r = await complete("@mixing|")
    const path = r.suggestions.find((s) => labelOf(s) === "notes/mixing-times")!
    expect(accept("@mixing|", path)).toBe("@notes/mixing-times@|")
    expect(path.command?.id).toBe("editor.action.triggerSuggest")
    const spaced = await complete("@spaced|".replace("spaced", "folder"))
    const sp = spaced.suggestions.find((s) => labelOf(s) === "my folder/note")!
    expect(accept("@folder|", sp)).toBe("@[my folder/note]@|")
  })

  it("lists the reference kinds on a bare @", async () => {
    const r = await complete("see @|")
    expect(labels(r)).toEqual(
      expect.arrayContaining(["eq:", "fig:", "tbl:", "sec:", "thm:", "def:", "data:"]),
    )
    expect(
      accept(
        "see @|",
        r.suggestions.find((s) => labelOf(s) === "thm:")!,
      ),
    ).toBe("see @thm:|")
  })

  it("does not fire on an e-mail address", async () => {
    const r = await complete("write to ada@thm:|".replace("thm:", "x"))
    expect(labels(r)).toEqual([])
  })

  it("resolves a lazy documentation card for the focused label", async () => {
    const { resolveLabelItem } = await import("./labels")
    const eq = (await complete(doc("@eq:|"))).suggestions[0]
    expect(eq.documentation).toBeUndefined()
    resolveLabelItem(eq)
    expect((eq.documentation as { value: string }).value).toContain("Equation (1)")
    const thm = (await complete(doc("@thm:|"))).suggestions[0]
    resolveLabelItem(thm)
    expect((thm.documentation as { value: string }).value).toContain("Theorem 1 · Mixing time")
  })
})

describe("label slot {#", () => {
  it("offers a slug from the environment title, unique in the vault", async () => {
    const r = await complete(":::theorem[Mixing time]{#|}")
    // thm:mixing-time is free; thm:mixing exists but is a different slug.
    expect(labels(r)).toEqual(["thm:mixing-time"])
    expect(accept(":::theorem[Mixing time]{#|}", r.suggestions[0])).toBe(
      ":::theorem[Mixing time]{#thm:mixing-time}|",
    )
  })

  it("numbers the slug when the label already exists", async () => {
    const r = await complete(":::theorem[Mixing]{#|}")
    expect(labels(r)).toEqual(["thm:mixing-2"])
  })

  it("derives a section slug from the heading, with accents folded", async () => {
    const r = await complete("# Convergencia rápida {#|")
    expect(labels(r)).toEqual(["sec:convergencia-rapida"])
    expect(accept("# Convergencia rápida {#|", r.suggestions[0])).toBe(
      "# Convergencia rápida {#sec:convergencia-rapida}|",
    )
  })

  it("offers the kind prefix for an equation, which has no title", async () => {
    const r = await complete("$$ x $$ {#|}")
    expect(labels(r)).toEqual(["eq:"])
  })
})

describe("footnotes [^", () => {
  const DOC = ["Text[^1] and more[^note].", "", "[^1]: First.", "[^3]: Third.", ""].join("\n")

  it("suggests on [^ with an empty word: defined notes plus the next free number", async () => {
    const r = await complete(DOC + "\nand [^|]")
    expect(labels(r)).toEqual(["4", "1", "3", "note"])
    const next = r.suggestions[0]
    expect((next.label as { description?: string }).description).toBe("next free number")
    expect(accept("and [^|]", next)).toBe("and [^4]|")
  })

  it("marks used-but-undefined notes", async () => {
    const r = await complete(DOC + "\nand [^|]")
    const note = r.suggestions.find((s) => labelOf(s) === "note")!
    expect((note.label as { description?: string }).description).toBe("used but not defined yet")
    const one = r.suggestions.find((s) => labelOf(s) === "1")!
    expect((one.label as { description?: string }).description).toBe("defined on line 3")
  })

  it("does not count the footnote being typed as used", async () => {
    const r = await complete("[^|]")
    expect(labels(r)).toEqual(["1"])
    const typed = await complete("[^7|]")
    expect(labels(typed)).toEqual([])
  })

  it("adds ] when the bracket is not closed", async () => {
    const text = DOC + "\nx [^3|"
    const r = await complete(text)
    expect(
      accept(
        text,
        r.suggestions.find((s) => labelOf(s) === "3")!,
      )
        .split("\n")
        .pop(),
    ).toBe("x [^3]|")
  })
})

describe("frontmatter", () => {
  it("lists the keys not used yet", async () => {
    const r = await complete("---\ntitle: A\n|\n---\nbody")
    expect(labels(r)).not.toContain("title")
    expect(labels(r)).toEqual(
      expect.arrayContaining(["author", "date", "tags", "lang", "comdtex.texclass"]),
    )
    const author = r.suggestions.find((s) => labelOf(s) === "author")!
    expect(accept("---\ntitle: A\n|\n---", author).split("\n")[2]).toBe("author: |")
    expect(author.command?.id).toBe("editor.action.triggerSuggest")
  })

  it("inserts a list skeleton for tags", async () => {
    const r = await complete("---\nta|\n---")
    const tags = r.suggestions.find((s) => labelOf(s) === "tags")!
    expect(accept("---\nta|\n---", tags).split("\n")[1]).toBe("tags: [|]")
  })

  it("completes the language, texclass and citestyle values", async () => {
    expect(labels(await complete("---\nlang: |\n---"))).toEqual(["en", "es"])
    const tex = await complete("---\ncomdtex.texclass: |\n---")
    expect(labels(tex).sort()).toEqual(["acmart", "apa7", "elsarticle", "ieeetran"])
    const cite = await complete("---\ncomdtex.citestyle: |\n---")
    expect(labels(cite)).toEqual(
      expect.arrayContaining(["default", "vancouver", "ama", "apa", "author-year"]),
    )
    const domain = await complete("---\ncomdtex.domain: |\n---")
    expect(labels(domain)).toEqual(["biology", "microbiology", "biomedicine"])
  })

  it("offers today for date", async () => {
    const r = await complete("---\ndate: |\n---")
    expect(labels(r)[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("stays out of the way once the closing fence is behind the cursor", async () => {
    const r = await complete("---\ntitle: A\n---\nlang: |")
    expect(labels(r)).not.toContain("en")
  })

  const fm = (text: string) => new FakeModel(text)

  it("is not a header when a leading --- is a thematic break above prose", async () => {
    expect(labels(await complete("---\nA first paragraph.\nti|"))).not.toContain("title")
    expect(labels(await complete("---\n\nText\nti|"))).not.toContain("title")
    expect(wantsSuggest(fm("---\nProse here\nti"), 3, "ti")).toBe(false)
    expect(wantsSuggest(fm("---\n\nText\nti"), 4, "ti")).toBe(false)
  })

  it("is still a header while it is typed, before any closing fence", async () => {
    expect(labels(await complete("---\ntitle: A\nau|"))).toContain("author")
    expect(labels(await complete("---\n|"))).toContain("title")
    expect(wantsSuggest(fm("---\ntitle: A\nau"), 3, "au")).toBe(true)
    expect(wantsSuggest(fm("---\ntags:\n  - a\nau"), 4, "au")).toBe(true)
  })

  it("does not treat a document without a leading --- as frontmatter", async () => {
    const r = await complete("hello\n---\n|\n---")
    expect(labels(r)).not.toContain("author")
  })
})

describe(":::csv and :::data", () => {
  it("completes vault CSV paths, disambiguating same-named files", async () => {
    const r = await complete(":::csv\n|\n:::")
    expect(r.suggestions.map((s) => s.insertText).sort()).toEqual([
      "data/growth.csv",
      "other/growth.csv",
      "rates.csv",
    ])
  })

  it("completes a path prefix and replaces the token", async () => {
    const r = await complete(":::csv[Rates]\nrat|\n:::")
    expect(accept(":::csv[Rates]\nrat|\n:::", r.suggestions[0]).split("\n")[1]).toBe("rates.csv|")
  })

  it("offers the column headers inside the first parentheses", async () => {
    const r = await complete(":::csv\ndata/growth.csv (|\n:::")
    expect(labels(r)).toEqual(["year", "Population Size", "rate"])
    const letter = (r.suggestions[1].label as { description?: string }).description
    expect(letter).toBe("column B")
  })

  it("completes the header after a comma and a colon in the selection", async () => {
    const r = await complete(":::csv\ndata/growth.csv (year, Pop|\n:::")
    expect(
      accept(":::csv\ndata/growth.csv (year, Pop|\n:::", r.suggestions[1]).split("\n")[1],
    ).toBe("data/growth.csv (year, Population Size|")
  })

  it("sniffs the delimiter of the header row", async () => {
    const r = await complete(":::data{#data:r}\ndata/rates.csv (|\n:::")
    expect(labels(r)).toEqual(["a", "b", "c"])
  })

  it("reads the file of a key/value block for cols:", async () => {
    const r = await complete(":::csv\nfile: data/growth.csv\ncols: |\n:::")
    expect(labels(r)).toEqual(["year", "Population Size", "rate"])
  })

  it("hands @data: references to the label source", async () => {
    const r = await complete(":::csv\n@data:|\n:::")
    expect(labels(r)).toEqual([])
    const withData = await complete(":::data{#data:growth}\nx.csv\n:::\n:::csv\n@data:|\n:::")
    expect(labels(withData)).toEqual(["growth"])
  })

  it("caches headers by the resolver's string", async () => {
    let reads = 0
    const text = "p,q\n1,2\n"
    setCompletionCsvResolver(() => {
      reads++
      return text
    })
    await complete(":::csv\nx.csv (|\n:::")
    await complete(":::csv\nx.csv (|\n:::")
    expect(reads).toBe(2) // read each time (cheap lookup), parsed once:
    const { csvHeaders } = await import("./csvBlocks")
    expect(csvHeaders("x.csv")).toEqual(["p", "q"])
  })
})

describe("latex commands", () => {
  it("opens on a bare backslash with the whole table", async () => {
    const r = await complete("a \\|")
    expect(r.suggestions.length).toBeGreaterThan(800)
  })

  it("filters by prefix, shows the glyph and the argument snippet", async () => {
    const alpha = (await complete("\\alp|")).suggestions
    expect(alpha.map(labelOf)).toEqual(["alpha"])
    expect(alpha[0].detail).toBe("α")
    const frac = (await complete("\\fra|")).suggestions.find((s) => labelOf(s) === "frac")!
    expect(frac.insertText).toBe("\\frac{${1}}{${2}}")
    expect(accept("\\fra|", frac)).toBe("\\frac{|}{}")
  })

  it("puts user macros first", async () => {
    updateMacroCompletions(["\\rr", "\\ra"])
    const r = await complete("\\r|")
    expect(r.suggestions.slice(0, 2).map(labelOf).sort()).toEqual(["ra", "rr"])
    expect(r.suggestions[0].detail).toBe("user macro")
    const rho = r.suggestions.find((s) => labelOf(s) === "rho")!
    expect(r.suggestions[0].sortText! < rho.sortText!).toBe(true)
  })

  it("completes environments after \\begin{ and swallows the auto-closed brace", async () => {
    const r = await complete("\\begin{pm|}")
    const env = r.suggestions.find((s) => labelOf(s) === "begin{pmatrix}")!
    expect(accept("\\begin{pm|}", env)).toBe("\\begin{pmatrix}\n\t|\n\\end{pmatrix}")
  })

  it("ignores an escaped backslash (a line break)", async () => {
    const r = await complete("a \\\\|")
    expect(r.suggestions.length).toBe(0)
  })

  it("covers the commands the old hard-coded list had", () => {
    const names = new Set(LATEX_COMMANDS.map((r) => r[0]))
    for (const n of [
      "alpha",
      "beta",
      "sum",
      "int",
      "infty",
      "partial",
      "nabla",
      "mathbb{R}",
      "log",
    ]) {
      expect(names.has(n)).toBe(true)
    }
  })
})

describe("shorthand and block snippets still work", () => {
  it("lists block types on bare :::", async () => {
    const r = await complete(":::|")
    expect(labels(r)).toEqual(expect.arrayContaining(["theorem", ":::truth"]))
  })

  it("offers shorthands from two letters and the user's own snippets first", async () => {
    updateUserSnippets([{ label: "fraction", detail: "mine", snippet: "mine" }])
    const r = await complete("fra|")
    expect(labels(r)[0]).toBe("fraction")
    expect(labels(r)).toContain("frac")
  })

  it("stays silent for a single letter", async () => {
    expect(labels(await complete("f|"))).toEqual([])
  })

  it("switches to the block's keywords inside :::pseudocode", async () => {
    const r = await complete(":::pseudocode\nWH|\n:::")
    expect(labels(r)).toEqual(["WHILE"])
  })
})

describe("signature help", () => {
  function provider() {
    let registered: monacoApi.languages.SignatureHelpProvider | null = null
    const monaco = {
      languages: {
        registerSignatureHelpProvider: (
          _lang: string,
          p: monacoApi.languages.SignatureHelpProvider,
        ) => {
          registered = p
          return { dispose() {} }
        },
      },
    } as unknown as typeof monacoApi
    registerSignatureHelp(monaco)
    return registered! as monacoApi.languages.SignatureHelpProvider
  }
  function help(text: string) {
    const { model, position } = parseCaret(text)
    const result = provider().provideSignatureHelp(
      model as unknown as monacoApi.editor.ITextModel,
      position as monacoApi.Position,
      {} as monacoApi.CancellationToken,
      {} as monacoApi.languages.SignatureHelpContext,
    ) as monacoApi.languages.SignatureHelpResult | null
    return result?.value ?? null
  }

  it("highlights the current argument", () => {
    const first = help("frac(|")!
    expect(first.signatures[0].label).toBe("frac(num, den)")
    expect(first.activeParameter).toBe(0)
    const second = help("frac(a, |")!
    expect(second.activeParameter).toBe(1)
    const [start, end] = second.signatures[0].parameters![1].label as [number, number]
    expect(second.signatures[0].label.slice(start, end)).toBe("den")
  })

  it("follows the innermost shorthand call and ignores nested commas", () => {
    expect(help("frac(sqrt(x, |")!.signatures[0].label).toMatch(/^sqrt\(/)
    expect(help("frac(f(a, b), |")!.activeParameter).toBe(1)
    expect(help("frac([1, 2], |")!.activeParameter).toBe(1)
  })

  it("is silent outside a shorthand, for LaTeX commands and inside special blocks", () => {
    expect(help("hello (|")).toBeNull()
    expect(help("\\frac(a, |")).toBeNull()
    expect(help("frac(a, b)|")).toBeNull()
    expect(help(":::plot\nsqrt(|\n:::")).toBeNull()
  })

  it("covers exactly the shorthands the linter counts, with matching arities", () => {
    const sigs = getShorthandSignatures()
    expect([...sigs.keys()].sort()).toEqual(Object.keys(EXPECTED_ARGS).sort())
    for (const [name, count] of Object.entries(EXPECTED_ARGS)) {
      if (count !== null) expect(sigs.get(name)!.params).toHaveLength(count)
    }
  })

  it("finds the call frame from the line prefix alone", () => {
    expect(findShorthandCall("x = frac(1, 2) + sum(i=0, ")).toEqual({ name: "sum", index: 1 })
    expect(findShorthandCall("frac(1, 2)")).toBeNull()
  })
})

describe("Enter on an opening fence", () => {
  const doc = (lines: string[]) => ({
    get: (n: number) => lines[n - 1] ?? "",
    count: lines.length,
  })

  it("adds the closing fence on its own line, caret in between", () => {
    const d = doc([":::theorem[Main]"])
    const edit = resolveBlockCloserEnter(d.get, d.count, 1, 17, "\n")
    expect(edit).toEqual({ text: "\n\n:::", caretLine: 2 })
  })

  it("does nothing inside a fenced code block", () => {
    const d = doc(["```md", ":::theorem", "```"])
    expect(resolveBlockCloserEnter(d.get, d.count, 2, 11, "\n")).toBeNull()
    const after = doc(["```", "x", "```", ":::theorem"])
    expect(resolveBlockCloserEnter(after.get, after.count, 4, 11, "\n")).not.toBeNull()
  })

  it("does nothing when a later fence already closes it", () => {
    const d = doc([":::theorem", "text", ":::"])
    expect(resolveBlockCloserEnter(d.get, d.count, 1, 11, "\n")).toBeNull()
  })

  it("counts nested blocks: an inner pair does not close the outer one", () => {
    const d = doc([":::theorem", ":::proof", "x", ":::"])
    expect(resolveBlockCloserEnter(d.get, d.count, 1, 11, "\n")).not.toBeNull()
  })

  it("ignores a mid-line caret and non-fence lines", () => {
    const d = doc([":::theorem", "hello"])
    expect(resolveBlockCloserEnter(d.get, d.count, 1, 5, "\n")).toBeNull()
    expect(resolveBlockCloserEnter(d.get, d.count, 2, 6, "\n")).toBeNull()
  })

  it("closes size-prefixed, labelled and bare ::: openers of unknown types alike", () => {
    for (const line of [":::lg theorem", ":::definition[Gap]{#def:gap}", ":::graph"]) {
      const d = doc([line])
      expect(resolveBlockCloserEnter(d.get, d.count, 1, line.length + 1, "\n")).not.toBeNull()
    }
  })

  it("uses the document's line ending", () => {
    const d = doc([":::note"])
    expect(resolveBlockCloserEnter(d.get, d.count, 1, 8, "\r\n")!.text).toBe("\r\n\r\n:::")
  })
})

describe("re-trigger rules", () => {
  const model = (text: string) => new FakeModel(text.replace("|", ""))

  it("re-opens after '; ' in a multi-cite", () => {
    const m = model("[@a; |")
    expect(wantsSuggest(m, 1, "[@a; ")).toBe(true)
    expect(wantsSuggest(m, 1, "plain; ")).toBe(false)
  })

  it("re-opens for frontmatter keys and values only inside the header", () => {
    const m = model("---\nti|\n---\nbody")
    expect(wantsSuggest(m, 2, "ti")).toBe(true)
    expect(wantsSuggest(m, 2, "title: ")).toBe(true)
    expect(wantsSuggest(model("---\nx\n---\nbody"), 4, "bo")).toBe(false)
  })

  it("re-opens inside :::csv but not in prose", () => {
    expect(wantsSuggest(model(":::csv\nda|\n:::"), 2, "da")).toBe(true)
    expect(wantsSuggest(model("da|"), 1, "da")).toBe(false)
  })

  it("re-opens for shorthand words only inside math", () => {
    expect(wantsSuggest(model("$fra|$"), 1, "$fra")).toBe(true)
    expect(wantsSuggest(model("fra|"), 1, "fra")).toBe(false)
    expect(wantsSuggest(model("$$\nfra|\n$$"), 2, "fra")).toBe(true)
  })

  it("detects math by dollar parity and multi-line fences", () => {
    const m = model("a\n$$\nx\n$$\nb")
    expect(isInMath(m, 3, "x")).toBe(true)
    expect(isInMath(m, 5, "b")).toBe(false)
    expect(isInMath(model("$a$ and $b"), 1, "$a$ and $b")).toBe(true)
    expect(isInMath(model("$a$ and b"), 1, "$a$ and b")).toBe(false)
  })
})
