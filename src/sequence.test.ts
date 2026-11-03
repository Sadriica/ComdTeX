import { describe, expect, it } from "vitest"
import {
  detectSeqType,
  gcContent,
  layoutSeq,
  looksLikeSeqBody,
  parseSeq,
  renderSeqHTML,
  reverseComplement,
  seqBlockToLatex,
  seqBlockToMarkdown,
  seqCaption,
  seqLegend,
  seqRecordLines,
} from "./sequence"
import { renderMarkdown } from "./renderer"
import { toCmdx, toStorage } from "./cmdxFormat"
import { specialBlocksToPandoc } from "./exportConversion"
import { exportToTex } from "./exporter"
import { lintContent } from "./contentLinter"
import { lossyExportWarnings } from "./exportCompatibility"
import { en } from "./i18n/en"

const SEV = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const
const DNA = "GAATTCGGATCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCC"

describe("biology helpers", () => {
  it("reverse complement keeps case and handles IUPAC", () => {
    expect(reverseComplement("GAATTC")).toBe("GAATTC")
    expect(reverseComplement("ATGc")).toBe("gCAT")
    expect(reverseComplement("ACGTRYKM")).toBe("KMRYACGT")
    expect(reverseComplement("AUGC", true)).toBe("GCAU")
    expect(reverseComplement("AACG", true)).toBe("CGUU")
  })

  it("GC content ignores ambiguity codes and rounds to one decimal", () => {
    expect(gcContent("GGCC")).toBe(100)
    expect(gcContent("ATAT")).toBe(0)
    expect(gcContent("GCATNN")).toBe(50)
    expect(gcContent("NNN")).toBeNull()
    expect(gcContent("GCAUA")).toBe(40)
    expect(gcContent("GCA")).toBe(66.7)
  })

  it("detects the alphabet", () => {
    expect(detectSeqType("acgtn")).toBe("dna")
    expect(detectSeqType("ACGU")).toBe("rna")
    expect(detectSeqType("MKTAYIAK")).toBe("protein")
    expect(detectSeqType("")).toBe("dna")
  })
})

describe("parseSeq", () => {
  it("parses raw sequence lines, ignoring spaces and GenBank position numbers", () => {
    const doc = parseSeq("   1 gaattc ggatcc\n  13 aagctt")
    expect(doc.issues).toEqual([])
    expect(doc.records).toHaveLength(1)
    expect(doc.records[0].residues).toBe("gaattcggatccaagctt")
    expect(doc.records[0].name).toBe("")
    expect(doc.records[0].type).toBe("dna")
  })

  it("parses several FASTA records with descriptions", () => {
    const doc = parseSeq(">a first one\nACGT\nACGT\n\n>b\nMKTAYIAK")
    expect(doc.issues).toEqual([])
    expect(doc.records.map((r) => [r.name, r.description, r.residues, r.type])).toEqual([
      ["a", "first one", "ACGTACGT", "dna"],
      ["b", "", "MKTAYIAK", "protein"],
    ])
  })

  it("reads header options", () => {
    const doc = parseSeq(
      "type: rna\nwidth: 30\ngroup: 5\nrevcomp: yes\nmotif: AUG, GCC\nhighlight: 2-4 start, 7\nAUGGCCAUGGCC",
    )
    expect(doc.issues).toEqual([])
    expect(doc.options).toMatchObject({ type: "rna", width: 30, group: 5, revcomp: true })
    expect(doc.options.motifs).toEqual(["AUG", "GCC"])
    expect(doc.options.highlights.map((h) => [h.start, h.end, h.label])).toEqual([
      [2, 4, "start"],
      [7, 7, ""],
    ])
  })

  it("reports invalid characters with their position and place", () => {
    const doc = parseSeq("type: dna\nACGT\nAC1GXT")
    const bad = doc.issues.filter((i) => i.code === "seq-invalid-char")
    expect(bad.map((i) => [i.char, i.position, i.line, i.col])).toEqual([
      ["1", 7, 2, 2],
      ["X", 9, 2, 4],
    ])
  })

  it("a position number only counts at the start of a line", () => {
    expect(parseSeq("ACGT 12").issues[0].code).toBe("seq-invalid-char")
  })

  it("flags U in DNA and T in RNA", () => {
    expect(parseSeq("type: dna\nACGU").issues[0].char).toBe("U")
    expect(parseSeq("type: rna\nACGT").issues[0].char).toBe("T")
  })

  it("accepts a terminal stop in proteins", () => {
    expect(parseSeq("MKT*").issues).toEqual([])
  })

  it("reports empty blocks and empty records", () => {
    expect(parseSeq("").issues[0].code).toBe("seq-empty")
    expect(parseSeq("type: dna").issues[0].code).toBe("seq-empty")
    expect(parseSeq(">a\n>b\nACGT").issues.map((i) => i.code)).toEqual(["seq-empty"])
  })

  it("reports unknown or malformed options", () => {
    const codes = (b: string) => parseSeq(`${b}\nACGT`).issues.map((i) => i.code)
    expect(codes("colour: red")).toEqual(["seq-bad-option"])
    expect(codes("type: lipid")).toEqual(["seq-bad-option"])
    expect(codes("width: 5")).toEqual(["seq-bad-option"])
    expect(codes("width: abc")).toEqual(["seq-bad-option"])
    expect(codes("highlight: nope")).toEqual(["seq-bad-option"])
    expect(codes("highlight: 9-3")).toEqual(["seq-bad-option"])
    expect(codes("motif: GA1")).toEqual(["seq-bad-option"])
    expect(codes("revcomp: maybe")).toEqual(["seq-bad-option"])
  })

  it("rejects highlights outside the sequence or on a missing record", () => {
    const out = parseSeq("highlight: 3-9 x, 2:1-2 y\nACGTACGT")
    expect(out.issues.map((i) => i.code)).toEqual(["seq-bad-range", "seq-bad-range"])
    expect(out.issues[0].message).toContain("length 8")
  })
})

