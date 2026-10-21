import { describe, expect, it } from "vitest"
import {
  NavDb,
  constructAt,
  constructsInLine,
  indexFile,
  listEnvironments,
  listNumberedMath,
  maskCode,
} from "./navScan"
import { prescanEquations } from "./equations"

describe("constructsInLine", () => {
  it("finds wikilinks, transclusions and headings in links", () => {
    const line = "See [[mixing-times]], ![[intro#Setup|the setup]] and [[a/b]]."
    const found = constructsInLine(line)
    expect(found.map((c) => c.type)).toEqual(["wikilink", "wikilink", "wikilink"])
    expect(found[0]).toMatchObject({ note: "mixing-times", heading: null, embed: false })
    expect(found[1]).toMatchObject({ note: "intro", heading: "Setup", embed: true })
    expect(found[2]).toMatchObject({ note: "a/b" })
    expect(line.slice(found[0].start, found[0].end)).toBe("[[mixing-times]]")
  })

  it("finds local, cross-file and escaped cross-file references", () => {
    const line = "Use @lem:cheeger, @gp/cal@def:x and @[my folder/note]@thm:main.1 here"
    const refs = constructsInLine(line).filter((c) => c.type === "ref")
    expect(refs).toMatchObject([
      { id: "lem:cheeger", docPath: null },
      { id: "def:x", docPath: "gp/cal" },
      { id: "thm:main.1", docPath: "my folder/note" },
    ])
  })

  it("normalizes the written kind and ignores unknown kinds", () => {
    const refs = constructsInLine("@theorem:a @lemma:b @foo:c").filter((c) => c.type === "ref")
    expect(refs.map((r) => (r as { id: string }).id)).toEqual(["thm:a", "lem:b"])
  })

  it("does not swallow a trailing period into the label", () => {
    const [ref] = constructsInLine("see @thm:main.")
    expect(ref).toMatchObject({ id: "thm:main" })
  })

  it("gives each key of a citation group its own span", () => {
    const line = "as shown [@alpha; @beta:2020, p. 3] and [@gamma]"
    const cites = constructsInLine(line).filter((c) => c.type === "cite")
    expect(cites.map((c) => (c as { key: string }).key)).toEqual(["alpha", "beta:2020", "gamma"])
    const beta = cites[1] as { start: number; end: number; groupStart: number; groupEnd: number }
    expect(line.slice(beta.start, beta.end)).toBe("@beta:2020")
    expect(line.slice(beta.groupStart, beta.groupEnd)).toBe("[@alpha; @beta:2020, p. 3]")
  })

  it("does not read a citation key as a label reference", () => {
    const found = constructsInLine("[@thm:levin] and [@smith:2020]")
    expect(found.every((c) => c.type === "cite")).toBe(true)
  })

  it("finds label definitions", () => {
    const [def] = constructsInLine(":::lemma[Bound]{#lem:cheeger}")
    expect(def).toMatchObject({ type: "labelDef", id: "lem:cheeger" })
  })

  it("skips constructs inside inline code", () => {
    expect(constructsInLine("`[[note]]` and `@thm:x` and `[@k]`")).toEqual([])
    expect(constructsInLine("`x` then [[note]]")).toHaveLength(1)
  })

  it("constructAt picks the construct under the column", () => {
    const line = "see [[a]] and @thm:x"
    expect(constructAt(line, 6)?.type).toBe("wikilink")
    expect(constructAt(line, 16)?.type).toBe("ref")
    expect(constructAt(line, 0)).toBeNull()
  })
})

describe("numbered math", () => {
  const doc = [
    "$$ a $$ {#eq:one}",
    "",
    "```tex",
    "$$ not an equation $$ {#eq:fenced}",
    "```",
    "",
    "~~~",
    "$$ nor this $$",
    "~~~",
    "",
    "`$$ inline code $$`",
    "",
    "$$",
    "b",
    "$$ {#eq:two}",
    "",
    "$c$ {#eq:inline}",
  ].join("\n")

  it("ignores $$ inside code fences and inline code, like the renderer", () => {
    const blocks = listNumberedMath(doc)
    expect(blocks.map((b) => [b.n, b.label])).toEqual([
      [1, "eq:one"],
      [2, "eq:two"],
      [3, "eq:inline"],
    ])
  })

  it("numbers exactly as prescanEquations does", () => {
    const fromRenderer = prescanEquations(doc)
    for (const b of listNumberedMath(doc)) {
      if (b.label) expect(fromRenderer.get(b.label)).toBe(b.n)
    }
  })

  it("keeps line numbers of the original text", () => {
    const two = listNumberedMath(doc).find((b) => b.label === "eq:two")!
    expect(two.startLine).toBe(13)
    expect(two.endLine).toBe(15)
    expect(two.body).toBe("b")
  })

  it("maskCode keeps offsets", () => {
    const text = "x\n```\n$$\n```\ny `a` z"
    expect(maskCode(text)).toHaveLength(text.length)
    expect(maskCode(text)).not.toContain("$$")
  })
})

