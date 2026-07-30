import { describe, it, expect } from "vitest"
import { parameterizeDocument, processTemplateVariables } from "./templates"

describe("parameterizeDocument", () => {
  it("templates the frontmatter title and date", () => {
    const out = parameterizeDocument("---\ntitle: Derivadas\ndate: 2026-03-04\n---\n\ntexto\n", "derivadas.md")
    expect(out).toContain("title: {{title}}")
    expect(out).toContain("date: {{date}}")
    expect(out).toContain("texto")
  })

  it("templates an H1 that restates the frontmatter title", () => {
    const out = parameterizeDocument("---\ntitle: Derivadas\n---\n\n# Derivadas\n\ntexto\n", "n.md")
    expect(out).toContain("# {{title}}")
  })

  it("templates an H1 that restates the filename", () => {
    const out = parameterizeDocument("# derivadas\n\ntexto\n", "derivadas.md")
    expect(out).toContain("# {{title}}")
  })

  it("leaves an H1 that is a real heading alone", () => {
    const out = parameterizeDocument("---\ntitle: Clase 3\n---\n\n# Teorema fundamental\n", "clase-3.md")
    expect(out).toContain("# Teorema fundamental")
    expect(out).not.toContain("# {{title}}")
  })

  it("does NOT rewrite dates in the body — those are content, not fields", () => {
    const body = "El 2026-03-04 se demostró el teorema.\n"
    const out = parameterizeDocument(`---\ndate: 2026-03-04\n---\n\n${body}`, "n.md")
    expect(out).toContain("date: {{date}}")
    expect(out).toContain("El 2026-03-04 se demostró")
  })

  it("is a no-op on a document with neither frontmatter nor a matching H1", () => {
    const doc = "solo prosa suelta\n"
    expect(parameterizeDocument(doc, "otra-cosa.md")).toBe(doc)
  })

  it("produces a template that rehydrates through processTemplateVariables", () => {
    const template = parameterizeDocument("---\ntitle: Vieja\n---\n\n# Vieja\n\ncuerpo\n", "vieja.md")
    const rendered = processTemplateVariables(template, "nueva.md")
    expect(rendered).toContain("title: nueva")
    expect(rendered).toContain("# nueva")
    expect(rendered).not.toContain("{{title}}")
  })
})
