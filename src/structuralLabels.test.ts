import { describe, expect, it } from "vitest"
import { scanStructuralLabels } from "./structuralLabels"

describe("scanStructuralLabels", () => {
  it("detects labels, broken refs, duplicates and unused labels", () => {
    const index = scanStructuralLabels([
      {
        path: "/a.md",
        name: "a.md",
        content: "# Intro {#sec:intro}\n\nVer @sec:intro y @eq:missing\n$$x$$ {#eq:x}",
      },
      {
        path: "/b.md",
        name: "b.md",
        content: "# Other {#sec:intro}",
      },
    ])

    expect(index.labels.map((label) => label.id)).toContain("sec:intro")
    expect(index.labels.map((label) => label.id)).toContain("eq:x")
    expect(index.broken.map((ref) => ref.id)).toContain("eq:missing")
    expect(index.duplicates.get("sec:intro")).toHaveLength(2)
    expect(index.unused.map((label) => label.id)).toContain("eq:x")
  })
})
