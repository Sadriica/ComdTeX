import { beforeEach, describe, expect, it, vi } from "vitest"

// In-memory FS shared between the mocked @tauri-apps/plugin-fs implementation
// and the tests. We hoist it via `vi.hoisted` so the mock factory below can
// safely reference it during module initialisation.
const fs = vi.hoisted(() => ({
  files: new Map<string, string>(),
}))

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async (path: string) => fs.files.has(path)),
  readTextFile: vi.fn(async (path: string) => {
    const content = fs.files.get(path)
    if (content === undefined) throw new Error(`missing file: ${path}`)
    return content
  }),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    fs.files.set(path, content)
  }),
}))

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) =>
    parts.join("/").replace(/\/+/g, "/"),
  ),
}))

import {
  COMMENTS_FILENAME,
  COMMENTS_VERSION,
  SNIPPET_MAX,
  addComment,
  deleteComment,
  generateCommentId,
  isCommentInSync,
  loadComments,
  makeLineSnippet,
  resolveComment,
  saveComments,
  toAbsolutePath,
  toRelativePath,
  type Comment,
} from "./comments"

const VAULT = "/vault"
const COMMENTS_PATH = `${VAULT}/${COMMENTS_FILENAME}`

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: overrides.id ?? generateCommentId(),
    filePath: "note.md",
    line: 1,
    lineSnippet: "the geometric series converges when |x| < 1",
    body: "Cite Apostol Ch 8 here",
    author: "user",
    createdAt: "2026-04-26T22:30:00Z",
    resolved: false,
    ...overrides,
  }
}

describe("comments storage", () => {
  beforeEach(() => {
    fs.files.clear()
  })

  describe("loadComments", () => {
    it("returns empty array when file is missing", async () => {
      const comments = await loadComments(VAULT)
      expect(comments).toEqual([])
    })

    it("returns empty array when file is malformed JSON", async () => {
      fs.files.set(COMMENTS_PATH, "{ not valid json ::: }")
      const comments = await loadComments(VAULT)
      expect(comments).toEqual([])
    })

    it("returns empty array when JSON has no comments array", async () => {
      fs.files.set(COMMENTS_PATH, JSON.stringify({ version: 1 }))
      const comments = await loadComments(VAULT)
      expect(comments).toEqual([])
    })

    it("parses well-formed comments and supplies defaults", async () => {
      fs.files.set(
        COMMENTS_PATH,
        JSON.stringify({
          version: 1,
          comments: [
            {
              id: "abc",
              filePath: "note.md",
              line: 4,
              body: "first",
              // intentionally omit author / createdAt / resolved
            },
          ],
        }),
      )
      const comments = await loadComments(VAULT)
      expect(comments).toHaveLength(1)
      expect(comments[0]).toMatchObject({
        id: "abc",
        filePath: "note.md",
        line: 4,
        body: "first",
        author: "user",
        resolved: false,
        lineSnippet: "",
      })
      expect(typeof comments[0].createdAt).toBe("string")
    })

    it("filters out malformed entries inside a valid comments file", async () => {
      fs.files.set(
        COMMENTS_PATH,
        JSON.stringify({
          version: 1,
          comments: [
            { id: "ok", filePath: "a.md", line: 1, body: "valid" },
            { id: "no-line", filePath: "a.md", body: "missing line" },
            null,
            "not an object",
          ],
        }),
      )
      const comments = await loadComments(VAULT)
      expect(comments).toHaveLength(1)
      expect(comments[0].id).toBe("ok")
    })
  })

  describe("saveComments", () => {
    it("writes the file in the documented JSON shape", async () => {
      const comment = makeComment({ id: "fixed-id" })
      await saveComments(VAULT, [comment])
      const raw = fs.files.get(COMMENTS_PATH)
      expect(raw).toBeDefined()
      const parsed = JSON.parse(raw!)
      expect(parsed.version).toBe(COMMENTS_VERSION)
      expect(parsed.comments).toHaveLength(1)
      expect(parsed.comments[0].id).toBe("fixed-id")
      expect(parsed.comments[0].body).toBe(comment.body)
    })

    it("round-trips comments through save then load", async () => {
      const comments = [makeComment({ id: "a" }), makeComment({ id: "b", line: 7, body: "second" })]
      await saveComments(VAULT, comments)
      const reloaded = await loadComments(VAULT)
      expect(reloaded).toEqual(comments)
    })
  })

  describe("addComment", () => {
    it("appends to existing comments", async () => {
      await saveComments(VAULT, [makeComment({ id: "first" })])
      await addComment(VAULT, makeComment({ id: "second", body: "another" }))
      const all = await loadComments(VAULT)
      expect(all.map((c) => c.id)).toEqual(["first", "second"])
    })

    it("creates the file when it doesn't exist", async () => {
      await addComment(VAULT, makeComment({ id: "first" }))
      expect(fs.files.has(COMMENTS_PATH)).toBe(true)
      const all = await loadComments(VAULT)
      expect(all).toHaveLength(1)
    })
  })

  describe("deleteComment", () => {
    it("removes the comment with the given id", async () => {
      await saveComments(VAULT, [
        makeComment({ id: "keep" }),
        makeComment({ id: "drop" }),
      ])
      await deleteComment(VAULT, "drop")
      const all = await loadComments(VAULT)
      expect(all.map((c) => c.id)).toEqual(["keep"])
    })

    it("is a no-op when the id doesn't exist", async () => {
      await saveComments(VAULT, [makeComment({ id: "keep" })])
      await deleteComment(VAULT, "nonexistent")
      const all = await loadComments(VAULT)
      expect(all.map((c) => c.id)).toEqual(["keep"])
    })
  })

  describe("resolveComment", () => {
    it("flips resolved to true while leaving other fields intact", async () => {
      const original = makeComment({ id: "x", body: "todo", resolved: false })
      await saveComments(VAULT, [original])
      await resolveComment(VAULT, "x")
      const all = await loadComments(VAULT)
      expect(all[0].resolved).toBe(true)
      expect(all[0].body).toBe("todo")
    })
  })
})