describe("marks", () => {
  it("applies highlight ranges to the chosen record with cycling colours", () => {
    const doc = parseSeq("highlight: 1-3 a, 2:2-4 b, 5-6 c\n>x\nACGTACGT\n>y\nTTTTTTTT")
    expect(doc.issues).toEqual([])
    expect(doc.records[0].marks.map((m) => [m.label, m.start, m.end, m.colour])).toEqual([
      ["a", 1, 3, 0],
      ["c", 5, 6, 1],
    ])
    expect(doc.records[1].marks.map((m) => m.label)).toEqual(["b"])
  })

  it("finds every motif occurrence, overlapping and case-insensitive", () => {
    const doc = parseSeq("motif: aca\nACACAXA".replace("X", "T"))
    const marks = doc.records[0].marks
    expect(marks.map((m) => [m.start, m.end])).toEqual([
      [1, 3],
      [3, 5],
    ])
  })

  it("finds reverse complement hits only when asked, and skips palindromes twice", () => {
    const seq = "GGATCCAAGAATTCTTGGATCCAAGGATCC"
    const off = parseSeq(`motif: GAATTC\n${seq}`).records[0]
    expect(off.marks).toHaveLength(1)
    const rc = parseSeq(`revcomp: yes\nmotif: GGAT\n${seq}`).records[0]
    expect(rc.motifHits[0].positions).toEqual([1, 17, 25])
    expect(rc.motifHits[0].reverse).toEqual([3, 19, 27])
    const both = parseSeq("revcomp: yes\nmotif: AAGC\nGCTTAAGC").records[0]
    expect(both.motifHits[0]).toMatchObject({ positions: [5], reverse: [1] })
    const pal = parseSeq(`revcomp: yes\nmotif: GAATTC\n${seq}`).records[0]
    expect(pal.marks).toHaveLength(1)
  })

  it("treats T and U alike in motifs of nucleic acids", () => {
    expect(parseSeq("motif: AUG\nCCATGCC").records[0].marks[0].start).toBe(3)
    expect(parseSeq("motif: ATG\nCCAUGCC").records[0].marks[0].start).toBe(3)
  })

  it("lists ranges and motif sites in the legend", () => {
    const rec = parseSeq("revcomp: yes\nhighlight: 1-4 fwd, 8\nmotif: GAA, TTT\nGAATTCCGAAA")
      .records[0]
    expect(seqLegend(rec).map((l) => l.text)).toEqual([
      "fwd (1-4)",
      "8",
      "motif GAA: 3 sites (+ 1, 8; - 4)",
      "motif TTT: 1 site (- 9)",
    ])
  })
})

