import { describe, it, expect } from "vitest"
import { parseBibtex, resolveCitations, renderBibliography, citationsToLatex } from "./bibtex"

const SAMPLE_BIB = `
@book{knuth84,
  author    = {Knuth, Donald E.},
  title     = {The TeXbook},
  year      = {1984},
  publisher = {Addison-Wesley},
}

@article{euler1748,
  author  = {Euler, Leonhard},
  title   = {Introductio in analysin infinitorum},
  journal = {Lausanne},
  year    = {1748},
  volume  = {1},
  pages   = {1--320},
}

@inproceedings{turing1936,
  author    = {Turing, Alan M.},
  title     = {On Computable Numbers},
  booktitle = {Proc. London Mathematical Society},
  year      = {1936},
}
`

describe("parseBibtex", () => {
  it("parses a book entry", () => {
    const map = parseBibtex(SAMPLE_BIB)
    const knuth = map.get("knuth84")
    expect(knuth).toBeDefined()
    expect(knuth!.type).toBe("book")
    expect(knuth!.key).toBe("knuth84")
    expect(knuth!.fields.author).toContain("Knuth")
    expect(knuth!.fields.year).toBe("1984")
    expect(knuth!.fields.title).toContain("TeXbook")
  })

  it("parses an article entry", () => {
    const map = parseBibtex(SAMPLE_BIB)
    const euler = map.get("euler1748")
    expect(euler).toBeDefined()
    expect(euler!.type).toBe("article")
    expect(euler!.fields.journal).toBe("Lausanne")
    expect(euler!.fields.volume).toBe("1")
    expect(euler!.fields.pages).toBe("1--320")
  })

  it("parses inproceedings entry", () => {
    const map = parseBibtex(SAMPLE_BIB)
    const turing = map.get("turing1936")
    expect(turing).toBeDefined()
    expect(turing!.type).toBe("inproceedings")
    expect(turing!.fields.booktitle).toContain("London")
  })

  it("ignores @string, @preamble, @comment entries", () => {
    const bib = `@string{pub = {MIT Press}}\n@comment{ignored}\n@book{mybook, author={A}, title={B}, year={2000}, publisher={C},}`
    const map = parseBibtex(bib)
    expect(map.has("mybook")).toBe(true)
    expect(map.size).toBe(1)
  })

  it("returns empty map for empty input", () => {
    expect(parseBibtex("").size).toBe(0)
  })

  it("returns empty map for input with no entries", () => {
    expect(parseBibtex("% just a comment\n").size).toBe(0)
  })
})

describe("resolveCitations", () => {
  const bibMap = parseBibtex(SAMPLE_BIB)

  it("replaces [@key] with a numbered superscript link", () => {
    const { text } = resolveCitations("See [@knuth84].", bibMap)
    expect(text).toContain("[1]")
    expect(text).toContain('class="cite-ref"')
    expect(text).toContain('href="#bib-knuth84"')
  })

  it("assigns sequential numbers across multiple citations", () => {
    const { text, citedKeys } = resolveCitations("[@knuth84] and [@euler1748]", bibMap)
    expect(text).toContain("[1]")
    expect(text).toContain("[2]")
    expect(citedKeys).toEqual(["knuth84", "euler1748"])
  })

  it("same key cited twice gets the same number", () => {
    const { text, citedKeys } = resolveCitations("[@knuth84] again [@knuth84]", bibMap)
    expect(citedKeys).toHaveLength(1)
    expect(text.match(/\[1\]/g)?.length).toBe(2)
  })

  it("unknown key gets cite-broken class", () => {
    const { text } = resolveCitations("[@unknown]", bibMap)
    expect(text).toContain("cite-broken")
  })

  it("handles [@key, p. 42] with page note", () => {
    const { text } = resolveCitations("[@knuth84, p. 42]", bibMap)
    expect(text).toContain("p. 42")
    expect(text).toContain("[1")
  })

  it("returns ordered citedKeys list", () => {
    const { citedKeys } = resolveCitations("[@turing1936] and [@knuth84]", bibMap)
    expect(citedKeys[0]).toBe("turing1936")
    expect(citedKeys[1]).toBe("knuth84")
  })
})

describe("renderBibliography", () => {
  const bibMap = parseBibtex(SAMPLE_BIB)

  it("returns empty string for empty cited keys", () => {
    expect(renderBibliography([], bibMap)).toBe("")
  })

  it("renders a bibliography section", () => {
    const html = renderBibliography(["knuth84"], bibMap)
    expect(html).toContain('class="bibliography"')
    expect(html).toContain("Referencias")
    expect(html).toContain("[1]")
    expect(html).toContain("Knuth")
    expect(html).toContain("TeXbook")
  })

  it("renders missing entry with bib-missing class", () => {
    const html = renderBibliography(["nonexistent"], bibMap)
    expect(html).toContain("bib-missing")
    expect(html).toContain("nonexistent")
  })

  it("escapes HTML in entry fields", () => {
    const bib = `@book{xss, author={<script>}, title={A & B}, year={2020}, publisher={P},}`
    const map = parseBibtex(bib)
    const html = renderBibliography(["xss"], map)
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&amp;")
  })

  it("sets correct anchor id for bib entries", () => {
    const html = renderBibliography(["knuth84"], bibMap)
    expect(html).toContain('id="bib-knuth84"')
  })
})

describe("citationsToLatex", () => {
  it("converts [@key] to \\cite{key}", () => {
    expect(citationsToLatex("See [@knuth84].")).toBe("See \\cite{knuth84}.")
  })

  it("strips page notes in LaTeX output", () => {
    expect(citationsToLatex("[@knuth84, p. 42]")).toBe("\\cite{knuth84}")
  })

  it("converts multiple citations", () => {
    const result = citationsToLatex("[@a] and [@b]")
    expect(result).toBe("\\cite{a} and \\cite{b}")
  })

  it("leaves non-citation text untouched", () => {
    expect(citationsToLatex("No citations here.")).toBe("No citations here.")
  })
})
