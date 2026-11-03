// Database accession numbers: recognise them in prose and map each to the
// page of the database that issued it.
//
// A methods section is only reproducible when a reader can get from "SRR1234567"
// to the data. Journals ask for exactly that (a Data availability statement),
// and the identifiers have rigid, well-documented formats, so they can be
// linked with very few false positives. This module is the single definition
// of "what is an accession":
//
//   - the preview wraps them in links (markdown-it core rule, below),
//   - the LaTeX export turns them into \href (same rule, same tokens),
//   - the linter asks whether the document has a Data availability heading.
//
// It never rewrites the stored file. Opt-in per document, with the same
// frontmatter switch as the rest of the biology tooling:
//
//   comdtex.domain: biology
//
// URL scheme: each identifier points to the NATIVE page of the database that
// owns it (NCBI, ENA/EBI, RCSB, UniProt, Ensembl), not to identifiers.org.
// Native URLs are what a reader expects to land on, work without a resolver
// in between, and every one of them is https.
//
//   GenBank / ENA / DDBJ nucleotide  https://www.ncbi.nlm.nih.gov/nuccore/<id>
//   RefSeq nucleotide (NC_, NM_ ...) https://www.ncbi.nlm.nih.gov/nuccore/<id>
//   RefSeq protein (NP_, XP_ ...)    https://www.ncbi.nlm.nih.gov/protein/<id>
//   SRA S*R/S*X/S*P/S*S              https://www.ncbi.nlm.nih.gov/sra/<id>
//   ENA/DDBJ runs, experiments (E*,D*) https://www.ebi.ac.uk/ena/browser/view/<id>
//   BioProject PRJNA                 https://www.ncbi.nlm.nih.gov/bioproject/<id>
//   PRJEB / PRJDB                    https://www.ebi.ac.uk/ena/browser/view/<id>
//   BioSample SAMN                   https://www.ncbi.nlm.nih.gov/biosample/<id>
//   SAMEA / SAMEG / SAMD             https://www.ebi.ac.uk/biosamples/samples/<id>
//   GEO GSE/GSM/GPL/GDS              https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=<id>
//   ArrayExpress E-MTAB-n ...        https://www.ebi.ac.uk/biostudies/arrayexpress/studies/<id>
//   PDB (prefixed only)              https://www.rcsb.org/structure/<id>
//   UniProt (prefixed only)          https://www.uniprot.org/uniprotkb/<id>
//   Ensembl ENSG/ENST/ENSP ...       https://www.ensembl.org/id/<id> (version stripped)
//
// Precision over recall: a link that goes nowhere trains readers to distrust
// every link. So a bare PDB code (`1ABC` is also a word, a year plus letters,
// a part number) and a bare UniProt accession (`Q12345`) are NEVER matched;
// they need their database name in front. Everything else needs the exact
// uppercase shape, a clean boundary on both sides, and is skipped inside
// code, math, links and headings. Zenodo and other DOIs are left alone.
//
// Pure and dependency-free (types only) so it can be unit-tested without
// Monaco or the DOM.

import type MarkdownIt from "markdown-it"
import type MdToken from "markdown-it/lib/token.mjs"
import { isBiologyDocument } from "./bioConventions"

export type AccessionKind =
  | "genbank"
  | "refseq"
  | "refseq-protein"
  | "sra"
  | "ena"
  | "bioproject"
  | "biosample"
  | "geo"
  | "arrayexpress"
  | "pdb"
  | "uniprot"
  | "ensembl"

export interface AccessionMatch {
  /** 0-based offset of the identifier (the prefix word of PDB/UniProt is not part of it). */
  start: number
  /** Exclusive end offset. */
  end: number
  /** The identifier exactly as written, version included (`MN908947.3`). */
  text: string
  kind: AccessionKind
  /** https URL of the database page. */
  url: string
}

// An identifier must not be glued to a word, a path, a handle or a label:
// `file_SRR123456`, `/MN908947`, `@GSE12345`, `{#fig:GSE12345}`.
const PRE = String.raw`(?<![\w@#./:])`
// ...nor continue into more word characters, or into `.word` (`MN908947.pdf`).
// A sentence's final dot (`... MN908947.`) is not `.word`, so it still matches.
const POST = String.raw`(?!\w|\.\w)`

interface Pattern {
  kind: AccessionKind
  re: RegExp
  /** Capture group holding the identifier; 0 = the whole match. */
  group?: number
  /** Builds the URL from the matched identifier. */
  url: (id: string) => string
  /** Extra check on the identifier; false drops the match. */
  accept?: (id: string) => boolean
}

const NCBI = "https://www.ncbi.nlm.nih.gov"
const ENA = "https://www.ebi.ac.uk/ena/browser/view/"

