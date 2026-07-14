import { describe, it, expect } from "vitest"
import { getFileNameSet, flatFiles, findByName, processWikilinks, matchesVaultRelPath, findByVaultRelPath } from "./wikilinks"
import type { FileNode } from "./types"

const tree: FileNode[] = [
  {
    name: "math",
    path: "/vault/math",
    type: "dir",
    children: [
      { name: "topology.md", path: "/vault/math/topology.md", type: "file", ext: "md" },
      { name: "algebra.md",  path: "/vault/math/algebra.md",  type: "file", ext: "md" },
    ],
  },
  { name: "notes.md",    path: "/vault/notes.md",    type: "file", ext: "md" },
  { name: "report.tex",  path: "/vault/report.tex",  type: "file", ext: "tex" },
]

describe("getFileNameSet", () => {
  it("returns base names without extension, lowercased", () => {
    const names = getFileNameSet(tree)
    expect(names.has("topology")).toBe(true)
    expect(names.has("algebra")).toBe(true)
    expect(names.has("notes")).toBe(true)
    expect(names.has("report")).toBe(true)
  })

  it("does not include directory names", () => {
    const names = getFileNameSet(tree)
    expect(names.has("math")).toBe(false)
  })

  it("returns empty set for empty tree", () => {
    expect(getFileNameSet([]).size).toBe(0)
  })
})

describe("flatFiles", () => {
  it("returns all file nodes recursively", () => {
    const files = flatFiles(tree)
    expect(files).toHaveLength(4)
    expect(files.map((f) => f.name)).toContain("topology.md")
    expect(files.map((f) => f.name)).toContain("notes.md")
  })

  it("does not include directory nodes", () => {
    const files = flatFiles(tree)
    expect(files.every((f) => f.type === "file")).toBe(true)
  })

  it("returns empty array for empty tree", () => {
    expect(flatFiles([])).toHaveLength(0)
  })
})

describe("findByName", () => {
  it("finds a file by base name (case-insensitive)", () => {
    expect(findByName(tree, "notes")).not.toBeNull()
    expect(findByName(tree, "Notes")).not.toBeNull()
    expect(findByName(tree, "TOPOLOGY")).not.toBeNull()
  })

  it("returns the correct file node", () => {
    const node = findByName(tree, "algebra")
    expect(node?.path).toBe("/vault/math/algebra.md")
  })

  it("returns null for non-existent name", () => {
    expect(findByName(tree, "missing")).toBeNull()
  })

  it("ignores extension in search", () => {
    const node = findByName(tree, "report")
    expect(node?.name).toBe("report.tex")
  })
})

describe("processWikilinks", () => {
  const names = getFileNameSet(tree) // topology, algebra, notes, report

  it("renders existing wikilinks with wikilink class", () => {
    const html = processWikilinks("[[notes]]", names)
    expect(html).toContain('class="wikilink"')
    expect(html).not.toContain("wikilink-broken")
    expect(html).toContain("notes")
  })

  it("renders missing wikilinks with wikilink-broken class", () => {
    const html = processWikilinks("[[missing-note]]", names)
    expect(html).toContain("wikilink-broken")
  })

  it("uses custom label from pipe syntax [[target|label]]", () => {
    const html = processWikilinks("[[notes|My Notes]]", names)
    expect(html).toContain("My Notes")
    expect(html).toContain('data-target="notes"')
  })

  it("wikilink matching is case-insensitive", () => {
    const html = processWikilinks("[[NOTES]]", names)
    expect(html).not.toContain("wikilink-broken")
  })

  it("sets data-target attribute on the anchor", () => {
    const html = processWikilinks("[[topology]]", names)
    expect(html).toContain('data-target="topology"')
  })

  it("escapes HTML in target name", () => {
    const html = processWikilinks('[[<script>alert(1)</script>]]', names)
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("leaves plain text untouched", () => {
    const text = "No links here."
    expect(processWikilinks(text, names)).toBe(text)
  })

  it("handles multiple wikilinks in same text", () => {
    const html = processWikilinks("[[notes]] and [[topology]]", names)
    expect(html.match(/class="wikilink"/g)?.length).toBe(2)
  })

  it("ignores headings: [[target#heading]] uses target for existence check", () => {
    const html = processWikilinks("[[notes#intro]]", names)
    expect(html).not.toContain("wikilink-broken")
  })
})

describe("matchesVaultRelPath", () => {
  it("matches a vault-relative path against an absolute file path", () => {
    expect(matchesVaultRelPath("/home/w/vault/gp/calendario.md", "gp/calendario")).toBe(true)
    expect(matchesVaultRelPath("/home/w/vault/gp/calendario.md", "calendario")).toBe(true)
  })

  it("disambiguates same-named files in different folders", () => {
    // The whole reason cross-refs are path-based: `findByName` would silently
    // return whichever `calendario.md` came first.
    expect(matchesVaultRelPath("/v/gp/calendario.md", "gp/calendario")).toBe(true)
    expect(matchesVaultRelPath("/v/otro/calendario.md", "gp/calendario")).toBe(false)
  })

  it("is case-insensitive and tolerates an explicit extension", () => {
    expect(matchesVaultRelPath("/v/GP/Calendario.md", "gp/calendario")).toBe(true)
    expect(matchesVaultRelPath("/v/gp/calendario.md", "gp/calendario.md")).toBe(true)
  })

  it("does not match a partial path segment", () => {
    expect(matchesVaultRelPath("/v/gp/mi-calendario.md", "calendario")).toBe(false)
  })

  it("rejects an empty path", () => {
    expect(matchesVaultRelPath("/v/gp/calendario.md", "  ")).toBe(false)
  })
})

describe("findByVaultRelPath", () => {
  const tree: FileNode[] = [
    { name: "gp", path: "/v/gp", type: "dir", children: [
      { name: "calendario.md", path: "/v/gp/calendario.md", type: "file" },
    ] },
    { name: "otro", path: "/v/otro", type: "dir", children: [
      { name: "calendario.md", path: "/v/otro/calendario.md", type: "file" },
    ] },
  ]

  it("finds the file addressed by its folder-qualified path", () => {
    expect(findByVaultRelPath(tree, "gp/calendario")?.path).toBe("/v/gp/calendario.md")
    expect(findByVaultRelPath(tree, "otro/calendario")?.path).toBe("/v/otro/calendario.md")
  })

  it("returns null for a missing path", () => {
    expect(findByVaultRelPath(tree, "nope/calendario")).toBeNull()
  })
})
