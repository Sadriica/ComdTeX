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
// Pure and dependency-free so it can be unit-tested without Monaco.

export interface BioFinding {
  /** 0-based offset in the text. */
  start: number
  /** Exclusive end offset. */
  end: number
  /** The exact matched text. */
  text: string
  kind: "binomial" | "gene"
  /** What the text should look like. */
  suggestion: string
}

// Genus names common enough in the literature that a match is worth a
// warning. Deliberately small and boring: precision over recall, because a
// false positive on every capitalized word would train users to ignore us.
const GENERA = [
  "Escherichia", "Salmonella", "Staphylococcus", "Streptococcus", "Bacillus",
  "Pseudomonas", "Mycobacterium", "Clostridium", "Listeria", "Vibrio",
  "Helicobacter", "Campylobacter", "Klebsiella", "Enterococcus", "Neisseria",
  "Lactobacillus", "Acinetobacter", "Shigella", "Yersinia", "Borrelia",
  "Saccharomyces", "Candida", "Aspergillus", "Penicillium", "Cryptococcus",
  "Plasmodium", "Trypanosoma", "Leishmania", "Toxoplasma", "Giardia",
  "Arabidopsis", "Drosophila", "Caenorhabditis", "Danio", "Xenopus",
  "Mus", "Rattus", "Homo", "Pan", "Macaca",
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
  "DNA", "RNA", "PCR", "ELISA", "SDS", "PAGE", "HPLC", "NMR", "MS", "LC",
  "CT", "MRI", "PET", "ICU", "WHO", "NIH", "FDA", "CDC", "EMA",
  "OD", "CFU", "PBS", "TBS", "BSA", "FBS", "DMSO", "EDTA", "TRIS", "HEPES",
  "ATP", "ADP", "NAD", "NADH", "GTP", "CAMP", "PH", "UV", "IR",
  "USA", "UK", "EU", "SI", "STD", "SEM", "ANOVA", "PCA", "AI", "ML",
  "OK", "PDF", "HTML", "CSV", "JSON", "API", "CPU", "GPU", "RAM",
  "TABLE", "FIGURE", "NOTE", "TODO", "FIXME",
])

/** Regions where prose rules do not apply: code, math, links, existing italics. */
function maskedRegions(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const patterns = [
    /```[\s\S]*?```/g,      // fenced code
    /`[^`\n]*`/g,           // inline code
    /\$\$[\s\S]*?\$\$/g,    // display math
    /\$[^$\n]*\$/g,         // inline math
    /\[[^\]]*\]\([^)]*\)/g, // links
    /!?\[\[[^\]]*\]\]/g,    // wikilinks
    // Frontmatter. The /g flag is REQUIRED: exec() in a loop over a
    // non-global regex always restarts at 0 and never terminates.
    /^---[\s\S]*?^---/gm,
    /\*[^*\n]+\*/g,         // already italic
    /_[^_\n]+_/g,           // already italic (underscore form)
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
  return /^comdtex\.domain:\s*(biology|microbiology|biomed(icine)?)\s*$/mi.test(fm[1])
}

/**
 * Find taxonomic binomials and gene symbols that are not italicized.
 * Returns findings in document order; empty when the document did not opt in.
 */
export function findBioConventions(text: string): BioFinding[] {
  if (!isBiologyDocument(text)) return []
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

  GENE_RE.lastIndex = 0
  while ((m = GENE_RE.exec(text)) !== null) {
    const sym = m[1]
    if (NOT_GENES.has(sym)) continue
    if (inMasked(m.index, masked)) continue
    // A symbol inside a heading is usually a section title, not a gene.
    const lineStart = text.lastIndexOf("\n", m.index) + 1
    if (/^\s{0,3}#{1,6}\s/.test(text.slice(lineStart, m.index))) continue
    found.push({
      start: m.index,
      end: m.index + sym.length,
      text: sym,
      kind: "gene",
      suggestion: `*${sym}*`,
    })
  }

  return found.sort((a, b) => a.start - b.start)
}
