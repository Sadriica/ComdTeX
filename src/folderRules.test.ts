import { describe, it, expect } from "vitest"
import {
  parseFolderRules,
  serializeFolderRules,
  resolveRulesForDir,
  ancestorChain,
  applyFilenamePattern,
  applyFolderFrontmatter,
  isGeneratedFile,
  GENERATED_MARKER,
  type FolderRules,
} from "./folderRules"

describe("parseFolderRules", () => {
  it("parses a full config", () => {
    const rules = parseFolderRules(JSON.stringify({
      version: 1,
      defaultTemplate: "clase",
      filenamePattern: "{{date:YYYY-MM-DD}}-{{title}}",
      frontmatter: { materia: "Álgebra II", tags: ["algebra"] },
      generated: [{ file: "_tareas.md", type: "tasks", scope: "folder" }],
    }))
    expect(rules).toEqual({
      version: 1,
      defaultTemplate: "clase",
      filenamePattern: "{{date:YYYY-MM-DD}}-{{title}}",
      frontmatter: { materia: "Álgebra II", tags: ["algebra"] },
      generated: [{ file: "_tareas.md", type: "tasks", scope: "folder" }],
    })
  })

  it("returns null on malformed JSON or a non-object", () => {
    expect(parseFolderRules("{not json")).toBeNull()
    expect(parseFolderRules("[]")).toBeNull()
    expect(parseFolderRules("42")).toBeNull()
  })

  it("keeps the good rules when one entry is broken", () => {
    const rules = parseFolderRules(JSON.stringify({
      defaultTemplate: "clase",
      generated: [{ file: "_ok.md", type: "tasks" }, { file: "_bad.md", type: "inventado" }],
    }))
    expect(rules?.defaultTemplate).toBe("clase")
    expect(rules?.generated).toEqual([{ file: "_ok.md", type: "tasks", scope: "folder" }])
  })

  it("refuses a generated file that escapes its folder", () => {
    const rules = parseFolderRules(JSON.stringify({
      generated: [
        { file: "../fuera.md", type: "tasks" },
        { file: "sub/dentro.md", type: "tasks" },
        { file: "ok.md", type: "tasks" },
      ],
    }))
    expect(rules?.generated).toEqual([{ file: "ok.md", type: "tasks", scope: "folder" }])
  })

  it("defaults scope to folder and version to 1", () => {
    const rules = parseFolderRules(JSON.stringify({ generated: [{ file: "i.md", type: "index" }] }))
    expect(rules?.version).toBe(1)
    expect(rules?.generated?.[0].scope).toBe("folder")
  })

  it("round-trips through serialize", () => {
    const original: FolderRules = {
      version: 1,
      defaultTemplate: "clase",
      filenamePattern: "{{date}}-{{title}}",
      generated: [{ file: "_i.md", type: "index", scope: "vault" }],
    }
    expect(parseFolderRules(serializeFolderRules(original))).toEqual(original)
  })
})

describe("ancestorChain", () => {
  it("lists root first, target last", () => {
    expect(ancestorChain("/vault/mate/algebra", "/vault"))
      .toEqual(["/vault", "/vault/mate", "/vault/mate/algebra"])
  })

  it("returns just the root for the root itself", () => {
    expect(ancestorChain("/vault", "/vault")).toEqual(["/vault"])
  })

  it("refuses a path outside the vault", () => {
    expect(ancestorChain("/otro/sitio", "/vault")).toEqual(["/vault"])
  })

  it("tolerates a trailing separator", () => {
    expect(ancestorChain("/vault/mate/", "/vault/")).toEqual(["/vault", "/vault/mate"])
  })
})

