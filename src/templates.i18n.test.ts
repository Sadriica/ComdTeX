// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { renderMarkdown } from "./renderer"
import { lintContent, type LintContext } from "./contentLinter"
import { findVaultFile } from "./vaultResolve"
import { setUiLanguage } from "./docLang"
import { en } from "./i18n/en"
import { es } from "./i18n/es"
import type { Lang } from "./i18n/types"
import { TEMPLATES, processTemplateVariables, templateBody } from "./templates"

const LANGS: Lang[] = ["en", "es"]
const VAULT = "/vault"
const Severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const

beforeAll(() => {
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    convertFileSrc: (p: string) => `asset://${p}`,
  }
})
afterEach(() => setUiLanguage("es"))

const builtIns = TEMPLATES.filter((t) => t.id !== "blank")
const nonJournal = builtIns.filter((t) => t.category !== "journal")

/** The body a user gets, variables filled. */
function body(id: string, lang: Lang): string {
  const tpl = TEMPLATES.find((t) => t.id === id)!
  return processTemplateVariables(templateBody(tpl, lang), "my-note.md", lang)
}

/** Notes a template transcludes, so the lint sees a vault where they exist. */
function vaultFor(content: string) {
  const targets = [...content.matchAll(/!\[\[([^\]]+)\]\]/g)].map((m) => m[1])
  return targets.map((t) => ({
    path: `${VAULT}/${t}.md`,
    name: `${t.split("/").pop()}.md`,
    content: "Text.\n",
  }))
}

function lint(lang: Lang, content: string) {
  const files = vaultFor(content)
  const ctx: LintContext = {
    vaultFileNames: new Set(
      files.flatMap((f) => [
        f.name.replace(/\.md$/, "").toLowerCase(),
        f.path
          .slice(VAULT.length + 1)
          .replace(/\.md$/, "")
          .toLowerCase(),
      ]),
    ),
    bibKeys: new Set(["key"]),
    messages: (lang === "en" ? en : es).lint.messages,
    dataResolver: (t) => findVaultFile(files, t)?.content ?? null,
    docPath: `${VAULT}/my-note.md`,
    vaultPath: VAULT,
    vaultFilePaths: new Set(files.map((f) => f.path)),
  }
  return lintContent(content, ctx, Severity as never)
}

function render(lang: Lang, content: string): string {
  setUiLanguage(lang)
  const files = vaultFor(content)
  return renderMarkdown(
    content,
    {},
    VAULT,
    new Set(files.map((f) => f.name.replace(/\.md$/, ""))),
    undefined,
    (t) => findVaultFile(files, t)?.content ?? null,
    undefined,
    { docPath: `${VAULT}/my-note.md` } as never,
  )
}

describe.each(LANGS)("built-in templates (%s)", (lang) => {
  it.each(nonJournal.map((t) => t.id))("%s lints without errors or warnings", (id) => {
    const found = lint(lang, body(id, lang)).filter(
      (m) => m.severity === Severity.Error || m.severity === Severity.Warning,
    )
    expect(found.map((m) => `${m.code} line ${m.startLineNumber}: ${m.message}`)).toEqual([])
  })

  it.each(nonJournal.map((t) => t.id))("%s renders", (id) => {
    const html = render(lang, body(id, lang))
    expect(html).not.toMatch(/env-ref-broken|class="[^"]*error/)
  })
})

describe("template language parity", () => {
  const blocks = (s: string) => [...s.matchAll(/^:::(\w+)/gm)].map((m) => m[1])
  const labels = (s: string) => [...s.matchAll(/\{#[\w:.-]+\}/g)].length
  const headings = (s: string) => [...s.matchAll(/^#{1,6} /gm)].length
  const fmKeys = (s: string) => {
    const m = /^---\n([\s\S]*?)\n---/.exec(s)
    return m ? [...m[1].matchAll(/^([\w.]+):/gm)].map((k) => k[1]) : []
  }

  it.each(nonJournal.map((t) => t.id))("%s has an English body with the same structure", (id) => {
    const tpl = TEMPLATES.find((t) => t.id === id)!
    if (id === "blank") return
    expect(tpl.contentEn).toBeDefined()
    const es_ = tpl.content
    const en_ = tpl.contentEn!
    expect(blocks(en_)).toEqual(blocks(es_))
    expect(labels(en_)).toBe(labels(es_))
    expect(headings(en_)).toBe(headings(es_))
    expect(fmKeys(en_)).toEqual(fmKeys(es_))
  })

  it("leaves journal templates in a single (English) body", () => {
    for (const tpl of TEMPLATES.filter((t) => t.category === "journal")) {
      expect(tpl.contentEn).toBeUndefined()
      expect(templateBody(tpl, "en")).toBe(tpl.content)
    }
  })

  it("keeps a frontmatter lang equal to the body language", () => {
    for (const tpl of nonJournal) {
      for (const [lang, text] of [
        ["en", tpl.contentEn],
        ["es", tpl.content],
      ] as const) {
        const m = /^lang:\s*(\w+)/m.exec(text ?? "")
        if (m) expect(m[1].slice(0, 2)).toBe(lang)
      }
    }
  })

  it("falls back to the stored (Spanish) body when none is English", () => {
    const blank = TEMPLATES.find((t) => t.id === "blank")!
    expect(templateBody(blank, "en")).toBe("")
  })

  it("English bodies carry no Spanish headings or prompts", () => {
    for (const tpl of nonJournal) {
      expect(tpl.contentEn ?? "", tpl.id).not.toMatch(
        /Introducci|Resultados|Conclusiones|Referencias|Definici|Teorema|Ejemplo|Problema|Contexto/,
      )
    }
  })
})
