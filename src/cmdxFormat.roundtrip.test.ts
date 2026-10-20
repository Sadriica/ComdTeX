import { describe, it, expect } from "vitest"
import { toCmdxMd, toStorageMd } from "./cmdxFormat"

// Storage (.md on disk) inputs and what must survive a trip through the editor
// format and back. `keep` lists substrings the saved file must still contain.
const STORAGE_CORPUS: { name: string; md: string; keep: string[] }[] = [
  {
    name: "table with body rows",
    md: "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |",
    keep: ["| 1 | 2 |", "| 3 | 4 |"],
  },
  {
    name: "table with alignment and body",
    md: "| A | B |\n|:--|--:|\n| 1 | 2 |\n",
    keep: [":--", "--:", "| 1 | 2 |"],
  },
  {
    name: "table whose header has commas and parens",
    md: "| f(x, y) | B |\n|---|---|\n",
    keep: ["f(x, y)"],
  },
  {
    name: "table followed by a row without outer pipes",
    md: "| A | B |\n|---|---|\n1 | 2",
    keep: ["1 | 2"],
  },
  {
    name: "indented table in a list",
    md: "- item\n  | A | B |\n  |---|---|\n  | 1 | 2 |",
    keep: ["| 1 | 2 |"],
  },
  {
    name: "table inside a backtick fence",
    md: "```\n| A | B |\n|---|---|\n```",
    keep: ["| A | B |\n|---|---|\n```"],
  },
  {
    name: "table inside a tilde fence",
    md: "~~~md\n| A | B |\n|---|---|\n~~~",
    keep: ["| A | B |\n|---|---|\n~~~"],
  },
  {
    name: "callout inside a fence",
    md: "```md\n> [!warning]- Careful\n> text\n```",
    keep: ["> [!warning]- Careful"],
  },
  {
    name: "table(...) shorthand in inline code",
    md: "Use `table(A, B)` to draw one.",
    keep: ["`table(A, B)`"],
  },
  {
    name: "header-only table",
    md: "| A | B |\n| --- | --- |",
    keep: ["| A | B |", "| --- | --- |"],
  },
  {
    name: "labelled theorem",
    md: "> [!abstract] Theorem: Pyth {#thm:pyth}\n> x",
    keep: ["{#thm:pyth}", "[!abstract]", "Theorem: Pyth"],
  },
  {
    name: "labelled theorem without title",
    md: "> [!abstract] Theorem {#thm:bare}\n> x",
    keep: ["{#thm:bare}"],
  },
  {
    name: "labelled definition",
    md: "> [!note] Definition: Group {#def:group}\n> A set.",
    keep: ["{#def:group}", "Definition: Group"],
  },
  {
    name: "folded closed warning",
    md: "> [!warning]- Cuidado\n> body",
    keep: ["[!warning]-"],
  },
  {
    name: "folded open tip",
    md: "> [!tip]+ Open\n> body",
    keep: ["[!tip]+"],
  },
  {
    name: "unknown danger type",
    md: "> [!danger] Watch out\n> body",
    keep: ["[!danger] Watch out"],
  },
  {
    name: "unknown quote type, folded, no title",
    md: "> [!quote]-\n> said",
    keep: ["[!quote]-"],
  },
  {
    name: "type with a hyphen",
    md: "> [!my-type] Hello\n> body",
    keep: ["[!my-type] Hello"],
  },
  {
    name: "obsidian types with no exact env",
    md: "> [!info] Hi\n> a\n\n> [!important]+ Ho\n> b\n\n> [!question] Why\n> c\n\n> [!success]- Yes\n> d",
    keep: ["[!info] Hi", "[!important]+ Ho", "[!question] Why", "[!success]- Yes"],
  },
  {
    name: "type named like a special block",
    md: "> [!graph] My graph\n> prose",
    keep: ["[!graph] My graph"],
  },
  {
    name: "nested callouts",
    md: "> [!abstract] Theorem: Outer {#thm:outer}\n> text\n> > [!warning]- Inner\n> > deep",
    keep: ["{#thm:outer}", "[!warning]- Inner"],
  },
  {
    name: "callout with a table in the body",
    md: "> [!note] Data\n> | A | B |\n> |---|---|\n> | 1 | 2 |",
    keep: ["| 1 | 2 |"],
  },
  {
    name: "callout with a fenced block",
    md: "> [!example] Code\n> ```\n> table(A, B)\n> ```",
    keep: ["> table(A, B)"],
  },
  {
    name: "frontmatter and prose",
    md: "---\ntitle: T\n---\n# H\n\nSome $x$ text.\n\n> [!tip]- Fold\n> body",
    keep: ["title: T", "[!tip]-"],
  },
  {
    name: "plain blockquote",
    md: "> quoted text",
    keep: ["> quoted text"],
  },
]

