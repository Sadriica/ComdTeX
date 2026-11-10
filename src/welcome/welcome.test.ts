// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { renderMarkdown } from "../renderer"
import { lintContent, type LintContext } from "../contentLinter"
import { findVaultFile } from "../vaultResolve"
import { setUiLanguage } from "../docLang"
import { en } from "../i18n/en"
import { es } from "../i18n/es"
import type { Lang } from "../i18n/types"
import {
  EXAMPLES_DIR,
  WELCOME_FILENAME,
  WELCOME_VERSION,
  backupCandidate,
  classifyWelcome,
  exampleFiles,
  noFileContent,
  welcomeContent,
  welcomeVersion,
} from "./index"
import { ensureWelcome, restoreWelcome, type WelcomeFs } from "./seed"
// The welcome file every vault received up to 1.32.0.
import legacy132 from "./fixtures/legacy-1.32.md?raw"

const LANGS: Lang[] = ["en", "es"]
const VAULT = "/vault"
const Severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const

beforeAll(() => {
  // Images resolve through Tauri's asset protocol in the renderer.
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    convertFileSrc: (p: string) => `asset://${p}`,
  }
})
afterEach(() => setUiLanguage("es"))

/** The vault exactly as a new vault receives it. */
function vaultFiles(lang: Lang) {
  return [{ path: WELCOME_FILENAME, content: welcomeContent(lang) }, ...exampleFiles(lang)].map(
    (f) => ({ path: `${VAULT}/${f.path}`, name: f.path.split("/").pop()!, content: f.content }),
  )
}

const notes = (lang: Lang) => vaultFiles(lang).filter((f) => f.name.endsWith(".md"))

function lint(lang: Lang, file: { path: string; content: string }) {
  const files = vaultFiles(lang)
  const ctx: LintContext = {
    vaultFileNames: new Set(files.map((f) => f.name.replace(/\.md$/, ""))),
    bibKeys: new Set(),
    messages: (lang === "en" ? en : es).lint.messages,
    dataResolver: (t) => findVaultFile(files, t)?.content ?? null,
    docPath: file.path,
    vaultPath: VAULT,
    vaultFilePaths: new Set(files.map((f) => f.path)),
  }
  return lintContent(file.content, ctx, Severity as never)
}

function render(lang: Lang, file: { path: string; content: string }): string {
  setUiLanguage(lang)
  const files = vaultFiles(lang)
  const names = new Set(files.map((f) => f.name.replace(/\.md$/, "")))
  const html = renderMarkdown(
    file.content,
    {},
    VAULT,
    names,
    undefined,
    (t) => findVaultFile(files, t)?.content ?? null,
    undefined,
    { docPath: file.path } as never,
  )
  // Text only, without KaTeX's source annotations (they repeat the input).
  return html
    .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
}

