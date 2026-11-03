import { describe, it, expect } from "vitest"
import { TEMPLATES, parameterizeDocument, processTemplateVariables } from "./templates"
import { TEX_CLASSES, exportToTex, pickTexClass, type TexClassId } from "./exporter"

describe("parameterizeDocument", () => {
  it("templates the frontmatter title and date", () => {
    const out = parameterizeDocument(
      "---\ntitle: Derivadas\ndate: 2026-03-04\n---\n\ntexto\n",
      "derivadas.md",
    )
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
    const out = parameterizeDocument(
      "---\ntitle: Clase 3\n---\n\n# Teorema fundamental\n",
      "clase-3.md",
    )
    expect(out).toContain("# Teorema fundamental")
    expect(out).not.toContain("# {{title}}")
  })

  it("does NOT rewrite dates in the body (those are content, not fields)", () => {
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
    const template = parameterizeDocument(
      "---\ntitle: Vieja\n---\n\n# Vieja\n\ncuerpo\n",
      "vieja.md",
    )
    const rendered = processTemplateVariables(template, "nueva.md")
    expect(rendered).toContain("title: nueva")
    expect(rendered).toContain("# nueva")
    expect(rendered).not.toContain("{{title}}")
  })
})

describe("computational-biology journal templates", () => {
  const ids = ["journal-plos", "journal-bioinformatics", "journal-biorxiv", "journal-bmc"]

  it("are journal templates that opt into a known class and the biology checks", () => {
    for (const id of ids) {
      const tpl = TEMPLATES.find((t) => t.id === id)!
      expect(tpl.category).toBe("journal")
      const cls = /comdtex\.texclass: (\w+)/.exec(tpl.content)![1]
      expect(pickTexClass(cls)).toBe(cls)
      expect(tpl.content).toContain("comdtex.domain: biology")
      expect(tpl.content).toContain("{#fig:")
      expect(tpl.content).toContain("si(")
      expect(tpl.content).not.toContain("\u2014")
    }
  })

  it("export with the class each template names", () => {
    for (const id of ids) {
      const tpl = TEMPLATES.find((t) => t.id === id)!
      const cls = /comdtex\.texclass: (\w+)/.exec(tpl.content)![1] as TexClassId
      const tex = exportToTex(processTemplateVariables(tpl.content, "x.md"), "", "Paper", "Ada")
      expect(tex).toContain(TEX_CLASSES[cls].documentclass)
    }
  })
})
