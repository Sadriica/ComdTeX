import { describe, expect, it } from "vitest"
import { renderMarkdown } from "./renderer"

describe("renderMarkdown", () => {
  it("numbers headings without exposing internal anchor text", () => {
    const html = renderMarkdown("# Intro\n\n## Details")

    expect(html).toContain("<h1>1 Intro</h1>")
    expect(html).toContain("<h2>1.1 Details</h2>")
    expect(html).not.toContain("{#sec-")
  })
})
