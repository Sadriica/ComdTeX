import { describe, expect, it } from "vitest"
import { prescanTables, resolveTableRefs, wrapTables } from "./tables"
import { renderMarkdown } from "./renderer"

const TABLE = "| A | B |\n|---|---|\n| 1 | 2 |"
/** Label directly after the last row (markdown-it folds it in as a lazy row). */
const NO_BLANK = `${TABLE}\n{#tbl:data}`
/** Label separated by a blank line (markdown-it renders it as its own <p>). */
const BLANK = `${TABLE}\n\n{#tbl:data}`

/** Collect every `id="..."` in a fragment. */
function ids(html: string): string[] {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
}

/** Collect every fragment `href="#..."` in a fragment. */
function fragmentHrefs(html: string): string[] {
  return [...html.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1])
}

describe("prescanTables", () => {
  it("finds a label written with no blank line after the table", () => {
    expect(prescanTables(NO_BLANK).get("tbl:data")).toBe(1)
  })

  it("finds a label written after a blank line", () => {
    expect(prescanTables(BLANK).get("tbl:data")).toBe(1)
  })

  it("numbers tables sequentially", () => {
    const src = `${TABLE}\n{#tbl:one}\n\nprose\n\n${TABLE}\n\n{#tbl:two}`
    const labels = prescanTables(src)
    expect(labels.get("tbl:one")).toBe(1)
    expect(labels.get("tbl:two")).toBe(2)
  })

  it("ignores pipe tables inside fenced code so numbers match the rendered output", () => {
    const src = "```\n| X | Y |\n|---|---|\n| a | b |\n```\n\n" + NO_BLANK
    expect(prescanTables(src).get("tbl:data")).toBe(1)
  })

  it("does not treat a far-away label line as a table label", () => {
    expect(prescanTables(`${TABLE}\n\n\nprose\n\n{#tbl:data}`).size).toBe(0)
  })
})

describe("wrapTables", () => {
  it("consumes the label paragraph (blank-line form)", () => {
    const html = "<table><tbody><tr><td>A</td></tr></tbody></table>\n<p>{#tbl:data}</p>"
    const out = wrapTables(html, new Map([["tbl:data", 1]]))
    expect(out).toContain('class="tbl-block"')
    expect(out).toContain("Tabla 1")
    expect(out).not.toContain("{#tbl:")
  })

  it("consumes the lazy-continuation label row (no-blank-line form)", () => {
    const html =
      "<table>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n<tr>\n<td>{#tbl:data}</td>\n<td></td>\n</tr>\n</tbody>\n</table>"
    const out = wrapTables(html, new Map([["tbl:data", 1]]))
    expect(out).not.toContain("{#tbl:")
    expect(out).toContain('id="tbl-data"')
    // the real data row survives
    expect(out).toContain("<td>1</td>")
  })

  it("falls back to positional numbering for unlabeled tables", () => {
    const html = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    expect(wrapTables(html, new Map())).toContain('id="tbl-1"')
  })
})

describe("table anchors", () => {
  it("emits a ref href that matches the table id", () => {
    const labels = prescanTables(NO_BLANK)
    const ref = resolveTableRefs("@tbl:data", labels)
    const html = renderMarkdown(NO_BLANK)

    const [href] = fragmentHrefs(ref)
    expect(href).toBe("tbl-data")
    expect(ids(html)).toContain(href)
  })
})

// Both source forms must be fully equivalent end-to-end: same number, same
// anchor, no raw label text leaking into the output.
describe.each([
  ["no blank line", NO_BLANK],
  ["blank line", BLANK],
])("renderMarkdown — %s form", (_name, source) => {
  const html = renderMarkdown(`${source}\n\nVer @tbl:data`)

  it("does not leak the raw label into the output", () => {
    expect(html).not.toContain("{#tbl:")
  })

  it("resolves the reference to the table number", () => {
    expect(html).toContain("Tabla 1</a>")
    expect(html).not.toContain("Tabla (?)")
  })

  it("links the reference to an id that exists in the document", () => {
    const documentIds = ids(html)
    expect(documentIds).toContain("tbl-data")
    for (const href of fragmentHrefs(html)) {
      expect(documentIds).toContain(href)
    }
  })
})

// A document modelled on a real user note (`~/Uni/s10/EvF/calendario.md`):
// Spanish prose, two labeled tables written the no-blank-line way, and `@tbl:`
// references to both.
describe("renderMarkdown — realistic document", () => {
  const doc = `# Evaluación Financiera

Conceptos básicos: el presupuesto son supuestos fundamentados en la
información resultante de los estudios de los diferentes componentes.

| Rol | Riesgo |
|---|---|
| Dueños de proyectos | Alto |
| Inversionista | Moderado |
{#tbl:comite}

Cuando estemos planteando los proyectos se tienen que tomar algunas
decisiones que pueden ser excluyentes, ver @tbl:decisiones.

| Decisión | Implicación |
|---|---|
| NO | Por múltiples factores |
| Aplazar | Más estudio, más plata |
| SI | Perfilar el proyecto |
{#tbl:decisiones}

Los comités se describen en @tbl:comite.`

  const html = renderMarkdown(doc)

  it("leaks no label text", () => {
    expect(html).not.toContain("{#tbl:")
  })

  it("numbers the tables in document order", () => {
    expect(html).toContain('<figure class="tbl-block" id="tbl-comite">')
    expect(html).toContain('<figure class="tbl-block" id="tbl-decisiones">')
    expect(html.indexOf("Tabla 1")).toBeLessThan(html.indexOf("Tabla 2"))
    expect(html).toContain('href="#tbl-decisiones">Tabla 2</a>')
    expect(html).toContain('href="#tbl-comite">Tabla 1</a>')
  })

  it("keeps the table rows intact", () => {
    expect(html).toContain("<td>Inversionista</td>")
    expect(html).toContain("<td>Perfilar el proyecto</td>")
  })

  it("resolves every reference to an id present in the document", () => {
    const documentIds = ids(html)
    const hrefs = fragmentHrefs(html)
    expect(hrefs.filter((h) => h.startsWith("tbl-"))).toHaveLength(2)
    for (const href of hrefs) expect(documentIds).toContain(href)
  })
})
