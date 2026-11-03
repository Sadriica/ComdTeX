import { describe, expect, it } from "vitest"
import {
  bioOrganism,
  findBioConventions,
  geneSuggestion,
  isBiologyDocument,
} from "./bioConventions"
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
      "",
      "P",
      "Ada",
    )
    expect(tex).toContain("\\documentclass[conference]{IEEEtran}")
    expect(tex).toContain("\\usepackage{siunitx}")
  })
})

const orgDoc = (organism: string, body: string) =>
  `---\ntitle: T\ncomdtex.domain: biology\ncomdtex.organism: ${organism}\n---\n${body}`
const kinds = (text: string, kind: string) =>
  findBioConventions(text)
    .filter((f) => f.kind === kind)
    .map((f) => f.text)

describe("bioOrganism", () => {
  it("reads the key, case-insensitively, and ignores unknown values", () => {
    expect(bioOrganism(orgDoc("mouse", "x"))).toBe("mouse")
    expect(bioOrganism(orgDoc("Zebrafish", "x"))).toBe("zebrafish")
    expect(bioOrganism(orgDoc("dragon", "x"))).toBeNull()
    expect(bioOrganism(bioDoc("x"))).toBeNull()
  })

  it("keeps the organism-blind check when the value is unknown", () => {
    expect(kinds(orgDoc("dragon", "Expression of TP53 rose."), "gene")).toEqual(["TP53"])
  })
})

describe("geneSuggestion", () => {
  it("applies each organism's capitalization", () => {
    expect(geneSuggestion("human", "tp53")).toBe("TP53")
    expect(geneSuggestion("mouse", "TRP53")).toBe("Trp53")
    expect(geneSuggestion("rat", "TRP53")).toBe("Trp53")
    expect(geneSuggestion("zebrafish", "TP53")).toBe("tp53")
    expect(geneSuggestion("yeast", "Cdc28")).toBe("CDC28")
    expect(geneSuggestion("bacteria", "lacZ")).toBe("lacZ")
    expect(geneSuggestion(null, "Abc")).toBe("Abc")
  })
})

describe("organism-aware: unitalic genes need a gene cue", () => {
  it("human: flags TP53 when the text says it is a gene", () => {
    const f = findBioConventions(orgDoc("human", "The TP53 gene is mutated; BRCA1 mutations too."))
    expect(f.filter((x) => x.kind === "gene").map((x) => [x.text, x.suggestion])).toEqual([
      ["TP53", "*TP53*"],
      ["BRCA1", "*BRCA1*"],
    ])
  })

  it("human: an upright capitalized symbol without a cue is a protein, not flagged", () => {
    expect(
      kinds(orgDoc("human", "Expression of TP53 and BRCA1 rose. The TP53 protein binds."), "gene"),
    ).toEqual([])
  })

  it("mouse: suggests the mouse capitalization", () => {
    const f = findBioConventions(orgDoc("mouse", "The Trp53 gene and the TRP53 knockout."))
    expect(f.filter((x) => x.kind === "gene").map((x) => x.suggestion)).toEqual([
      "*Trp53*",
      "*Trp53*",
    ])
  })

  it("mouse: ordinary capitalized words never match", () => {
    const body = "The Mouse gene pool, Figure 2 and Table 3 describe the Day2 gene set."
    expect(kinds(orgDoc("mouse", body), "gene")).toEqual([])
  })

  it("zebrafish: lowercase symbol with a cue, never log2 or ph7", () => {
    expect(kinds(orgDoc("zebrafish", "The tp53 mutant and sox10 mutations."), "gene")).toEqual([
      "tp53",
      "sox10",
    ])
    expect(kinds(orgDoc("zebrafish", "We took log2 gene counts at ph7 gene."), "gene")).toEqual([])
  })

  it("yeast: CDC28 gene, but not the Cdc28p protein", () => {
    expect(
      kinds(orgDoc("yeast", "The CDC28 gene and Cdc28p protein; cdc28 mutant."), "gene"),
    ).toEqual(["CDC28"])
  })

  it("bacteria: lacZ needs no cue, LacZ and prose do not match", () => {
    expect(kinds(orgDoc("bacteria", "A lacZ fusion and recA deletion."), "gene")).toEqual([
      "lacZ",
      "recA",
    ])
    expect(kinds(orgDoc("bacteria", "The LacZ protein; macOS and bioRxiv, mRNA."), "gene")).toEqual(
      [],
    )
    expect(kinds(orgDoc("bacteria", "A *lacZ* fusion and `recA`."), "gene")).toEqual([])
  })

  it("drosophila: no symbol rules, nothing to detect with precision", () => {
    expect(
      kinds(orgDoc("drosophila", "The white gene and w mutants, Notch gene."), "gene"),
    ).toEqual([])
  })

  it("keeps a symbol as typed on a line that compares organisms", () => {
    const f = findBioConventions(orgDoc("mouse", "The human TP53 gene has the mouse ortholog."))
    expect(f.find((x) => x.kind === "gene")?.suggestion).toBe("*TP53*")
  })

  it("ignores code, math, links and headings", () => {
    const body = "`TP53 gene` and $TP53$ gene and [TP53](x) gene\n\n## The TP53 gene"
    expect(kinds(orgDoc("human", body), "gene")).toEqual([])
  })
})

