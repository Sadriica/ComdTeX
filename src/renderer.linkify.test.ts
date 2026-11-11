import { describe, expect, it } from "vitest"
import { renderMarkdown } from "./renderer"

// linkify read a bare `macros.md` as the web address http://macros.md (.md is
// a country domain), so the welcome file's "Vault > Edit macros.md" was a link
// that opened a browser. A bare name with a file extension is a file.
describe("linkify and file names", () => {
  it("leaves bare file names as text", () => {
    for (const name of ["macros.md", "data/growth.csv", "notes.tex", "fig.png", "run.py"]) {
      const html = renderMarkdown(`Edit ${name} now`)
      expect(html, name).not.toContain("<a ")
      expect(html).toContain(name)
    }
  })

  it("still links real addresses", () => {
    expect(renderMarkdown("See https://comdtex.witara.site/docs")).toContain(
      'href="https://comdtex.witara.site/docs"',
    )
    expect(renderMarkdown("See www.example.org today")).toContain('href="http://www.example.org"')
    expect(renderMarkdown("See example.org today")).toContain('href="http://example.org"')
  })
})