describe.each(LANGS)("welcome files (%s)", (lang) => {
  it("lint without errors, warnings or notes", () => {
    for (const file of notes(lang)) {
      expect(
        lint(lang, file).map((m) => `${m.code} line ${m.startLineNumber}: ${m.message}`),
        file.name,
      ).toEqual([])
    }
  })

  it("render every block with nothing missing", () => {
    for (const file of notes(lang)) {
      const text = render(lang, file)
      expect(text, file.name).not.toMatch(/not found|no se encontr|\(\?\)/i)
      // Shorthands are expanded everywhere, display math included.
      expect(text, file.name).not.toMatch(/\b(?:frac|sum|lim|sup|si|val)\(\w/)
    }
  })

  it("show the pipeline values, accession links and supplement numbers", () => {
    const [welcome, biology] = notes(lang)
    const w = render(lang, welcome)
    expect(w).toContain("0.73")
    const html = renderMarkdown(
      biology.content,
      {},
      VAULT,
      undefined,
      undefined,
      (t) => findVaultFile(vaultFiles(lang), t)?.content ?? null,
    )
    // Values reach KaTeX as source, so check the math annotations.
    expect(html).toContain("p &lt; 0.001")
    expect(html).toMatch(/n = 48\b/)
    expect(html).toContain("0.914")
    expect(render(lang, biology)).toMatch(/S1/)
    expect(html).toContain("ncbi.nlm.nih.gov")
  })

  it("only point at files the vault receives", () => {
    const paths = new Set(vaultFiles(lang).map((f) => f.path))
    for (const file of notes(lang)) {
      const dir = file.path.slice(0, file.path.lastIndexOf("/"))
      for (const m of file.content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
        expect(paths.has(`${dir}/${m[1]}`), `${file.name}: ${m[1]}`).toBe(true)
      }
      for (const m of file.content.matchAll(/^(comdtex-examples\/\S+)$/gm)) {
        expect(paths.has(`${VAULT}/${m[1]}`), `${file.name}: ${m[1]}`).toBe(true)
      }
    }
  })

  it("have a no-file preview with nothing left raw", () => {
    const text = render(lang, { path: `${VAULT}/none.md`, content: noFileContent(lang) })
    expect(text).not.toMatch(/\b(?:frac|sum|sqrt|sup)\(\w/)
    expect(noFileContent(lang)).toContain("comdtex.md")
  })

  it("carry the current version marker", () => {
    for (const file of notes(lang)) expect(welcomeVersion(file.content)).toBe(WELCOME_VERSION)
    expect(classifyWelcome(welcomeContent(lang))).toEqual({ kind: "current" })
  })
})

describe("English and Spanish templates", () => {
  const shape = (text: string) => ({
    blocks: [...text.matchAll(/^:::(?:sm |lg )?(\w+)/gm)].map((m) => m[1]),
    headings: [...text.matchAll(/^#{1,6} /gm)].length,
    labels: [...text.matchAll(/\{#(\w+):/g)].map((m) => m[1]),
    fences: [...text.matchAll(/^```(\w*)/gm)].map((m) => m[1]),
  })
  it("have the same structure", () => {
    expect(shape(welcomeContent("es"))).toEqual(shape(welcomeContent("en")))
    expect(shape(exampleFiles("es")[0].content)).toEqual(shape(exampleFiles("en")[0].content))
  })
})

describe("classifyWelcome", () => {
  it("reads an untouched 1.32 copy as outdated and pristine", () => {
    expect(classifyWelcome(legacy132)).toEqual({ kind: "outdated", pristine: true })
  })

  it("reads the em dashes and callout lines older builds wrote as untouched", () => {
    const older = legacy132
      .replace("# Mi Vault: ComdTeX", "# Mi Vault — ComdTeX")
      .replace(":::definition[Función continua]", "> [!note] definition[Función continua]")
    expect(classifyWelcome(older)).toEqual({ kind: "outdated", pristine: true })
    expect(classifyWelcome(`${older}\nA line of my own.\n`)).toEqual({
      kind: "outdated",
      pristine: false,
    })
  })

  it("keeps a copy that became the owner's own note", () => {
    const own = ["# Thesis notes", ...Array.from({ length: 40 }, (_, i) => `Idea number ${i}`)]
    expect(classifyWelcome(`${legacy132.slice(0, 300)}\n${own.join("\n")}`)).toEqual({
      kind: "custom",
    })
    expect(classifyWelcome("# Short")).toEqual({ kind: "custom" })
  })
})

describe("backupCandidate", () => {
  it("puts -old before the extension", () => {
    expect(backupCandidate("/v/comdtex.md", 1)).toBe("/v/comdtex-old.md")
    expect(backupCandidate("/v/comdtex-examples/stats.csv", 3)).toBe(
      "/v/comdtex-examples/stats-old-3.csv",
    )
  })
})

/** A small in-memory filesystem with the same contract as the real one. */
function memoryFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial))
  const fs: WelcomeFs = {
    read: async (p) => files.get(p) ?? null,
    write: async (p, c) => {
      files.set(p, c)
    },
    mkdir: async () => {},
  }
  return { fs, files }
}

describe("ensureWelcome", () => {
  const welcomePath = `${VAULT}/${WELCOME_FILENAME}`

  it("seeds a new vault with the welcome file and every example", async () => {
    const { fs, files } = memoryFs()
    expect(await ensureWelcome(fs, VAULT, "en", false)).toEqual({ kind: "created" })
    expect(files.get(welcomePath)).toBe(welcomeContent("en"))
    for (const f of exampleFiles("en")) expect(files.get(`${VAULT}/${f.path}`)).toBe(f.content)
  })

  it("does not bring back a welcome file the owner deleted", async () => {
    const { fs, files } = memoryFs()
    expect(await ensureWelcome(fs, VAULT, "en", true)).toEqual({ kind: "absent" })
    expect(files.size).toBe(0)
  })

  it("replaces an untouched old copy without a backup", async () => {
    const { fs, files } = memoryFs({ [welcomePath]: legacy132 })
    expect(await ensureWelcome(fs, VAULT, "es", true)).toEqual({ kind: "updated", backup: null })
    expect(files.get(welcomePath)).toBe(welcomeContent("es"))
    expect(files.has(`${VAULT}/${EXAMPLES_DIR}/stats.csv`)).toBe(true)
  })

  it("keeps an edited old copy as comdtex-old.md before replacing it", async () => {
    const edited = `${legacy132}\nMy own line.\n`
    const { fs, files } = memoryFs({ [welcomePath]: edited, [`${VAULT}/comdtex-old.md`]: "taken" })
    const outcome = await ensureWelcome(fs, VAULT, "en", true)
    expect(outcome).toEqual({ kind: "updated", backup: `${VAULT}/comdtex-old-2.md` })
    expect(files.get(`${VAULT}/comdtex-old-2.md`)).toBe(edited)
    expect(files.get(`${VAULT}/comdtex-old.md`)).toBe("taken")
    expect(files.get(welcomePath)).toBe(welcomeContent("en"))
  })

  it("leaves current and custom copies, and existing example files, alone", async () => {
    const own = `# My index\n\n${Array.from({ length: 30 }, (_, i) => `- [[note-${i}]]`).join("\n")}`
    const stats = `${VAULT}/${EXAMPLES_DIR}/stats.csv`
    for (const text of [welcomeContent("en"), own]) {
      const { fs, files } = memoryFs({ [welcomePath]: text, [stats]: "metric,value\nn,1\n" })
      expect(await ensureWelcome(fs, VAULT, "en", true)).toEqual({ kind: "kept" })
      expect(files.get(welcomePath)).toBe(text)
      expect(files.get(stats)).toBe("metric,value\nn,1\n")
      expect(files.size).toBe(2)
    }
  })
})

describe("restoreWelcome", () => {
  it("rewrites everything, keeping changed files as -old, and is idempotent", async () => {
    const own = "# Mine\n"
    const stats = `${VAULT}/${EXAMPLES_DIR}/stats.csv`
    const { fs, files } = memoryFs({ [`${VAULT}/comdtex.md`]: own, [stats]: "edited\n" })
    const first = await restoreWelcome(fs, VAULT, "en")
    expect(first.backups).toEqual([
      `${VAULT}/comdtex-old.md`,
      `${VAULT}/${EXAMPLES_DIR}/stats-old.csv`,
    ])
    expect(files.get(`${VAULT}/comdtex-old.md`)).toBe(own)
    expect(files.get(`${VAULT}/${EXAMPLES_DIR}/stats-old.csv`)).toBe("edited\n")
    expect(first.written).toHaveLength(1 + exampleFiles("en").length)

    const second = await restoreWelcome(fs, VAULT, "en")
    expect(second).toEqual({ written: [], backups: [] })
  })

  it("replaces an untouched old welcome without keeping a copy", async () => {
    const { fs, files } = memoryFs({ [`${VAULT}/comdtex.md`]: legacy132 })
    const { backups } = await restoreWelcome(fs, VAULT, "es")
    expect(backups).toEqual([])
    expect(files.get(`${VAULT}/comdtex.md`)).toBe(welcomeContent("es"))
  })
})
