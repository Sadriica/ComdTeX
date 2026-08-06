import { describe, expect, it } from "vitest"
import { findBioConventions, isBiologyDocument } from "./bioConventions"
import { exportToTex, detectSciPackages } from "./exporter"

const bioDoc = (body: string) => `---\ntitle: T\ncomdtex.domain: biology\n---\n${body}`

describe("isBiologyDocument", () => {
  it("is opt-in through frontmatter only", () => {
    expect(isBiologyDocument(bioDoc("x"))).toBe(true)
    expect(isBiologyDocument("---\ntitle: T\n---\nEscherichia coli")).toBe(false)
    expect(isBiologyDocument("Escherichia coli")).toBe(false)
  })

  it("accepts the sibling domains", () => {
    expect(isBiologyDocument("---\ncomdtex.domain: microbiology\n---\nx")).toBe(true)
    expect(isBiologyDocument("---\ncomdtex.domain: biomed\n---\nx")).toBe(true)
  })
})

describe("findBioConventions: binomials", () => {
  it("flags a full binomial and the abbreviated form", () => {
    const f = findBioConventions(bioDoc("We grew Escherichia coli and then E. coli again."))
    expect(f.filter((x) => x.kind === "binomial").map((x) => x.text)).toEqual([
      "Escherichia coli",
      "E. coli",
    ])
    expect(f[0].suggestion).toBe("*Escherichia coli*")
  })

  it("stays silent when the name is already italic", () => {
    const f = findBioConventions(bioDoc("We grew *Escherichia coli* overnight."))
    expect(f.filter((x) => x.kind === "binomial")).toEqual([])
  })

  it("never touches code, math or links", () => {
    const f = findBioConventions(
      bioDoc("`Escherichia coli` and $Escherichia coli$ and [Escherichia coli](http://x)"),
    )
    expect(f.filter((x) => x.kind === "binomial")).toEqual([])
  })
})

describe("findBioConventions: gene symbols", () => {
  it("flags likely gene symbols", () => {
    const f = findBioConventions(bioDoc("Expression of TP53 and BRCA1 rose."))
    expect(f.filter((x) => x.kind === "gene").map((x) => x.text)).toEqual(["TP53", "BRCA1"])
  })

  it("does not flag common lab and method acronyms", () => {
    const f = findBioConventions(bioDoc("We ran PCR, ELISA and HPLC with DNA in PBS."))
    expect(f.filter((x) => x.kind === "gene")).toEqual([])
  })

  it("does not flag protein products written in lowercase", () => {
    const f = findBioConventions(bioDoc("The p53 protein accumulates."))
    expect(f.filter((x) => x.kind === "gene")).toEqual([])
  })

  it("ignores symbols inside headings", () => {
    const f = findBioConventions(bioDoc("## TP53 and friends\n\nBody text."))
    expect(f.filter((x) => x.kind === "gene")).toEqual([])
  })
})

describe("findBioConventions: ordering and opt-out", () => {
  it("returns findings in document order", () => {
    const f = findBioConventions(bioDoc("TP53 first, then Escherichia coli."))
    expect(f.map((x) => x.kind)).toEqual(["gene", "binomial"])
    expect(f[0].start).toBeLessThan(f[1].start)
  })

  it("returns nothing for documents that did not opt in", () => {
    expect(findBioConventions("Escherichia coli and TP53")).toEqual([])
  })
})

describe("science packages load only when used", () => {
  it("detects units, chemistry and tables in the generated body", () => {
    expect(detectSciPackages("\\qty{1}{\\meter}")).toMatchObject({ units: true, chem: false })
    expect(detectSciPackages("\\ce{H2O}")).toMatchObject({ chem: true, units: false })
    expect(detectSciPackages("plain text")).toEqual({ units: false, chem: false, tables: false })
  })

  it("adds siunitx to the preamble only for documents with quantities", () => {
    const withUnits = exportToTex("La aceleración es $si(9.81, m/s^2)$.", "", "T")
    expect(withUnits).toContain("\\usepackage{siunitx}")
    expect(withUnits).toContain("\\qty{9.81}{\\meter\\per\\second\\squared}")

    const without = exportToTex("Texto sin unidades.", "", "T")
    expect(without).not.toContain("siunitx")
  })

  it("adds mhchem only for documents with chemistry", () => {
    const withChem = exportToTex("El agua es $ce(H2O)$.", "", "T")
    expect(withChem).toContain("\\usepackage[version=4]{mhchem}")
    expect(exportToTex("Sin química.", "", "T")).not.toContain("mhchem")
  })

  it("carries the science packages into journal classes too", () => {
    const tex = exportToTex(
      "---\ntitle: P\ncomdtex.texclass: ieeetran\n---\nMedimos $si(3, kg)$.",
      "", "P", "Ada",
    )
    expect(tex).toContain("\\documentclass[conference]{IEEEtran}")
    expect(tex).toContain("\\usepackage{siunitx}")
  })
})
