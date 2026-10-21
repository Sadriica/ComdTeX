import { describe, expect, it } from "vitest"
import {
  displayDestination,
  finalName,
  initialCursorFor,
  relativeFolder,
  stripCursorMarker,
  targetFolder,
  validateName,
} from "./fileNaming"

const ROOT = "/home/w/vault"

describe("targetFolder", () => {
  it("uses the selected folder", () => {
    expect(
      targetFolder({
        vaultRoot: ROOT,
        selectedPath: `${ROOT}/papers`,
        selectedIsDir: true,
        activePath: `${ROOT}/notes/a.md`,
      }),
    ).toBe(`${ROOT}/papers`)
  })

  it("uses the folder of a selected file", () => {
    expect(
      targetFolder({
        vaultRoot: ROOT,
        selectedPath: `${ROOT}/papers/x.md`,
        selectedIsDir: false,
        activePath: `${ROOT}/notes/a.md`,
      }),
    ).toBe(`${ROOT}/papers`)
  })

  it("falls back to the folder of the active note", () => {
    expect(targetFolder({ vaultRoot: ROOT, activePath: `${ROOT}/papers/spectral-gap.md` })).toBe(
      `${ROOT}/papers`,
    )
  })

  it("falls back to the vault root", () => {
    expect(targetFolder({ vaultRoot: ROOT })).toBe(ROOT)
    expect(targetFolder({ vaultRoot: ROOT, activePath: `${ROOT}/a.md` })).toBe(ROOT)
  })

  it("never leaves the vault", () => {
    expect(targetFolder({ vaultRoot: ROOT, activePath: "/etc/passwd" })).toBe(ROOT)
    expect(
      targetFolder({ vaultRoot: ROOT, selectedPath: "/home/w/vault-other", selectedIsDir: true }),
    ).toBe(ROOT)
  })

  it("handles Windows separators", () => {
    expect(targetFolder({ vaultRoot: "C:\\v", activePath: "C:\\v\\papers\\a.md" })).toBe(
      "C:\\v\\papers",
    )
  })
})

describe("relativeFolder and displayDestination", () => {
  it("makes vault-relative folders", () => {
    expect(relativeFolder(ROOT, `${ROOT}/papers/sub`)).toBe("papers/sub")
    expect(relativeFolder(ROOT, ROOT)).toBe("")
    expect(displayDestination("papers", "draft.md")).toBe("papers/draft.md")
    expect(displayDestination("", "draft.md")).toBe("draft.md")
  })
})

describe("finalName", () => {
  it("adds .md and keeps creatable extensions", () => {
    expect(finalName("draft", "file")).toBe("draft.md")
    expect(finalName("refs.bib", "file")).toBe("refs.bib")
    expect(finalName("data.CSV", "file")).toBe("data.CSV")
    expect(finalName("a.typ", "file")).toBe("a.typ")
    expect(finalName("a.tex", "file")).toBe("a.tex")
    expect(finalName("v1.2 notes", "file")).toBe("v1.2 notes.md")
    expect(finalName("name.png", "file")).toBe("name.png.md")
    expect(finalName("name.md", "folder")).toBe("name.md")
  })
})

describe("validateName", () => {
  const siblings = ["Existing.md", "refs.bib", "sub"]
  it("accepts good names", () => {
    expect(validateName("draft", "file", siblings)).toBeNull()
    expect(validateName("draft.tex", "file", siblings)).toBeNull()
    expect(validateName("new-folder", "folder", siblings)).toBeNull()
  })
  it("refuses empty and blank", () => {
    expect(validateName("", "file", siblings)).toBe("empty")
    expect(validateName("   ", "file", siblings)).toBe("edge")
  })
  it("refuses invalid characters on any system", () => {
    for (const c of ["<", ">", ":", '"', "|", "?", "*", "\\", "/", "\u0001"]) {
      expect(validateName(`a${c}b`, "file", [])).toBe("invalidChars")
    }
  })
  it("refuses dots-only, leading/trailing spaces and dots", () => {
    expect(validateName("..", "file", [])).toBe("dotOnly")
    expect(validateName(".", "folder", [])).toBe("dotOnly")
    expect(validateName(".hidden", "file", [])).toBe("edge")
    expect(validateName("name ", "file", [])).toBe("edge")
    expect(validateName(" name", "file", [])).toBe("edge")
    expect(validateName("name.", "folder", [])).toBe("edge")
  })
  it("refuses reserved Windows names", () => {
    expect(validateName("con", "file", [])).toBe("reserved")
    expect(validateName("NUL.md", "file", [])).toBe("reserved")
    expect(validateName("com1", "folder", [])).toBe("reserved")
    expect(validateName("console", "file", [])).toBeNull()
  })
  it("refuses names over 255 characters", () => {
    expect(validateName("a".repeat(256), "folder", [])).toBe("tooLong")
    expect(validateName("a".repeat(252), "file", [])).toBeNull()
    expect(validateName("a".repeat(253), "file", [])).toBe("tooLong")
  })
  it("detects an existing name, also case-insensitively and with the added extension", () => {
    expect(validateName("refs.bib", "file", siblings)).toBe("exists")
    expect(validateName("Existing", "file", siblings)).toBe("exists")
    expect(validateName("existing", "file", siblings)).toBe("existsCase")
    expect(validateName("REFS.BIB", "file", siblings)).toBe("existsCase")
    expect(validateName("sub", "folder", siblings)).toBe("exists")
    expect(validateName("SUB", "folder", siblings)).toBe("existsCase")
  })
  it("renaming: never conflicts with itself, allows a case-only change", () => {
    expect(validateName("Existing.md", "file", siblings, "Existing.md")).toBeNull()
    expect(validateName("existing.md", "file", siblings, "Existing.md")).toBeNull()
    expect(validateName("refs.bib", "file", siblings, "Existing.md")).toBe("exists")
  })
})

describe("initialCursorFor", () => {
  it("puts an empty note at 1,1", () => {
    expect(initialCursorFor("")).toEqual({ line: 1, column: 1 })
  })
  it("honours the {{cursor}} marker", () => {
    expect(initialCursorFor("# T\n\nHello {{cursor}} world")).toEqual({ line: 3, column: 7 })
    expect(stripCursorMarker("a{{cursor}}b")).toBe("ab")
  })
  it("goes under the first heading, skipping frontmatter", () => {
    expect(initialCursorFor("---\ntitle: x\n---\n\n# Title\n\nbody")).toEqual({
      line: 6,
      column: 1,
    })
  })
  it("ignores a # inside frontmatter and falls back to the end", () => {
    expect(initialCursorFor("---\n# not heading\n---\nplain")).toEqual({ line: 4, column: 6 })
  })
  it("sits at the end of a heading that is the last line", () => {
    expect(initialCursorFor("# Title")).toEqual({ line: 1, column: 8 })
  })
})
