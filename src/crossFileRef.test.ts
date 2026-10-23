import { describe, expect, it } from "vitest"
import { lintContent, type LintContext } from "./contentLinter"
import { crossFileRefText, refPathTarget } from "./crossFileRef"
import { prescanEnvironmentLabels, resolveEnvironmentRefs } from "./environments"
import { LintVaultIndex } from "./lintVault"
import { NavDb, constructsInLine } from "./navScan"

const TARGET = "/v/Álgebra/Teoría.md"
const TARGET_TEXT = ":::proposition[Grupos]{#prop:grupos}\nTodo grupo.\n:::\n"

describe("cross-file reference text", () => {
  it("is bare only when the readers can read it bare", () => {
    expect(refPathTarget("notes/mixing-times")).toBe("notes/mixing-times")
    expect(refPathTarget("my folder/note")).toBe("[my folder/note]")
    expect(refPathTarget("Álgebra/Teoría")).toBe("[Álgebra/Teoría]")
    expect(refPathTarget("c++/notes")).toBe("[c++/notes]")
    expect(crossFileRefText("Álgebra/Teoría", "prop:grupos")).toBe("@[Álgebra/Teoría]@prop:grupos")
  })

  it("round trip: the written reference resolves, lints clean and jumps", () => {
    const ref = crossFileRefText("Álgebra/Teoría", "prop:grupos")

    // The preview resolves it (a bare accented path rendered "(?)").
    const html = resolveEnvironmentRefs(`ver ${ref}`, new Map(), (p) =>
      p === "Álgebra/Teoría" ? TARGET_TEXT : null,
    )
    expect(html).not.toContain("(?)")
    expect(html).toContain("env-ref-cross")
    expect(prescanEnvironmentLabels(TARGET_TEXT).has("prop:grupos")).toBe(true)

    // The linter finds the note and the label.
    const index = new LintVaultIndex()
    const vaultDocs = [
      ...index.update([
        { path: "/v/a.md", name: "a.md", content: "x" },
        { path: TARGET, name: "Teoría.md", content: TARGET_TEXT },
      ]),
    ]
    const ctx: LintContext = {
      vaultFileNames: new Set(),
      bibKeys: new Set(),
      vaultDocs,
      docPath: "/v/a.md",
    }
    const severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as never
    expect(lintContent(ref, ctx, severity).map((m) => m.code)).toEqual([])

    // F12 lands on the definition in that note.
    const [found] = constructsInLine(ref)
    expect(found).toMatchObject({ type: "ref", id: "prop:grupos", docPath: "Álgebra/Teoría" })
    const db = new NavDb([
      { path: "/v/a.md", name: "a.md", content: ref },
      { path: TARGET, name: "Teoría.md", content: TARGET_TEXT },
    ])
    const hits = db.resolveRef({ id: "prop:grupos", docPath: "Álgebra/Teoría" }, "/v/a.md")
    expect(hits.map((h) => h.file.path)).toEqual([TARGET])
  })

  it("matches a path whatever the Unicode normalization of the file name", () => {
    const nfd = "/v/Álgebra/Teoría.md".normalize("NFD")
    const db = new NavDb([{ path: nfd, name: "Teoría.md", content: TARGET_TEXT }])
    const hits = db.resolveRef(
      { id: "prop:grupos", docPath: "Álgebra/Teoría".normalize("NFC") },
      "/v/a.md",
    )
    expect(hits).toHaveLength(1)
  })
})
