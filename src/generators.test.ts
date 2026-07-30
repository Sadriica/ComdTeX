import { describe, it, expect } from "vitest"
import {
  parseTasks,
  documentTitle,
  documentDate,
  generateTasks,
  generateCalendar,
  generateIndex,
  runGenerator,
  type SourceFile,
} from "./generators"
import { isGeneratedFile, GENERATED_MARKER } from "./folderRules"

const file = (path: string, content: string): SourceFile => ({ path, content })

describe("parseTasks", () => {
  it("finds tasks with their file and line", () => {
    const items = parseTasks([file("/v/a.md", "texto\n- [ ] uno\n- [x] dos\n")])
    expect(items).toEqual([
      { filePath: "/v/a.md", fileName: "a.md", line: 2, text: "uno", done: false },
      { filePath: "/v/a.md", fileName: "a.md", line: 3, text: "dos", done: true },
    ])
  })

  it("accepts nested tasks and the *, + bullets", () => {
    const items = parseTasks([file("/v/a.md", "  - [ ] anidada\n* [ ] estrella\n+ [X] mas\n")])
    expect(items.map((i) => i.text)).toEqual(["anidada", "estrella", "mas"])
    expect(items[2].done).toBe(true)
  })

  it("ignores non-tasks", () => {
    expect(parseTasks([file("/v/a.md", "- lista normal\n[ ] sin guión\n")])).toEqual([])
  })
})

describe("documentTitle", () => {
  it("prefers the frontmatter title", () => {
    expect(documentTitle(file("/v/a.md", "---\ntitle: Del FM\n---\n\n# Del H1\n"))).toBe("Del FM")
  })

  it("falls back to the H1", () => {
    expect(documentTitle(file("/v/a.md", "# Del H1\n\ntexto"))).toBe("Del H1")
  })

  it("falls back to the filename without extension", () => {
    expect(documentTitle(file("/v/mi-nota.md", "solo texto"))).toBe("mi-nota")
  })
})

describe("documentDate", () => {
  it("reads the frontmatter date", () => {
    expect(documentDate(file("/v/a.md", "---\ndate: 2026-03-04\n---\n"))).toBe("2026-03-04")
  })

  it("reads a date prefix in the filename", () => {
    expect(documentDate(file("/v/2026-03-04-clase.md", "texto"))).toBe("2026-03-04")
  })

  it("returns null when there is no date", () => {
    expect(documentDate(file("/v/a.md", "texto"))).toBeNull()
  })
})

describe("generateTasks", () => {
  const files = [
    file("/v/algebra.md", "# Álgebra\n- [ ] leer cap 1\n- [x] ejercicio 3\n"),
    file("/v/analisis.md", "- [ ] entregar informe\n"),
  ]

  it("groups by file and links back with wikilinks", () => {
    const out = generateTasks(files)
    expect(out).toContain("## [[algebra]]")
    expect(out).toContain("## [[analisis]]")
    expect(out).toContain("- [ ] leer cap 1")
    expect(out).toContain("- [x] ejercicio 3")
  })

  it("summarises how much is left", () => {
    expect(generateTasks(files)).toContain("**2 pendientes**")
  })

  it("puts pending tasks before completed ones inside a file", () => {
    const out = generateTasks([file("/v/a.md", "- [x] hecha\n- [ ] pendiente\n")])
    expect(out.indexOf("- [ ] pendiente")).toBeLessThan(out.indexOf("- [x] hecha"))
  })

  it("is marked as generated so it can be safely overwritten", () => {
    expect(isGeneratedFile(generateTasks(files))).toBe(true)
    expect(generateTasks(files)).toContain(GENERATED_MARKER)
  })

  it("says so when there are no tasks", () => {
    expect(generateTasks([file("/v/a.md", "solo prosa")])).toContain("No hay tareas")
  })
})

describe("generateCalendar", () => {
  const files = [
    file("/v/2026-03-04-clase.md", "# Derivadas"),
    file("/v/2026-04-01-clase.md", "# Integrales"),
    file("/v/apuntes.md", "# Sueltos"),
  ]

  it("orders newest first and groups by month", () => {
    const out = generateCalendar(files)
    expect(out.indexOf("2026-04")).toBeLessThan(out.indexOf("2026-03"))
    expect(out).toContain("## 2026-04")
  })

  it("keeps undated notes instead of dropping them", () => {
    const out = generateCalendar(files)
    expect(out).toContain("## Sin fecha")
    expect(out).toContain("[[apuntes]]")
  })

  it("is marked as generated", () => {
    expect(isGeneratedFile(generateCalendar(files))).toBe(true)
  })
})

describe("generateIndex", () => {
  it("lists notes alphabetically with their title", () => {
    const out = generateIndex([
      file("/v/zeta.md", "# Última"),
      file("/v/alfa.md", "# Primera"),
    ])
    expect(out.indexOf("[[alfa]]")).toBeLessThan(out.indexOf("[[zeta]]"))
    expect(out).toContain("[[alfa]] — Primera")
  })

  it("omits the title when it just repeats the filename", () => {
    expect(generateIndex([file("/v/alfa.md", "texto")])).toContain("- [[alfa]]\n")
  })
})

describe("runGenerator", () => {
  const files = [file("/v/a.md", "# A\n- [ ] x\n")]

  it.each(["tasks", "calendar", "index"] as const)("dispatches %s", (type) => {
    const out = runGenerator(type, files)
    expect(out).toContain(GENERATED_MARKER)
    expect(out.length).toBeGreaterThan(GENERATED_MARKER.length)
  })

  it("honours a custom title", () => {
    expect(runGenerator("tasks", files, "Mis pendientes")).toContain("# Mis pendientes")
  })
})
