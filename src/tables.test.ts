import { describe, expect, it } from "vitest"
import { prescanTables, resolveTableRefs, wrapTables } from "./tables"

describe("table labels", () => {
  it("numbers markdown tables and resolves labels", () => {
    const markdown = "| A | B |\n|---|---|\n| 1 | 2 |\n{#tbl:data}"
    const labels = prescanTables(markdown)

    expect(labels.get("tbl:data")).toBe(1)
    expect(resolveTableRefs("Ver @tbl:data", labels)).toContain("Tabla 1")
  })

  it("wraps rendered tables with figure captions", () => {
    const labels = new Map([["tbl:data", 1]])
    const html = "<table><tr><td>A</td></tr></table>\n<p>{#tbl:data}</p>"

    expect(wrapTables(html, labels)).toContain('class="tbl-block"')
    expect(wrapTables(html, labels)).toContain("Tabla 1")
  })
})
