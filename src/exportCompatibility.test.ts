import { describe, expect, it } from "vitest"
import { analyzeExportCompatibility, lossyExportWarnings } from "./exportCompatibility"

describe("analyzeExportCompatibility", () => {
  it("scores LaTeX and Obsidian degradations separately", () => {
    const report = analyzeExportCompatibility(
      ["# Intro {#sec:intro}", "Ver @sec:intro y [@key].", "```mermaid", "graph LR", "```"].join(
        "\n",
      ),
    )

    expect(report.latexScore).toBeLessThan(100)
    expect(report.obsidianScore).toBeLessThan(100)
    expect(report.latexIssues.some((issue) => issue.message.includes("Mermaid"))).toBe(true)
    expect(
      report.obsidianIssues.some((issue) => issue.message.includes("Referencia estructural")),
    ).toBe(true)
  })
  it("no longer calls a local environment ref a lost structural ref", () => {
    const report = analyzeExportCompatibility("Ver @thm:main y @def:grupo.")
    const messages = report.obsidianIssues.map((issue) => issue.message)
    expect(messages.some((m) => m.includes("Referencia estructural"))).toBe(false)
    expect(messages.some((m) => m.includes("texto numerado"))).toBe(true)
    expect(report.obsidianIssues.every((issue) => issue.severity === "info")).toBe(true)
  })

  it("warns that cross-file environment refs cannot be numbered outside the app", () => {
    expect(lossyExportWarnings("Ver @gp/calendario@def:x.", "obsidian").length).toBe(1)
    expect(lossyExportWarnings("Ver @[mi nota]@thm:y.", "obsidian").length).toBe(1)
    expect(lossyExportWarnings("Ver @thm:y.", "obsidian")).toEqual([])
  })
})
