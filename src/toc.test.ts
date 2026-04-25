import { describe, expect, it } from "vitest"
import { buildTocMarkdown, extractTocEntries } from "./toc"

describe("toc", () => {
  it("builds a markdown toc with explicit ids and normalized slugs", () => {
    const content = "# Introducción {#intro}\n\n## Método Ágil\n\n#### Ignored"

    expect(extractTocEntries(content)).toEqual([
      { level: 1, text: "Introducción", slug: "intro", line: 1 },
      { level: 2, text: "Método Ágil", slug: "metodo-agil", line: 3 },
    ])
    expect(buildTocMarkdown(content)).toBe("- [Introducción](#intro)\n  - [Método Ágil](#metodo-agil)")
  })
})