describe("layout", () => {
  it("splits into lines of width and groups of group", () => {
    const lines = layoutSeq(25, 12, 5)
    expect(lines.map((l) => l.start)).toEqual([1, 13, 25])
    expect(lines[0].groups).toEqual([
      [0, 5],
      [5, 10],
      [10, 12],
    ])
    expect(lines[2].groups).toEqual([[24, 25]])
  })

  it("group 0 means one group per line", () => {
    expect(layoutSeq(20, 10, 0)[0].groups).toEqual([[0, 10]])
  })

  it("prints numbered grouped text with an aligned gutter", () => {
    const doc = parseSeq(
      `>s desc\nwidth: 20\n${DNA}`.replace(">s desc\nwidth: 20\n", "width: 20\n>s desc\n"),
    )
    const lines = seqRecordLines(doc.records[0], doc.options)
    expect(lines[0]).toBe(">s desc")
    expect(lines[1]).toBe(" 1 GAATTCGGAT CCAAGCTTGC")
    expect(lines[2]).toBe("21 ATGCCTGCAG GTCGACTCTA")
    expect(lines[3]).toBe("41 GAGGATCC")
  })

  it("captions with type, length and GC (not for proteins)", () => {
    expect(seqCaption(parseSeq("GGCCAATT").records[0])).toBe("DNA, 8 bp, GC 50.0%")
    expect(seqCaption(parseSeq("AUGC").records[0])).toBe("RNA, 4 bp, GC 50.0%")
    expect(seqCaption(parseSeq("MKTAYIAK").records[0])).toBe("Protein, 8 aa")
  })
})

describe("preview HTML", () => {
  it("renders groups, positions, highlights, legend and stats", () => {
    const html = renderSeqHTML("Primers", `highlight: 1-6 site\nmotif: GGATCC\n${DNA}`, "2")
    expect(html).toContain("Sequence 2: Primers")
    expect(html).toContain('<span class="seq-pos">')
    expect(html).toContain('class="seq-hl seq-hl-0" title="site 1-6"')
    expect(html).toContain('class="seq-motif"')
    expect(html).toContain("seq-legend")
    expect(html).toContain("DNA, 48 bp, GC")
    expect(html).not.toContain("seq-error")
  })

  it("shows record names as headers", () => {
    expect(renderSeqHTML("", ">pUC <19> insert\nACGT", "1")).toContain(
      'class="seq-name">pUC <span class="seq-desc">&lt;19&gt; insert</span>',
    )
  })

  it("replaces the block with an honest error when invalid", () => {
    const html = renderSeqHTML("", "ACGTZ1", "1")
    expect(html).toContain("seq-error")
    expect(html).toContain("Invalid Protein character &quot;1&quot;")
    expect(html).not.toContain("seq-lines")
  })

  it("is numbered per block by the renderer and does not touch the sequence text", () => {
    const md = `:::seq[A]\nGAATTC\n:::\n\ntext\n\n:::seq\nMKTAYIAK\n:::\n`
    const html = renderMarkdown(md)
    expect(html).toContain("Sequence 1: A")
    expect(html).toContain("Sequence 2")
    expect(html).toContain("seq-block")
    expect(html).toContain("GAATTC")
  })
})

describe("round-trip", () => {
  const SRC = `:::seq[Primers, *italic*]\ntype: dna\nhighlight: 1-6 site\nmotif: GAATTC\n>a b\n${DNA}\n:::`
  for (const format of ["md", "tex"] as const) {
    it(`survives a ${format} save and reopen byte for byte`, () => {
      const onDisk = toStorage(SRC, format)
      expect(onDisk).not.toContain("[!note]")
      expect(onDisk).toContain(":::seq[Primers, *italic*]")
      expect(toCmdx(onDisk, format)).toBe(SRC)
    })
  }

  it("keeps shorthand-looking text and long lines intact", () => {
    const src = `:::seq\n>x sqrt(2) alpha\n${"ACGT".repeat(40)}\n:::`
    expect(toCmdx(toStorage(src, "md"), "md")).toBe(src)
  })

  it("recognises the body shapes", () => {
    expect(looksLikeSeqBody(">x\nACGT")).toBe(true)
    expect(looksLikeSeqBody("motif: GAATTC\nACGT")).toBe(true)
    expect(looksLikeSeqBody("Notes for tomorrow")).toBe(false)
  })
})