// Two-letter GenBank prefixes that are far more often something else in
// prose or product codes (ID123456, NO123456, PO numbers).
const NOT_GENBANK_PREFIX = new Set([
  "ID",
  "NO",
  "PO",
  "SN",
  "PN",
  "PS",
  "SO",
  "SK",
  "IV",
  "VI",
  "XX",
])

const PATTERNS: Pattern[] = [
  // GenBank / ENA / DDBJ nucleotide: 2 letters + 6 digits (MN908947, AB123456),
  // or 1 letter + 5 digits ONLY with a version (U12345.1: bare it is too loose).
  {
    kind: "genbank",
    re: new RegExp(String.raw`${PRE}([A-Z]{2}\d{6}(?:\.\d{1,2})?|[A-Z]\d{5}\.\d{1,2})${POST}`, "g"),
    group: 1,
    url: (id) => `${NCBI}/nuccore/${id}`,
    accept: (id) => !NOT_GENBANK_PREFIX.has(id.slice(0, 2)),
  },
  // RefSeq. The underscore makes the shape unmistakable, so the version is optional.
  {
    kind: "refseq",
    re: new RegExp(
      String.raw`${PRE}((?:NC|NG|NM|NR|NT|NW|AC|XM|XR)_\d{6,9}(?:\.\d{1,2})?|NZ_[A-Z]{2,6}\d{6,}(?:\.\d{1,2})?)${POST}`,
      "g",
    ),
    group: 1,
    url: (id) => `${NCBI}/nuccore/${id}`,
  },
  {
    kind: "refseq-protein",
    re: new RegExp(String.raw`${PRE}((?:NP|XP|YP|WP|AP)_\d{6,9}(?:\.\d{1,2})?)${POST}`, "g"),
    group: 1,
    url: (id) => `${NCBI}/protein/${id}`,
  },
  // SRA at NCBI: SRR runs, SRX experiments, SRP studies, SRS samples.
  {
    kind: "sra",
    re: new RegExp(String.raw`${PRE}(SR[RXPS]\d{6,9})${POST}`, "g"),
    group: 1,
    url: (id) => `${NCBI}/sra/${id}`,
  },
  // The same objects deposited at ENA (E*) or DDBJ (D*), browsed at ENA.
  {
    kind: "ena",
    re: new RegExp(String.raw`${PRE}([ED]R[RXPS]\d{6,9}|PRJ(?:EB|DB)\d{3,9})${POST}`, "g"),
    group: 1,
    url: (id) => `${ENA}${id}`,
  },
  {
    kind: "bioproject",
    re: new RegExp(String.raw`${PRE}(PRJNA\d{3,9})${POST}`, "g"),
    group: 1,
    url: (id) => `${NCBI}/bioproject/${id}`,
  },
  {
    kind: "biosample",
    re: new RegExp(String.raw`${PRE}(SAMN\d{8,9})${POST}`, "g"),
    group: 1,
    url: (id) => `${NCBI}/biosample/${id}`,
  },
  {
    kind: "biosample",
    re: new RegExp(String.raw`${PRE}(SAM(?:EA|EG|D)\d{6,})${POST}`, "g"),
    group: 1,
    url: (id) => `https://www.ebi.ac.uk/biosamples/samples/${id}`,
  },
  {
    kind: "geo",
    re: new RegExp(String.raw`${PRE}((?:GSE|GSM|GPL|GDS)\d{2,8})${POST}`, "g"),
    group: 1,
    url: (id) => `${NCBI}/geo/query/acc.cgi?acc=${id}`,
  },
  {
    kind: "arrayexpress",
    re: new RegExp(
      String.raw`${PRE}(E-(?:MTAB|GEOD|MEXP|MIMR|ERAD|TABM|AFMX)-\d{1,7})${POST}`,
      "g",
    ),
    group: 1,
    url: (id) => `https://www.ebi.ac.uk/biostudies/arrayexpress/studies/${id}`,
  },
  // PDB: ONLY after the word PDB (`PDB 1ABC`, `PDB: 1ABC`, `PDB ID 1ABC`).
  // The code needs a letter, so `PDB 2020` stays text.
  {
    kind: "pdb",
    re: new RegExp(String.raw`(?<![\w])PDB(?:\s+ID)?:?\s+([1-9][A-Z0-9]{3})${POST}`, "g"),
    group: 1,
    url: (id) => `https://www.rcsb.org/structure/${id}`,
    accept: (id) => /[A-Z]/.test(id),
  },
  // UniProt: ONLY after its name (`UniProt P04637`, `UniProtKB: P04637`,
  // `Swiss-Prot accession P04637`).
  {
    kind: "uniprot",
    re: new RegExp(
      String.raw`(?<![\w])(?:UniProt(?:KB)?|Swiss-?Prot|TrEMBL)(?:\s+(?:accession|ID|entry))?:?\s+((?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2}))${POST}`,
      "g",
    ),
    group: 1,
    url: (id) => `https://www.uniprot.org/uniprotkb/${id}`,
  },
  // Ensembl gene/transcript/protein/exon ids, human (ENSG) or any species (ENSMUSG).
  {
    kind: "ensembl",
    re: new RegExp(String.raw`${PRE}(ENS(?:[A-Z]{3,4})?[GTPE]\d{11}(?:\.\d{1,3})?)${POST}`, "g"),
    group: 1,
    url: (id) => `https://www.ensembl.org/id/${id.replace(/\.\d+$/, "")}`,
  },
]

