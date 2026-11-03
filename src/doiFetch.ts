/**
 * On-demand DOI / arXiv → BibTeX fetcher.
 *
 * IMPORTANT: every network call in this module is *opt-in / on-demand*: it
 * only runs when the user explicitly clicks "Add by DOI" in the Citation
 * Manager. ComdTeX makes no background or automatic network requests; the app
 * stays fully offline unless the user triggers a fetch here.
 *
 * Endpoints (both CORS-enabled, return BibTeX directly, no redirect):
 *   - CrossRef:  https://api.crossref.org/works/{DOI}/transform/application/x-bibtex
 *   - DataCite:  https://api.datacite.org/dois/application/x-bibtex/{DOI}
 *
 * The CSP `connect-src` in src-tauri/tauri.conf.json is extended to allow ONLY
 * these two hosts.
 */

const CROSSREF = "https://api.crossref.org/works"
const DATACITE = "https://api.datacite.org/dois/application/x-bibtex"
const TIMEOUT_MS = 10000

export interface DoiResult {
  /** Raw BibTeX text returned by the provider. */
  bibtex: string
}

/**
 * Normalize raw user input into a DOI.
 *
 * Accepts:
 *   - a raw DOI:            10.xxxx/...
 *   - a doi.org URL:        https://doi.org/10.xxxx/...
 *   - an arXiv id:          2301.00001  /  arXiv:2301.00001
 *
 * arXiv ids are mapped to their DataCite DOI (10.48550/arXiv.<id>).
 * Returns `{ doi, isArxiv }` or null if the input can't be recognized.
 */
export function normalizeDoiInput(raw: string): { doi: string; isArxiv: boolean } | null {
  const input = raw.trim()
  if (!input) return null

  // doi.org / dx.doi.org URL → strip to the bare DOI
  const urlMatch = input.match(/^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i)
  const candidate = urlMatch ? urlMatch[1].trim() : input

  // Bare DOI (10.xxxx/...)
  if (/^10\.\d{4,9}\/\S+$/.test(candidate)) {
    return { doi: candidate, isArxiv: /^10\.48550\/arxiv\./i.test(candidate) }
  }

  // arXiv id: "arXiv:2301.00001" or "2301.00001" (optionally with version vN)
  const arxivMatch = candidate.match(/^(?:arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i)
  if (arxivMatch) {
    return { doi: `10.48550/arXiv.${arxivMatch[1]}`, isArxiv: true }
  }

  return null
}

/** fetch with an AbortController-based timeout. */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/x-bibtex" },
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch a BibTeX entry for the given DOI / arXiv id, on demand.
 *
 * Strategy: CrossRef first for plain DOIs; DataCite as fallback (and as the
 * primary source for arXiv-derived DOIs). Throws on any failure (offline,
 * 404, CORS, timeout) so the caller can surface a toast.
 */
export async function fetchBibtexForDoi(rawInput: string): Promise<DoiResult> {
  const norm = normalizeDoiInput(rawInput)
  if (!norm) throw new Error("invalid-input")
  const { doi, isArxiv } = norm

  const tryFetch = async (url: string): Promise<string | null> => {
    try {
      const res = await fetchWithTimeout(url)
      if (!res.ok) return null
      const text = (await res.text()).trim()
      return text.length > 0 ? text : null
    } catch {
      return null
    }
  }

  // arXiv-derived DOIs live only in DataCite; plain DOIs try CrossRef first.
  if (!isArxiv) {
    const cr = await tryFetch(
      `${CROSSREF}/${encodeURIComponent(doi)}/transform/application/x-bibtex`,
    )
    if (cr) return { bibtex: cr }
  }

  const dc = await tryFetch(`${DATACITE}/${encodeURIComponent(doi)}`)
  if (dc) return { bibtex: dc }

  throw new Error("not-found")
}

// ── Astronomy and high-energy physics identifiers ────────────────────────────
//
// These communities do not cite by DOI: astronomers copy a NASA ADS bibcode
// (2024ApJ...900....1A) out of the ADS UI, and physicists pull entries from
// INSPIRE-HEP. Both publish BibTeX directly, so the Citation Manager can
// resolve them the same way it resolves a DOI.

/** ADS bibcodes are exactly 19 characters: YYYYJJJJJVVVVMPPPPA. */
export function isAdsBibcode(raw: string): boolean {
  const s = raw.trim()
  return /^\d{4}[A-Za-z.&]{5}[\w.]{4}[\w.][\w.]{4}[A-Z]$/.test(s) && s.length === 19
}

/** INSPIRE literature reference: a recid, an INSPIRE URL, or arXiv id. */
export function parseInspireInput(raw: string): { kind: "recid" | "arxiv"; value: string } | null {
  const s = raw.trim()
  const url = /inspirehep\.net\/(?:literature|record)\/(\d+)/i.exec(s)
  if (url) return { kind: "recid", value: url[1] }
  if (/^inspire:(\d+)$/i.test(s)) return { kind: "recid", value: s.split(":")[1] }
  const arxiv = /^(?:arxiv:)?(\d{4}\.\d{4,5})(?:v\d+)?$/i.exec(s)
  if (arxiv) return { kind: "arxiv", value: arxiv[1] }
  return null
}

/**
 * Fetch BibTeX for an ADS bibcode. ADS requires a personal API token, which
 * lives in the OS keychain (secretStore), never in the settings file.
 */
export async function fetchBibtexFromAds(bibcode: string, token: string): Promise<string> {
  const res = await fetch("https://api.adsabs.harvard.edu/v1/export/bibtex", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ bibcode: [bibcode.trim()] }),
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error("ADS rejected the token")
  }
  if (!res.ok) throw new Error(`ADS returned ${res.status}`)
  const data = (await res.json()) as { export?: string }
  const bib = data.export?.trim()
  if (!bib) throw new Error("ADS returned no BibTeX")
  return bib
}

