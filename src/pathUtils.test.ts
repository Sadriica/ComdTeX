import { describe, it, expect } from "vitest"
import { pathBasename, pathDirname } from "./pathUtils"

describe("pathBasename", () => {
  it("returns last segment of forward-slash path", () => {
    expect(pathBasename("a/b/c.md")).toBe("c.md")
  })
  it("returns last segment of backslash path", () => {
    expect(pathBasename("a\\b\\c.md")).toBe("c.md")
  })
  it("handles mixed separators", () => {
    expect(pathBasename("a/b\\c.md")).toBe("c.md")
  })
  it("returns the input when there is no separator", () => {
    expect(pathBasename("c.md")).toBe("c.md")
  })
  it("returns empty string for empty input", () => {
    expect(pathBasename("")).toBe("")
  })
})

describe("pathDirname", () => {
  it("returns parent for forward-slash path", () => {
    expect(pathDirname("a/b/c.md")).toBe("a/b")
  })
  it("returns parent for backslash path", () => {
    expect(pathDirname("a\\b\\c.md")).toBe("a\\b")
  })
  it("returns empty string when there is no separator", () => {
    expect(pathDirname("c.md")).toBe("")
  })
  it("handles mixed separators using the last one", () => {
    expect(pathDirname("a/b\\c.md")).toBe("a/b")
  })
})
