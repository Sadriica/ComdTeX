import { afterEach, describe, expect, it } from "vitest"
import {
  getUiLanguage,
  parseLanguageTag,
  previewLangTag,
  resolveDocLanguage,
  setUiLanguage,
} from "./docLang"
import { renderMarkdown } from "./renderer"
import { numberEnvironmentsForExport } from "./envExport"
import { toExportMarkdownContent } from "./exportConversion"
import { ALL_ENVS } from "./environments"
import { parseBibtex } from "./bibtex"
import { analyzeExportCompatibility } from "./exportCompatibility"
import { en } from "./i18n/en"
import { es } from "./i18n/es"

afterEach(() => setUiLanguage("es"))

const DOC = [
  ":::definition[Expander]{#def:exp}",
  "A graph.",
  ":::",
  "",
  ":::theorem[Mixing]",
  "See @def:exp.",
  ":::",
  "",
  ":::proof",
  "Done.",
  ":::",
].join("\n")

describe("parseLanguageTag", () => {
  it("reads common spellings", () => {
    expect(parseLanguageTag("en")).toBe("en")
    expect(parseLanguageTag("en-US")).toBe("en")
    expect(parseLanguageTag("English")).toBe("en")
    expect(parseLanguageTag("es_ES")).toBe("es")
    expect(parseLanguageTag("Español")).toBe("es")
    expect(parseLanguageTag("fr")).toBeNull()
    expect(parseLanguageTag(3)).toBeNull()
  })
  it("prefers the document over the interface language", () => {
    expect(resolveDocLanguage({ lang: "en" }, "es")).toBe("en")
    expect(resolveDocLanguage({ language: "es" }, "en")).toBe("es")
    expect(resolveDocLanguage({}, "en")).toBe("en")
    expect(resolveDocLanguage(null)).toBe(getUiLanguage())
  })
})

describe("preview words follow the language", () => {
  it("keeps Spanish by default", () => {
    const html = renderMarkdown(DOC)
    expect(html).toContain("Definición 1")
    expect(html).toContain("Teorema 1")
    expect(html).toContain("Demostración")
    expect(html).not.toContain("Theorem")
  })

  it("uses the render language option for the interface language", () => {
    const html = renderMarkdown(DOC, {}, undefined, undefined, undefined, undefined, undefined, {
      lang: "en",
    })
    expect(html).toContain("Definition 1")
    expect(html).toContain("Theorem 1")
    expect(html).toContain("Proof")
    expect(html).toContain(">Definition 1</a>")
    expect(html).not.toContain("Definición")
    expect(html).not.toContain("Demostración")
  })

  it("lets the document frontmatter override the interface language", () => {
    const html = renderMarkdown(`---\nlang: en\n---\n${DOC}`)
    expect(html).toContain("Theorem 1")
    const back = renderMarkdown(
      `---\nlang: es\n---\n${DOC}`,
      {},
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        lang: "en",
      },
    )
    expect(back).toContain("Teorema 1")
  })

  it("translates figures, tables and the bibliography", () => {
    const bib = parseBibtex("@book{a, author={Rudin, W.}, year={1976}, title={A}}")
    const md = "![Cap](x.png){#fig:x}\n\nSee @fig:x and [@a] and [@zz].\n"
    const html = renderMarkdown(md, {}, undefined, undefined, bib, undefined, undefined, {
      lang: "en",
    })
    expect(html).toContain("Figure 1")
    expect(html).toContain("<h2>References</h2>")
    expect(html).toContain("Key not found: zz")
    const spanish = renderMarkdown(md, {}, undefined, undefined, bib)
    expect(spanish).toContain("Figura 1")
    expect(spanish).toContain("<h2>Referencias</h2>")
  })

  it("does not leak the document language into the next render", () => {
    renderMarkdown(`---\nlang: en\n---\n${DOC}`)
    expect(renderMarkdown(DOC)).toContain("Teorema 1")
  })
})

describe("non-LaTeX exports", () => {
  it("use the interface language by default", () => {
    setUiLanguage("en")
    const out = numberEnvironmentsForExport(DOC, "bold")
    expect(out).toContain("**Definition 1 (Expander).**")
    expect(out).toContain("Definition 1")
    expect(out).not.toContain("Definición")
  })

  it("prefer the document's own language", () => {
    setUiLanguage("en")
    const out = numberEnvironmentsForExport(`---\nlang: es\n---\n${DOC}`, "bold")
    expect(out).toContain("**Definición 1 (Expander).**")
    expect(out).toContain("Definición 1")
  })

  it("name the kind of a broken reference in the document language", () => {
    const out = numberEnvironmentsForExport("See @thm:missing.", "bold", undefined, undefined, "en")
    expect(out).toContain("Theorem (?)")
  })

  it("reach the Markdown export", () => {
    setUiLanguage("en")
    expect(toExportMarkdownContent(DOC)).toContain("Definition 1")
  })
})

describe("translations", () => {
  it("environment titles in Spanish match the legacy table", () => {
    for (const [name, info] of Object.entries(ALL_ENVS)) {
      expect(es.docTerms.env[name], name).toBe(info.es)
      expect(en.docTerms.env[name], name).toBeTruthy()
    }
  })

  it("covers every label kind in the Labels panel", () => {
    expect(Object.keys(en.labelsPanel.kindTitles).sort()).toEqual(
      Object.keys(es.labelsPanel.kindTitles).sort(),
    )
    expect(en.labelsPanel.kindTitles.sec).toBe("Sections")
  })

  it("export compatibility messages follow the interface language", () => {
    const md = "```mermaid\n```"
    expect(analyzeExportCompatibility(md, en.documentLab.compat).latexIssues[0].message).toContain(
      "Mermaid should",
    )
    expect(analyzeExportCompatibility(md).latexIssues[0].message).toContain("Mermaid debe")
  })
})

describe("previewLangTag", () => {
  it("passes a well-formed frontmatter tag through, even for a language with no UI words", () => {
    expect(previewLangTag({ lang: "fr" })).toBe("fr")
    expect(previewLangTag({ language: "de_CH" })).toBe("de-CH")
  })

  it("maps spelled-out names to a supported tag", () => {
    expect(previewLangTag({ lang: "english" })).toBe("en")
    expect(previewLangTag({ lang: "Español" })).toBe("es")
  })

  it("falls back to the given language without frontmatter", () => {
    expect(previewLangTag(undefined, "en")).toBe("en")
    expect(previewLangTag({ title: "x" }, "es")).toBe("es")
  })
})