// Editor-format (CMDX) inputs in canonical form: saving and reopening must
// give back exactly the same text.
const CMDX_CORPUS: string[] = [
  ":::theorem[Pyth] {#thm:pyth}\nx\n:::",
  ":::theorem {#thm:bare}\nx\n:::",
  ":::lemma[L]\nx\n:::",
  ":::foo\nx\n:::",
  ":::foo[Bar]\nx\n:::",
  ":::danger[Watch out]\nx\n:::",
  ":::tip[Hi]\nbody\n:::",
  ":::theorem[Outer] {#thm:o}\ntext\n:::warning[Inner]\ndeep\n:::\n:::",
  "table(A, B)",
  "| A | B |\n|---|---|\n| 1 | 2 |",
  "```\ntable(A, B)\n:::note\nx\n:::\n```",
  "`table(A, B)` inline",
  ":::truth[T]\np | q\n:::",
]

describe("cmdxFormat round-trip invariants", () => {
  for (const { name, md, keep } of STORAGE_CORPUS) {
    describe(name, () => {
      const cmdx = toCmdxMd(md)
      const saved = toStorageMd(cmdx)

      it("keeps the semantic content when saved", () => {
        for (const piece of keep) expect(saved).toContain(piece)
      })

      it("reopens to the same editor text", () => {
        expect(toCmdxMd(saved)).toBe(cmdx)
      })

      it("saves to the same file text a second time", () => {
        expect(toStorageMd(toCmdxMd(saved))).toBe(saved)
      })
    })
  }

  for (const cmdx of CMDX_CORPUS) {
    it(`editor text survives save and reopen: ${JSON.stringify(cmdx)}`, () => {
      expect(toCmdxMd(toStorageMd(cmdx))).toBe(cmdx)
    })
  }

  it("never drops body rows of a pipe table", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"
    expect(toCmdxMd(md)).toBe(md)
    expect(toStorageMd(toCmdxMd(md))).toBe(md)
  })

  it("keeps the label so @thm:pyth still resolves after reopening", () => {
    const saved = toStorageMd(":::theorem[Pyth] {#thm:pyth}\nx\n:::")
    expect(saved).toBe("> [!abstract] Theorem: Pyth {#thm:pyth}\n> x")
    expect(toCmdxMd(saved)).toBe(":::theorem[Pyth] {#thm:pyth}\nx\n:::")
  })

  it("keeps fold marker and unknown callout types", () => {
    expect(toStorageMd(toCmdxMd("> [!warning]- Cuidado\n> b"))).toBe("> [!warning]- Cuidado\n> b")
    expect(toStorageMd(toCmdxMd("> [!danger] D\n> b"))).toBe("> [!danger] D\n> b")
    expect(toStorageMd(":::foo\nx\n:::")).toBe("> [!foo]\n> x")
  })

  it("can drop env labels for user-facing exports", () => {
    expect(toStorageMd(":::theorem {#thm:a}\nx\n:::", { envLabels: false })).toBe(
      "> [!abstract] Theorem\n> x",
    )
  })
})
