import { describe, it, expect } from "vitest"
import { toCmdxMd, toStorageMd } from "./cmdxFormat"

// open + save of an unchanged file must give back the same bytes
const roundTrip = (md: string): string => toStorageMd(toCmdxMd(md))

const TYPES = [
  "note",
  "tip",
  "warning",
  "info",
  "important",
  "abstract",
  "question",
  "success",
  "example",
  "danger",
  "quote",
  "failure",
  "bug",
  "hint",
  "caution",
  "theorem",
  "lemma",
  "definition",
  "proof",
  "remark",
  "exercise",
  "todo",
  "my-type",
  "NOTE",
  "Tip",
]

describe("callout round-trip is byte-identical", () => {
  for (const type of TYPES) {
    for (const fold of ["", "-", "+"]) {
      const head = `[!${type}]${fold}`
      const cases: [string, string][] = [
        ["no title, one line", `> ${head}\n> body`],
        ["title, one line", `> ${head} Hi\n> body`],
        ["title with colon", `> ${head} Note: Hi\n> body`],
        ["title only, empty body", `> ${head} Hi`],
        ["multi-line body", `> ${head} Hi\n> one\n> two\n> - item\n> - item`],
        ["labelled", `> ${head} Hi {#thm:x}\n> body`],
      ]
      for (const [name, md] of cases) {
        it(`${head}: ${name}`, () => {
          expect(roundTrip(md)).toBe(md)
        })
      }
    }
  }

  it("keeps callouts amid prose and a trailing newline", () => {
    const md = "# H\n\nText.\n\n> [!tip] Hi\n> body\n\nMore text.\n"
    expect(roundTrip(md)).toBe(md)
  })

  it("multi-paragraph body with '> ' blank lines", () => {
    const md = "> [!tip] Hi\n> first\n> \n> second"
    expect(roundTrip(md)).toBe(md)
  })

  it("multi-paragraph body with '>' blank lines", () => {
    const md = "> [!tip] Hi\n> first\n>\n> second"
    expect(roundTrip(md)).toBe(md)
  })

  it("nested content", () => {
    const md = "> [!info] Outer\n> text\n> > [!warning] Inner\n> > deep\n> back"
    expect(roundTrip(md)).toBe(md)
  })

  it("nested content under a foldable outer", () => {
    const md = "> [!tip]- Outer\n> > [!note] Inner\n> > deep"
    expect(roundTrip(md)).toBe(md)
  })

  it("lists, code and math in the body", () => {
    const md = "> [!example] Ex\n> 1. a\n> 2. b\n>\n> $$x^2$$\n>\n> ```py\n> print(1)\n> ```"
    expect(roundTrip(md)).toBe(md)
  })

  it("two adjacent callouts", () => {
    const md = "> [!tip] A\n> a\n\n> [!info] B\n> b"
    expect(roundTrip(md)).toBe(md)
  })

  it("odd spacing is kept", () => {
    for (const md of [
      ">[!tip] Hi\n>body",
      "> [!tip]   Hi\n> body",
      "> [!tip] Hi  \n> body",
      "> [!tip] Hi\n>  indented",
    ]) {
      expect(roundTrip(md)).toBe(md)
    }
  })

  it("a title that starts with the type name is kept as written", () => {
    for (const md of [
      "> [!tip] Tip: Hi\n> body",
      "> [!tip] Tip\n> body",
      "> [!note] Note\n> body",
      "> [!warning] Warning: Careful\n> body",
    ]) {
      expect(roundTrip(md)).toBe(md)
    }
  })
})

describe("callouts do not show a marker in the editor", () => {
  const md = [
    "> [!info] Hi\n> a",
    "> [!theorem] T\n> a",
    "> [!tip]- Fold\n> a",
    "> [!question]+ Q\n> a",
    "> [!my-type] X\n> a",
    "> [!graph] G\n> prose",
  ].join("\n\n")

  it("toCmdxMd never writes <!--cmdx", () => {
    expect(toCmdxMd(md)).not.toContain("<!--cmdx")
  })
})

describe("callouts that have a native environment still become one", () => {
  it("tip", () => {
    expect(toCmdxMd("> [!tip] Hi\n> body")).toBe(":::tip[Hi]\nbody\n:::")
  })
  it("warning", () => {
    expect(toCmdxMd("> [!warning]\n> body")).toBe(":::warning\nbody\n:::")
  })
  it("theorem via its heading prefix", () => {
    expect(toCmdxMd("> [!abstract] Theorem: P {#thm:p}\n> body")).toBe(
      ":::theorem[P] {#thm:p}\nbody\n:::",
    )
  })
  it("unknown lowercase type becomes an env of that name", () => {
    expect(toCmdxMd("> [!danger] D\n> body")).toBe(":::danger[D]\nbody\n:::")
  })
  it("environments written in the editor keep their title clean", () => {
    expect(toStorageMd(":::tip[Hi]\nbody\n:::")).toBe("> [!tip] Hi\n> body")
    expect(toStorageMd(":::tip\nbody\n:::")).toBe("> [!tip]\n> body")
    expect(toStorageMd(":::theorem[P]\nbody\n:::")).toBe("> [!abstract] Theorem: P\n> body")
  })
})

describe("editor text that older builds produced still loads", () => {
  it("honours and strips the <!--cmdx type=... --> marker on save", () => {
    expect(toStorageMd(":::note[Hi]\n<!--cmdx type=info -->\nbody\n:::")).toBe(
      "> [!info] Hi\n> body",
    )
  })
  it("honours and strips the fold marker on save", () => {
    expect(toStorageMd(":::warning[Hi]\n<!--cmdx fold=- -->\nbody\n:::")).toBe(
      "> [!warning]- Hi\n> body",
    )
  })
})
