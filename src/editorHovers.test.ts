import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHoverProvider, previewLines, setBibHoverEntries } from "./editorHovers"
import { configureEditorNavigation } from "./editorNavigation"
import { cancelToken, createFakeMonaco, editorModel, type FakeModel } from "./fakeMonaco.testutil"
import { resetEditorNavigation } from "./navHost"
import type { NavFile } from "./navScan"
import { perfBudget } from "./perfBudget"

const A_TEXT = [
  "---",
  "title: A",
  "---",
  "",
  "$$",
  "x = 1",
  "$$ {#eq:first}",
  "",
  "```tex",
  "$$ y = 2 $$ {#eq:fenced}",
  "```",
  "",
  "$$ z = 3 $$ {#eq:second}",
  "",
  ":::lemma[Cheeger bound]{#lem:cheeger}",
  "First body line with $x$.",
  "Second body line.",
  ":::",
  "",
  "Refs: @eq:second, @lem:cheeger, @sub/b@def:far, @thm:nowhere, @fig:pic.",
  "Cites: [@one; @two, p. 3] and [@ghost].",
  "Notes: [[b]], [[b#Second part]], [[unloaded]], [[nope]], [[lazy#Second part]].",
  "Footnote[^n].",
  "",
  "[^n]: The footnote text.",
  "",
  "![A figure](pic.png){#fig:pic}",
].join("\n")

const B_TEXT = [
  "# B",
  "---",
  "intro line",
  "",
  "## Second part",
  "part body",
  "",
  "## Third",
  "later",
  "",
  ":::definition[Far def]{#def:far}",
  "Defined far away.",
  ":::",
].join("\n")

const files: NavFile[] = [
  { path: "/v/a.md", name: "a.md", content: A_TEXT },
  { path: "/v/sub/b.md", name: "b.md", content: B_TEXT },
  // The text cache has not reached this note yet.
  { path: "/v/unloaded.md", name: "unloaded.md", content: "" },
  { path: "/v/lazy.md", name: "lazy.md", content: "" },
]

