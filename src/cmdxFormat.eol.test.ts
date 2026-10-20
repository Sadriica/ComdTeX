import { describe, it, expect } from "vitest"
import { renameLineEnding, toDiskContent, toEditorContent, usesCrlf } from "./cmdxFormat"

const CASES: Array<[string, string]> = [
  ["plain.md", "# T\r\n\r\nhello\r\nworld\r\n"],
  ["callout.md", "# T\r\n\r\n> [!tip] Hi\r\n> body\r\n\r\ntext\r\n"],
  ["env.md", "> [!abstract] Theorem: P\r\n> body\r\n"],
  ["table.md", "| a | b |\r\n|---|---|\r\n| 1 | 2 |\r\n"],
  ["doc.tex", "\\section{A}\r\nx\r\n"],
]

describe("line endings survive open and save", () => {
  for (const [path, disk] of CASES) {
    it(`keeps CRLF in ${path}`, () => {
      const editor = toEditorContent(`/v/${path}`, disk)
      expect(editor).not.toContain("\r")
      expect(toDiskContent(`/v/${path}`, editor)).toBe(disk)
    })
  }

  it("keeps LF files LF, even after the same path was CRLF", () => {
    toEditorContent("/v/a.md", "x\r\ny\r\n")
    const editor = toEditorContent("/v/a.md", "x\ny\n")
    expect(toDiskContent("/v/a.md", editor)).toBe("x\ny\n")
  })

  it("writes CRLF for lines the user added", () => {
    const editor = toEditorContent("/v/b.md", "one\r\ntwo\r\n")
    expect(toDiskContent("/v/b.md", editor + "three\n")).toBe("one\r\ntwo\r\nthree\r\n")
  })

  it("follows a file and a folder through a rename", () => {
    const one = toEditorContent("/v/old.md", "a\r\nb\r\n")
    const two = toEditorContent("/v/dir/c.md", "c\r\nd\r\n")
    renameLineEnding("/v/old.md", "/v/new.md")
    renameLineEnding("/v/dir", "/v/moved")
    expect(toDiskContent("/v/new.md", one)).toBe("a\r\nb\r\n")
    expect(toDiskContent("/v/moved/c.md", two)).toBe("c\r\nd\r\n")
    expect(toDiskContent("/v/old.md", one)).toBe("a\nb\n")
  })

  it("decides by majority", () => {
    expect(usesCrlf("a\r\nb\r\nc\n")).toBe(true)
    expect(usesCrlf("a\nb\nc\r\n")).toBe(false)
    expect(usesCrlf("no breaks")).toBe(false)
  })
})
