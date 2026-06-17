/**
 * On-demand Zotero → BibTeX import (local HTTP API).
 *
 * IMPORTANT: every network call in this module is *opt-in / on-demand* — it
 * only runs when the user explicitly searches / imports from the Citation
 * Manager's "Import from Zotero" UI. ComdTeX makes no background or automatic
 * requests; the app stays fully offline unless the user triggers one here.
 *
 * REQUIREMENTS: Zotero must be running locally, ideally with the
 * Better BibTeX (BBT) plugin installed. Both expose a local HTTP server on
 * port 23119. Nothing here works unless Zotero is open.
 *
 * Strategy (defensive — tries the most reliable path first):
 *   1) Better BibTeX JSON-RPC at /better-bibtex/json-rpc
 *        - method `item.search` → returns matching items
 *        - method `item.export` → returns BibTeX text for given citekeys
 *   2) Stock Zotero local API fallback:
 *        - /api/users/0/items?format=bibtex (availability varies by version)
 *
 * The CSP `connect-src` in src-tauri/tauri.conf.json is extended to allow ONLY
 * http://localhost:23119.
 */

const BASE = "http://localhost:23119"
const JSON_RPC = `${BASE}/better-bibtex/json-rpc`
const STOCK_ITEMS = `${BASE}/api/users/0/items`
const TIMEOUT_MS = 8000

/** Clear, user-facing message when Zotero / BBT can't be reached. */
export const ZOTERO_UNAVAILABLE = "Zotero/Better BibTeX no está disponible en localhost:23119"

export interface ZoteroItem {
  /** Better BibTeX citekey (used to export BibTeX). */
  citekey: string
  title: string
  author: string
  year: string
}

/** fetch with an AbortController-based timeout. */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** POST a Better BibTeX JSON-RPC call. Throws ZOTERO_UNAVAILABLE on any failure. */
async function jsonRpc<T>(method: string, params: unknown[]): Promise<T> {
  let res: Response
  try {
    res = await fetchWithTimeout(JSON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    })
  } catch {
    throw new Error(ZOTERO_UNAVAILABLE)
  }
  if (!res.ok) throw new Error(ZOTERO_UNAVAILABLE)
  let body: { result?: T; error?: { message?: string } }
  try {
    body = await res.json()
  } catch {
    throw new Error(ZOTERO_UNAVAILABLE)
  }
  if (body.error) throw new Error(body.error.message || ZOTERO_UNAVAILABLE)
  return body.result as T
}

/** Best-effort string extraction from a Zotero creators array. */
function formatAuthors(creators: unknown): string {
  if (!Array.isArray(creators)) return ""
  const names = creators
    .map(c => {
      if (!c || typeof c !== "object") return ""
      const o = c as Record<string, unknown>
      const last = typeof o.lastName === "string" ? o.lastName : ""
      const first = typeof o.firstName === "string" ? o.firstName : ""
      const name = typeof o.name === "string" ? o.name : ""
      if (last && first) return `${last}, ${first}`
      return last || name || first
    })
    .filter(Boolean)
  return names.join("; ")
}

/** Pull a 4-digit year out of a Zotero date string. */
function extractYear(date: unknown): string {
  if (typeof date !== "string") return ""
  const m = date.match(/\d{4}/)
  return m ? m[0] : ""
}

/** Derive a Better BibTeX citekey from a raw item, falling back to its key. */
function itemCitekey(o: Record<string, unknown>): string {
  if (typeof o.citationKey === "string" && o.citationKey) return o.citationKey
  if (typeof o.citekey === "string" && o.citekey) return o.citekey
  if (typeof o.key === "string" && o.key) return o.key
  return ""
}

/**
 * Search Zotero for items matching `query`, on demand.
 *
 * Uses Better BibTeX's `item.search` JSON-RPC. Throws an Error whose message is
 * `ZOTERO_UNAVAILABLE` when Zotero/BBT can't be reached, so the caller can
 * surface a clear toast.
 */
export async function searchZotero(query: string): Promise<ZoteroItem[]> {
  const q = query.trim()
  if (!q) return []

  const raw = await jsonRpc<unknown>("item.search", [q])
  if (!Array.isArray(raw)) return []

  return raw
    .map(r => {
      if (!r || typeof r !== "object") return null
      const o = r as Record<string, unknown>
      const citekey = itemCitekey(o)
      if (!citekey) return null
      const title = typeof o.title === "string" ? o.title : ""
      const author = formatAuthors(o.creators)
      const year = extractYear(o.date)
      return { citekey, title, author, year } satisfies ZoteroItem
    })
    .filter((x): x is ZoteroItem => x !== null)
}

/**
 * Fetch BibTeX text for the given Better BibTeX citekeys (or a free-text
 * query, which is first resolved via {@link searchZotero}), on demand.
 *
 * Tries the BBT `item.export` JSON-RPC first (translator "Better BibTeX", then
 * plain "BibTeX"), and falls back to the stock Zotero local items API. Throws
 * `ZOTERO_UNAVAILABLE` if nothing is reachable.
 */
export async function fetchZoteroBibtex(itemKeysOrQuery: string[] | string): Promise<string> {
  let citekeys: string[]
  if (Array.isArray(itemKeysOrQuery)) {
    citekeys = itemKeysOrQuery.filter(Boolean)
  } else {
    citekeys = (await searchZotero(itemKeysOrQuery)).map(i => i.citekey)
  }
  if (citekeys.length === 0) return ""

  // 1) Better BibTeX item.export — try the BBT translator, then plain BibTeX.
  for (const translator of ["Better BibTeX", "BibTeX"]) {
    try {
      const out = await jsonRpc<unknown>("item.export", [citekeys, translator])
      // BBT may return a string, or [contentType, body], or { ... body }.
      const text = normalizeExport(out)
      if (text) return text
    } catch {
      // fall through to stock API
    }
  }

  // 2) Stock Zotero local API fallback.
  try {
    const url = `${STOCK_ITEMS}?format=bibtex&itemKey=${encodeURIComponent(citekeys.join(","))}`
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/x-bibtex" } })
    if (res.ok) {
      const text = (await res.text()).trim()
      if (text) return text
    }
  } catch {
    // ignore — reported below
  }

  throw new Error(ZOTERO_UNAVAILABLE)
}

/** Coerce the various shapes BBT `item.export` may return into BibTeX text. */
function normalizeExport(out: unknown): string {
  if (typeof out === "string") return out.trim()
  if (Array.isArray(out)) {
    // [contentType, body] tuple — body is the second element.
    const body = out[1] ?? out[0]
    return typeof body === "string" ? body.trim() : ""
  }
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>
    const body = o.body ?? o.data ?? o.bibtex
    return typeof body === "string" ? body.trim() : ""
  }
  return ""
}
