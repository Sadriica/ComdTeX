import { describe, expect, it } from "vitest"
import { toExportMarkdownContent, toPandocMarkdownInput } from "./exportConversion"

describe("exportConversion", () => {
  it("makes user-facing markdown export Obsidian-clean", () => {
    const output = toExportMarkdownContent("# Intro {#sec:intro}\n\n:::theorem[Main] {#thm:main}\nBody\n:::\n\nVer @sec:intro")

    expect(output).toContain("# Intro")
    expect(output).toContain("> [!abstract] Theorem: Main")
    expect(output).toContain("`sec:intro`")
    expect(output).not.toContain("{#sec:intro}")
    expect(output).not.toContain("{#thm:main}")
  })

  it("keeps Pandoc markdown inputs closer to storage markdown", () => {
    const output = toPandocMarkdownInput("# Intro {#sec:intro}\n\n:::note\nBody\n:::")

    expect(output).toContain("# Intro {#sec:intro}")
    expect(output).toContain("> [!note]")
  })
})
