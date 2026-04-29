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

    it("indexes labels and resolves @eq:refs on the first call even when macros are not loaded yet", () => {
      // Regression: on the first render after opening a vault, `App.tsx` used
      // to compute `previewHtml` before `loadMacros` had resolved. Equations
      // that referenced user-defined macros rendered as red `\macro` source
      // text (KaTeX `throwOnError: false` fallback). The fix gates the preview
      // on `macrosReady`, but the renderer itself must also remain correct
      // when called with an empty macros object — the label-indexing pass
      // must precede the @eq resolution pass on every call so that the
      // textually-first equation gets number 1, etc.
      const text = [
        `$$ \\limgeom{x_n} = 0 $$ {#eq:limite}`,
        ``,
        `$$ e^{i\\pi}+1=0 $$ {#eq:euler}`,
        ``,
        `See @eq:euler and @eq:limite.`,
      ].join("\n")

      // Render twice with empty macros (mirrors first-paint state) and again
      // with macros populated (mirrors post-load state). Equation numbering
      // and reference resolution must be identical and never produce (?).
      const cases: Record<string, string>[] = [{}, { limgeom: "\\lim" }]
      for (const macros of cases) {
        const html = renderMarkdown(text, macros)
        expect(html).not.toContain("(?)")
        expect(html).not.toContain("eq-ref-broken")

        const eqNumbers = [...html.matchAll(/class="eq-number">\((\d+)\)/g)].map((m) => m[1])
        expect(eqNumbers).toEqual(["1", "2"])

        const refNumbers = [...html.matchAll(/class="eq-ref">\((\d+)\)/g)].map((m) => m[1])
        // Refs appear in source order: @eq:euler then @eq:limite → (2), (1).
        expect(refNumbers).toEqual(["2", "1"])
      }
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

  describe(":::code environment", () => {
    it(":::code python yields class=\"language-python\"", () => {
      const html = renderMarkdown(":::code python\nx = 1\n:::")
      expect(html).toContain('<code class="language-python">x = 1</code>')
    })

    it(":::code without language has no class on <code>", () => {
      const html = renderMarkdown(":::code\nplain text\n:::")
      expect(html).toMatch(/<pre><code>plain text<\/code><\/pre>/)
      expect(html).not.toContain("language-")
    })

    it(":::code body is HTML-escaped (XSS-safe)", () => {
      const html = renderMarkdown(":::code\n<script>alert(1)</script>\n:::")
      expect(html).not.toContain("<script>alert(1)</script>")
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    })

    it(":::code wraps in env-wrap with data-source-line", () => {
      const html = renderMarkdown("line1\n\n:::code\nbody\n:::")
      expect(html).toMatch(/<div class="env-wrap" data-source-line="\d+"><pre><code>body<\/code><\/pre><\/div>/)
    })

    it("triple-backtick fences still render normally (regression)", () => {
      const html = renderMarkdown("```python\nx = 1\n```")
      expect(html).toContain("language-python")
      expect(html).toContain("x = 1")
    })
  })
})
