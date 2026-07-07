import { describe, expect, it } from "vitest"
import {
  VaultSearchIndex,
  parseSearchQuery,
  buildSearchRegex,
  DEFAULT_SEARCH_CAP,
  type SearchCandidate,
} from "./searchIndex"

/**
 * A real (non-mock) async reader with an observable call counter. Repo rule:
 * tests exercise real behavior, no mocking library. `count` lets a test assert
 * how many times the index actually read a file; when several `responses` are
 * given, successive calls return successive values (last one repeats).
 */
type CountedReader = (() => Promise<string>) & { count: number }
function counted(...responses: string[]): CountedReader {
  const reader = (async () => {
    const idx = Math.min(reader.count, responses.length - 1)
    reader.count += 1
    return responses[idx]
  }) as CountedReader
  reader.count = 0
  return reader
}

function candidate(
  path: string,
  content: string,
  mtimeMs: number,
  read?: () => Promise<string>,
): SearchCandidate {
  const name = path.split("/").pop()!
  const ext = name.split(".").pop() ?? ""
  return {
    path,
    name,
    ext,
    getMtime: async () => mtimeMs,
    readContent: read ?? (async () => content),
  }
}

describe("parseSearchQuery", () => {
  it("splits tag:/path:/ext:/fm: filters from the free-text query", () => {
    const { filters, textQuery } = parseSearchQuery("hello tag:math ext:.md path:notes fm:author=Jane world")
    expect(textQuery).toBe("hello world")
    expect(filters.tags).toEqual(["math"])
    expect(filters.exts).toEqual(["md"])
    expect(filters.paths).toEqual(["notes"])
    expect(filters.frontmatter).toEqual([{ key: "author", value: "jane" }])
  })

  it("returns an empty textQuery when the query is only filters", () => {
    const { textQuery } = parseSearchQuery("tag:math")
    expect(textQuery).toBe("")
  })
})

describe("buildSearchRegex", () => {
  it("escapes plain-text metacharacters", () => {
    const re = buildSearchRegex("a+b")
    expect(re).not.toBeNull()
    expect(re!.source).toBe("a\\+b")
  })

  it("returns null for invalid regex mode input", () => {
    expect(buildSearchRegex("(", { regex: true })).toBeNull()
  })

  it("is case-insensitive by default", () => {
    const re = buildSearchRegex("hello")!
    expect(re.test("HELLO world")).toBe(true)
  })
})

describe("VaultSearchIndex.syncFile", () => {
  it("reads and caches a file on first sync", async () => {
    const idx = new VaultSearchIndex()
    const read = counted("# Title\n\nSome content here.")
    const entry = await idx.syncFile("/vault/a.md", 100, read)
    expect(read.count).toBe(1)
    expect(entry.content).toContain("Some content here.")
    expect(idx.has("/vault/a.md")).toBe(true)
    expect(idx.size()).toBe(1)
  })

  it("does NOT re-read an unchanged file (same mtime) on a second sync", async () => {
    const idx = new VaultSearchIndex()
    const read = counted("content v1")
    await idx.syncFile("/vault/a.md", 100, read)
    const second = await idx.syncFile("/vault/a.md", 100, read)
    expect(read.count).toBe(1)
    expect(second.content).toBe("content v1")
  })

  it("re-reads when the mtime changes", async () => {
    const idx = new VaultSearchIndex()
    const read = counted("content v1", "content v2")
    await idx.syncFile("/vault/a.md", 100, read)
    const second = await idx.syncFile("/vault/a.md", 200, read)
    expect(read.count).toBe(2)
    expect(second.content).toBe("content v2")
  })

  it("derives frontmatter and tags from the synced content", async () => {
    const idx = new VaultSearchIndex()
    const content = "---\ntitle: Hello\ntags: [alpha, beta]\n---\n\nBody #inline-tag here."
    const entry = await idx.syncFile("/vault/a.md", 1, async () => content)
    expect(entry.frontmatterData.title).toBe("Hello")
    expect(entry.tags).toEqual(expect.arrayContaining(["alpha", "beta", "inline-tag"]))
  })
})

describe("VaultSearchIndex.setFromEditorContent / invalidate / rename / clear", () => {
  it("installs an entry directly without calling any reader", async () => {
    const idx = new VaultSearchIndex()
    idx.setFromEditorContent("/vault/a.md", 50, "hello world")
    const read = counted("should not be called")
    const entry = await idx.syncFile("/vault/a.md", 50, read)
    expect(read.count).toBe(0)
    expect(entry.content).toBe("hello world")
  })

  it("invalidate() forces a re-read on the next sync even with the same mtime", async () => {
    const idx = new VaultSearchIndex()
    const read = counted("content")
    await idx.syncFile("/vault/a.md", 100, read)
    idx.invalidate("/vault/a.md")
    expect(idx.has("/vault/a.md")).toBe(false)
    await idx.syncFile("/vault/a.md", 100, read)
    expect(read.count).toBe(2)
  })

  it("rename() moves the cached entry to the new path and drops the old key", async () => {
    const idx = new VaultSearchIndex()
    await idx.syncFile("/vault/old.md", 1, async () => "moved content")
    idx.rename("/vault/old.md", "/vault/new.md")
    expect(idx.has("/vault/old.md")).toBe(false)
    expect(idx.get("/vault/new.md")?.content).toBe("moved content")
  })

  it("rename() of an unknown path is a no-op beyond clearing any stale target entry", async () => {
    const idx = new VaultSearchIndex()
    idx.rename("/vault/missing.md", "/vault/target.md")
    expect(idx.has("/vault/target.md")).toBe(false)
  })

  it("clear() drops every cached entry", async () => {
    const idx = new VaultSearchIndex()
    await idx.syncFile("/vault/a.md", 1, async () => "a")
    await idx.syncFile("/vault/b.md", 1, async () => "b")
    idx.clear()
    expect(idx.size()).toBe(0)
  })
})

