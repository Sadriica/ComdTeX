import { describe, expect, it } from "vitest"
import { diagnoseDocuments } from "./documentDiagnostics"
import { en } from "./i18n/en"

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
    expect(
      summary.issues.some((issue) => issue.message.includes("Label duplicado: sec:intro")),
    ).toBe(true)
    expect(
      summary.issues.some((issue) => issue.message.includes("Cita no encontrada: @missing")),
    ).toBe(true)
    expect(summary.issues.some((issue) => issue.message.includes("Bloque $$ sin cerrar"))).toBe(
      true,
    )
  })
})

describe("diagnoseDocuments with vault context", () => {
  const doc = (content: string, path = "/v/papers/doc.md") => ({
    path,
    name: path.split("/").pop()!,
    content,
  })

  it("accepts citations whose keys come from the vault bibliography", () => {
    const summary = diagnoseDocuments([doc("See [@knuth84] and [@a; @b].")], {
      bibKeys: ["knuth84", "a", "b"],
    })
    expect(summary.issues.filter((i) => i.category === "citations")).toHaveLength(0)
  })

  it("flags the unknown key inside a grouped citation", () => {
    const summary = diagnoseDocuments([doc("See [@a; @nope].")], {
      bibKeys: ["a"],
      messages: en.documentLab.diag,
    })
    const cites = summary.issues.filter((i) => i.category === "citations")
    expect(cites.map((i) => i.message)).toEqual(["Citation not found: @nope"])
  })

  it("finds images among the vault assets, relative to the document or the vault root", () => {
    const summary = diagnoseDocuments(
      [doc("![a](../figures/x.svg)\n![b](figures/y.png)\n![c](missing/z.png)")],
      { assetPaths: ["/v/figures/x.svg", "/v/figures/y.png"], vaultPath: "/v" },
    )
    const imgs = summary.issues.filter((i) => i.category === "assets")
    expect(imgs).toHaveLength(1)
    expect(imgs[0].message).toContain("missing/z.png")
  })

  it("reports in the UI language", () => {
    const summary = diagnoseDocuments([doc("$$\nx")], { messages: en.documentLab.diag })
    expect(summary.issues.map((i) => i.message)).toContain("Unclosed $$ block")
  })
})
