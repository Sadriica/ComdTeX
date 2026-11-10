// Biology's typographic conventions, checked but never enforced.
//
// Journals reject or return manuscripts over two rules that no editor
// checks today:
//
//   1. Taxonomic binomials are italic: "Escherichia coli", "E. coli".
//   2. Gene symbols are italic; their protein products are not (TP53 vs p53).
//
// This module finds likely violations and reports them as WARNINGS with a
// suggested fix. It never rewrites: "Bacillus" can be a genus or a surname,
// and only the author knows. Opt-in per document via frontmatter:
//
//   comdtex.domain: biology
//
// A second optional key, `comdtex.organism`, selects the gene and protein
// symbol conventions of one organism (human, mouse, rat, zebrafish,
// drosophila, yeast, bacteria). Without it the gene check is the original
// organism-blind one. With it the check is narrower on purpose: a symbol is
// reported only when its shape fits the organism AND the sentence says it is
// a gene ("the TP53 gene", "Trp53 knockout"), because an upright capitalized
// word is usually a protein or ordinary prose, and a warning on every one of
// them would be ignored.
//
// Pure and dependency-free so it can be unit-tested without Monaco.

export interface BioFinding {
  /** 0-based offset in the text. */
  start: number
  /** Exclusive end offset. */
  end: number
  /** The exact matched text. */
  text: string
  kind: BioFindingKind
  /** What the text should look like. */
  suggestion: string
  /** The organism whose convention the finding follows (organism-aware kinds). */
  organism?: BioOrganism
  /** `binomial-first` only: the full name the abbreviation stands for. */
  full?: string
}

/**
 * binomial: a species name that is not italic.
 * binomial-first: an abbreviated species ("E. coli") used before its full name.
 * gene: a gene symbol that is not italic.
 * gene-case: an italic gene symbol in another organism's capitalization.
 * protein-italic: a protein symbol set in italics.
 */
export type BioFindingKind = "binomial" | "binomial-first" | "gene" | "gene-case" | "protein-italic"

export const BIO_ORGANISMS = [
  "human",
  "mouse",
  "rat",
  "zebrafish",
  "drosophila",
  "yeast",
  "bacteria",
] as const
export type BioOrganism = (typeof BIO_ORGANISMS)[number]

// Genus names common enough in the literature that a match is worth a
// warning. Deliberately small and boring: precision over recall, because a
// false positive on every capitalized word would train users to ignore us.
const GENERA = [
  "Escherichia",
  "Salmonella",
  "Staphylococcus",
  "Streptococcus",
  "Bacillus",
  "Pseudomonas",
  "Mycobacterium",
  "Clostridium",
  "Listeria",
  "Vibrio",
  "Helicobacter",
  "Campylobacter",
  "Klebsiella",
  "Enterococcus",
  "Neisseria",
  "Lactobacillus",
  "Acinetobacter",
  "Shigella",
  "Yersinia",
  "Borrelia",
  "Saccharomyces",
  "Schizosaccharomyces",
  "Candida",
  "Aspergillus",
  "Penicillium",
  "Cryptococcus",
  "Plasmodium",
  "Trypanosoma",
  "Leishmania",
  "Toxoplasma",
  "Giardia",
  "Arabidopsis",
  "Drosophila",
  "Caenorhabditis",
  "Danio",
  "Xenopus",
  "Anopheles",
  "Gallus",
  "Oryza",
  "Zea",
  "Neurospora",
  "Chlamydomonas",
  "Dictyostelium",
  "Haemophilus",
  "Bacteroides",
  "Bifidobacterium",
  "Streptomyces",
  "Mus",
  "Rattus",
  "Homo",
  "Pan",
  "Macaca",
]

const GENUS_RE = new RegExp(
  `\\b(?:(${GENERA.join("|")})\\s+([a-z][a-z-]{2,})|([A-Z])\\.\\s+([a-z][a-z-]{2,}))\\b`,
  "g",
)