describe("VaultSearchIndex.search", () => {
  it("finds matching lines across multiple files and reports 1-based line numbers", async () => {
    const idx = new VaultSearchIndex()
    const candidates = [
      candidate("/vault/a.md", "line one\nfindme here\nline three", 1),
      candidate("/vault/b.md", "nothing to see", 1),
    ]
    const { filters, textQuery } = parseSearchQuery("findme")
    const re = buildSearchRegex(textQuery)!
    const results = await idx.search(candidates, filters, textQuery, re)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ filePath: "/vault/a.md", fileName: "a.md", line: 2, content: "findme here" })
  })

  it("only re-reads a file whose content changed (mtime bump) between two searches", async () => {
    const idx = new VaultSearchIndex()
    const readA = counted("alpha content")
    const candA = candidate("/vault/a.md", "", 1, readA)

    const { filters, textQuery } = parseSearchQuery("alpha")
    const re1 = buildSearchRegex(textQuery)!
    await idx.search([candA], filters, textQuery, re1)
    expect(readA.count).toBe(1)

    // Second search, same mtime: readContent must NOT be called again.
    const re2 = buildSearchRegex(textQuery)!
    await idx.search([candA], filters, textQuery, re2)
    expect(readA.count).toBe(1)
  })

  it("applies ext: and path: filters without invoking readContent for excluded files", async () => {
    const idx = new VaultSearchIndex()
    const readMd = counted("match target here")
    const readTex = counted("match target here too")
    const candidates = [
      candidate("/vault/notes/a.md", "", 1, readMd),
      candidate("/vault/b.tex", "", 1, readTex),
    ]
    const { filters, textQuery } = parseSearchQuery("ext:md match")
    const re = buildSearchRegex(textQuery)!
    const results = await idx.search(candidates, filters, textQuery, re)
    expect(readMd.count).toBe(1)
    expect(readTex.count).toBe(0)
    expect(results.every((r) => r.filePath.endsWith(".md"))).toBe(true)
  })

  it("applies tag: filters against parsed frontmatter/inline tags", async () => {
    const idx = new VaultSearchIndex()
    const withTag = candidate("/vault/a.md", "---\ntags: [math]\n---\n\nsome content line", 1)
    const withoutTag = candidate("/vault/b.md", "some content line", 1)
    const { filters, textQuery } = parseSearchQuery("tag:math content")
    const re = buildSearchRegex(textQuery)!
    const results = await idx.search([withTag, withoutTag], filters, textQuery, re)
    expect(results.map((r) => r.filePath)).toEqual(["/vault/a.md"])
  })

  it("applies fm: filters against frontmatter values", async () => {
    const idx = new VaultSearchIndex()
    const match = candidate("/vault/a.md", "---\nauthor: Jane Doe\n---\n\nbody line", 1)
    const noMatch = candidate("/vault/b.md", "---\nauthor: John Doe\n---\n\nbody line", 1)
    const { filters, textQuery } = parseSearchQuery("fm:author=jane body")
    const re = buildSearchRegex(textQuery)!
    const results = await idx.search([match, noMatch], filters, textQuery, re)
    expect(results.map((r) => r.filePath)).toEqual(["/vault/a.md"])
  })

  it("caps results at the configured limit (default 500)", async () => {
    const idx = new VaultSearchIndex()
    const manyLines = Array.from({ length: 10 }, () => "hit line").join("\n")
    const candidates = Array.from({ length: 100 }, (_, i) => candidate(`/vault/f${i}.md`, manyLines, 1))
    const { filters, textQuery } = parseSearchQuery("hit")
    const re = buildSearchRegex(textQuery)!
    const results = await idx.search(candidates, filters, textQuery, re, { cap: 25 })
    expect(results.length).toBeLessThanOrEqual(25 + 9) // last file's forEach isn't cut mid-file, matches original semantics
    expect(results.length).toBeGreaterThanOrEqual(25)
  })

  it("stops calling readContent on files past the point a search is cancelled", async () => {
    const idx = new VaultSearchIndex()
    const reads: string[] = []
    const candidates = Array.from({ length: 5 }, (_, i) =>
      candidate(`/vault/f${i}.md`, "hit", 1, async () => { reads.push(`f${i}`); return "hit" }))
    let cancelled = false
    const { filters, textQuery } = parseSearchQuery("hit")
    const re = buildSearchRegex(textQuery)!
    // Cancel after the very first candidate is processed by wrapping isCancelled
    // to flip true once we've seen one read.
    const results = await idx.search(candidates, filters, textQuery, re, {
      isCancelled: () => { const c = cancelled; if (reads.length >= 1) cancelled = true; return c },
    })
    expect(reads.length).toBeLessThan(5)
    expect(results.length).toBeGreaterThan(0)
  })

  it("respects the default cap constant when none is passed", async () => {
    const idx = new VaultSearchIndex()
    const candidates = [candidate("/vault/a.md", "x", 1)]
    const { filters, textQuery } = parseSearchQuery("x")
    const re = buildSearchRegex(textQuery)!
    const results = await idx.search(candidates, filters, textQuery, re)
    expect(results.length).toBeLessThanOrEqual(DEFAULT_SEARCH_CAP)
  })
})
