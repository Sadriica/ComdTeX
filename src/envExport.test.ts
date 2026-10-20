// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { numberEnvironmentsForExport } from "./envExport"
import { toExportMarkdownContent, toPandocMarkdownInput } from "./exportConversion"
import { exportToObsidianMarkdown } from "./obsidianExport"
import { exportReveal } from "./exporter"
import { renderMarkdown } from "./renderer"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"

const DOC = [
  "# Notes",
  "",
  ":::definition[Group]{#def:group}",
  "A group is a set with an operation.",
  ":::",
  "",
  ":::theorem[Pythagoras]{#thm:pyth}",
  "$a^2+b^2=c^2$",
  ":::",
  "",
  ":::lemma{#lem:aux}",
  "An auxiliary fact.",
  ":::",
  "",
  ":::theorem{#thm:second}",
  "Second theorem.",
  ":::",
  "",
  ":::proof",
  "Trivial.",
  ":::",
  "",
  "By @thm:pyth and @thm:second, using @lem:aux and @def:group. Missing: @thm:nope.",
].join("\n")

/** Numbers the preview shows for each environment heading, in document order. */
function previewHeadings(src: string): string[] {
  const html = renderMarkdown(src)
  return [...html.matchAll(/<span class="math-env-label">([^<]*)<\/span>/g)].map((m) => m[1])
}

describe("numberEnvironmentsForExport", () => {
  it("writes the preview's headings and numbers into callouts", () => {
    const out = numberEnvironmentsForExport(DOC, "callout")
    expect(out).toContain("> [!note] Definición 1 (Group)")
    expect(out).toContain("> [!abstract] Teorema 1 (Pythagoras)")
    expect(out).toContain("> [!abstract] Lema 1")
    expect(out).toContain("> [!abstract] Teorema 2")
    expect(out).toContain("> [!success] Demostración")
    expect(out).not.toContain(":::")
  })

  it("agrees with the in-app preview heading for heading", () => {
    const out = numberEnvironmentsForExport(DOC, "bold")
    const exported = [...out.matchAll(/^> \*\*(.+?)\*\*$/gm)].map((m) => m[1])
    expect(exported).toEqual(previewHeadings(DOC))
  })

  it("resolves references to the same text the preview links show", () => {
    const out = numberEnvironmentsForExport(DOC, "callout")
    expect(out).toContain("By Teorema 1 and Teorema 2, using Lema 1 and Definición 1.")
    expect(out).toContain("Missing: Teorema (?).")
    expect(out).not.toMatch(/@thm:/)

    const html = renderMarkdown(DOC)
    expect(html).toMatch(/<a class="env-ref" href="#env-thm:pyth">Teorema 1<\/a>/)
    expect(html).toMatch(/<a class="env-ref" href="#env-thm:second">Teorema 2<\/a>/)
  })

  it("uses a bold lead-in with the preview's full stop rule in bold style", () => {
    const out = numberEnvironmentsForExport(DOC, "bold")
    expect(out).toContain("> **Teorema 1 (Pythagoras).**\n>\n> $a^2+b^2=c^2$")
    expect(out).toContain("> **Demostración**\n>\n> Trivial.")
  })

  it("numbers nested environments in document order and keeps fences intact", () => {
    const src = [
      ":::theorem{#thm:outer}",
      "Outer.",
      "",
      ":::remark",
      "```",
      "code line",
      "```",
      ":::",
      ":::",
      "",
      ":::theorem",
      "Next.",
      ":::",
    ].join("\n")
    const out = numberEnvironmentsForExport(src, "bold")
    expect(out).toContain("> **Teorema 1.**")
    expect(out).toContain("> > **Observación.**")
    expect(out).toContain("> > ```\n> > code line\n> > ```")
    expect(out).toContain("> **Teorema 2.**")
  })

  it("does not touch environments or refs inside code", () => {
    const src =
      "```\n:::theorem\nx\n:::\n```\n\nInline `@thm:a` stays.\n\n:::theorem{#thm:a}\nA\n:::\n\nSee @thm:a."
    const out = numberEnvironmentsForExport(src, "callout")
    expect(out).toContain("```\n:::theorem\nx\n:::\n```")
    expect(out).toContain("`@thm:a`")
    expect(out).toContain("See Teorema 1.")
  })

  it("resolves cross-file references through the resolver", () => {
    const other = ":::definition{#def:x}\nD\n:::\n\n:::definition{#def:y}\nE\n:::"
    const out = numberEnvironmentsForExport("See @notes/other@def:y.", "callout", (p) =>
      p === "notes/other" ? other : null,
    )
    expect(out).toBe("See Definición 2.")
    const broken = numberEnvironmentsForExport("See @gone@def:y.", "callout", () => null)
    expect(broken).toBe("See Definición (?).")
  })

  it("leaves a document without environments untouched", () => {
    const src = "# Title\n\nPlain text with @eq:one and @fig:two."
    expect(numberEnvironmentsForExport(src, "callout")).toBe(src)
  })
})

