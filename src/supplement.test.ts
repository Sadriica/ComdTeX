import { describe, expect, it } from "vitest"
import { toCmdxMd, toStorageMd } from "./cmdxFormat"
import { numberEnvironmentsForExport } from "./envExport"
import { exportToTex } from "./exporter"
import { prescanFigures, resolveFigRefs } from "./figures"
import { renderMarkdown } from "./renderer"
import { scanStructuralLabels } from "./structuralLabels"
import { prescanTables } from "./tables"
import { SUPPLEMENT_MARKER, hasSupplementMarker } from "./supplement"

const DOC = [
  "![Main one](a.png){#fig:a}",
  "",
  "| A | B |",
  "|---|---|",
  "| 1 | 2 |",
  "{#tbl:t1}",
  "",
  "<!-- supplement -->",
  "",
  "![Supp one](b.png){#fig:b}",
  "",
  "![Supp two](c.png)",
  "",
  "| A | B |",
  "|---|---|",
  "| 3 | 4 |",
  "{#tbl:s1}",
  "",
  "See @fig:a, @fig:b, @tbl:t1 and @tbl:s1.",
].join("\n")

describe("supplement marker", () => {
  it("detects the marker line only on its own line", () => {
    expect(hasSupplementMarker(`x\n${SUPPLEMENT_MARKER}\ny`)).toBe(true)
    expect(hasSupplementMarker("text <!-- supplement --> text")).toBe(false)
    expect(hasSupplementMarker("no marker")).toBe(false)
  })
})

describe("supplement numbering", () => {
  it("restarts figures and tables with the S prefix after the marker", () => {
    const figs = prescanFigures(DOC)
    expect(figs.get("fig:a")).toBe(1)
    expect(figs.get("fig:b")).toBe("S1")
    const tbls = prescanTables(DOC)
    expect(tbls.get("tbl:t1")).toBe(1)
    expect(tbls.get("tbl:s1")).toBe("S1")
  })

  it("ignores a marker inside a code fence", () => {
    const text = "```\n<!-- supplement -->\n```\n\n![x](a.png){#fig:a}"
    expect(prescanFigures(text).get("fig:a")).toBe(1)
  })

  it("only the first marker restarts the numbering", () => {
    const text = "<!-- supplement -->\n![x](a.png)\n<!-- supplement -->\n![y](b.png){#fig:b}"
    expect(prescanFigures(text).get("fig:b")).toBe("S2")
  })

  it("leaves documents without a marker unchanged", () => {
    expect(prescanFigures("![x](a.png){#fig:a}").get("fig:a")).toBe(1)
  })

  it("resolves references to the S number", () => {
    const html = resolveFigRefs("@fig:b", prescanFigures(DOC))
    expect(html).toContain("Figura S1")
  })

  it("prints S captions and reference text in the preview", () => {
    const html = renderMarkdown(
      DOC,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        lang: "en",
      },
    )
    expect(html).toContain("Figure 1.")
    expect(html).toContain("Figure S1.")
    expect(html).toContain("Figure S2.")
    expect(html).toContain("Table 1")
    expect(html).toContain("Table S1")
    expect(html).toContain('id="fig-b"')
    expect(html).toContain(">Figure S1</a>")
    expect(html).toContain(">Table S1</a>")
    expect(html).toContain(">Figure 1</a>")
  })

  it("numbers unlabeled supplement figures too", () => {
    const html = renderMarkdown(
      "<!-- supplement -->\n\n![Only](a.png)",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        lang: "en",
      },
    )
    expect(html).toContain("Figure S1.")
  })

  it("gives the Labels panel the S number", () => {
    const index = scanStructuralLabels([{ path: "/a.md", name: "a.md", content: DOC }])
    const byId = new Map(index.labels.map((l) => [l.id, l.number]))
    expect(byId.get("fig:a")).toBe("1")
    expect(byId.get("fig:b")).toBe("S1")
  })
})

describe("supplement export", () => {
  it("emits the standard LaTeX counter restart at the marker", () => {
    const tex = exportToTex(DOC, "", "t")
    expect(tex).toContain("\\setcounter{figure}{0}")
    expect(tex).toContain("\\setcounter{table}{0}")
    expect(tex).toContain("\\renewcommand{\\thefigure}{S\\arabic{figure}}")
    expect(tex).toContain("\\renewcommand{\\thetable}{S\\arabic{table}}")
    expect(tex.indexOf("\\label{fig:a}")).toBeLessThan(tex.indexOf("\\setcounter{figure}"))
    expect(tex.indexOf("\\setcounter{figure}")).toBeLessThan(tex.indexOf("\\label{fig:b}"))
    expect(tex).not.toContain("supplement -->")
  })

  it("emits no restart without a marker and only once with several", () => {
    expect(exportToTex("![x](a.png){#fig:a}", "", "t")).not.toContain("thefigure")
    const tex = exportToTex(`${SUPPLEMENT_MARKER}\n\n${SUPPLEMENT_MARKER}\n\ntext`, "", "t")
    expect(tex.match(/\\setcounter\{figure\}/g)).toHaveLength(1)
  })

  it("does not restart inside a code sample", () => {
    const tex = exportToTex("```\n<!-- supplement -->\n```", "", "t")
    expect(tex).not.toContain("thefigure")
  })

  it("writes the S numbers into text exports", () => {
    const out = numberEnvironmentsForExport(DOC, "callout", undefined, undefined, "en")
    expect(out).toContain("See @fig:a, Figure S1, @tbl:t1 and Table S1.")
    const es = numberEnvironmentsForExport(DOC, "bold", undefined, undefined, "es")
    expect(es).toContain("Figura S1")
    expect(es).toContain("Tabla S1")
  })

  it("keeps the marker byte for byte through save and reopen", () => {
    expect(toStorageMd(toCmdxMd(DOC))).toBe(DOC)
    expect(toCmdxMd(toStorageMd(DOC))).toBe(DOC)
  })
})