/**
 * Find accession numbers in a piece of PROSE (no markdown awareness: the
 * caller is responsible for not passing code, math or link text; see
 * `findAccessionsInMarkdown` for a whole document). Document order, no overlaps.
 */
export function findAccessions(text: string): AccessionMatch[] {
  if (text.length < 6) return []
  const found: AccessionMatch[] = []
  for (const p of PATTERNS) {
    p.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = p.re.exec(text)) !== null) {
      if (m[0].length === 0) {
        p.re.lastIndex++
        continue
      }
      const id = m[p.group ?? 0]
      if (p.accept && !p.accept(id)) continue
      const start = m.index + m[0].length - id.length
      found.push({ start, end: start + id.length, text: id, kind: p.kind, url: p.url(id) })
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  // Patterns are disjoint by construction, but never emit two links on the
  // same characters if a future pattern overlaps one.
  const out: AccessionMatch[] = []
  for (const f of found) {
    if (out.length && f.start < out[out.length - 1].end) continue
    out.push(f)
  }
  return out
}

/** The URL of a single identifier written alone, or null when it is not one. */
export function accessionUrl(id: string): string | null {
  const hit = findAccessions(id.trim())
  return hit.length === 1 && hit[0].text === id.trim() ? hit[0].url : null
}

// ── Whole-document view (linter) ────────────────────────────────────────────

/** Same-length blanking: offsets in the result are offsets in the source. */
function blank(text: string, re: RegExp): string {
  return text.replace(re, (m) => m.replace(/[^\n]/g, " "))
}

/**
 * Accessions in a markdown document's prose: code, math, frontmatter, links,
 * wikilinks, bare URLs and heading lines are blanked out first, so the offsets
 * still index into `text`. Does not check the opt-in; see `isBiologyDocument`.
 */
export function findAccessionsInMarkdown(text: string): AccessionMatch[] {
  let t = text
  t = blank(t, /^---\r?\n[\s\S]*?\r?\n---/) // frontmatter, only at the very start
  t = blank(t, /(^|\n)(```|~~~)[\s\S]*?(\n\2|$)/g)
  t = blank(t, /`[^`\n]*`/g)
  t = blank(t, /\$\$[\s\S]*?\$\$/g)
  t = blank(t, /\$[^$\n]*\$/g)
  t = blank(t, /!?\[\[[^\]\n]*\]\]/g)
  t = blank(t, /\]\([^)\n]*\)/g) // the target of [text](target)
  t = blank(t, /https?:\/\/[^\s)>\]]+/g)
  t = blank(t, /^[ \t]{0,3}#{1,6}[ \t].*$/gm) // headings
  return findAccessions(t)
}

// ── Data availability ───────────────────────────────────────────────────────

const NUM = String.raw`(?:\d+(?:\.\d+)*\.?\s+)?`
const DAS_PHRASE = String.raw`(?:data\s+availability(?:\s+statement)?|availability\s+of\s+(?:data|supporting\s+data)(?:\s+and\s+materials?)?|data\s+and\s+(?:code|materials?)\s+availability|data\s+accessibility|disponibilidad\s+de\s+(?:los\s+)?datos|declaraci[oó]n\s+de\s+disponibilidad\s+de\s+(?:los\s+)?datos|disponibilidad\s+de\s+datos\s+y\s+materiales)`
// A heading (`## Data availability`) or a run-in bold title (`**Data availability.**`).
const DAS_RE = new RegExp(
  String.raw`^[ \t]{0,3}(?:#{1,6}[ \t]+|\*\*|__)${NUM}${DAS_PHRASE}\b`,
  "im",
)
const REFERENCES_HEADING_RE =
  /^[ \t]{0,3}#{1,6}[ \t]+(?:\d+(?:\.\d+)*\.?\s+)?(?:references|bibliography|literature\s+cited|referencias|bibliograf[ií]a)\b/im
const SEQUENCING_RE =
  /\b(?:FASTQ|RNA-?seq|scRNA-?seq|ChIP-?seq|ATAC-?seq|whole[- ]genome\s+sequencing|metagenom\w*|(?:Illumina|Nanopore|PacBio)\s+(?:sequencing|reads?)|sequencing\s+(?:data|reads?)|raw\s+reads|secuenciaci[oó]n|lecturas\s+crudas)\b/i

