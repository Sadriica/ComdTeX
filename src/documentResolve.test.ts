import { describe, expect, it } from "vitest"
// Sources are imported as text (Vite `?raw`) rather than read from disk, so
// this guard typechecks in the production build like any other module.
import exportActionsSrc from "./exportActions.ts?raw"
import useExportActionsSrc from "./useExportActions.ts?raw"
import rendererSrc from "./renderer.ts?raw"
import { resolveDocumentContent } from "./documentResolve"
import { exportToTex } from "./exporter"

const CSV = ["t,od\n", "0,0.1\n", "1,0.4\n"].join("")

const resolver = (target: string): string | null => {
  if (target === "growth.csv") return CSV
  if (target === "chapter") return "Embedded prose.\n\n:::csv\ngrowth.csv (A) (1)\n:::"
  return null
}

describe("resolveDocumentContent", () => {
  it("expands csv selections into tables", () => {
    const out = resolveDocumentContent(":::csv[Growth]\ngrowth.csv\n:::", resolver)
    expect(out).toContain("| t | od |")
    expect(out).toContain("| 0 | 0.1 |")
    expect(out).not.toContain(":::csv")
  })

  it("expands a csv block that lives inside a transcluded note", () => {
    const out = resolveDocumentContent("![[chapter]]", resolver)
    expect(out).toContain("Embedded prose.")
    // The embedded block selects column A, row 1 only.
    expect(out).toContain("| t |")
    expect(out).toContain("| 0 |")
    expect(out).not.toContain(":::csv")
  })

  it("returns the content untouched without a resolver", () => {
    expect(resolveDocumentContent(":::csv\ngrowth.csv\n:::")).toContain(":::csv")
  })
})

describe("the resolved document reaches LaTeX", () => {
  it("a csv selection becomes a real tabular in the export", () => {
    const resolved = resolveDocumentContent(":::csv[Growth]\ngrowth.csv\n:::", resolver)
    const tex = exportToTex(resolved, "", "T")
    expect(tex).toContain("\\begin{tabular}")
    expect(tex).toContain("0.4")
    expect(tex).not.toContain(":::csv")
    // Tables pull booktabs/longtable in through the science-package detector.
    expect(tex).toContain("\\usepackage{booktabs}")
  })
})

describe("every export path resolves the document", () => {
  // A guard, not a unit test: it is easy to add a new export handler and
  // forget the resolution step, which silently ships raw `:::csv` blocks in
  // whatever that button produces. Any path that reads editor content or
  // composes a project must route it through resolveDocumentContent.
  it("exportActions.ts routes its content through the shared resolver", () => {
    const src = exportActionsSrc
    // The old direct call must not come back.
    expect(src).not.toContain("resolveTransclusions(")
    // Every entry point that builds output from editor content.
    for (const fn of ["buildLatex", "exportPdf", "exportProjectLatex"]) {
      expect(src).toContain(fn)
    }
    expect(src.match(/resolveDocumentContent\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it("useExportActions.ts routes its handlers through the shared resolver", () => {
    const src = useExportActionsSrc
    expect(src).not.toContain("resolveTransclusions(")
    expect(src.match(/resolveDocumentContent\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it("the renderer uses the same definition as the exports", () => {
    const src = rendererSrc
    expect(src).toContain("resolveDocumentContent(")
    expect(src).not.toContain("expandCsvBlocks(")
  })
})
