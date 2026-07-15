/**
 * In-memory vault search index.
 *
 * `useVault.search()` (and, historically, `SearchReplacePanel.tsx`) used to
 * `readTextFile()` EVERY vault file on EVERY query, then re-run
 * `toEditorContent()` + `extractFrontmatter()` + `extractDetailedTags()` on
 * each one. That's O(vault size) disk I/O + parsing per keystroke.
 *
 * This module caches, per file path, the already-converted editor content
 * plus its derived frontmatter/tags, keyed by the file's last-seen mtime.
 * A file is only re-read + re-parsed when its mtime changes (or it hasn't
 * been seen yet) — an unchanged file is served straight from memory.
 *
 * The index deliberately does NOT touch the filesystem itself (no Tauri
 * `stat`/`readTextFile` imports here) — the caller supplies the mtime and a
 * `readContent()` thunk. That keeps this module pure/testable and leaves the
 * door open for a future inverted/token index to slot in behind the same
 * `syncFile`/`search` API without touching call sites.
 */

import { toEditorContent } from "./cmdxFormat"
import { extractFrontmatter, extractDetailedTags, type FrontmatterData } from "./frontmatter"
import type { SearchResult } from "./types"

export const DEFAULT_SEARCH_CAP = 500

export interface SearchIndexEntry {
  /** Editor-format content (post `toEditorContent`), NOT raw disk bytes. */
  content: string
  mtimeMs: number
  frontmatterData: FrontmatterData
  /** Lower-cased tags, frontmatter + inline (mirrors `extractDetailedTags`). */
  tags: string[]
}

export interface SearchFilters {
  tags: string[]
  paths: string[]
  exts: string[]
  frontmatter: { key: string; value: string }[]
}

export interface ParsedSearchQuery {
  filters: SearchFilters
  textQuery: string
}

/**
 * Split a raw query into its `tag:`/`path:`/`ext:`/`fm:key=value` filter
 * terms and the remaining free-text query. Mirrors the filter parsing that
 * used to live inline in `useVault.search()` — kept byte-for-byte identical
 * so existing query syntax (and tests) keep working.
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const terms = query.trim().split(/\s+/)
  const filters: SearchFilters = {
    tags: terms.filter((term) => term.startsWith("tag:")).map((term) => term.slice(4).toLowerCase()),
    paths: terms.filter((term) => term.startsWith("path:")).map((term) => term.slice(5).toLowerCase()),
    exts: terms.filter((term) => term.startsWith("ext:")).map((term) => term.slice(4).replace(/^\./, "").toLowerCase()),
    frontmatter: terms
      .filter((term) => term.startsWith("fm:"))
      .map((term) => term.slice(3))
      .map((term) => {
        const [key, ...valueParts] = term.split("=")
        return { key: key.toLowerCase(), value: valueParts.join("=").toLowerCase() }
      })
      .filter((item) => item.key),
  }
  const textQuery = terms
    .filter((term) => !/^(tag|path|ext|fm):/.test(term))
    .join(" ")
  return { filters, textQuery }
}

/**
 * Build the line-matching RegExp for a parsed text query. Returns `null` on
 * an invalid user-supplied regex (caller should treat that as "no results").
 * Mirrors the try/catch that used to live inline in `useVault.search()`.
 */
export function buildSearchRegex(
  textQuery: string,
  opts: { regex?: boolean; caseSensitive?: boolean } = {},
): RegExp | null {
  try {
    return opts.regex
      ? new RegExp(textQuery || ".*", opts.caseSensitive ? "g" : "gi")
      : new RegExp((textQuery || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), opts.caseSensitive ? "g" : "gi")
  } catch {
    return null
  }
}

/**
 * A file eligible for search, plus how to fetch its mtime/content if
 * uncached or stale. Both are lazy (`() => Promise<...>`) so that `search()`
 * can honour the result cap / cancellation WITHOUT paying for a `stat()`
 * call on files it never gets to — mirroring the original tree-walk's
 * early-exit behaviour once the cap is hit.
 */
export interface SearchCandidate {
  path: string
  name: string
  ext: string
  /** Resolve to `undefined` if the mtime can't be determined (candidate is skipped). */
  getMtime: () => Promise<number | undefined>
  readContent: () => Promise<string>
}

export class VaultSearchIndex {
  private cache = new Map<string, SearchIndexEntry>()

  /** Number of files currently cached. Exposed for tests/diagnostics. */
  size(): number {
    return this.cache.size
  }

  has(path: string): boolean {
    return this.cache.has(path)
  }

  get(path: string): SearchIndexEntry | undefined {
    return this.cache.get(path)
  }

