import { describe, expect, it } from "vitest"
import { keepFileExtension } from "./pathUtils"

describe("keepFileExtension", () => {
  it("restores the original extension when the user dropped it", () => {
    expect(keepFileExtension("chapter", "intro.md")).toBe("chapter.md")
  })
  it("treats a dotted name without a known extension as extensionless", () => {
    expect(keepFileExtension("draft.v2", "intro.md")).toBe("draft.v2.md")
  })
  it("respects a known extension typed on purpose", () => {
    expect(keepFileExtension("paper.tex", "intro.md")).toBe("paper.tex")
    expect(keepFileExtension("intro.md", "intro.md")).toBe("intro.md")
  })
  it("leaves names alone when the original had no extension", () => {
    expect(keepFileExtension("x", "LICENSE")).toBe("x")
  })
})