describe("hover cards", () => {
  let model: FakeModel
  let provider: ReturnType<typeof createHoverProvider>
  const readText = vi.fn(async (path: string) =>
    path === "/v/unloaded.md"
      ? "Read later\n"
      : path === "/v/lazy.md"
        ? "# Lazy\nintro\n\n## Second part\nlazy part body\n\n## Third\nlater\n"
        : null,
  )

  beforeEach(() => {
    resetEditorNavigation()
    readText.mockClear()
    configureEditorNavigation({
      getActivePath: () => "/v/a.md",
      getFiles: () => files,
      readText,
    })
    setBibHoverEntries([
      {
        key: "one",
        type: "book",
        fields: { title: "Book One", author: "Ada", year: "2001", publisher: "Pub" },
      },
      { key: "two", type: "article", fields: { title: "Paper Two", journal: "J", year: "2002" } },
    ])
    model = editorModel(A_TEXT)
    provider = createHoverProvider(createFakeMonaco().api)
  })

  async function hover(needle: string, shift = 1) {
    const lines = A_TEXT.split("\n")
    const lineNumber = lines.findIndex((l) => l.includes(needle)) + 1
    const column = lines[lineNumber - 1].indexOf(needle) + 1 + shift
    const out = (await provider.provideHover(
      model as never,
      { lineNumber, column } as never,
      cancelToken,
    )) as {
      contents: { value: string }[]
      range: { startColumn: number; endColumn: number }
    } | null
    return out ? { ...out, text: out.contents.map((c) => c.value).join("\n---\n") } : null
  }

  it("shows one card per key of a grouped citation, whichever key is hovered", async () => {
    for (const needle of ["@one", "@two"]) {
      const h = (await hover(needle))!
      expect(h.contents).toHaveLength(2)
      expect(h.contents[0].value).toContain("**Book One**")
      expect(h.contents[0].value).toContain("_Ada_")
      expect(h.contents[0].value).toContain("2001, Pub")
      expect(h.contents[1].value).toContain("**Paper Two**")
      expect(h.contents[1].value).toContain("`@article{two}`")
    }
    const line = A_TEXT.split("\n").find((l) => l.startsWith("Cites"))!
    const h = (await hover("@one"))!
    expect(line.slice(h.range.startColumn - 1, h.range.endColumn - 1)).toBe("[@one; @two, p. 3]")
  })

  it("flags a key that is not in the bibliography", async () => {
    const h = (await hover("@ghost"))!
    expect(h.text).toContain("`@ghost`")
    expect(h.text).toContain("Not found: @ghost")
  })

  it("previews any vault note from the text cache, not only open tabs", async () => {
    const h = (await hover("[[b]]"))!
    expect(h.contents[0].value).toBe("**b**")
    expect(h.contents[1].value).toContain("# B")
    expect(h.contents[1].value).toContain("intro line")
    expect(readText).not.toHaveBeenCalled()
  })

  it("previews just the section for [[note#heading]]", async () => {
    const h = (await hover("[[b#Second part]]"))!
    expect(h.contents[0].value).toBe("**b › Second part**")
    expect(h.contents[1].value).toBe("part body")
  })

  it("reads a note asynchronously when its text has not been cached yet", async () => {
    const h = (await hover("[[unloaded]]"))!
    expect(readText).toHaveBeenCalledWith("/v/unloaded.md")
    expect(h.contents[1].value).toBe("Read later")
  })

  it("previews just the section of a note that still has to be read", async () => {
    const h = (await hover("[[lazy#Second part]]"))!
    expect(readText).toHaveBeenCalledWith("/v/lazy.md")
    expect(h.contents[0].value).toBe("**lazy › Second part**")
    expect(h.contents[1].value).toBe("lazy part body")
  })

  it("says so for a note that does not exist", async () => {
    expect((await hover("[[nope]]"))!.text).toContain("Not found: [[nope]]")
  })

  it("numbers @eq like the preview, ignoring $$ in code fences", async () => {
    // first = 1, the fenced one does not count, second = 2.
    const h = (await hover("@eq:second"))!
    expect(h.contents[0].value).toBe("**Equation (2)**")
    expect(h.text).toContain("z = 3")
    const first = (await provider.provideHover(
      editorModel("@eq:first\n" + A_TEXT) as never,
      { lineNumber: 1, column: 3 } as never,
      cancelToken,
    )) as { contents: { value: string }[] }
    expect(first.contents[0].value).toBe("**Equation (1)**")
  })

  it("shows an environment's title, number and first body lines for @thm refs", async () => {
    const h = (await hover("@lem:cheeger"))!
    expect(h.contents[0].value).toBe("**Lemma 1 (Cheeger bound)**")
    expect(h.contents[1].value).toBe("First body line with $x$.  \nSecond body line.")
    expect(h.contents[2].value).toContain("a.md, line 15")
  })

  it("resolves a cross-file @doc@def:x ref in the other file", async () => {
    const h = (await hover("@sub/b@def:far"))!
    expect(h.contents[0].value).toBe("**Definition 1 (Far def)**")
    expect(h.contents[1].value).toBe("Defined far away.")
    expect(h.contents[2].value).toContain("b.md, line 11")
  })

  it("reports an unresolved reference", async () => {
    expect((await hover("@thm:nowhere"))!.text).toContain("Not found: thm:nowhere")
  })

  it("shows the context line for figures", async () => {
    const h = (await hover("@fig:pic"))!
    expect(h.contents[0].value).toBe("**fig:pic**")
    expect(h.contents[1].value).toContain("![A figure](pic.png)")
  })

  it("keeps the footnote hover", async () => {
    const h = (await hover("[^n]"))!
    expect(h.text).toContain("**Footnote:** The footnote text.")
  })

  it("returns nothing on plain text", async () => {
    expect(await hover("First body line", 0)).toBeNull()
  })

  it("answers within the hover budget on a large vault", async () => {
    const big: NavFile[] = Array.from({ length: 300 }, (_, i) => ({
      path: `/v/n${i}.md`,
      name: `n${i}.md`,
      content: Array.from(
        { length: 20 },
        (_, j) => `:::lemma{#lem:l${i}_${j}}\nbody @lem:l${i}_${(j + 1) % 20}\n:::`,
      ).join("\n"),
    }))
    big.push(files[0])
    configureEditorNavigation({ getFiles: () => big })
    await hover("@lem:cheeger") // warms the index
    const t = performance.now()
    for (let i = 0; i < 20; i++) await hover("@lem:cheeger")
    expect((performance.now() - t) / 20).toBeLessThan(perfBudget(5))
  })
})

describe("previewLines", () => {
  it("cuts long lines so the card stays narrow", () => {
    const out = previewLines("x".repeat(200), 3)
    expect(out).toHaveLength(72)
    expect(out.endsWith("…")).toBe(true)
  })

  it("keeps the first non-blank lines and marks a cut", () => {
    expect(previewLines("a\n\nb\nc\nd", 2)).toBe("a  \nb  \n…")
    expect(previewLines("a\nb", 5)).toBe("a  \nb")
    expect(previewLines("\n\n", 5)).toBe("")
  })
})