describe("organism-aware: italic symbols in the wrong form", () => {
  it("mouse and rat: an all-caps italic symbol is a wrong-case gene", () => {
    const f = findBioConventions(orgDoc("mouse", "We deleted *TRP53* in cells."))
    expect(f.filter((x) => x.kind === "gene-case").map((x) => [x.text, x.suggestion])).toEqual([
      ["*TRP53*", "*Trp53*"],
    ])
    expect(kinds(orgDoc("rat", "We deleted _TP53_ in cells."), "gene-case")).toEqual(["_TP53_"])
  })

  it("mouse: correct italics, emphasis, bold and comparisons stay silent", () => {
    expect(
      kinds(orgDoc("mouse", "We deleted *Trp53*, not *AND*, **TP53**, *Fig2*."), "gene-case"),
    ).toEqual([])
    expect(kinds(orgDoc("mouse", "Human *TP53* and its mouse ortholog."), "gene-case")).toEqual([])
    expect(kinds(orgDoc("mouse", "A *TP53 gene* here and `*TP53*`"), "gene-case")).toEqual([])
  })

  it("human: an italic Trp53 should be uppercase", () => {
    expect(kinds(orgDoc("human", "The *Trp53* gene."), "gene-case")).toEqual(["*Trp53*"])
    expect(kinds(orgDoc("human", "The *TP53* gene, *Table1*, *Day3*."), "gene-case")).toEqual([])
  })

  it("zebrafish: italic upper or first-cap symbols should be lowercase", () => {
    const f = findBioConventions(orgDoc("zebrafish", "Loss of *TP53* and *Tp53* but not *tp53*."))
    expect(f.filter((x) => x.kind === "gene-case").map((x) => x.suggestion)).toEqual([
      "*tp53*",
      "*tp53*",
    ])
  })

  it("yeast: italic Cdc28 should be CDC28, italic Cdc28p is a protein", () => {
    const f = findBioConventions(orgDoc("yeast", "*Cdc28* and *Cdc28p* but *CDC28* and *cdc28-1*."))
    expect(f.filter((x) => x.kind === "gene-case").map((x) => x.suggestion)).toEqual(["*CDC28*"])
    const p = f.filter((x) => x.kind === "protein-italic")
    expect(p.map((x) => [x.text, x.suggestion])).toEqual([["*Cdc28p*", "Cdc28p"]])
  })

  it("bacteria: an italic LacZ is a protein written as a gene", () => {
    const f = findBioConventions(orgDoc("bacteria", "The *LacZ* product and *lacZ* gene."))
    expect(f.filter((x) => x.kind === "protein-italic").map((x) => x.suggestion)).toEqual(["LacZ"])
  })

  it("is off without an organism", () => {
    const f = findBioConventions(bioDoc("We deleted *TRP53* and *Cdc28p* and *LacZ*."))
    expect(f.filter((x) => x.kind === "gene-case" || x.kind === "protein-italic")).toEqual([])
  })
})

describe("binomial first mention", () => {
  it("flags the abbreviation used before the full name, once", () => {
    const f = findBioConventions(
      bioDoc("*E. coli* grew. *E. coli* again. Later *Escherichia coli* is named."),
    )
    const first = f.filter((x) => x.kind === "binomial-first")
    expect(first).toHaveLength(1)
    expect(first[0].text).toBe("E. coli")
    expect(first[0].full).toBe("Escherichia coli")
    expect(first[0].start).toBe(bioDoc("").length + 1)
  })

  it("is silent when the full name comes first", () => {
    const f = findBioConventions(bioDoc("*Escherichia coli* (*E. coli*) grew; *E. coli* again."))
    expect(f.filter((x) => x.kind === "binomial-first")).toEqual([])
  })

  it("matches the genus initial and the epithet, nothing looser", () => {
    const f = findBioConventions(
      bioDoc(
        "*E. coli* and *S. aureus* first; *Escherichia fergusonii* only, *Staphylococcus epidermidis*.",
      ),
    )
    expect(f.filter((x) => x.kind === "binomial-first")).toEqual([])
  })

  it("is silent when the full name never appears", () => {
    const f = findBioConventions(bioDoc("*E. coli* and *B. subtilis*."))
    expect(f.filter((x) => x.kind === "binomial-first")).toEqual([])
  })

  it("reports each species once, in order", () => {
    const f = findBioConventions(
      bioDoc("*B. subtilis* and *E. coli*, then *Escherichia coli* and *Bacillus subtilis*."),
    )
    expect(f.filter((x) => x.kind === "binomial-first").map((x) => x.text)).toEqual([
      "B. subtilis",
      "E. coli",
    ])
  })

  it("ignores code, math, links and frontmatter, and heading mentions", () => {
    const body = "`E. coli` and $E. coli$ first.\n\n## E. coli growth\n\nNow *Escherichia coli*."
    expect(findBioConventions(bioDoc(body)).filter((x) => x.kind === "binomial-first")).toEqual([])
    const head = "## Escherichia coli\n\nThen *E. coli* grew."
    expect(findBioConventions(bioDoc(head)).filter((x) => x.kind === "binomial-first")).toEqual([])
  })

  it("covers the added model-organism genera", () => {
    const f = findBioConventions(
      bioDoc("Schizosaccharomyces pombe, Neurospora crassa and Oryza sativa are model species."),
    )
    expect(f.filter((x) => x.kind === "binomial").map((x) => x.text)).toEqual([
      "Schizosaccharomyces pombe",
      "Neurospora crassa",
      "Oryza sativa",
    ])
  })
})
