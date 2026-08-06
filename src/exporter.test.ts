import { describe, expect, it } from "vitest"
import { exportToTex, exportReveal, detectFeaturePackages } from "./exporter"

describe("exportToTex", () => {
  it("loads babel with es-noquoting so literal ->> / >-> text survives", () => {
    // Plain [spanish]{babel} treats << / >> as guillemet shorthands backed by
    // an internal `quoting` environment: literal arrow text (\texttt{->>})
    // then emits a stray \end{quoting} and aborts the whole compile.
    const tex = exportToTex("Flechas: `->>` y `>->`.", "", "t")
    expect(tex).toContain("\\usepackage[spanish,es-noquoting,es-noshorthands]{babel}")
  })

  it("uses frontmatter metadata without exporting raw YAML as document body", () => {
    const tex = exportToTex("---\ntitle: Front Title\nauthor: Ada\n---\n# Body", "", "Front Title", "Ada")

    expect(tex).toContain("\\title{Front Title}")
    expect(tex).toContain("\\author{Ada}")
    expect(tex).toContain("\\section{Body}")
    expect(tex).not.toContain("title: Front Title")
    expect(tex).not.toContain("\\hrulefill")
  })

  it("exports structural labels and references as Overleaf-compatible LaTeX", () => {
    const tex = exportToTex([
      "# Intro {#sec:intro}",
      "Ver @sec:intro y @eq:energy.",
      "$$E = mc^2$$ {#eq:energy}",
      "![Diagrama](diagram.png){#fig:diagram}",
      "Ver @fig:diagram.",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "{#tbl:data}",
      "Ver @tbl:data.",
      ":::theorem[Principal]{#thm:main}",
      "Contenido",
      ":::",
      "Ver @thm:main.",
    ].join("\n"))

    expect(tex).toContain("\\label{sec:intro}")
    expect(tex).toContain("\\eqref{eq:energy}")
    expect(tex).toContain("\\label{eq:energy}")
    expect(tex).toContain("\\label{fig:diagram}")
    expect(tex).toContain("\\label{tbl:data}")
    expect(tex).toContain("\\label{thm:main}")
    expect(tex).toContain("Teorema~\\ref{thm:main}")
  })
})

describe("exportReveal", () => {
  it("defaults to the black theme when no frontmatter is present", () => {
    const html = exportReveal("# Slide", "Demo")
    expect(html).toContain("theme/black.css")
  })

  it("reads `reveal_theme` from frontmatter", () => {
    const html = exportReveal("---\nreveal_theme: dracula\n---\n# Slide", "Demo")
    expect(html).toContain("theme/dracula.css")
    expect(html).not.toContain("theme/black.css")
    // Frontmatter must not leak into the slide body
    expect(html).not.toContain("reveal_theme: dracula")
  })

  it("falls back to `theme` field if `reveal_theme` is missing", () => {
    const html = exportReveal("---\ntheme: solarized\n---\n# Slide", "Demo")
    expect(html).toContain("theme/solarized.css")
  })

  it("ignores invalid theme names and falls back to black", () => {
    const html = exportReveal("---\nreveal_theme: not-a-theme\n---\n# Slide", "Demo")
    expect(html).toContain("theme/black.css")
  })
})

describe("cross-file environment refs → LaTeX", () => {
  it("degrades a cross-file ref to plain text naming the source doc", () => {
    const tex = exportToTex("Como vimos en @gp/calendario@def:valor, esto vale.")
    expect(tex).toContain("Definición~(gp/calendario)")
    // The whole point: NO dangling \ref to a label that isn't in this document.
    expect(tex).not.toContain("\\ref{def:valor}")
    // And the path must not survive as stray escaped prose.
    expect(tex).not.toContain("@gp/calendario")
  })

  it("handles the bracketed escape form", () => {
    const tex = exportToTex("Ver @[mi carpeta/mi nota]@lem:clave aqui.")
    expect(tex).toContain("Lema~(mi carpeta/mi nota)")
    expect(tex).not.toContain("\\ref{lem:clave}")
  })

  it("still emits a real \\ref for LOCAL env refs", () => {
    const tex = exportToTex(":::theorem{#thm:main}\nx\n:::\n\nVer @thm:main")
    expect(tex).toContain("Teorema~\\ref{thm:main}")
  })

  it("leaves an unknown cross-file prefix as literal text", () => {
    const tex = exportToTex("@gp/calendario@zzz:valor")
    expect(tex).toContain("zzz:valor")
    expect(tex).not.toContain("\\ref{zzz:valor}")
  })
})