describe("resolveRulesForDir", () => {
  const map = new Map<string, FolderRules>([
    ["/v", { version: 1, defaultTemplate: "base", frontmatter: { autor: "Ana" } }],
    ["/v/mate", { version: 1, filenamePattern: "{{date}}-{{title}}", frontmatter: { materia: "Mate" } }],
  ])

  it("inherits from the parent what the child does not define", () => {
    const rules = resolveRulesForDir(map, "/v/mate", "/v")
    expect(rules?.defaultTemplate).toBe("base")
    expect(rules?.filenamePattern).toBe("{{date}}-{{title}}")
  })

  it("merges frontmatter with the nearer folder winning", () => {
    const rules = resolveRulesForDir(map, "/v/mate", "/v")
    expect(rules?.frontmatter).toEqual({ autor: "Ana", materia: "Mate" })
  })

  it("applies an ancestor's rules to a deeper folder", () => {
    const rules = resolveRulesForDir(map, "/v/mate/algebra", "/v")
    expect(rules?.filenamePattern).toBe("{{date}}-{{title}}")
  })

  it("does NOT inherit generated files — they name a concrete file", () => {
    const withGen = new Map<string, FolderRules>([
      ["/v", { version: 1, generated: [{ file: "_i.md", type: "index", scope: "folder" }] }],
    ])
    expect(resolveRulesForDir(withGen, "/v/sub", "/v")?.generated).toBeUndefined()
    expect(resolveRulesForDir(withGen, "/v", "/v")?.generated).toHaveLength(1)
  })

  it("returns null when nothing is configured", () => {
    expect(resolveRulesForDir(new Map(), "/v/mate", "/v")).toBeNull()
  })
})

describe("applyFilenamePattern", () => {
  it("returns the name untouched without a pattern", () => {
    expect(applyFilenamePattern(null, "mi nota")).toBe("mi nota")
    expect(applyFilenamePattern({ version: 1 }, "mi nota")).toBe("mi nota")
  })

  it("substitutes the title into the pattern", () => {
    const rules: FolderRules = { version: 1, filenamePattern: "clase-{{title}}" }
    expect(applyFilenamePattern(rules, "derivadas")).toBe("clase-derivadas")
  })

  it("preserves an explicit extension", () => {
    const rules: FolderRules = { version: 1, filenamePattern: "clase-{{title}}" }
    expect(applyFilenamePattern(rules, "derivadas.md")).toBe("clase-derivadas.md")
  })

  it("expands a date pattern", () => {
    const rules: FolderRules = { version: 1, filenamePattern: "{{date:YYYY}}-{{title}}" }
    const year = new Date().getFullYear()
    expect(applyFilenamePattern(rules, "x")).toBe(`${year}-x`)
  })
})

describe("applyFolderFrontmatter", () => {
  it("adds frontmatter when the document has none", () => {
    const out = applyFolderFrontmatter({ version: 1, frontmatter: { materia: "Mate" } }, "# Hola\n")
    expect(out).toContain("materia: Mate")
    expect(out).toContain("# Hola")
  })

  it("never overwrites a key the document already defines", () => {
    const doc = "---\nmateria: Física\n---\n\n# Hola\n"
    const out = applyFolderFrontmatter({ version: 1, frontmatter: { materia: "Mate" } }, doc)
    expect(out).toContain("materia: Física")
    expect(out).not.toContain("materia: Mate")
  })

  it("adds only the missing keys", () => {
    const doc = "---\ntitle: T\n---\n\ncuerpo\n"
    const out = applyFolderFrontmatter({ version: 1, frontmatter: { materia: "Mate" } }, doc)
    expect(out).toContain("title: T")
    expect(out).toContain("materia: Mate")
    expect(out).toContain("cuerpo")
  })

  it("is a no-op without rules", () => {
    expect(applyFolderFrontmatter(null, "texto")).toBe("texto")
  })
})

describe("isGeneratedFile", () => {
  it("accepts an empty file and one carrying the marker", () => {
    expect(isGeneratedFile("")).toBe(true)
    expect(isGeneratedFile("   \n ")).toBe(true)
    expect(isGeneratedFile(`${GENERATED_MARKER}\n\n# Tareas\n`)).toBe(true)
  })

  it("refuses a file somebody wrote", () => {
    expect(isGeneratedFile("# Mis notas\n\nimportante")).toBe(false)
  })
})
