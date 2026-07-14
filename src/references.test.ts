import { describe, expect, it } from "vitest"
import { numberHeadings, resolveSectionRefs } from "./references"
import { renderMarkdown } from "./renderer"

function ids(html: string): string[] {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
}

function fragmentHrefs(html: string): string[] {
  return [...html.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1])
}

describe("references", () => {
  it("numbers explicit heading labels and resolves @sec references", () => {
    const numbered = numberHeadings("# Intro {#sec:intro}\n\nVer @sec:sec:intro")

    expect(numbered.content).toContain("# 1 Intro")
    expect(numbered.content).not.toContain("{#sec:intro}")
    expect(resolveSectionRefs(numbered.content, numbered.sections)).toContain("sección 1")
  })

  it("resolves the documented `@sec:label` form", () => {
    const numbered = numberHeadings("# Intro {#sec:intro}")
    expect(resolveSectionRefs("Ver @sec:intro", numbered.sections)).toContain("sección 1")
  })

  it("does not swallow a trailing sentence period into the label", () => {
    const numbered = numberHeadings("# Intro {#sec:intro}")
    const out = resolveSectionRefs("Ver @sec:intro.", numbered.sections)
    expect(out).toContain("sección 1")
    expect(out.endsWith("</a>.")).toBe(true)
  })

  it("still allows dots inside a label", () => {
    const numbered = numberHeadings("# Intro {#sec:part1.2}")
    expect(resolveSectionRefs("Ver @sec:part1.2", numbered.sections)).toContain("sección 1")
  })

  it("marks an unknown label as broken instead of leaking raw source text", () => {
    const out = resolveSectionRefs("Ver @sec:ghost", new Map())
    expect(out).not.toContain("@sec:")
    expect(out).toContain("xref-broken")
  })
})

describe("section anchors end-to-end", () => {
  it("gives explicit-labeled headings an id even with no [[toc]]", () => {
    const html = renderMarkdown("# El ciclo {#sec:decisiones}\n\nVer @sec:decisiones.")
    expect(html).toContain('id="sec-decisiones"')
    expect(fragmentHrefs(html)).toContain("sec-decisiones")
    for (const href of fragmentHrefs(html)) expect(ids(html)).toContain(href)
  })

  it("gives unlabeled headings an id even with no [[toc]]", () => {
    expect(renderMarkdown("# El ciclo\n\nprose")).toContain('id="el-ciclo"')
  })

  it("leaks neither the label nor the internal id marker", () => {
    const html = renderMarkdown("# El ciclo {#sec:decisiones}\n\nVer @sec:decisiones.")
    expect(html).not.toContain("{#sec:")
    expect(html).not.toContain("SECID")
    expect(html).not.toContain("\x02")
  })

  it("points the auto-TOC at the same id the heading actually has", () => {
    const html = renderMarkdown("[[toc]]\n\n# El ciclo {#sec:decisiones}\n\n## Otra")
    expect(html).toContain('id="sec-decisiones"')
    for (const href of fragmentHrefs(html)) expect(ids(html)).toContain(href)
  })

  it("de-duplicates ids for headings with the same text", () => {
    const html = renderMarkdown("# Notas\n\n# Notas")
    expect(ids(html)).toEqual(["notas", "notas-2"])
  })
})

// Mirrors the shape of a real user note: Spanish prose, `{#sec:...}` headings,
// labeled tables, `@sec:`/`@tbl:` references and no `[[toc]]` anywhere.
describe("renderMarkdown — mixed cross-references, no TOC", () => {
  const doc = `# El ciclo de decisiones {#sec:decisiones}

Cuando estemos planteando los proyectos se tienen que tomar algunas
decisiones que pueden ser excluyentes, ver @tbl:decisiones.

| Decisión | Implicación |
|---|---|
| NO | Por múltiples factores |
| SI | Perfilar el proyecto |
{#tbl:decisiones}

# Perfilar el proyecto {#sec:perfilar}

Perfilar es darle forma, ver @sec:decisiones y @tbl:decisiones.

:::theorem[Main]{#thm:main}
Enunciado.
:::

Ver @thm:main y @sec:perfilar.`

  const html = renderMarkdown(doc)

  it("leaves no raw label or reference syntax in the output", () => {
    expect(html).not.toContain("{#")
    expect(html).not.toContain("@sec:")
    expect(html).not.toContain("@tbl:")
    expect(html).not.toContain("@thm:")
  })

  it("resolves every reference to an id that exists in the document", () => {
    const documentIds = ids(html)
    const hrefs = fragmentHrefs(html)
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(documentIds).toContain(href)
  })

  it("has no broken references", () => {
    expect(html).not.toContain("(?)")
  })

  it("anchors each cross-reference family at its target", () => {
    expect(html).toContain('id="sec-decisiones"')
    expect(html).toContain('id="sec-perfilar"')
    expect(html).toContain('id="tbl-decisiones"')
    expect(html).toContain('id="env-thm:main"')
  })
})
