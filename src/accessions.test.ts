// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  accessionUrl,
  findAccessions,
  findAccessionsInMarkdown,
  findMissingDataAvailability,
} from "./accessions"
import { renderMarkdown } from "./renderer"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"
import { exportToTex } from "./exporter"
import { lintContent, type LintContext } from "./contentLinter"
import { en } from "./i18n/en"
import { es } from "./i18n/es"

const bio = (body: string) => `---\ntitle: T\ncomdtex.domain: biology\n---\n${body}`
const ids = (t: string) => findAccessions(t).map((m) => m.text)

describe("findAccessions: formats and URLs", () => {
  const cases: Array<[string, string]> = [
    ["MN908947.3", "https://www.ncbi.nlm.nih.gov/nuccore/MN908947.3"],
    ["AB123456", "https://www.ncbi.nlm.nih.gov/nuccore/AB123456"],
    ["U12345.1", "https://www.ncbi.nlm.nih.gov/nuccore/U12345.1"],
    ["NM_000546.6", "https://www.ncbi.nlm.nih.gov/nuccore/NM_000546.6"],
    ["NC_045512.2", "https://www.ncbi.nlm.nih.gov/nuccore/NC_045512.2"],
    ["XM_011520002.1", "https://www.ncbi.nlm.nih.gov/nuccore/XM_011520002.1"],
    ["NZ_CP012345.1", "https://www.ncbi.nlm.nih.gov/nuccore/NZ_CP012345.1"],
    ["NP_000537.3", "https://www.ncbi.nlm.nih.gov/protein/NP_000537.3"],
    ["SRR1234567", "https://www.ncbi.nlm.nih.gov/sra/SRR1234567"],
    ["SRX123456", "https://www.ncbi.nlm.nih.gov/sra/SRX123456"],
    ["SRP012345", "https://www.ncbi.nlm.nih.gov/sra/SRP012345"],
    ["ERR1234567", "https://www.ebi.ac.uk/ena/browser/view/ERR1234567"],
    ["DRR123456", "https://www.ebi.ac.uk/ena/browser/view/DRR123456"],
    ["PRJEB12345", "https://www.ebi.ac.uk/ena/browser/view/PRJEB12345"],
    ["PRJNA123456", "https://www.ncbi.nlm.nih.gov/bioproject/PRJNA123456"],
    ["SAMN12345678", "https://www.ncbi.nlm.nih.gov/biosample/SAMN12345678"],
    ["SAMEA1234567", "https://www.ebi.ac.uk/biosamples/samples/SAMEA1234567"],
    ["GSE12345", "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE12345"],
    ["GSM123456", "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSM123456"],
    ["GPL570", "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GPL570"],
    ["E-MTAB-1234", "https://www.ebi.ac.uk/biostudies/arrayexpress/studies/E-MTAB-1234"],
    ["ENSG00000141510", "https://www.ensembl.org/id/ENSG00000141510"],
    ["ENSMUST00000000001", "https://www.ensembl.org/id/ENSMUST00000000001"],
  ]
  it.each(cases)("%s links to %s", (id, url) => {
    const hit = findAccessions(`Data are in ${id}.`)
    expect(hit).toHaveLength(1)
    expect(hit[0].text).toBe(id)
    expect(hit[0].url).toBe(url)
    expect(accessionUrl(id)).toBe(url)
  })

  it("strips the version from Ensembl URLs but keeps it in the text", () => {
    const [h] = findAccessions("see ENSG00000141510.18")
    expect(h.text).toBe("ENSG00000141510.18")
    expect(h.url).toBe("https://www.ensembl.org/id/ENSG00000141510")
  })

  it("reports offsets of the identifier alone", () => {
    const t = "Reads: SRR1234567, GSE12345."
    const hits = findAccessions(t)
    expect(hits.map((h) => t.slice(h.start, h.end))).toEqual(["SRR1234567", "GSE12345"])
  })

  it("does not swallow a sentence-final dot", () => {
    expect(ids("deposited as MN908947.")).toEqual(["MN908947"])
    expect(ids("deposited as MN908947.3.")).toEqual(["MN908947.3"])
  })
})

describe("findAccessions: PDB and UniProt need their name", () => {
  it("links PDB ids only after the word PDB", () => {
    expect(ids("structure PDB 1ABC and PDB: 4HHB and PDB ID 6VXX")).toEqual([
      "1ABC",
      "4HHB",
      "6VXX",
    ])
    expect(ids("the 1ABC protein, 4HHB, 6VXX")).toEqual([])
    expect(accessionUrl("4HHB")).toBeNull()
  })

  it("never reads a year or a number after PDB as a structure", () => {
    expect(ids("the PDB 2020 release")).toEqual([])
    expect(ids("PDB 1234")).toEqual([])
  })

  it("links UniProt accessions only after the database name", () => {
    expect(ids("UniProt P04637 and UniProtKB: Q9Y6K9 and Swiss-Prot accession O15111")).toEqual([
      "P04637",
      "Q9Y6K9",
      "O15111",
    ])
    expect(findAccessions("UniProt P04637")[0].url).toBe("https://www.uniprot.org/uniprotkb/P04637")
  })

  it("leaves bare UniProt-shaped words alone", () => {
    expect(ids("P04637 and Q12345 and A0A024R161 on their own")).toEqual([])
  })
})

