import { describe, expect, it } from "vitest"
import { findByName, getFileNameSet, processWikilinks } from "./wikilinks"
import type { FileNode } from "./types"

// Two notes called `intro`: completion writes `[[physics/intro]]` for them, and
// that form has to resolve, render as a live link and not read as broken.
const tree: FileNode[] = [
  {
    name: "notes",
    path: "/vault/notes",
    type: "dir",
    children: [{ name: "intro.md", path: "/vault/notes/intro.md", type: "file", ext: "md" }],
  },
  {
    name: "physics",
    path: "/vault/physics",
    type: "dir",
    children: [{ name: "intro.md", path: "/vault/physics/intro.md", type: "file", ext: "md" }],
  },
]

describe("path-form wikilinks", () => {
  it("resolves the path form to the right note", () => {
    expect(findByName(tree, "physics/intro")?.path).toBe("/vault/physics/intro.md")
    expect(findByName(tree, "notes/intro")?.path).toBe("/vault/notes/intro.md")
  })

  it("keeps the bare name resolving to the first note", () => {
    expect(findByName(tree, "intro")?.path).toBe("/vault/notes/intro.md")
  })

  it("does not render the path form as a broken link", () => {
    const html = processWikilinks("[[physics/intro]] [[physics/missing]]", getFileNameSet(tree))
    expect(html).toContain('class="wikilink" data-target="physics/intro"')
    expect(html).toContain('class="wikilink wikilink-broken" data-target="physics/missing"')
  })
})