// Human gene symbols: 2-6 uppercase letters, optionally followed by digits
// (TP53, BRCA1, IL6, CFTR). A trailing "p" or a lowercase form is usually
// the protein, which must stay upright, so those never match.
const GENE_RE = /\b([A-Z]{2,6}\d{0,3})\b/g

// Acronyms that look like gene symbols but are not, so they are never
// flagged. Extend rather than loosen the pattern.
const NOT_GENES = new Set([
  "DNA",
  "RNA",
  "PCR",
  "ELISA",
  "SDS",
  "PAGE",
  "HPLC",
  "NMR",
  "MS",
  "LC",
  "CT",
  "MRI",
  "PET",
  "ICU",
  "WHO",
  "NIH",
  "FDA",
  "CDC",
  "EMA",
  "OD",
  "CFU",
  "PBS",
  "TBS",
  "BSA",
  "FBS",
  "DMSO",
  "EDTA",
  "TRIS",
  "HEPES",
  "ATP",
  "ADP",
  "NAD",
  "NADH",
  "GTP",
  "CAMP",
  "PH",
  "UV",
  "IR",
  "USA",
  "UK",
  "EU",
  "SI",
  "STD",
  "SEM",
  "ANOVA",
  "PCA",
  "AI",
  "ML",
  "OK",
  "PDF",
  "HTML",
  "CSV",
  "JSON",
  "API",
  "CPU",
  "GPU",
  "RAM",
  "TABLE",
  "FIGURE",
  "NOTE",
  "TODO",
  "FIXME",
  // Publishing, identifiers and file formats that papers and journal
  // templates mention in prose.
  "LB",
  "URL",
  "DOI",
  "PLOS",
  "ONE",
  "BMC",
  "OUP",
  "ISBN",
  "ISSN",
  "ORCID",
  "XML",
  "YAML",
  "HTTP",
  "HTTPS",
  // Statistics and repositories.
  "SD",
  "SE",
  "CI",
  "IQR",
  "AUC",
  "ROC",
  "FDR",
  "NCBI",
  "EBI",
  "GEO",
  "SRA",
  "PDB",
])