/** Fetch BibTeX from INSPIRE-HEP. No token needed. */
export async function fetchBibtexFromInspire(ref: {
  kind: "recid" | "arxiv"
  value: string
}): Promise<string> {
  const url =
    ref.kind === "recid"
      ? `https://inspirehep.net/api/literature/${ref.value}?format=bibtex`
      : `https://inspirehep.net/api/arxiv/${ref.value}?format=bibtex`
  const res = await fetch(url, { headers: { Accept: "application/x-bibtex" } })
  if (!res.ok) throw new Error(`INSPIRE returned ${res.status}`)
  const bib = (await res.text()).trim()
  if (!bib.startsWith("@")) throw new Error("INSPIRE returned no BibTeX")
  return bib
}

// ── PubMed and PubMed Central ────────────────────────────────────────────────
//
// Biomedical papers are cited by PMID or PMCID. NCBI E-utilities describe the
// record as JSON (no BibTeX), so we reuse the DOI path when the record has a
// DOI (CrossRef BibTeX is richer) and otherwise build an @article ourselves.

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
const IDCONV = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/"

/**
 * PubMed / PMC reference: `PMID: 123`, `pmid:123`, `PMC123`, a PubMed or PMC
 * URL, or bare digits (INSPIRE recids need their `inspire:` prefix, so bare
 * digits are free for PMIDs).
 */
export function parsePubmedInput(raw: string): { kind: "pmid" | "pmcid"; value: string } | null {
  const s = raw.trim()
  const pmcUrl = /ncbi\.nlm\.nih\.gov\/(?:pmc\/)?articles\/(PMC\d+)/i.exec(s)
  if (pmcUrl) return { kind: "pmcid", value: pmcUrl[1].toUpperCase() }
  const pmidUrl = /(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d{1,9})/i.exec(s)
  if (pmidUrl) return { kind: "pmid", value: pmidUrl[1] }
  const pmc = /^(?:pmcid:\s*)?(PMC\d+)$/i.exec(s)
  if (pmc) return { kind: "pmcid", value: pmc[1].toUpperCase() }
  const pmid = /^(?:pmid:\s*)?(\d{1,9})$/i.exec(s)
  if (pmid) return { kind: "pmid", value: pmid[1] }
  return null
}

