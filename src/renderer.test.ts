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

  it("keeps soft line breaks in plain paragraphs for preview CSS to display", () => {
    const html = renderMarkdown("Datos:\nIncognitas:\nSolucion:")

    expect(html).toContain("<p>Datos:\nIncognitas:\nSolucion:</p>")
  })

  it("preserves leading indentation on paragraph continuation lines", () => {
    const html = renderMarkdown("**Datos:**\n    $Altura (\\nabla y) = h$")

    expect(html).toContain('class="md-soft-indent"')
    expect(html).toContain("&nbsp;&nbsp;&nbsp;&nbsp;")
    expect(html).toContain('class="katex"')
  })

  it("keeps soft line breaks inside prose environments for preview CSS to display", () => {
    const html = renderMarkdown(":::example\nDatos:\nIncognitas:\nSolucion:\n:::")

    expect(html).toContain('class="math-env math-env-example"')
    expect(html).toContain("<p>Datos:\nIncognitas:\nSolucion:</p>")
  })

  it("renders markdown formatting inside prose environments", () => {
    const html = renderMarkdown(":::example\n**Incognitas:** $t = ?$\n`Dato:` $g = 9.8$\n:::")

    expect(html).toContain('class="math-env math-env-example"')
    expect(html).toContain("<strong>Incognitas:</strong>")
    expect(html).toContain("<code>Dato:</code>")
    expect(html).toContain('class="katex"')
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

    // Regression: `pre` was missing from ANNOTATABLE_SELECTOR, so an indented
    // code block carried no data-source-line. Double-clicking inside it jumped
    // the preview to the nearest annotated block ABOVE (often dozens of lines
    // off), and clicking it in the preview did not move the editor at all.
    it("annotates an indented code block with the line its content starts on", () => {
      const raw = [
        "Guia PMI #8:",                 // 1
        "",                              // 2
        "    -> Estandar",               // 3  <- indented code block starts here
        "        -> Aspectos",           // 4
        "        -> Sistema de valor",   // 5
        "",                              // 6
        "Acta de constitucion.",         // 7
      ].join("\n")
      const html = renderMarkdown(raw)
      // The <pre> is keyed by its FIRST content line, not its joined textContent.
      expect(html).toMatch(/<pre[^>]*data-source-line="3"/)
      // Blocks around it keep their own accurate lines.
      expect(html).toMatch(/<p[^>]*data-source-line="1"[^>]*>Guia PMI #8:/)
      expect(html).toMatch(/<p[^>]*data-source-line="7"[^>]*>Acta de constitucion/)
    })

    it("keeps `->` matchable: arrows are escaped, not rewritten to →", () => {
      const raw = ["Intro:", "", "    -> Estandar", "    -> Aspectos"].join("\n")
      const html = renderMarkdown(raw)
      expect(html).toContain("-&gt; Estandar")
      expect(html).not.toContain("→")
      expect(html).toMatch(/<pre[^>]*data-source-line="3"/)
    })

    it("annotates a fenced code block with its first content line", () => {
      const raw = [
        "Example:",   // 1
        "",            // 2
        "```js",       // 3
        "const a = 1", // 4  <- first content line
        "const b = 2", // 5
        "```",         // 6
        "",            // 7
        "After.",      // 8
      ].join("\n")
      const html = renderMarkdown(raw)
      expect(html).toMatch(/<pre[^>]*data-source-line="4"/)
      expect(html).toMatch(/<p[^>]*data-source-line="8"[^>]*>After/)
      // Fenced content is still rendered verbatim (no regression).
      expect(html).toContain("const a = 1")
      expect(html).toContain("const b = 2")
    })

    it("does not let fenced code content shadow identical prose lines", () => {
      const raw = [
        "```",          // 1
        "duplicate me", // 2
        "```",          // 3
        "",             // 4
        "duplicate me", // 5
      ].join("\n")
      const html = renderMarkdown(raw)
      // The <pre> takes line 2 (its own content); the paragraph keeps line 5.
      expect(html).toMatch(/<pre[^>]*data-source-line="2"/)
      expect(html).toMatch(/<p[^>]*data-source-line="5"[^>]*>duplicate me/)
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
      expect(html).toMatch(/<pre[^>]*><code>plain text<\/code><\/pre>/)
      expect(html).not.toContain("language-")
    })

    it(":::code body is HTML-escaped (XSS-safe)", () => {
      const html = renderMarkdown(":::code\n<script>alert(1)</script>\n:::")
      expect(html).not.toContain("<script>alert(1)</script>")
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    })

    it(":::code wraps in env-wrap with data-source-line", () => {
      const html = renderMarkdown("line1\n\n:::code\nbody\n:::")
      // The wrapper is annotated with the `:::code` line (3); the inner <pre>
      // is separately annotated with the line its body starts on (4).
      expect(html).toMatch(/<div class="env-wrap" data-source-line="3"><pre[^>]*><code>body<\/code><\/pre><\/div>/)
      expect(html).toMatch(/<pre[^>]*data-source-line="4"/)
    })

    it("triple-backtick fences still render normally (regression)", () => {
      const html = renderMarkdown("```python\nx = 1\n```")
      expect(html).toContain("language-python")
      expect(html).toContain("x = 1")
    })
  })

  describe("text highlighting (==mark==)", () => {
    it("wraps ==text== in a <mark> element", () => {
      const html = renderMarkdown("Esto es ==importante== aquí.")
      expect(html).toContain("<mark>importante</mark>")
    })

    it("does not highlight a single = or unmatched ==", () => {
      const html = renderMarkdown("a = b and c == d unmatched")
      expect(html).not.toContain("<mark>")
    })

    it("leaves == inside inline code untouched", () => {
      const html = renderMarkdown("`a ==b== c`")
      expect(html).not.toContain("<mark>")
      expect(html).toContain("<code>a ==b== c</code>")
    })

    it("leaves == inside a fenced code block untouched", () => {
      const html = renderMarkdown("```\nx ==y== z\n```")
      expect(html).not.toContain("<mark>")
      expect(html).toContain("x ==y== z")
    })

    it("does not treat == inside inline math as a highlight", () => {
      const html = renderMarkdown("$a == b$")
      expect(html).not.toContain("<mark>")
    })

    it("keeps coloured <mark class> raw HTML through the sanitizer", () => {
      const html = renderMarkdown('Un <mark class="hl-green">verde</mark> y un <u>subrayado</u>.')
      expect(html).toContain('<mark class="hl-green">verde</mark>')
      expect(html).toContain("<u>subrayado</u>")
    })
  })

  describe("auto-generated table of contents ([[toc]])", () => {
    it("expands a standalone [[toc]] line into a list linking to headings", () => {
      const text = "[[toc]]\n\n# Intro\n\n## Details\n\n# Conclusion"
      const html = renderMarkdown(text)
      // The marker itself must not survive as literal text.
      expect(html).not.toContain("[[toc]]")
      // Links to the heading slugs.
      expect(html).toContain('href="#intro"')
      expect(html).toContain('href="#details"')
      expect(html).toContain('href="#conclusion"')
      // Matching ids assigned to the rendered headings for navigation.
      expect(html).toMatch(/<h1[^>]*id="intro"[^>]*>1 Intro<\/h1>/)
      expect(html).toMatch(/<h2[^>]*id="details"[^>]*>1\.1 Details<\/h2>/)
    })

    it("also accepts the single-bracket [toc] form, case-insensitively", () => {
      const html = renderMarkdown("[TOC]\n\n# A\n\n# B")
      expect(html).not.toContain("[TOC]")
      expect(html).toContain('href="#a"')
      expect(html).toContain('href="#b"')
    })

    it("leaves [[toc]] with no headings as an empty expansion (no marker leak)", () => {
      const html = renderMarkdown("[[toc]]\n\nJust prose, no headings.")
      expect(html).not.toContain("[[toc]]")
    })

    it("assigns the right id to a Setext heading (no index-desync)", () => {
      // Setext h1 ('Title One' underlined with ===) is not an ATX heading, yet
      // markdown-it renders it as <h1>. Ids derive from rendered text, so the
      // following ## must still get its own correct id.
      const html = renderMarkdown("[[toc]]\n\nTitle One\n========\n\n## Sub Section")
      expect(html).toMatch(/<h1[^>]*id="title-one"[^>]*>/)
      expect(html).toMatch(/<h2[^>]*id="sub-section"[^>]*>/)
      expect(html).toContain('href="#title-one"')
      expect(html).toContain('href="#sub-section"')
    })

    it("ignores a heading inside a code block when assigning TOC ids", () => {
      const html = renderMarkdown("[[toc]]\n\n```\n# not a heading\n```\n\n# Real Heading")
      // The code-block '# not a heading' is not an <h*>, so the real heading
      // keeps its own id and TOC link.
      expect(html).toMatch(/<h1[^>]*id="real-heading"[^>]*>/)
      expect(html).toContain('href="#real-heading"')
      expect(html).not.toContain('href="#not-a-heading"')
    })

    it("disambiguates duplicate heading titles with suffixed ids", () => {
      const html = renderMarkdown("[[toc]]\n\n# Notes\n\n# Notes")
      expect(html).toMatch(/id="notes"/)
      expect(html).toMatch(/id="notes-2"/)
      expect(html).toContain('href="#notes"')
      expect(html).toContain('href="#notes-2"')
    })
  })

  describe("regression fixes", () => {
    it("renders footnotes via the plugin without a duplicate post-pass", () => {
      const html = renderMarkdown("Texto con nota[^1].\n\n[^1]: El cuerpo de la nota.")
      expect(html).toContain('class="footnote-ref"')
      expect(html).toContain("El cuerpo de la nota.")
      // The old hand-rolled pass emitted a second <ol class="footnotes">.
      expect(html.match(/footnote-ref/g)?.length).toBe(1)
    })

    it("does not crash on a footnote ref whose id contains regex metachars", () => {
      // Orphan ref (no definition) with regex-special chars used to throw via
      // `new RegExp(origId)` in the removed resolveFootnotes pass.
      expect(() => renderMarkdown("See[^a.b(c] here.")).not.toThrow()
    })

    it("leaves a @eq ref and [[wikilink]] inside inline code untouched", () => {
      const text = "$$ x = 1 $$ {#eq:foo}\n\nUse `@eq:foo` and `[[Note]]` literally; ref @eq:foo links."
      const html = renderMarkdown(text, {}, undefined, new Set(["Note"]))
      // Inside code: kept verbatim, not turned into a link.
      expect(html).toContain("<code>@eq:foo</code>")
      expect(html).toContain("<code>[[Note]]</code>")
      // Outside code: the real reference still resolves.
      expect(html).toContain('class="eq-ref">(1)')
    })

    it("does not count an ![](...) inside a code block toward figure numbering", () => {
      const text = [
        "```",
        "![not a real figure](fake.png)",
        "```",
        "",
        "![Real one](real.png){#fig:r}",
        "",
        "See @fig:r.",
      ].join("\n")
      const html = renderMarkdown(text)
      // The real figure must be number 1, not 2.
      expect(html).toContain("Figura 1")
      expect(html).toContain('class="fig-ref"')
      expect(html).not.toContain("Figura (?)")
    })
  })
})