/** Regions where prose rules do not apply: code, math, links, existing italics. */
function maskedRegions(text: string, withItalics = true): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const patterns = [
    /```[\s\S]*?```/g, // fenced code
    /`[^`\n]*`/g, // inline code
    /\$\$[\s\S]*?\$\$/g, // display math
    /\$[^$\n]*\$/g, // inline math
    /\[[^\]]*\]\([^)]*\)/g, // links
    /!?\[\[[^\]]*\]\]/g, // wikilinks
    // Frontmatter. The /g flag is REQUIRED: exec() in a loop over a
    // non-global regex always restarts at 0 and never terminates.
    /^---[\s\S]*?^---/gm,
    ...(withItalics
      ? [
          /\*[^*\n]+\*/g, // already italic
          /_[^_\n]+_/g, // already italic (underscore form)
        ]
      : []),
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      out.push([m.index, m.index + m[0].length])
      if (m[0].length === 0) re.lastIndex++
    }
  }
  return out
}

function inMasked(pos: number, masked: Array<[number, number]>): boolean {
  return masked.some(([a, b]) => pos >= a && pos < b)
}

/** True when the document opted in via `comdtex.domain: biology`. */
export function isBiologyDocument(text: string): boolean {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!fm) return false
  return /^comdtex\.domain:\s*(biology|microbiology|biomed(icine)?)\s*$/im.test(fm[1])
}

const ORGANISM_SET: ReadonlySet<string> = new Set(BIO_ORGANISMS)

/**
 * The organism chosen by `comdtex.organism`, or null when the key is absent or
 * not one of the known values (an unknown value never changes the check).
 */
export function bioOrganism(text: string): BioOrganism | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!fm) return null
  const m = /^comdtex\.organism:\s*([A-Za-z]+)\s*$/im.exec(fm[1])
  const v = m?.[1].toLowerCase()
  return v && ORGANISM_SET.has(v) ? (v as BioOrganism) : null
}

/** A gene symbol in the capitalization the organism's convention asks for. */
export function geneSuggestion(organism: BioOrganism | null, sym: string): string {
  switch (organism) {
    case "human":
    case "yeast":
      return sym.toUpperCase()
    case "mouse":
    case "rat":
      return sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase()
    case "zebrafish":
      return sym.toLowerCase()
    default:
      return sym
  }
}

// Words that say a sentence is about ANOTHER organism or compares several: a
// human TP53 next to a mouse Trp53 is correct in both spellings, so those
// lines are never second-guessed.
const COMPARATIVE = "ortholog\\w*|homolog\\w*|paralog\\w*|cross-species|conserved"
const ORGANISM_WORDS: Record<BioOrganism, string> = {
  human: "human|humans|patient|patients|Homo|sapiens",
  mouse: "mouse|mice|murine|Mus|musculus",
  rat: "rat|rats|Rattus|norvegicus",
  zebrafish: "zebrafish|Danio|rerio",
  drosophila: "Drosophila|fly|flies|melanogaster",
  yeast: "yeast|cerevisiae|Saccharomyces",
  bacteria: "bacteria|bacterial|coli|Escherichia",
}

function otherOrganismRe(own: BioOrganism): RegExp {
  const others = BIO_ORGANISMS.filter((o) => o !== own).map((o) => ORGANISM_WORDS[o])
  return new RegExp(`\\b(?:${[COMPARATIVE, ...others].join("|")})\\b`, "i")
}

/** True when the line talks about another organism or compares several. */
export function isComparativeLine(organism: BioOrganism, line: string): boolean {
  return otherOrganismRe(organism).test(line)
}

function lineAround(text: string, pos: number): string {
  const a = text.lastIndexOf("\n", pos - 1) + 1
  const b = text.indexOf("\n", pos)
  return text.slice(a, b === -1 ? text.length : b)
}

function inHeading(text: string, pos: number): boolean {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1
  return /^\s{0,3}#{1,6}\s/.test(text.slice(lineStart, pos))
}

// Words that look like "Abc12" but are labels, not genes: "*Fig2*", "*Day3*".
const NOT_MIXED_PREFIX = new Set([
  "fig",
  "eq",
  "ref",
  "day",
  "exp",
  "run",
  "rep",
  "tab",
  "sec",
  "step",
  "set",
  "week",
  "wk",
  "batch",
  "plate",
  "well",
  "mix",
  "pass",
  "trial",
  "chr",
  "sample",
  "table",
  "panel",
  "lane",
  "group",
  "cohort",
  "line",
  "case",
])

// Camel-case words that fit the bacterial gene shape but are not genes.
const NOT_BACTERIAL = new Set(["macOS", "tvOS", "pdfTeX", "xeTeX", "luaTeX"])

const GENE_CUE_BEFORE = /(?:gene|genes|allele|alleles|locus)\s+$/i
const GENE_CUE_AFTER =
  /^\s+(?:gene|genes|locus|loci|allele|alleles|promoter|mRNA|transcript|transcripts|mutant|mutants|mutation|mutations|knockout|knockouts|deletion|deletions)\b/i

function hasGeneCue(text: string, start: number, end: number): boolean {
  return (
    GENE_CUE_BEFORE.test(text.slice(Math.max(0, start - 14), start)) ||
    GENE_CUE_AFTER.test(text.slice(end, end + 24))
  )
}

const MIXED_SHAPE = /^([A-Z][a-z]{1,5})\d{1,3}[a-z]?$/ // Trp53, Brca1, Cdkn2a
const UPPER_DIGIT_SHAPE = /^[A-Z]{2,6}\d{1,3}$/ // TP53, TRP53
const BACTERIAL_GENE = /^[a-z]{3}[A-Z]\d?$/ // lacZ, recA
const BACTERIAL_PROTEIN = /^[A-Z][a-z]{2}[A-Z]\d?$/ // LacZ
const YEAST_GENE = /^[A-Z]{3}\d{1,3}$/ // CDC28
const YEAST_GENE_MIXED = /^[A-Z][a-z]{2}\d{1,3}$/ // Cdc28
const YEAST_PROTEIN = /^[A-Z][a-z]{2}\d{1,3}p$/ // Cdc28p

function mixedOk(sym: string): boolean {
  const m = MIXED_SHAPE.exec(sym)
  return !!m && !NOT_MIXED_PREFIX.has(m[1].toLowerCase())
}

/** Whether an UNITALIC word has the shape of a gene symbol of this organism. */
function plainGeneShape(organism: BioOrganism, w: string): boolean {
  if (NOT_GENES.has(w.toUpperCase())) return false
  switch (organism) {
    case "human":
      return /^[A-Z]{2,6}\d{0,3}$/.test(w)
    case "mouse":
    case "rat":
      return UPPER_DIGIT_SHAPE.test(w) || mixedOk(w) || /^[A-Z]{3,6}$/.test(w)
    case "zebrafish":
      return (
        /^[a-z]{2,6}\d{1,3}$/.test(w) &&
        !NOT_MIXED_PREFIX.has(w.replace(/\d+$/, "")) &&
        !/^(log|ic|ec|ld|od|ph|co|h|n)\d/i.test(w)
      )
    case "yeast":
      return YEAST_GENE.test(w) || YEAST_GENE_MIXED.test(w)
    default:
      return false
  }
}

/** Unitalic gene symbols for one organism (cue words required, except bacteria). */
function organismGenes(
  text: string,
  organism: BioOrganism,
  masked: Array<[number, number]>,
  out: BioFinding[],
): void {
  if (organism === "drosophila") return // symbols come from mutant phenotypes: nothing detectable
  const other = otherOrganismRe(organism)
  const re = /\b[A-Za-z][A-Za-z0-9]{1,7}\b/g
  let m: RegExpExecArray | null
  re.lastIndex = 0
  while ((m = re.exec(text)) !== null) {
    const w = m[0]
    const start = m.index
    const end = start + w.length
    if (organism === "bacteria") {
      if (!BACTERIAL_GENE.test(w) || NOT_BACTERIAL.has(w)) continue
    } else {
      if (!plainGeneShape(organism, w)) continue
      if (!hasGeneCue(text, start, end)) continue
    }
    if (inMasked(start, masked) || inHeading(text, start)) continue
    const comparative = other.test(lineAround(text, start))
    const sym = comparative ? w : geneSuggestion(organism, w)
    out.push({
      start,
      end,
      text: w,
      kind: "gene",
      suggestion: `*${sym}*`,
      organism,
    })
  }
}

const ITALIC_SPANS = [/\*([^*\n]+)\*/g, /_([^_\n]+)_/g]

/** Italic symbols that break the organism's capitalization or are proteins. */
function italicSymbols(
  text: string,
  organism: BioOrganism,
  masked: Array<[number, number]>,
  out: BioFinding[],
): void {
  if (organism === "drosophila") return
  const other = otherOrganismRe(organism)
  ITALIC_SPANS.forEach((re, which) => {
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      const inner = m[1]
      const before = start > 0 ? text[start - 1] : ""
      const after = end < text.length ? text[end] : ""
      // Bold (`**x**`) and snake_case are not italic symbols.
      const bad = which === 0 ? /[*]/ : /[\w_]/
      if (bad.test(before) || bad.test(after)) continue
      if (NOT_GENES.has(inner.toUpperCase())) continue
      if (inMasked(start, masked) || inHeading(text, start)) continue
      const protein = proteinItalic(organism, inner)
      if (protein) {
        out.push({
          start,
          end,
          text: m[0],
          kind: "protein-italic",
          suggestion: inner,
          organism,
        })
        continue
      }
      const wanted = wrongCaseTarget(organism, inner)
      if (wanted === null || wanted === inner) continue
      if (other.test(lineAround(text, start))) continue
      out.push({
        start,
        end,
        text: m[0],
        kind: "gene-case",
        suggestion: `*${wanted}*`,
        organism,
      })
    }
  })
}

/** An italic protein symbol of this organism, which must be upright. */
function proteinItalic(organism: BioOrganism, sym: string): boolean {
  if (organism === "bacteria") return BACTERIAL_PROTEIN.test(sym)
  if (organism === "yeast") return YEAST_PROTEIN.test(sym)
  return false
}

/**
 * The capitalization an italic gene symbol should have, or null when the
 * symbol is not recognisably a gene (or its shape is ambiguous).
 */
function wrongCaseTarget(organism: BioOrganism, sym: string): string | null {
  switch (organism) {
    case "human":
      return mixedOk(sym) ? sym.toUpperCase() : null
    case "mouse":
    case "rat":
      return UPPER_DIGIT_SHAPE.test(sym) ? geneSuggestion(organism, sym) : null
    case "zebrafish":
      return UPPER_DIGIT_SHAPE.test(sym) || mixedOk(sym) ? sym.toLowerCase() : null
    case "yeast":
      return YEAST_GENE_MIXED.test(sym) && mixedOk(sym) ? sym.toUpperCase() : null
    default:
      return null
  }
}

/**
 * Abbreviated species ("E. coli") used before the full name ("Escherichia
 * coli"). Only the first such use per species is reported, and only when the
 * full name does appear later: a document that never spells it out may have
 * done so elsewhere. Italic text counts (the rule is about order, not style);
 * headings may supply the full name but are never reported.
 */
function binomialOrder(text: string, masked: Array<[number, number]>, out: BioFinding[]): void {
  const firstFull = new Map<string, { at: number; name: string }>()
  const abbrevs: Array<{ key: string; start: number; end: number; text: string }> = []
  const re = new RegExp(GENUS_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (inMasked(m.index, masked)) continue
    if (m[1]) {
      const key = `${m[1][0]} ${m[2]}`
      if (!firstFull.has(key)) firstFull.set(key, { at: m.index, name: `${m[1]} ${m[2]}` })
    } else if (!inHeading(text, m.index)) {
      abbrevs.push({
        key: `${m[3]} ${m[4]}`,
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
      })
    }
  }
  const reported = new Set<string>()
  for (const a of abbrevs) {
    const full = firstFull.get(a.key)
    if (!full || full.at < a.start || reported.has(a.key)) continue
    reported.add(a.key)
    out.push({
      start: a.start,
      end: a.end,
      text: a.text,
      kind: "binomial-first",
      suggestion: full.name,
      full: full.name,
    })
  }
}

/**
 * Find taxonomic binomials and gene symbols that break the conventions.
 * Returns findings in document order; empty when the document did not opt in.
 */
export function findBioConventions(text: string): BioFinding[] {
  if (!isBiologyDocument(text)) return []
  const organism = bioOrganism(text)
  const masked = maskedRegions(text)
  const found: BioFinding[] = []

  GENUS_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = GENUS_RE.exec(text)) !== null) {
    if (inMasked(m.index, masked)) continue
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      kind: "binomial",
      suggestion: `*${m[0]}*`,
    })
  }

  if (organism) {
    organismGenes(text, organism, masked, found)
  } else {
    GENE_RE.lastIndex = 0
    while ((m = GENE_RE.exec(text)) !== null) {
      const sym = m[1]
      if (NOT_GENES.has(sym)) continue
      if (inMasked(m.index, masked)) continue
      // A symbol inside a heading is usually a section title, not a gene.
      if (inHeading(text, m.index)) continue
      found.push({
        start: m.index,
        end: m.index + sym.length,
        text: sym,
        kind: "gene",
        suggestion: `*${sym}*`,
      })
    }
  }

  // The checks below read italic text, so the italic mask is left out.
  const plain = maskedRegions(text, false)
  binomialOrder(text, plain, found)
  if (organism) italicSymbols(text, organism, plain, found)

  return found.sort((a, b) => a.start - b.start)
}