describe("comments helpers", () => {
  describe("makeLineSnippet", () => {
    it("truncates to SNIPPET_MAX chars", () => {
      const long = "x".repeat(SNIPPET_MAX + 50)
      expect(makeLineSnippet(long).length).toBe(SNIPPET_MAX)
    })

    it("flattens line breaks to spaces", () => {
      expect(makeLineSnippet("foo\r\nbar")).toBe("foo bar")
    })
  })

  describe("toRelativePath / toAbsolutePath", () => {
    it("converts vault-internal absolute paths to relative", () => {
      expect(toRelativePath("/vault/notes/a.md", "/vault")).toBe("notes/a.md")
    })

    it("normalises backslashes when matching the vault prefix", () => {
      expect(toRelativePath("C:\\vault\\notes\\a.md", "C:\\vault")).toBe("notes/a.md")
    })

    it("leaves external paths untouched", () => {
      expect(toRelativePath("/elsewhere/a.md", "/vault")).toBe("/elsewhere/a.md")
    })

    it("rebuilds an absolute path from a relative one", () => {
      expect(toAbsolutePath("notes/a.md", "/vault")).toBe("/vault/notes/a.md")
    })

    it("leaves already-absolute paths alone", () => {
      expect(toAbsolutePath("/elsewhere/a.md", "/vault")).toBe("/elsewhere/a.md")
    })
  })

  describe("isCommentInSync", () => {
    const file = "first line\nsecond line\nthird line"

    it("is true when snippet matches the recorded line", () => {
      const c = makeComment({ line: 2, lineSnippet: "second line" })
      expect(isCommentInSync(c, file)).toBe(true)
    })

    it("is false when the recorded line has changed", () => {
      const c = makeComment({ line: 2, lineSnippet: "second line" })
      const edited = "first line\nMOVED\nthird line"
      expect(isCommentInSync(c, edited)).toBe(false)
    })

    it("is false when the line number is past EOF", () => {
      const c = makeComment({ line: 99, lineSnippet: "x" })
      expect(isCommentInSync(c, file)).toBe(false)
    })

    it("treats empty snippet as 'in sync' (legacy entries)", () => {
      const c = makeComment({ line: 2, lineSnippet: "" })
      expect(isCommentInSync(c, file)).toBe(true)
    })
  })

  describe("generateCommentId", () => {
    it("generates unique-looking ids", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateCommentId()))
      expect(ids.size).toBe(100)
    })
  })
})
