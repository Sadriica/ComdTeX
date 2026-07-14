import { describe, expect, it } from "vitest"
import { randomSuffix, tempFileNameFor, TEMP_FILE_RE } from "./atomicWrite"

describe("randomSuffix", () => {
  it("returns a 12-char lowercase hex string", () => {
    const s = randomSuffix()
    expect(s).toMatch(/^[0-9a-f]{12}$/)
  })

  it("is different across calls (collision-safe in practice)", () => {
    const values = new Set(Array.from({ length: 200 }, () => randomSuffix()))
    expect(values.size).toBe(200)
  })
})

describe("tempFileNameFor", () => {
  it("appends a tmp- suffix to the basename", () => {
    expect(tempFileNameFor("note.md", "abc123")).toBe("note.md.tmp-abc123")
  })

  // Regression: a dot-prefixed temp name is rejected by Tauri's fs scope on
  // Unix (`<vault>/**` cannot match a leading dot), which made every save fail
  // with "forbidden path: /…/.note.md.tmp-…".
  it("never produces a name starting with '.'", () => {
    expect(tempFileNameFor("note.md").startsWith(".")).toBe(false)
  })

  it("strips leading dots so hidden targets get a non-hidden temp file", () => {
    expect(tempFileNameFor(".comdtex-comments.json", "abc123")).toBe(
      "comdtex-comments.json.tmp-abc123"
    )
    expect(tempFileNameFor(".comdtex-comments.json").startsWith(".")).toBe(false)
  })

  it("keeps the original basename recognizable inside the temp name", () => {
    expect(tempFileNameFor("references.bib", "deadbeef0000")).toBe(
      "references.bib.tmp-deadbeef0000"
    )
  })

  it("generates a fresh random suffix per call when none is supplied", () => {
    const a = tempFileNameFor("note.md")
    const b = tempFileNameFor("note.md")
    expect(a).not.toBe(b)
  })
})

describe("TEMP_FILE_RE", () => {
  it("matches the temp names tempFileNameFor produces, so buildTree hides them", () => {
    for (const base of ["note.md", "chapter1.tex", ".comdtex-comments.json"]) {
      expect(TEMP_FILE_RE.test(tempFileNameFor(base))).toBe(true)
    }
  })

  it("does not match real vault documents", () => {
    for (const name of ["note.md", "references.bib", "notes.tmp.md", "a.tmp-zz.md"]) {
      expect(TEMP_FILE_RE.test(name)).toBe(false)
    }
  })
})