  /**
   * (Re)read + re-parse `path` only if it is absent from the cache or its
   * mtime differs from the cached value. Returns the cached-or-fresh entry.
   */
  async syncFile(path: string, mtimeMs: number, readContent: () => Promise<string>): Promise<SearchIndexEntry> {
    const existing = this.cache.get(path)
    if (existing && existing.mtimeMs === mtimeMs) return existing
    const raw = await readContent()
    const entry = this.buildEntry(path, mtimeMs, raw)
    this.cache.set(path, entry)
    return entry
  }

  /**
   * Directly install an entry from already-converted editor content (e.g.
   * right after a write, where the caller already has the new text and
   * mtime in hand) — skips the disk round-trip a plain `invalidate()` +
   * next-search `syncFile()` would otherwise force.
   */
  setFromEditorContent(path: string, mtimeMs: number, editorContent: string): SearchIndexEntry {
    const parsed = extractFrontmatter(editorContent)
    const tags = extractDetailedTags(editorContent).map((tag) => tag.tag)
    const entry: SearchIndexEntry = {
      content: editorContent,
      mtimeMs,
      frontmatterData: parsed?.data ?? {},
      tags,
    }
    this.cache.set(path, entry)
    return entry
  }

  private buildEntry(path: string, mtimeMs: number, rawDiskContent: string): SearchIndexEntry {
    const editorContent = toEditorContent(path, rawDiskContent)
    const parsed = extractFrontmatter(editorContent)
    const tags = extractDetailedTags(editorContent).map((tag) => tag.tag)
    return { content: editorContent, mtimeMs, frontmatterData: parsed?.data ?? {}, tags }
  }

  invalidate(path: string): void {
    this.cache.delete(path)
  }

  rename(oldPath: string, newPath: string): void {
    const entry = this.cache.get(oldPath)
    if (!entry) { this.cache.delete(newPath); return }
    this.cache.delete(oldPath)
    this.cache.set(newPath, entry)
  }

  clear(): void {
    this.cache.clear()
  }

  /**
   * Run a search over `candidates` (already filtered down to text vault
   * files the caller wants considered, in tree order), applying `filters`
   * and `searchRe`, syncing each candidate against the cache as it goes.
   * Stops as soon as `cap` results are collected or `isCancelled()` returns
   * true — mirrors the early-exit behaviour of the original recursive tree
   * walk in `useVault.search()`, so an aborted/superseded query doesn't pay
   * for reading files past the point where it stopped mattering.
   */
  async search(
    candidates: SearchCandidate[],
    filters: SearchFilters,
    textQuery: string,
    searchRe: RegExp,
    opts: { cap?: number; isCancelled?: () => boolean } = {},
  ): Promise<SearchResult[]> {
    const cap = opts.cap ?? DEFAULT_SEARCH_CAP
    const results: SearchResult[] = []

    for (const candidate of candidates) {
      if (opts.isCancelled?.() || results.length >= cap) break

      if (filters.exts.length > 0 && !filters.exts.includes(candidate.ext.toLowerCase())) continue
      if (filters.paths.length > 0 && !filters.paths.some((p) => candidate.path.toLowerCase().includes(p))) continue

      let entry: SearchIndexEntry
      try {
        const mtimeMs = await candidate.getMtime()
        if (mtimeMs === undefined) continue
        entry = await this.syncFile(candidate.path, mtimeMs, candidate.readContent)
      } catch {
        continue
      }

      if (filters.tags.length > 0 && !filters.tags.every((tag) => entry.tags.includes(tag))) continue

      if (filters.frontmatter.length > 0) {
        const data = entry.frontmatterData
        const ok = filters.frontmatter.every(({ key, value }) => {
          // `key` is lowercased by parseSearchQuery, but frontmatter keys are
          // stored verbatim (frontmatter.ts preserves case), so a document with
          // `Author:`/`Title:` would never match a `fm:author=…` filter with a
          // direct `data[key]` lookup. Resolve the key case-insensitively.
          const actualKey = Object.keys(data).find((k) => k.toLowerCase() === key)
          const actual = actualKey != null ? data[actualKey] : undefined
          if (actual == null) return false
          if (!value) return true
          return String(actual).toLowerCase().includes(value)
        })
        if (!ok) continue
      }

      entry.content.split("\n").forEach((line, i) => {
        searchRe.lastIndex = 0
        if (results.length < cap && (!textQuery || searchRe.test(line)))
          results.push({ filePath: candidate.path, fileName: candidate.name, line: i + 1, content: line.trim().slice(0, 200) })
      })
    }

    return results
  }
}