describe("journal classes via comdtex.texclass", () => {
  const doc = (cls: string) =>
    `---\ntitle: Paper\nauthor: Ada\ncomdtex.texclass: ${cls}\n---\n# Intro\n\n:::theorem{#thm:main}\nx\n:::\n`

  it("exports IEEEtran with its conference class and author block", () => {
    const tex = exportToTex(doc("ieeetran"), "", "Paper", "Ada")
    expect(tex).toContain("\\documentclass[conference]{IEEEtran}")
    expect(tex).toContain("\\IEEEauthorblockN{Ada}")
    expect(tex).toContain("\\maketitle")
    expect(tex).toContain("\\newtheorem{theorem}")
    expect(tex).not.toContain("{babel}")
  })

  it("exports acmart without redefining the theorem envs the class ships", () => {
    const tex = exportToTex(doc("acmart"), "", "Paper", "Ada")
    expect(tex).toContain("\\documentclass[sigconf]{acmart}")
    // acmart predefines theorem/lemma/etc: redefining them is a LaTeX error.
    expect(tex).not.toContain("\\newtheorem{theorem}")
    expect(tex).toContain("\\newtheorem*{exercise}")
    // acmart loads hyperref itself; a second \usepackage{hyperref} errors.
    expect(tex).not.toContain("\\usepackage{hyperref}")
  })

  it("exports elsarticle with a frontmatter block instead of maketitle", () => {
    const tex = exportToTex(doc("elsarticle"), "", "Paper", "Ada")
    expect(tex).toContain("\\documentclass[preprint,12pt]{elsarticle}")
    expect(tex).toContain("\\begin{frontmatter}")
    expect(tex).toContain("\\end{frontmatter}")
    expect(tex).not.toContain("\\maketitle")
  })

  it("exports apa7 with authorsnames", () => {
    const tex = exportToTex(doc("apa7"), "", "Paper", "Ada")
    expect(tex).toContain("\\documentclass[man]{apa7}")
    expect(tex).toContain("\\authorsnames{Ada}")
  })

  it("keeps the classic article export byte-compatible when the key is absent", () => {
    const tex = exportToTex("---\ntitle: T\n---\n# Body", "", "T")
    expect(tex).toContain("\\documentclass[12pt,a4paper]{article}")
    expect(tex).toContain("\\usepackage[spanish,es-noquoting,es-noshorthands]{babel}")
  })

  it("ignores an unknown class value and falls back to article", () => {
    const tex = exportToTex(doc("nonsense"), "", "Paper", "Ada")
    expect(tex).toContain("\\documentclass[12pt,a4paper]{article}")
  })
})

describe("citations reach LaTeX", () => {
  it("turns [@key] into a real \\cite", () => {
    const tex = exportToTex("As shown in [@rudin1976].", "", "T")
    expect(tex).toContain("\\cite{rudin1976}")
    expect(tex).not.toContain("[@rudin1976]")
  })

  it("carries a page locator the way LaTeX expects", () => {
    const tex = exportToTex("See [@rudin1976, p. 321].", "", "T")
    expect(tex).toContain("\\cite[p. 321]{rudin1976}")
  })

  it("closes the document with the bibliography when something was cited", () => {
    const tex = exportToTex("Cited [@a].", "", "T")
    expect(tex).toContain("\\bibliography{references}")
    expect(tex).toContain("\\bibliographystyle{plain}")
    // The commands must sit inside the document, before \end{document}.
    expect(tex.indexOf("\\bibliography{references}")).toBeLessThan(tex.indexOf("\\end{document}"))
  })

  it("emits no bibliography for a document without citations", () => {
    const tex = exportToTex("No citations here.", "", "T")
    expect(tex).not.toContain("\\bibliography")
  })

  it("matches the bst to the citation style", () => {
    const vanc = exportToTex("---\ncomdtex.citestyle: vancouver\n---\nCited [@a].", "", "T")
    expect(vanc).toContain("\\bibliographystyle{unsrt}")
    const apa = exportToTex("---\ncomdtex.citestyle: apa\n---\nCited [@a].", "", "T")
    expect(apa).toContain("\\bibliographystyle{apalike}")
    const ay = exportToTex("---\ncomdtex.citestyle: author-year\n---\nCited [@a].", "", "T")
    expect(ay).toContain("\\bibliographystyle{plainnat}")
  })

  it("still resolves cross-references correctly next to citations", () => {
    const tex = exportToTex("See @sec:intro and [@key].\n\n# Intro {#sec:intro}", "", "T")
    expect(tex).toContain("\\cite{key}")
    expect(tex).toContain("\\ref{sec:intro}")
  })

  it("leaves a bracketed non-citation alone", () => {
    const tex = exportToTex("An array [a, b] and an email a@b.com.", "", "T")
    expect(tex).not.toContain("\\cite")
  })
})

