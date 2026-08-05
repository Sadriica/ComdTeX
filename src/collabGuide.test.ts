import { describe, expect, it } from "vitest"
import { collabState, defaultSaveMessage, unmergedFiles, type CollabStatusInput } from "./collabGuide"

const base = (over: Partial<CollabStatusInput> = {}): CollabStatusInput => ({
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  ...over,
})

describe("collabState", () => {
  it("asks for a remote before anything else", () => {
    expect(collabState(base({ untracked: [{ x: "?", y: "?", path: "a.md" }] }), false)).toBe("no-remote")
  })

  it("puts conflicts above everything once a remote exists", () => {
    const st = base({
      unstaged: [{ x: "U", y: "U", path: "tesis.md" }],
      untracked: [{ x: "?", y: "?", path: "b.md" }],
      behind: 2,
    })
    expect(collabState(st, true)).toBe("conflicted")
  })

  it("reports dirty before ahead/behind", () => {
    expect(collabState(base({ unstaged: [{ x: " ", y: "M", path: "a.md" }], ahead: 1 }), true)).toBe("dirty")
  })

  it("reports behind, then ahead, then synced", () => {
    expect(collabState(base({ behind: 3 }), true)).toBe("behind")
    expect(collabState(base({ ahead: 2 }), true)).toBe("ahead")
    expect(collabState(base(), true)).toBe("synced")
  })
})

describe("unmergedFiles", () => {
  it("detects UU, AA and DD without duplicating staged/unstaged entries", () => {
    const f = { x: "U", y: "U", path: "a.md" }
    const st = base({
      staged: [f, { x: "A", y: "A", path: "b.md" }],
      unstaged: [f, { x: "D", y: "D", path: "c.md" }, { x: " ", y: "M", path: "normal.md" }],
    })
    expect(unmergedFiles(st).map((x) => x.path)).toEqual(["a.md", "b.md", "c.md"])
  })
})

describe("defaultSaveMessage", () => {
  it("stamps a readable date", () => {
    expect(defaultSaveMessage(new Date(2026, 7, 5, 9, 3))).toBe("Writing session 2026-08-05 09:03")
  })
})
