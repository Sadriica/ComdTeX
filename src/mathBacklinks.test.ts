import { describe, expect, it } from "vitest"
import { scanMathBacklinks } from "./mathBacklinks"

describe("scanMathBacklinks", () => {
  it("groups structural references by label", () => {
    const groups = scanMathBacklinks([
      { path: "/v/a.md", name: "a.md", content: "$$\nx\n$$ {#eq:x}" },
      { path: "/v/b.md", name: "b.md", content: "Usa @eq:x" },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].label.id).toBe("eq:x")
    expect(groups[0].references[0].fileName).toBe("b.md")
  })
})