describe("per-target numbering", () => {
  it("Markdown export (editor path): numbered callouts and resolved refs", () => {
    const out = toExportMarkdownContent(DOC)
    expect(out).toContain("> [!abstract] Teorema 1 (Pythagoras)")
    expect(out).toContain("> [!abstract] Teorema 2")
    expect(out).toContain("By Teorema 1 and Teorema 2")
    expect(out).not.toContain("`thm:pyth`")
  })

  it("Obsidian export (raw buffer path): numbered callouts and resolved refs", () => {
    const out = exportToObsidianMarkdown(DOC)
    expect(out).toContain("> [!note] Definición 1 (Group)")
    expect(out).toContain("> [!lemma] Lema 1")
    expect(out).toContain("using Lema 1 and Definición 1")
    expect(out).not.toContain("{#thm:pyth}")
  })

  it("Pandoc input (DOCX, PDF, Typst, Beamer): numbered bold lead-ins, resolved refs", () => {
    const out = toPandocMarkdownInput(DOC)
    expect(out).toContain("> **Definición 1 (Group).**")
    expect(out).toContain("> **Teorema 1 (Pythagoras).**")
    expect(out).toContain("> **Teorema 2.**")
    expect(out).toContain("By Teorema 1 and Teorema 2, using Lema 1 and Definición 1.")
    expect(out).not.toContain("[!")
    expect(out).not.toContain("@thm:")
  })

  it("Pandoc input keeps a special block nested in an environment legible", () => {
    const out = toPandocMarkdownInput(
      ":::theorem{#thm:a}\n:::truth[T]\np -> q\n:::\n:::\n\nSee @thm:a.",
    )
    expect(out).toContain("> **Teorema 1.**")
    expect(out).toContain("> **Truth Table: T**")
    expect(out).toContain("See Teorema 1.")
  })

  it("Reveal.js export: blockquote slides with numbers and resolved refs", () => {
    const html = exportReveal(DOC, "notes.md")
    expect(html).toContain("> **Teorema 1 (Pythagoras).**")
    expect(html).toContain("> **Lema 1.**")
    expect(html).toContain("By Teorema 1 and Teorema 2")
    expect(html).not.toContain(":::theorem")
  })

  it("HTML export: sanitized preview HTML keeps numbered headings and resolved links", () => {
    const html = sanitizeRenderedHtml(
      renderMarkdown(DOC, {}, undefined, undefined, undefined, undefined, undefined, {
        annotate: false,
      }),
    )
    expect(html).toContain("Teorema 1 (Pythagoras).")
    expect(html).toContain("Teorema 2.")
    expect(html).toContain('id="env-thm:pyth"')
    expect(html).toMatch(/href="#env-thm:pyth"[^>]*>Teorema 1</)
  })
})