describe("footnotes reach LaTeX", () => {
  it("turns [^id] + its definition into a real \\footnote", () => {
    const tex = exportToTex("Texto[^1].\n\n[^1]: La nota.", "", "T")
    expect(tex).toContain("\\footnote{La nota.}")
    // The marker and the orphan definition line must not survive as text.
    expect(tex).not.toContain("[^1]")
  })

  it("escapes nested markup inside the footnote body", () => {
    const tex = exportToTex("Texto[^1].\n\n[^1]: 50% de **algo**.", "", "T")
    expect(tex).toContain("\\footnote{50\\% de \\textbf{algo}.}")
  })

  it("does not load any extra package for footnotes (core LaTeX \\footnote)", () => {
    const tex = exportToTex("Texto[^1].\n\n[^1]: La nota.", "", "T")
    expect(tex).not.toContain("\\usepackage{tcolorbox}")
    expect(tex).not.toContain("\\usepackage{soul}")
  })
})

describe("callouts reach LaTeX", () => {
  it("turns > [!warning] into a titled tcolorbox, not a generic quote", () => {
    const tex = exportToTex("> [!warning] Ojo\n> Cuidado.", "", "T")
    expect(tex).toContain("\\begin{tcolorbox}[colback=orange!10,colframe=orange!60!black,title=Ojo]")
    expect(tex).toContain("Cuidado.")
    expect(tex).toContain("\\end{tcolorbox}")
    // The old behavior: a bare \begin{quote} with the marker printed literally.
    expect(tex).not.toContain("[!warning]")
    expect(tex).not.toContain("\\begin{quote}")
  })

  it("defaults the title to the capitalized type when none is given", () => {
    const tex = exportToTex("> [!note]\n> Contenido.", "", "T")
    expect(tex).toContain("title=Note")
  })

  it("loads tcolorbox only when a callout is actually used", () => {
    const withCallout = exportToTex("> [!note] Aviso\n> Texto.", "", "T")
    expect(withCallout).toContain("\\usepackage{tcolorbox}")

    const withoutCallout = exportToTex("Un párrafo normal.", "", "T")
    expect(withoutCallout).not.toContain("\\usepackage{tcolorbox}")
  })

  it("still converts nested markup inside a callout body", () => {
    const tex = exportToTex("> [!tip] Consejo\n> Usa **negrita**.", "", "T")
    expect(tex).toContain("\\textbf{negrita}")
  })
})

describe("highlights and underline reach LaTeX", () => {
  it("turns ==text== into \\hl{} instead of printing == literally", () => {
    const tex = exportToTex("Esto es ==importante==.", "", "T")
    expect(tex).toContain("\\hl{importante}")
    expect(tex).not.toContain("==importante==")
  })

  it("loads soul only when ==highlight== is actually used", () => {
    const withMark = exportToTex("Esto es ==importante==.", "", "T")
    expect(withMark).toContain("\\usepackage{soul}")

    const withoutMark = exportToTex("Texto normal.", "", "T")
    expect(withoutMark).not.toContain("\\usepackage{soul}")
  })

  it("turns coloured <mark> spans into \\colorbox", () => {
    const tex = exportToTex('Dato <mark class="hl-green">clave</mark> aquí.', "", "T")
    expect(tex).toContain("\\colorbox{green!30}{clave}")
  })

  it("loads xcolor only when a coloured highlight or code block is used", () => {
    const withMark = exportToTex('<mark class="hl-blue">x</mark>', "", "T")
    expect(withMark).toContain("\\usepackage{xcolor}")

    const withoutFeature = exportToTex("Texto normal.", "", "T")
    expect(withoutFeature).not.toContain("\\usepackage{xcolor}")
  })

  it("turns <u>text</u> into \\underline{}", () => {
    const tex = exportToTex("Esto es <u>subrayado</u>.", "", "T")
    expect(tex).toContain("\\underline{subrayado}")
    expect(tex).not.toContain("<u>")
  })
})

describe("detectFeaturePackages", () => {
  it("reports every flag false for a plain body", () => {
    expect(detectFeaturePackages("Plain LaTeX body.")).toEqual({
      callouts: false,
      soulHighlight: false,
      colorHighlight: false,
    })
  })

  it("reports each flag true only when its own macro is present", () => {
    expect(detectFeaturePackages("\\begin{tcolorbox}[title=x]\nBody\n\\end{tcolorbox}").callouts).toBe(true)
    expect(detectFeaturePackages("\\hl{x}").soulHighlight).toBe(true)
    expect(detectFeaturePackages("\\colorbox{green!30}{x}").colorHighlight).toBe(true)
  })
})