/** Insert extra fields before the closing brace of a single BibTeX entry. */
export function addBibtexFields(bibtex: string, fields: Record<string, string>): string {
  const end = bibtex.lastIndexOf("}")
  if (end < 0) return bibtex
  const extra = Object.entries(fields)
    .filter(([name, value]) => value && !new RegExp(`\\b${name}\\s*=`, "i").test(bibtex))
    .map(([name, value]) => `  ${name} = {${value}}`)
  if (extra.length === 0) return bibtex
  const head = bibtex.slice(0, end).replace(/[\s,]*$/, "")
  return `${head},\n${extra.join(",\n")}\n}`
}

interface PubmedRecord {
  title?: string
  authors?: { name?: string }[]
  fulljournalname?: string
  source?: string
  pubdate?: string
  volume?: string
  issue?: string
  pages?: string
  articleids?: { idtype?: string; value?: string }[]
}

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`NCBI returned ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Build an @article entry from an esummary record. */
function bibtexFromSummary(pmid: string, rec: PubmedRecord, pmcid: string, doi: string): string {
  // esummary lists authors as "Smith JA"; BibTeX wants "Smith, JA".
  const authors = (rec.authors ?? [])
    .map((a) => (a.name ?? "").trim())
    .filter(Boolean)
    .map((n) => {
      const i = n.lastIndexOf(" ")
      return i > 0 ? `${n.slice(0, i)}, ${n.slice(i + 1)}` : n
    })
  const year = /\d{4}/.exec(rec.pubdate ?? "")?.[0] ?? ""
  const title = (rec.title ?? "").trim().replace(/\.$/, "")
  const surname = (authors[0] ?? "")
    .split(",")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  const key = `${surname || "pmid"}${year}pmid${pmid}`
  const fields: Record<string, string> = {
    author: authors.join(" and "),
    title,
    journal: rec.fulljournalname || rec.source || "",
    year,
    volume: rec.volume ?? "",
    number: rec.issue ?? "",
    pages: (rec.pages ?? "").replace(/-/g, "--"),
    doi,
    pmid,
    pmcid,
  }
  const body = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(",\n")
  return `@article{${key},\n${body}\n}`
}

/**
 * Fetch BibTeX for a PubMed / PMC reference. No token needed. Prefers the
 * DOI route when the record has a DOI, and always records the pmid.
 */
export async function fetchBibtexFromPubmed(ref: {
  kind: "pmid" | "pmcid"
  value: string
}): Promise<string> {
  let pmid = ref.value
  let pmcid = ref.kind === "pmcid" ? ref.value : ""
  if (ref.kind === "pmcid") {
    const conv = await getJson<{ records?: { pmid?: string }[] }>(
      `${IDCONV}?ids=${encodeURIComponent(ref.value)}&format=json`,
    )
    const found = conv.records?.[0]?.pmid
    if (!found) throw new Error("PMC id has no PubMed record")
    pmid = found
  }
  const data = await getJson<{ result?: Record<string, PubmedRecord | undefined> }>(
    `${EUTILS}/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`,
  )
  const rec = data.result?.[pmid]
  if (!rec || !rec.title) throw new Error("PubMed returned no record")
  const idOf = (type: string) => rec.articleids?.find((a) => a.idtype === type)?.value ?? ""
  if (!pmcid) pmcid = idOf("pmc")
  const doi = idOf("doi")
  if (doi) {
    try {
      const { bibtex } = await fetchBibtexForDoi(doi)
      return addBibtexFields(bibtex, { pmid, pmcid })
    } catch {
      // DOI not resolvable (not in CrossRef/DataCite): fall back to esummary.
    }
  }
  return bibtexFromSummary(pmid, rec, pmcid, doi)
}
