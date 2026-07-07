import { describe, expect, it } from "vitest"
import { randomSuffix, tempFileNameFor } from "./atomicWrite"

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
  it("dot-prefixes the basename and appends a tmp- suffix", () => {
    expect(tempFileNameFor("note.md", "abc123")).toBe(".note.md.tmp-abc123")
  })

  it("produces a name that starts with '.' — hidden from buildTree's dotfile filter", () => {
    const name = tempFileNameFor("chapter1.tex")
    expect(name.startsWith(".")).toBe(true)
  })

  it("keeps the original basename recognizable inside the temp name", () => {
    const name = tempFileNameFor("references.bib", "deadbeef0000")
    expect(name).toBe(".references.bib.tmp-deadbeef0000")
  })

  it("generates a fresh random suffix per call when none is supplied", () => {
    const a = tempFileNameFor("note.md")
    const b = tempFileNameFor("note.md")
    expect(a).not.toBe(b)
  })
})
