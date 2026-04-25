import { describe, expect, it } from "vitest"
import { diagnoseDocuments } from "./documentDiagnostics"

describe("diagnoseDocuments", () => {
  it("detects broken refs, duplicate labels, missing citations and malformed math", () => {
    const summary = diagnoseDocuments([
      {
        path: "/v/main.md",
        name: "main.md",
        content: [
          "# Intro {#sec:intro}",
          "# Duplicate {#sec:intro}",
          "Ver @eq:missing y [@missing].",
          "$$",
          "x",
        ].join("\n"),
      },
      { path: "/v/references.bib", name: "references.bib", content: "@book{known, title={Known}}" },
    ])

    expect(summary.errors).toBeGreaterThan(0)
    expect(summary.issues.map((issue) => issue.message)).toContain("Referencia rota: @eq:missing")
    expect(summary.issues.some((issue) => issue.message.includes("Label duplicado: sec:intro"))).toBe(true)
    expect(summary.issues.some((issue) => issue.message.includes("Cita no encontrada: @missing"))).toBe(true)
    expect(summary.issues.some((issue) => issue.message.includes("Bloque $$ sin cerrar"))).toBe(true)
  })
})
