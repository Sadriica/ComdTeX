import { describe, expect, it, beforeEach } from "vitest"
import { exportToObsidianMarkdown } from "./obsidianExport"
import { setUiLanguage } from "./docLang"

// These assertions use the Spanish document terms (Teorema, Figura, sección). The
// interface defaults to English; English output is covered by the *.lang tests.
beforeEach(() => setUiLanguage("es"))

describe("exportToObsidianMarkdown", () => {
  it("removes structural labels from visible markdown", () => {
    const input =
      "# Intro {#sec:intro}\n\n$$x$$ {#eq:x}\n\n| A |\n|---|\n| 1 |\n{#tbl:a}\n\nVer @eq:x"
    const output = exportToObsidianMarkdown(input)

    expect(output).toContain("# Intro")
    expect(output).not.toContain("{#sec:intro}")
    expect(output).not.toContain("{#tbl:a}")
    expect(output).toContain("`eq:x`")
  })

  it("converts ComdTeX environments to Obsidian callouts", () => {
    const output = exportToObsidianMarkdown(":::theorem[Main]{#thm:main}\nBody\n:::")

    expect(output).toContain("> [!theorem] Teorema 1 (Main)")
    expect(output).toContain("> Body")
    expect(output).not.toContain("{#thm:main}")
  })
})