describe("findAccessions: no false positives on prose", () => {
  const prose = [
    "COVID19 and H1N1 spread in 2020, CD4 counts of A549 cells.",
    "Invoice ID123456 was paid; order NO123456 shipped; PO123456 pending.",
    "The ISO 27001 standard, ISO27001, RFC2616 and IL6 levels.",
    "Phone +34 600123456, zip 28001, ABC123456 and abc123456 and ab123456.",
    "Tolerance ABCD12345 and P-value 0.0001, p<0.05, n=1234567.",
    "See file SRR1234567_1.fastq and path /data/MN908947 and SRR1234567.fastq.gz",
    "Handle @GSE12345, label {#fig:GSE12345}, id tag_SRR1234567.",
    "Zenodo DOI 10.5281/zenodo.1234567 and doi:10.1038/s41586-020-2012-7.",
    "Model GPT4, Windows11, Python3, R2D2, B52, A12345 and U12345 without version.",
    "Chapter 12, Section 3.4, Figure 2B, Table S1, E-mail E-123.",
    "Measured at SRR12 and GSE1 and NM_12 and ENSG123.",
    "The word PDB alone, or UniProt alone, or PDBsum 1ABC.",
  ]
  it.each(prose)("stays silent: %s", (t) => {
    expect(ids(t)).toEqual([])
  })

  it("is case sensitive", () => {
    expect(ids("srr1234567 gse12345 mn908947 nm_000546.6")).toEqual([])
  })

  it("handles the empty and the tiny", () => {
    expect(findAccessions("")).toEqual([])
    expect(findAccessions("SRR1")).toEqual([])
  })
})

describe("findAccessionsInMarkdown", () => {
  it("skips code, math, links, urls, wikilinks, frontmatter and headings", () => {
    const text = [
      "---",
      "title: SRR1234567",
      "---",
      "## Reads SRR1234567 {#sec:srr}",
      "`SRR1234567` and $SRR1234567$ and [x](https://e.org/SRR1234567) and https://e.org/GSE12345",
      "[[SRR1234567]]",
      "```",
      "SRR1234567",
      "```",
      "Real: GSE12345.",
    ].join("\n")
    const hits = findAccessionsInMarkdown(text)
    expect(hits.map((h) => h.text)).toEqual(["GSE12345"])
    expect(text.slice(hits[0].start, hits[0].end)).toBe("GSE12345")
  })
})

