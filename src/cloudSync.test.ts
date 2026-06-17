import { describe, it, expect } from "vitest"
import { isConflictFile, findConflicts, isPathInside } from "./cloudSync"
import type { FileNode } from "./types"

describe("isConflictFile — Dropbox", () => {
  it("matches plain conflicted-copy pattern", () => {
    const m = isConflictFile("note (conflicted copy 2026-04-29).md")
    expect(m.isConflict).toBe(true)
    expect(m.provider).toBe("dropbox")
    expect(m.baseName).toBe("note.md")
  })

  it("matches conflicted copy with author name", () => {
    const m = isConflictFile("paper (Alice's conflicted copy 2026-04-29).tex")
    expect(m.isConflict).toBe(true)
    expect(m.provider).toBe("dropbox")
    expect(m.baseName).toBe("paper.tex")
  })

  it("preserves multi-dot stems", () => {
    const m = isConflictFile("data.v2 (conflicted copy 2026-04-29).md")
    expect(m.baseName).toBe("data.v2.md")
  })

  it("ignores normal filenames", () => {
    expect(isConflictFile("note.md").isConflict).toBe(false)
    expect(isConflictFile("draft (v2).md").isConflict).toBe(false)
  })
})

describe("isConflictFile — OneDrive heuristic", () => {
  it("matches all-caps machine-name suffix (only with onedrive hint)", () => {
    const m = isConflictFile("note-DESKTOP123.md", "onedrive")
    expect(m.isConflict).toBe(true)
    expect(m.provider).toBe("onedrive")
    expect(m.baseName).toBe("note.md")
  })

  it("matches hyphenated machine name (DESKTOP-7F3KQ9)", () => {
    const m = isConflictFile("paper-DESKTOP-7F3KQ9.tex", "onedrive")
    expect(m.isConflict).toBe(true)
    expect(m.provider).toBe("onedrive")
    expect(m.baseName).toBe("paper.tex")
  })

  it("never runs the OneDrive heuristic without a onedrive hint", () => {
    // No hint → unrelated vaults must not get spurious conflicts that would
    // then be offered for deletion.
    expect(isConflictFile("note-DESKTOP123.md").isConflict).toBe(false)
    expect(isConflictFile("chapter-Introduction.md").isConflict).toBe(false)
  })

  it("does NOT flag ordinary hyphenated academic filenames", () => {
    // Normal Capitalized words must not look like a machine name even when the
    // provider is known to be OneDrive.
    expect(isConflictFile("chapter-Introduction.md", "onedrive").isConflict).toBe(false)
    expect(isConflictFile("lemma-Banach.md", "onedrive").isConflict).toBe(false)
    expect(isConflictFile("proof-Sketch.md", "onedrive").isConflict).toBe(false)
  })

  it("ignores too-short / lowercase suffix", () => {
    expect(isConflictFile("a-b.md", "onedrive").isConflict).toBe(false)
  })
})

describe("isPathInside", () => {
  it("matches nested path", () => {
    expect(isPathInside("/home/u/Dropbox/vault", "/home/u/Dropbox")).toBe(true)
  })
  it("matches identical path", () => {
    expect(isPathInside("/home/u/Dropbox", "/home/u/Dropbox")).toBe(true)
  })
  it("rejects sibling with shared prefix", () => {
    expect(isPathInside("/home/u/DropboxOther", "/home/u/Dropbox")).toBe(false)
  })
  it("is case-insensitive (Windows)", () => {
    expect(isPathInside("C:/Users/U/Dropbox/Vault", "c:/users/u/dropbox")).toBe(true)
  })
  it("normalizes backslashes", () => {
    expect(isPathInside("C:\\Users\\U\\Dropbox\\Vault", "C:/Users/U/Dropbox")).toBe(true)
  })
})

describe("findConflicts", () => {
  const file = (name: string, dir = "/v"): FileNode => ({
    name, path: `${dir}/${name}`, type: "file", ext: name.split(".").pop(),
  })

  it("finds Dropbox conflict and pairs it with the original sibling", () => {
    const tree: FileNode[] = [
      file("note.md"),
      file("note (conflicted copy 2026-04-29).md"),
    ]
    const conflicts = findConflicts(tree)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].provider).toBe("dropbox")
    expect(conflicts[0].baseName).toBe("note.md")
    expect(conflicts[0].basePath).toBe("/v/note.md")
  })

  it("reports a Dropbox conflict even when the original is missing", () => {
    const tree: FileNode[] = [
      file("note (conflicted copy 2026-04-29).md"),
    ]
    const conflicts = findConflicts(tree)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].basePath).toBeNull()
  })

  it("requires a sibling for OneDrive matches (suppresses false positives)", () => {
    // No sibling "draft.md" → must NOT flag "draft-DESKTOP123.md".
    const tree: FileNode[] = [file("draft-DESKTOP123.md")]
    expect(findConflicts(tree, "onedrive")).toHaveLength(0)
  })

  it("flags OneDrive conflict when sibling exists (onedrive hint)", () => {
    const tree: FileNode[] = [
      file("draft.md"),
      file("draft-DESKTOP123.md"),
    ]
    const conflicts = findConflicts(tree, "onedrive")
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].provider).toBe("onedrive")
    expect(conflicts[0].basePath).toBe("/v/draft.md")
  })

  it("does NOT flag hyphenated academic filenames as OneDrive conflicts (even with sibling)", () => {
    // Regression: chapter-Introduction.md alongside chapter.md must not be
    // offered for deletion. "Introduction" is a normal word, not a machine name.
    const tree: FileNode[] = [
      file("chapter.md"),
      file("chapter-Introduction.md"),
      file("lemma.md"),
      file("lemma-Banach.md"),
    ]
    expect(findConflicts(tree, "onedrive")).toHaveLength(0)
  })

  it("never flags hyphenated filenames when no provider hint is given", () => {
    // The destructive false positive: without an OneDrive root detected, a
    // genuine-looking machine-name suffix must still be ignored entirely.
    const tree: FileNode[] = [
      file("draft.md"),
      file("draft-DESKTOP123.md"),
    ]
    expect(findConflicts(tree)).toHaveLength(0)
  })

  it("walks nested directories", () => {
    const tree: FileNode[] = [
      {
        name: "subdir", path: "/v/subdir", type: "dir",
        children: [
          file("a.md", "/v/subdir"),
          file("a (conflicted copy 2026-04-29).md", "/v/subdir"),
        ],
      },
    ]
    const conflicts = findConflicts(tree)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].conflictPath).toBe("/v/subdir/a (conflicted copy 2026-04-29).md")
    expect(conflicts[0].basePath).toBe("/v/subdir/a.md")
  })

  it("does not pair a conflict in one directory with an original in another", () => {
    const tree: FileNode[] = [
      file("note.md", "/v"),
      file("note (conflicted copy 2026-04-29).md", "/v/sub"),
    ]
    const conflicts = findConflicts(tree)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].basePath).toBeNull()
  })
})
