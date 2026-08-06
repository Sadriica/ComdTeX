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
    const cr = await tryFetch(`${CROSSREF}/${encodeURIComponent(doi)}/transform/application/x-bibtex`)
    if (cr) return { bibtex: cr }
  }

  const dc = await tryFetch(`${DATACITE}/${encodeURIComponent(doi)}`)
  if (dc) return { bibtex: dc }

  throw new Error("not-found")
}