describe("listEnvironments", () => {
  it("numbers per type and reads title, label and body", () => {
    const text = [
      ":::theorem[Main]{#thm:main}",
      "Body one.",
      ":::",
      "",
      ":::lemma{#lem:a}",
      "Lemma body",
      "line two",
      ":::",
      "",
      ":::theorem{#thm:second}",
      "Second",
      ":::",
    ].join("\n")
    const envs = listEnvironments(text)
    expect(envs.map((e) => [e.type, e.number, e.label, e.title])).toEqual([
      ["theorem", "1", "thm:main", "Main"],
      ["lemma", "1", "lem:a", ""],
      ["theorem", "2", "thm:second", ""],
    ])
    expect(envs[1].body).toBe("Lemma body\nline two")
    expect(envs[1].startLine).toBe(5)
  })
})

const files = [
  {
    path: "/v/a.md",
    name: "a.md",
    content: [
      "# Top {#sec:top}",
      "",
      ":::lemma{#lem:x}",
      "Body",
      ":::",
      "",
      "$$",
      "e = mc^2",
      "$$ {#eq:e}",
      "",
      "Use @lem:x and @eq:e and @b@thm:y and [[b#Deep Heading]] and [@key1].",
    ].join("\n"),
  },
  {
    path: "/v/sub/b.md",
    name: "b.md",
    content: [
      "# B",
      "",
      "## Deep Heading",
      "",
      ":::theorem{#thm:y}",
      "T",
      ":::",
      "",
      "@lem:x here",
    ].join("\n"),
  },
  { path: "/v/c.md", name: "c.md", content: ":::lemma{#lem:x}\nOwn\n:::\n\nuses @lem:x [[a]]" },
]

describe("NavDb", () => {
  const db = new NavDb(files)

  it("indexes labels, headings, refs and cites per file", () => {
    const a = indexFile(files[0])
    expect(a.labels.map((l) => l.id)).toEqual(["sec:top", "lem:x", "eq:e"])
    expect(a.headings.map((h) => h.text)).toEqual(["Top"])
    expect(a.cites.map((c) => c.key)).toEqual(["key1"])
    expect(indexFile(files[0])).toBe(a)
  })

  it("resolves a local ref in its own file first", () => {
    const hits = db.resolveRef({ id: "lem:x", docPath: null }, "/v/a.md")
    expect(hits.map((h) => h.file.path)).toEqual(["/v/a.md"])
  })

  it("falls back to the rest of the vault when the file has no such label", () => {
    const hits = db.resolveRef({ id: "thm:y", docPath: null }, "/v/a.md")
    expect(hits.map((h) => h.file.path)).toEqual(["/v/sub/b.md"])
  })

  it("resolves cross-file refs by vault-relative path only", () => {
    const hits = db.resolveRef({ id: "thm:y", docPath: "sub/b" }, "/v/a.md")
    expect(hits).toHaveLength(1)
    expect(db.resolveRef({ id: "thm:y", docPath: "a" }, "/v/c.md")).toEqual([])
    expect(db.resolveRef({ id: "lem:x", docPath: "c" }, "/v/a.md")[0].file.path).toBe("/v/c.md")
  })

  it("points an equation label at the start of its display block", () => {
    const [hit] = db.resolveRef({ id: "eq:e", docPath: null }, "/v/a.md")
    expect(db.targetOf(hit)).toMatchObject({ path: "/v/a.md", line: 7, endLine: 9, selLine: 7 })
  })

  it("finds notes by name, folder path and heading", () => {
    expect(db.findNote("b", "/v/a.md")?.path).toBe("/v/sub/b.md")
    expect(db.findNote("sub/b", null)?.path).toBe("/v/sub/b.md")
    expect(db.findNote("missing", null)).toBeNull()
    const b = db.file("/v/sub/b.md")!
    expect(db.findHeading(b, "deep heading")?.line).toBe(3)
  })

  it("lists usages of a label that resolve to its definition", () => {
    const usages = db.usagesOfLabel("lem:x", "/v/a.md")
    // a.md uses it; b.md has no own definition so its bare ref means a.md's; c.md defines its own.
    expect(usages.map((u) => u.file.path).sort()).toEqual(["/v/a.md", "/v/sub/b.md"])
    const cUsages = db.usagesOfLabel("lem:x", "/v/c.md")
    expect(cUsages.map((u) => u.file.path)).toEqual(["/v/c.md"])
  })

  it("lists backlinks to a note", () => {
    const a = db.file("/v/a.md")!
    expect(db.backlinks(a).map((b) => b.file.path)).toEqual(["/v/c.md"])
  })

  it("lists citation usages", () => {
    expect(db.usagesOfCite("key1")).toHaveLength(1)
    expect(db.usagesOfCite("nope")).toEqual([])
  })
})