describe("preview", () => {
  const render = (md: string) => sanitizeRenderedHtml(renderMarkdown(md))

  it("links accessions in prose of an opted-in document", () => {
    const html = render(bio("Genome MN908947.3 and reads SRR1234567, structure PDB 6VXX."))
    expect(html).toContain('href="https://www.ncbi.nlm.nih.gov/nuccore/MN908947.3"')
    expect(html).toContain(">MN908947.3</a>")
    expect(html).toContain('href="https://www.ncbi.nlm.nih.gov/sra/SRR1234567"')
    expect(html).toContain('href="https://www.rcsb.org/structure/6VXX"')
    expect(html).toContain("PDB <a")
  })

  it("is off without the opt-in", () => {
    expect(render("Genome MN908947.3")).not.toContain("<a ")
    expect(render("---\ntitle: T\n---\nGenome MN908947.3")).not.toContain("<a ")
  })

  it("leaves code, math, existing links and headings alone", () => {
    const html = render(
      bio(
        [
          "# Reads SRR1234567",
          "",
          "`SRR1234567` and $x_{SRR1234567}$ and [data](https://example.org/x) SRR7654321.",
          "",
          "[SRR1111111](https://example.org/mine) and <a href='https://e.org'>GSE22222</a>",
          "",
          "```",
          "GSE12345",
          "```",
        ].join("\n"),
      ),
    )
    expect(html).not.toContain("nuccore")
    expect(html).not.toContain("SRR1234567</a>")
    expect(html).not.toContain("GSE12345</a>")
    expect(html).not.toContain('class="accession">GSE22222')
    expect(html).toContain("https://example.org/mine")
    expect(html).toContain('href="https://www.ncbi.nlm.nih.gov/sra/SRR7654321"')
  })

  it("does not touch the stored text and survives sanitizing (https only)", () => {
    const src = bio("Run SRR1234567.")
    const before = src
    const html = render(src)
    expect(src).toBe(before)
    expect(html).toMatch(/<a [^>]*href="https:\/\//)
  })

  it("links in lists and table cells", () => {
    const html = render(bio("- GSE12345\n\n| a |\n|---|\n| ERR1234567 |"))
    expect(html).toContain("acc.cgi?acc=GSE12345")
    expect(html).toContain("ena/browser/view/ERR1234567")
  })

  it("does not leak between renders", () => {
    render(bio("SRR1234567"))
    expect(render("SRR1234567")).not.toContain("<a ")
  })
})

describe("LaTeX export", () => {
  it("emits \\href for accessions of an opted-in document and loads hyperref", () => {
    const tex = exportToTex(bio("Reads in SRR1234567 and GSE12345."), "", "t")
    expect(tex).toContain("\\href{https://www.ncbi.nlm.nih.gov/sra/SRR1234567}{SRR1234567}")
    expect(tex).toContain("\\href{https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE12345}")
    expect(tex).toContain("\\usepackage{hyperref}")
  })

  it("keeps the underscore of RefSeq ids escaped in text and verbatim in the URL", () => {
    const tex = exportToTex(bio("Gene NM_000546.6."), "", "t")
    expect(tex).toContain("{NM\\_000546.6}")
    expect(tex).toContain("/nuccore/NM\\_000546.6}")
  })

  it("is plain text without the opt-in, in code, in headings and inside links", () => {
    expect(exportToTex("Reads SRR1234567.", "", "t")).not.toContain("\\href")
    const tex = exportToTex(
      bio("# Reads SRR1234567\n\n`SRR1234567` [x](https://e.org) [SRR7654321](https://e.org/y)"),
      "",
      "t",
    )
    expect(tex).not.toContain("sra/SRR")
    expect(tex).not.toMatch(/\\href\{[^}]*\}\{[^}]*\\href/)
  })

  it("resets the switch after a biology export", () => {
    exportToTex(bio("SRR1234567"), "", "t")
    expect(exportToTex("SRR1234567", "", "t")).not.toContain("\\href")
  })
})

describe("findMissingDataAvailability", () => {
  it("fires on an accession, pointing at it", () => {
    const text = bio("We used GSE12345.")
    const f = findMissingDataAvailability(text)!
    expect(f.accession).toBe("GSE12345")
    expect(text.slice(f.start, f.end)).toBe("GSE12345")
  })

  it("fires on sequencing data without accessions", () => {
    expect(findMissingDataAvailability(bio("We ran RNA-seq on all samples."))).not.toBeNull()
  })

  it("fires on a references section of an opted-in document", () => {
    const f = findMissingDataAvailability(bio("Text.\n\n## References\n\n1. x"))
    expect(f).not.toBeNull()
    expect(f!.accession).toBeUndefined()
  })

  it("stays quiet for short notes, other domains and documents with the section", () => {
    expect(findMissingDataAvailability(bio("Just a lab note."))).toBeNull()
    expect(findMissingDataAvailability("We used GSE12345.\n\n## References")).toBeNull()
    for (const h of [
      "## Data availability",
      "## Data Availability Statement",
      "### 5. Data availability",
      "## Disponibilidad de datos",
      "## Availability of data and materials",
      "**Data availability.** Deposited at GEO.",
    ]) {
      expect(findMissingDataAvailability(bio(`GSE12345\n\n${h}\n\nx`))).toBeNull()
    }
  })

  it("ignores accessions in code", () => {
    expect(findMissingDataAvailability(bio("```\nSRR1234567\n```"))).toBeNull()
  })
})

describe("linter marker", () => {
  const Severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as never
  const ctx = (messages = en.lint.messages): LintContext => ({
    vaultFileNames: new Set(),
    bibKeys: new Set(),
    messages,
  })
  const run = (t: string, messages = en.lint.messages) =>
    lintContent(t, ctx(messages), Severity).filter((m) => m.code === "bio-data-availability")

  it("emits one info marker with a stable code", () => {
    const m = run(bio("Data: SRR1234567 and GSE12345."))
    expect(m).toHaveLength(1)
    expect(m[0].severity).toBe(2)
    expect(m[0].message).toContain("SRR1234567")
  })

  it("is silent without opt-in or with the section", () => {
    expect(run("Data: SRR1234567")).toHaveLength(0)
    expect(run(bio("SRR1234567\n\n## Data availability\n\nGEO."))).toHaveLength(0)
  })

  it("is translated", () => {
    expect(run(bio("SRR1234567"), es.lint.messages)[0].message).toContain("Disponibilidad de datos")
    expect(run(bio("SRR1234567"), en.lint.messages)[0].message).toContain("Data availability")
  })
})
