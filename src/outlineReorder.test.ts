import { describe, expect, it } from "vitest"
import { reorderSection } from "./outlineReorder"

// Helper: build a doc and return content + a map of heading text -> 1-based line.
function lineOf(content: string, headingText: string): number {
  const idx = content.split("\n").findIndex((l) => l.trim() === headingText)
  if (idx < 0) throw new Error(`heading not found: ${headingText}`)
  return idx + 1
}

describe("reorderSection", () => {
  it("moves a middle section up (before the target)", () => {
    const content = [
      "# A",
      "alpha",
      "",
      "# B",
      "beta",
      "",
      "# C",
      "gamma",
    ].join("\n")

    // Move C before A.
    const out = reorderSection(content, lineOf(content, "# C"), lineOf(content, "# A"))
    expect(out).toBe([
      "# C",
      "gamma",
      "# A",
      "alpha",
      "",
      "# B",
      "beta",
    ].join("\n"))
  })

  it("moves a middle section down (before a later target)", () => {
    const content = [
      "# A",
      "alpha",
      "",
      "# B",
      "beta",
      "",
      "# C",
      "gamma",
    ].join("\n")

    // Move A before C → order B, A, C.
    const out = reorderSection(content, lineOf(content, "# A"), lineOf(content, "# C"))
    const headings = out.split("\n").filter((l) => l.startsWith("# "))
    expect(headings).toEqual(["# B", "# A", "# C"])
    expect(out).toContain("# A\nalpha")
    expect(out).toContain("# B\nbeta")
    expect(out).toContain("# C\ngamma")
  })

  it("carries nested subsections with their parent", () => {
    const content = [
      "# One",
      "one body",
      "## One-a",
      "sub a",
      "## One-b",
      "sub b",
      "# Two",
      "two body",
      "# Three",
      "three body",
    ].join("\n")

    // Move One (with its two subsections) before Three.
    const out = reorderSection(content, lineOf(content, "# One"), lineOf(content, "# Three"))
    const lines = out.split("\n").filter((l) => /^#{1,6}\s/.test(l))
    expect(lines).toEqual([
      "# Two",
      "# One",
      "## One-a",
      "## One-b",
      "# Three",
    ])
    // Subsection bodies travelled too.
    expect(out).toContain("# One\none body\n## One-a\nsub a\n## One-b\nsub b")
  })

  it("does not absorb a sibling of equal level", () => {
    const content = [
      "# A",
      "a body",
      "## A-sub",
      "a sub",
      "# B",
      "b body",
    ].join("\n")

    // Move B before A. B has no subsections; A's sub must stay with A.
    const out = reorderSection(content, lineOf(content, "# B"), lineOf(content, "# A"))
    const headings = out.split("\n").filter((l) => /^#{1,6}\s/.test(l))
    expect(headings).toEqual(["# B", "# A", "## A-sub"])
  })

  it("moves the last section (block runs to EOF) up", () => {
    const content = [
      "# A",
      "alpha",
      "",
      "# B",
      "beta",
      "",
      "# C",
      "gamma line 1",
      "gamma line 2",
    ].join("\n")

    const out = reorderSection(content, lineOf(content, "# C"), lineOf(content, "# B"))
    const headings = out.split("\n").filter((l) => l.startsWith("# "))
    expect(headings).toEqual(["# A", "# C", "# B"])
    expect(out).toContain("# C\ngamma line 1\ngamma line 2")
  })

  it("moves the first section down to before another", () => {
    const content = [
      "# First",
      "first body",
      "# Second",
      "second body",
    ].join("\n")

    // from === before the only other; moving First before Second is a no-op
    // structurally (First is already right before Second), but moving First to
    // itself is the no-op test. Here move Second before First instead.
    const out = reorderSection(content, lineOf(content, "# Second"), lineOf(content, "# First"))
    const headings = out.split("\n").filter((l) => l.startsWith("# "))
    expect(headings).toEqual(["# Second", "# First"])
  })

  it("is a no-op when from === to", () => {
    const content = "# A\nbody\n# B\nmore\n"
    const line = lineOf(content, "# B")
    expect(reorderSection(content, line, line)).toBe(content)
  })

  it("returns content unchanged for invalid lines", () => {
    const content = "# A\nbody\n# B\nmore\n"
    expect(reorderSection(content, 0, 3)).toBe(content)
    expect(reorderSection(content, 1, 999)).toBe(content)
    // Line 2 ("body") is not a heading.
    expect(reorderSection(content, 2, 3)).toBe(content)
  })

  it("refuses to move a section into its own subtree", () => {
    const content = [
      "# Parent",
      "p body",
      "## Child",
      "c body",
    ].join("\n")
    // Target is inside the dragged block → no-op.
    expect(
      reorderSection(content, lineOf(content, "# Parent"), lineOf(content, "## Child")),
    ).toBe(content)
  })

  it("preserves trailing newline state", () => {
    const withNl = "# A\nbody\n# B\nmore\n"
    const out1 = reorderSection(withNl, lineOf(withNl, "# B"), lineOf(withNl, "# A"))
    expect(out1.endsWith("\n")).toBe(true)

    const noNl = "# A\nbody\n# B\nmore"
    const out2 = reorderSection(noNl, lineOf(noNl, "# B"), lineOf(noNl, "# A"))
    expect(out2.endsWith("\n")).toBe(false)
  })
})