describe("export", () => {
  const BODY = `highlight: 1-6 site-A, 20-30 site-B\n>frag one\n${DNA}`

  it("Markdown: caption, fenced grouped text, stats and a plain legend", () => {
    const md = seqBlockToMarkdown("Frag", BODY, 3)!.join("\n")
    expect(md).toContain("**Sequence 3: Frag**")
    expect(md).toContain("```\n>frag one\n 1 GAATTCGGAT")
    expect(md).toContain("*DNA, 48 bp, GC")
    expect(md).toContain("Highlights: site-A (1-6); site-B (20-30)")
  })

  it("LaTeX: verbatim layout with a legend, no texshade", () => {
    const tex = seqBlockToLatex("Frag", BODY, 1, (s) => s.replace(/%/g, "\\%"))!
    expect(tex).toContain("\\begin{verbatim}\n>frag one\n 1 GAATTCGGAT")
    expect(tex).toContain("\\end{verbatim}")
    expect(tex).toContain("Sequence 1: Frag")
    expect(tex).toContain("GC ")
    expect(tex).toContain("\\%")
    expect(tex).toContain("Highlights: site-A (1-6); site-B (20-30)")
    expect(tex).not.toContain("texshade")
  })

  it("LaTeX: a name cannot close the verbatim environment", () => {
    const tex = seqBlockToLatex("", ">x\\end{verbatim}\\input{y} \nACGT", 1, (s) => s)!
    expect(tex.match(/\\end\{verbatim\}/g)).toHaveLength(1)
  })

  it("invalid blocks fall back (null) so the raw source is kept", () => {
    expect(seqBlockToMarkdown("", "ACGT1", 1)).toBeNull()
    expect(seqBlockToLatex("", "ACGT1", 1, (s) => s)).toBeNull()
  })

  it("the full LaTeX export numbers sequences in order", () => {
    const tex = exportToTex(
      `# T\n\n:::seq[One]\nGAATTC\n:::\n\nbetween\n\n:::seq[Two]\nMKTAYIAK\n:::\n`,
    )
    expect(tex).toContain("Sequence 1: One")
    expect(tex).toContain("Sequence 2: Two")
    expect(tex).toContain("\\begin{verbatim}")
    expect(tex.indexOf("Sequence 1")).toBeLessThan(tex.indexOf("between"))
  })

  it("pandoc inputs get a numbered fenced block", () => {
    const out = specialBlocksToPandoc(":::seq[A]\nGAATTC\n:::\n\n:::seq\nMKTAYIAK\n:::")
    expect(out).toContain("**Sequence 1: A**")
    expect(out).toContain("**Sequence 2**")
    expect(out).toContain("```\n1 GAATTC\n```")
  })

  it("pandoc inputs keep an invalid block as captioned raw code", () => {
    const out = specialBlocksToPandoc(":::seq\nACGT1\n:::")
    expect(out).toContain("**Sequence**")
    expect(out).toContain("```\nACGT1\n```")
  })

  it("warns that LaTeX loses highlights only when the block has them", () => {
    const warn = (md: string) => lossyExportWarnings(md, "latex", en.documentLab.compat)
    expect(warn(":::seq\nACGT\n:::")).toEqual([])
    expect(warn(":::seq\nmotif: GA\nACGT\n:::")).toContain(en.documentLab.compat.seqHighlights)
    expect(warn(":::seq\nhighlight: 1-2\nACGT\n:::")).toContain(en.documentLab.compat.seqHighlights)
  })
})

describe("linter", () => {
  const lint = (text: string) =>
    lintContent(text, { vaultFileNames: new Set(), bibKeys: new Set() }, SEV as never)

  it("accepts a valid block and knows the block type", () => {
    expect(lint(":::seq\n>x\nGAATTC\n:::\n")).toEqual([])
  })

  it("marks the invalid character itself", () => {
    const m = lint("intro\n\n:::seq\ntype: dna\nACGT\nACXT\n:::\n").filter(
      (x) => x.code === "seq-invalid-char",
    )
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({
      startLineNumber: 6,
      startColumn: 3,
      endColumn: 4,
      severity: SEV.Error,
    })
  })

  it("marks empty blocks, bad options and bad ranges with stable codes", () => {
    const codes = (t: string) => lint(t).map((x) => x.code)
    expect(codes(":::seq\n\n:::\n")).toEqual(["seq-empty"])
    expect(codes(":::seq\nbogus: 1\nACGT\n:::\n")).toEqual(["seq-bad-option"])
    expect(codes(":::seq\nhighlight: 1-99\nACGT\n:::\n")).toEqual(["seq-bad-range"])
  })
})
