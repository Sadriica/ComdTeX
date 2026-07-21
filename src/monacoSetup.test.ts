import { describe, expect, it } from "vitest"
import {
  findEnclosingSpecialBlock,
  getSpecialBlockCompletions,
  resolveSpecialBlockTabCompletion,
  resolveTabCompletion,
} from "./monacoSetup"

describe("resolveTabCompletion", () => {
  it("expands plain environment words", () => {
    const result = resolveTabCompletion("example", "example")

    expect(result?.completion.label).toBe("example")
    expect(result?.overwriteBefore).toBe("example".length)
  })

  it("replaces the full ::: environment prefix instead of duplicating colons", () => {
    const result = resolveTabCompletion(":::example", "example")

    expect(result?.completion.label).toBe("example")
    expect(result?.overwriteBefore).toBe(":::example".length)
  })

  it("exposes flowchart through the same completion catalog", () => {
    const result = resolveTabCompletion("flowchart", "flowchart")

    expect(result?.completion.label).toBe("flowchart")
    expect(result?.completion.snippet).toContain(":::flowchart")
  })

  it("only matches block snippets after a ::: prefix", () => {
    // `t` alone is ambiguous math shorthand territory (table, tan, tilde…);
    // behind ::: those must not qualify, so `:::t` stays unresolved (multiple
    // block types start with t is false — theorem/truth → still ambiguous),
    // while `:::tr` uniquely resolves to the truth-table block.
    const ambiguous = resolveTabCompletion(":::t", "t")
    expect(ambiguous === null || ambiguous.completion.snippet.startsWith(":::")).toBe(true)

    const truth = resolveTabCompletion(":::tr", "tr")
    expect(truth?.completion.snippet).toContain(":::truth")
    expect(truth?.overwriteBefore).toBe(":::tr".length)
  })

  it("never expands a non-block shorthand behind :::", () => {
    // Previously `:::ta` could match `table(...)`/`tan(...)` and replace the
    // block prefix with a math shorthand.
    const result = resolveTabCompletion(":::ta", "ta")
    expect(result).toBeNull()
  })
})

describe("findEnclosingSpecialBlock", () => {
  const doc = (lines: string[]) => (n: number) => lines[n - 1] ?? ""

  it("detects the enclosing block type", () => {
    const getLine = doc([":::pseudocode[Ordenar]", "INPUT: A", ""])
    expect(findEnclosingSpecialBlock(getLine, 2)).toBe("pseudocode")
    expect(findEnclosingSpecialBlock(getLine, 3)).toBe("pseudocode")
  })

  it("returns null outside a block (closer found first)", () => {
    const getLine = doc([":::truth", "p ∧ q", ":::", "texto normal"])
    expect(findEnclosingSpecialBlock(getLine, 4)).toBeNull()
  })

  it("returns null on the opener line itself so ::: completion still works", () => {
    const getLine = doc([":::graph"])
    expect(findEnclosingSpecialBlock(getLine, 1)).toBeNull()
  })

  it("strips sm/lg size prefixes", () => {
    const getLine = doc([":::sm remark", "cuerpo"])
    expect(findEnclosingSpecialBlock(getLine, 2)).toBe("remark")
  })
})

describe("getSpecialBlockCompletions", () => {
  it("returns a catalog for special blocks and null for environments", () => {
    expect(getSpecialBlockCompletions("pseudocode")?.length).toBeGreaterThan(5)
    expect(getSpecialBlockCompletions("theorem")).toBeNull()
    expect(getSpecialBlockCompletions("excalidraw")).toBeNull()
  })

  it("returns a stable instance per type", () => {
    expect(getSpecialBlockCompletions("truth")).toBe(getSpecialBlockCompletions("truth"))
  })

  it("flowchart shares the pseudocode grammar", () => {
    const labels = getSpecialBlockCompletions("flowchart")!.map((c) => c.label)
    expect(labels).toContain("FOR")
    expect(labels).toContain("IF")
  })
})

describe("resolveSpecialBlockTabCompletion", () => {
  const pseudo = getSpecialBlockCompletions("pseudocode")!

  it("expands a unique keyword prefix case-insensitively", () => {
    const result = resolveSpecialBlockTabCompletion(pseudo, "fo")
    expect(result?.completion.label).toBe("FOR")
    expect(result?.completion.snippet).toContain("END FOR")
    expect(result?.overwriteBefore).toBe(2)
  })

  it("resolves exact matches even when a longer label shares the prefix", () => {
    // IF is a prefix of IFELSE — exact match must win.
    const result = resolveSpecialBlockTabCompletion(pseudo, "if")
    expect(result?.completion.label).toBe("IF")
  })

  it("returns null on ambiguity or no match", () => {
    expect(resolveSpecialBlockTabCompletion(pseudo, "e")).toBeNull()
    expect(resolveSpecialBlockTabCompletion(pseudo, "zzz")).toBeNull()
    expect(resolveSpecialBlockTabCompletion(pseudo, "")).toBeNull()
  })
})
