import { describe, expect, it } from "vitest"
import { analyzeExportCompatibility } from "./exportCompatibility"

describe("analyzeExportCompatibility", () => {
  it("scores LaTeX and Obsidian degradations separately", () => {
    const report = analyzeExportCompatibility([
      "# Intro {#sec:intro}",
      "Ver @sec:intro y [@key].",
      "```mermaid",
      "graph LR",
      "```",
    ].join("\n"))

    expect(report.latexScore).toBeLessThan(100)
    expect(report.obsidianScore).toBeLessThan(100)
    expect(report.latexIssues.some((issue) => issue.message.includes("Mermaid"))).toBe(true)
    expect(report.obsidianIssues.some((issue) => issue.message.includes("Referencia estructural"))).toBe(true)
  })
})
