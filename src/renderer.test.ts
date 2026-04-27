// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderMarkdown, annotateSourceLines, buildParagraphLineMap } from "./renderer"

describe("renderMarkdown", () => {
  it("numbers headings without exposing internal anchor text", () => {
    const html = renderMarkdown("# Intro\n\n## Details")

    expect(html).toMatch(/<h1[^>]*>1 Intro<\/h1>/)
    expect(html).toMatch(/<h2[^>]*>1\.1 Details<\/h2>/)
    expect(html).not.toContain("{#sec-")
  })

  describe("display equation labels and references", () => {
    it("strips {#eq:label} from output and resolves @eq:label to (n)", () => {
      const text = `$$ x = 1 $$ {#eq:foo}\n\nSee @eq:foo for details.`
      const html = renderMarkdown(text)

      // Label suffix must be consumed by the renderer (no literal leak).
      expect(html).not.toContain("{#eq:foo}")
      // Renderer wraps the equation block with its number.
      expect(html).toContain('class="eq-block"')
      expect(html).toContain('class="eq-number">(1)')
      // Reference resolves and is linked, not "(?)".
      expect(html).toContain('class="eq-ref">(1)')
      expect(html).not.toContain("(?)")
    })

    it("numbers equations in textual order even when one is inside a :::env block", () => {
      // Regression: previously, `extractEnvironments` rendered nested content
      // recursively before the outer math regex ran, so the inner equation
      // got number 1 and the outer (textually first) got number 2 — leaving
      // the rendered (N) out of sync with `@eq:label` references that use
      // prescan order.
      const text = [
        `$$ a = 1 $$ {#eq:before}`,
        ``,
        `:::theorem[Test]`,
        `$$ b = 2 $$ {#eq:inside}`,
        `:::`,
        ``,
        `$$ c = 3 $$ {#eq:after}`,
        ``,
        `Refs: @eq:before, @eq:inside, @eq:after.`,
      ].join("\n")
      const html = renderMarkdown(text)

      // No leaked label suffixes.
      expect(html).not.toContain("{#eq:before}")
      expect(html).not.toContain("{#eq:inside}")
      expect(html).not.toContain("{#eq:after}")
      // No broken-ref markers.
      expect(html).not.toContain("(?)")

      // Equations rendered in textual order: 1, 2, 3.
      const eqNumbers = [...html.matchAll(/class="eq-number">\((\d+)\)/g)].map(
        (m) => m[1],
      )
      expect(eqNumbers).toEqual(["1", "2", "3"])

      // References resolve to the same numbers in the same order.
      const refNumbers = [...html.matchAll(/class="eq-ref">\((\d+)\)/g)].map(
        (m) => m[1],
      )
      expect(refNumbers).toEqual(["1", "2", "3"])
    })
  })

  describe("source-line annotations (preview ↔ editor sync)", () => {
    it("indexes lists, blockquotes, headings, and paragraphs in buildParagraphLineMap", () => {
      const raw = [
        "# Heading one",       // 1
        "",                     // 2
        "Plain paragraph text.",// 3
        "",                     // 4
        "- first item",         // 5
        "- second item",        // 6
        "",                     // 7
        "> quoted line",        // 8
      ].join("\n")
      const map = buildParagraphLineMap(raw)
      expect(map.get("Heading one")).toEqual([1])
      expect(map.get("Plain paragraph text.")).toEqual([3])
      expect(map.get("first item")).toEqual([5])
      expect(map.get("second item")).toEqual([6])
      expect(map.get("quoted line")).toEqual([8])
    })

    it("annotates rendered headings, paragraphs and list items with data-source-line", () => {
      const raw = [
        "# Title",        // line 1
        "",                // 2
        "First paragraph.",// 3
        "",                // 4
        "- one",           // 5
        "- two",           // 6
      ].join("\n")
      const html = renderMarkdown(raw)
      expect(html).toMatch(/<h1[^>]*data-source-line="1"/)
      expect(html).toMatch(/<p[^>]*data-source-line="3"[^>]*>First paragraph/)
      expect(html).toMatch(/<li[^>]*data-source-line="5"[^>]*>one/)
      expect(html).toMatch(/<li[^>]*data-source-line="6"[^>]*>two/)
    })

    it("standalone annotateSourceLines adds data-source-line to matching blocks", () => {
      const raw = "Hello world\n\nAnother line"
      const html = "<p>Hello world</p>\n<p>Another line</p>"
      const annotated = annotateSourceLines(html, raw)
      expect(annotated).toMatch(/<p[^>]*data-source-line="1"[^>]*>Hello world/)
      expect(annotated).toMatch(/<p[^>]*data-source-line="3"[^>]*>Another line/)
    })
  })

  describe("block ids", () => {
    it("renders a paragraph trailing ^id with id='block-id' and removes the marker", () => {
      const html = renderMarkdown("Important paragraph. ^key-finding")
      expect(html).toMatch(/id="block-key-finding"/)
      expect(html).not.toContain("^key-finding")
    })
  })
})
