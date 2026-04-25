import { describe, expect, it } from "vitest"
import { buildProjectPlan, composeProjectMarkdown } from "./projectExport"

describe("project export", () => {
  const files = [
    { path: "/v/main.md", name: "main.md", content: "---\ncomdtex.main: true\n---\n# Main\n![[chapter]]\n![[missing]]" },
    { path: "/v/chapter.md", name: "chapter.md", content: "# Chapter\nBody" },
  ]

  it("finds the main document and embedded files", () => {
    const plan = buildProjectPlan(files)
    expect(plan.main?.name).toBe("main.md")
    expect(plan.included.map((file) => file.name)).toContain("chapter.md")
    expect(plan.missingEmbeds).toContain("missing")
  })

  it("composes markdown through transclusions", () => {
    expect(composeProjectMarkdown(files)).toContain("# Chapter")
  })
})