describe("cross-file environment refs (end-to-end)", () => {
  const calendario = [
    ":::definition[Uno]{#def:uno}\na\n:::",
    ":::definition[Valor integrado]{#def:valor}\nc\n:::",
  ].join("\n\n")
  const envRefResolver = (p: string) => (p === "gp/calendario" ? calendario : null)

  it("renders a cross-file ref as a link with the target's number", () => {
    const html = renderMarkdown(
      "Como vimos en @gp/calendario@def:valor y sigue",
      {}, undefined, undefined, undefined, undefined, envRefResolver,
    )
    expect(html).toContain("Definición 2")
    expect(html).toContain('data-target="gp/calendario"')
  })

  it("does not collide with [@key] bibtex citations", () => {
    // The `@` stays LEADING (`@doc@def:x`, never `[doc]@def:x`) precisely so a
    // cross-file ref can never be mistaken for a `[@key]` citation, and a
    // citation is never eaten by the ref resolver. Both must survive one render.
    const bib = new Map([["knuth1984", {
      key: "knuth1984", type: "article", fields: { author: "Knuth", year: "1984", title: "Literate Programming" },
    }]])
    const html = renderMarkdown(
      "Cita [@knuth1984] y ref @gp/calendario@def:valor y sigue",
      {}, undefined, undefined, bib as never, undefined, envRefResolver,
    )
    // The citation rendered as a citation (not as an env ref)…
    expect(html).toContain("cite-ref")
    expect(html).toContain("Knuth")
    expect(html).not.toContain("env-ref-broken")
    // …and the cross-file ref still rendered as a cross-file ref.
    expect(html).toContain("env-ref-cross")
    expect(html).toContain("Definición 2")
  })

  it("leaves a cross-file ref inside a code span verbatim", () => {
    const html = renderMarkdown(
      "Escribe `@gp/calendario@def:valor` para citar.",
      {}, undefined, undefined, undefined, undefined, envRefResolver,
    )
    expect(html).toContain("@gp/calendario@def:valor")
    expect(html).not.toContain("env-ref-cross")
  })

  it("renders a broken cross-ref without a resolver instead of throwing", () => {
    const html = renderMarkdown("Ver @gp/calendario@def:valor y sigue")
    expect(html).toContain("env-ref-broken")
  })
})