export interface DataAvailabilityFinding {
  /** Offset of the evidence the warning points at. */
  start: number
  end: number
  /** The first accession cited, when that is what triggered the finding. */
  accession?: string
}

/**
 * Rule for the "no Data availability statement" note. Only for documents that
 * opted in to `comdtex.domain: biology` and have no data availability heading
 * (or bold run-in title). It fires when ANY of these holds, in order of how
 * specific the evidence is, and points at the first one found:
 *
 *   1. the prose cites at least one accession number,
 *   2. it mentions sequencing data (FASTQ, RNA-seq, "raw reads"...),
 *   3. it has a References / Bibliography heading, i.e. it is a paper.
 *
 * A short note with none of the three stays quiet. Returns null when there is
 * nothing to say.
 */
export function findMissingDataAvailability(text: string): DataAvailabilityFinding | null {
  if (!isBiologyDocument(text)) return null
  if (DAS_RE.test(text)) return null

  const acc = findAccessionsInMarkdown(text)[0]
  if (acc) return { start: acc.start, end: acc.end, accession: acc.text }

  const body = blank(blank(text, /^---\r?\n[\s\S]*?\r?\n---/), /(^|\n)(```|~~~)[\s\S]*?(\n\2|$)/g)
  const seq = SEQUENCING_RE.exec(body)
  if (seq) return { start: seq.index, end: seq.index + seq[0].length }

  const refs = REFERENCES_HEADING_RE.exec(body)
  if (refs) {
    const lineEnd = body.indexOf("\n", refs.index)
    return { start: refs.index, end: lineEnd < 0 ? body.length : lineEnd }
  }
  return null
}

// ── markdown-it ─────────────────────────────────────────────────────────────

// An anchor written as raw HTML opens and closes with html_inline tokens.
const A_OPEN_RE = /^<a[\s>]/i
const A_CLOSE_RE = /^<\/a\s*>/i

/** Split the text tokens of one inline token's children into text + links. */
function linkInline(
  children: MdToken[],
  Token: new (type: string, tag: string, nesting: 1 | 0 | -1) => MdToken,
): MdToken[] {
  const out: MdToken[] = []
  let inLink = 0
  for (const tok of children) {
    if (tok.type === "link_open") inLink++
    else if (tok.type === "link_close") inLink = Math.max(0, inLink - 1)
    else if (tok.type === "html_inline") {
      if (A_OPEN_RE.test(tok.content)) inLink++
      else if (A_CLOSE_RE.test(tok.content)) inLink = Math.max(0, inLink - 1)
    }
    if (tok.type !== "text" || inLink > 0 || tok.content.length < 6) {
      out.push(tok)
      continue
    }
    // Placeholders for math/environments travel as text (\x02MATH0\x03);
    // blank them so nothing inside can look like an identifier.
    const hay = tok.content.replace(/\x02[^\x03]*\x03/g, (m: string) => " ".repeat(m.length))
    const hits = findAccessions(hay)
    if (hits.length === 0) {
      out.push(tok)
      continue
    }
    let last = 0
    const text = (content: string) => {
      const t = new Token("text", "", 0)
      t.content = content
      t.level = tok.level
      return t
    }
    for (const h of hits) {
      if (h.start > last) out.push(text(tok.content.slice(last, h.start)))
      const open = new Token("link_open", "a", 1)
      open.attrs = [
        ["href", h.url],
        ["class", "accession"],
      ]
      open.level = tok.level
      open.markup = "accession"
      out.push(open)
      out.push(text(tok.content.slice(h.start, h.end)))
      const close = new Token("link_close", "a", -1)
      close.level = tok.level
      close.markup = "accession"
      out.push(close)
      last = h.end
    }
    if (last < tok.content.length) out.push(text(tok.content.slice(last)))
  }
  return out
}

/**
 * markdown-it plugin: a core rule that links accessions in prose. It runs only
 * when the render environment carries `accessions: true` (the caller sets it
 * for documents that opted in), so every other document is untouched. Code,
 * math placeholders, existing links and headings are skipped. Because it
 * emits ordinary `link_open` tokens, the HTML renderer and the LaTeX exporter
 * both handle the result with the code they already have for links.
 */
export function accessionsPlugin(md: MarkdownIt): void {
  md.core.ruler.push("accessions", (state) => {
    if (!state.env || !(state.env as { accessions?: boolean }).accessions) return
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      if (tok.type !== "inline" || !tok.children) continue
      if (i > 0 && tokens[i - 1].type === "heading_open") continue
      tok.children = linkInline(tok.children, state.Token)
    }
  })
}
