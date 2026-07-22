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

describe("specialBlocksToPandoc", () => {
  it("degrades special blocks to captioned code fences", () => {
    const out = toPandocMarkdownInput(":::truth[Contrapositiva]\n(p → q) ↔ (¬q → ¬p)\n:::")
    expect(out).toContain("**Truth Table — Contrapositiva**")
    expect(out).toContain("```\n(p → q) ↔ (¬q → ¬p)\n```")
    expect(out).not.toContain(":::truth")
  })

  it("omits excalidraw bodies but keeps the caption", () => {
    const out = toPandocMarkdownInput(':::excalidraw[Boceto]\n{"type":"excalidraw"}\n:::')
    expect(out).toContain("**Excalidraw — Boceto**")
    expect(out).not.toContain('{"type":"excalidraw"}')
  })

  it("leaves unclosed blocks and math environments untouched", () => {
    const out = toPandocMarkdownInput(":::pseudocode[X]\nA ← 1")
    expect(out).toContain(":::pseudocode[X]")
  })

  it("handles the ':::code lang' language variant", () => {
    const out = toPandocMarkdownInput(":::code python\nprint('hola')\n:::")
    expect(out).toContain("**Code**")
    expect(out).toContain("```python\nprint('hola')\n```")
  })
})
