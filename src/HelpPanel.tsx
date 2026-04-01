import { useState } from "react"
import katex from "katex"
import { useT } from "./i18n"

function math(tex: string, display = false) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false })
  } catch {
    return tex
  }
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`hp-section ${open ? "hp-section-open" : ""}`}>
      <button className="hp-section-title" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="hp-section-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="hp-section-body">{children}</div>}
    </div>
  )
}

// ── Shorthand row ─────────────────────────────────────────────────────────────

function Row({ code, desc, render }: { code: string; desc: string; render?: string }) {
  return (
    <div className="hp-row">
      <code className="hp-code">{code}</code>
      <span className="hp-desc">{desc}</span>
      {render && <span className="hp-render" dangerouslySetInnerHTML={{ __html: render }} />}
    </div>
  )
}

// ── Environment card ──────────────────────────────────────────────────────────

function EnvCard({
  type,
  syntaxTitle,
  envLabel,
  body,
}: {
  type: string
  syntaxTitle?: string
  envLabel: string
  body: string
}) {
  const titlePart = syntaxTitle ? `[${syntaxTitle}]` : ""
  return (
    <div className="hp-env-card">
      <pre className="hp-env-syntax">{`:::${type}${titlePart}\n${body}\n:::`}</pre>
      <div className={`math-env math-env-${type} hp-env-preview`}>
        <div className="math-env-header">
          <span className="math-env-label">{envLabel}</span>
        </div>
        <div className="math-env-body">{body}</div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function HelpPanel() {
  const t = useT()
  const hp = t.helpPanel

  return (
    <div className="hp-panel">

      {/* ── Math environments ── */}
      <Section title={hp.environments} defaultOpen>
        <p className="hp-intro">
          <code className="hp-code">{hp.envSyntaxCode}</code> {hp.envSyntaxMid} <code className="hp-code">:::</code>
          <br />
          {hp.envCapabilities}
        </p>
        <div className="hp-label">{hp.normal.split("—")[0].trim()}</div>
        <Row code=":::sm remark"       desc={hp.compact} />
        <Row code=":::theorem[Título]" desc={hp.normal} />
        <Row code=":::lg definition"   desc={hp.large} />

        <div className="hp-label">{hp.numbered}</div>
        <div className="hp-env-grid2">
          <EnvCard type="theorem"     syntaxTitle={hp.syntaxPythagoras}   envLabel={hp.theorem1}      body={hp.thmBody} />
          <EnvCard type="lemma"                                            envLabel={hp.lemma1}        body={hp.lemBody} />
          <EnvCard type="corollary"   syntaxTitle={hp.syntaxUniqueness}   envLabel={hp.corollary1}    body={hp.corBody} />
          <EnvCard type="proposition"                                      envLabel={hp.proposition1}  body={hp.propBody} />
          <EnvCard type="definition"  syntaxTitle={hp.syntaxContinuity}   envLabel={hp.definition1}   body={hp.defBody} />
          <EnvCard type="example"     syntaxTitle={hp.syntaxEvenFunction} envLabel={hp.example1}      body={hp.exBody} />
          <EnvCard type="exercise"                                         envLabel={hp.exercise1}     body={hp.exerBody} />
        </div>

        <div className="hp-label" style={{ marginTop: "0.6rem" }}>{hp.unnumbered}</div>
        <div className="hp-env-grid2">
          <EnvCard type="proof"   envLabel={hp.proofLabel}  body={hp.proofBody} />
          <EnvCard type="remark"  envLabel={hp.remarkLabel} body={hp.remarkBody} />
          <EnvCard type="note"    envLabel={hp.noteLabel}   body={hp.noteBody} />
        </div>

        <p className="hp-intro" style={{ marginTop: "0.7rem" }}>
          <strong>{hp.headingsNote}</strong>{" "}
          <code className="hp-code">## </code>,{" "}
          <code className="hp-code">### </code>,{" "}
          <code className="hp-code">#### </code>
          {hp.headingsPurpose}
        </p>
      </Section>

      {/* ── Math shorthands ── */}
      <Section title={hp.shorthands}>
        <p className="hp-intro">
          {hp.intro1} <kbd className="hp-kbd">Tab</kbd>.{" "}
          {hp.intro2} <code className="hp-code">$...$</code>.{" "}
          {hp.intro3} <code className="hp-code">frac(sqrt(x), abs(y))</code>.
        </p>

        <div className="hp-label">{hp.operations}</div>
        <Row code="frac(a, b)"     desc={hp.fraction}      render={math("\\dfrac{a}{b}")} />
        <Row code="sqrt(x)"        desc={hp.sqrt}           render={math("\\sqrt{x}")} />
        <Row code="root(n, x)"     desc={hp.nthRoot}        render={math("\\sqrt[n]{x}")} />
        <Row code="abs(x)"         desc={hp.abs}            render={math("\\left|x\\right|")} />
        <Row code="norm(v)"        desc={hp.norm}           render={math("\\left\\|v\\right\\|")} />
        <Row code="ceil(x)"        desc={hp.ceil}           render={math("\\lceil x\\rceil")} />
        <Row code="floor(x)"       desc={hp.floor}          render={math("\\lfloor x\\rfloor")} />

        <div className="hp-label">{hp.superSub}</div>
        <Row code="sup(x, n)"      desc={hp.superscript}    render={math("x^{n}")} />
        <Row code="sub(x, n)"      desc={hp.subscript}      render={math("x_{n}")} />
        <Row code="inv(A)"         desc={hp.inverse}        render={math("A^{-1}")} />
        <Row code="trans(A)"       desc={hp.transpose}      render={math("A^{\\top}")} />

        <div className="hp-label">{hp.decorators}</div>
        <Row code="hat(x)"         desc={hp.hat}            render={math("\\hat{x}")} />
        <Row code="bar(x)"         desc={hp.bar}            render={math("\\overline{x}")} />
        <Row code="tilde(x)"       desc={hp.tilde}          render={math("\\tilde{x}")} />
        <Row code="dot(x)"         desc={hp.dot}            render={math("\\dot{x}")} />
        <Row code="ddot(x)"        desc={hp.ddot}           render={math("\\ddot{x}")} />
        <Row code="vec(v)"         desc={hp.vector}         render={math("\\vec{v}")} />

        <div className="hp-label">{hp.mathFonts}</div>
        <Row code="bf(x)"          desc={hp.bold}           render={math("\\mathbf{x}")} />
        <Row code="cal(A)"         desc={hp.calligraphic}   render={math("\\mathcal{A}")} />
        <Row code="bb(R)"          desc={hp.blackboard}     render={math("\\mathbb{R}")} />

        <div className="hp-label">{hp.sumsLimits}</div>
        <Row code="sum(i=0, n)"    desc={hp.sum}            render={math("\\sum_{i=0}^{n}")} />
        <Row code="int(a, b)"      desc={hp.integral}       render={math("\\int_{a}^{b}")} />
        <Row code="lim(x, 0)"      desc={hp.limit}          render={math("\\lim_{x\\to 0}")} />
        <Row code="der(f, x)"      desc={hp.derivative}     render={math("\\frac{df}{dx}")} />
        <Row code="pder(f, x)"     desc={hp.partialDer}     render={math("\\frac{\\partial f}{\\partial x}")} />

        <div className="hp-label">{hp.matrices}</div>
        <Row code="mat(1,0,0,1)"             desc={hp.matAuto} />
        <Row code="matf(2,3, a,b,c, d,e,f)"  desc={hp.matFixed} />
        <Row code="table(Col1, Col2)"         desc={hp.matTable} />
        <Row code="[[1,2],[3,4]]"             desc={hp.matLiteral} />

        <p className="hp-intro" style={{ marginTop: "0.6rem" }}>
          <strong>{hp.nesting}</strong>{" "}
          <code className="hp-code">{"frac(sqrt(abs(x)), 1 + norm(vec(x)))"}</code>
          {" → "}
          <span dangerouslySetInnerHTML={{ __html: math("\\dfrac{\\sqrt{|x|}}{1+\\|\\vec{x}\\|}") }} />
        </p>
      </Section>

      {/* ── Equations ── */}
      <Section title={hp.equations}>
        <div className="hp-codeblock">{hp.eqCodeBlock}</div>
        <Row code="$$ ... $$ {#eq:etq}" desc={hp.numberedEq} />
        <Row code="$$ ... $$"           desc={hp.numberedNoLabel} />
        <Row code="@eq:etq"             desc={hp.refLabel} />
        <Row code="@eq:3"               desc={hp.directRef} />
        <p className="hp-intro" style={{ marginTop: "0.5em" }}>
          Inline: <code className="hp-code">{"$x^2 + y^2 = r^2$"}</code>
          {" → "}
          <span dangerouslySetInnerHTML={{ __html: math("x^2+y^2=r^2") }} />
        </p>
      </Section>

      {/* ── Custom macros ── */}
      <Section title={hp.macros}>
        <p className="hp-intro">{hp.macrosDesc}</p>
        <div className="hp-codeblock">{`\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\norm}[1]{\\left\\|#1\\right\\|}\n\\newcommand{\\inner}[2]{\\langle #1, #2\\rangle}`}</div>
        <Row code="\\newcommand{\\cmd}{def}"       desc={hp.noArgs} />
        <Row code="\\newcommand{\\cmd}[1]{…#1}"   desc={hp.withArgs} />
      </Section>

      {/* ── BibTeX ── */}
      <Section title={hp.bibtex}>
        <p className="hp-intro">{hp.bibtexDesc}</p>
        <div className="hp-codeblock">{`@article{einstein05,\n  author = {Einstein, Albert},\n  title  = {Zur Elektrodynamik…},\n  year   = {1905},\n}`}</div>
        <Row code="[@einstein05]"        desc={hp.cite} />
        <Row code="[@einstein05, p. 42]" desc={hp.citeNote} />
      </Section>

      {/* ── Front matter ── */}
      <Section title={hp.frontmatter}>
        <div className="hp-codeblock">{`---\ntitle: Análisis Real\nauthor: Ada Lovelace\ndate: 2024-03-15\ntags: [análisis, topología]\n---`}</div>
        <Row code="title"  desc={hp.fmTitle} />
        <Row code="author" desc={hp.fmAuthor} />
        <Row code="date"   desc={hp.fmDate} />
        <Row code="tags"   desc={hp.fmTags} />
      </Section>

      {/* ── Wikilinks & backlinks ── */}
      <Section title={hp.wikilinks}>
        <Row code="[[nombre-nota]]"   desc={hp.wikilinkRow} />
        <p className="hp-intro" style={{ marginTop: "0.4em" }}>
          {hp.wikilinkDesc}
        </p>
      </Section>

      {/* ── Templates ── */}
      <Section title={hp.templates}>
        <p className="hp-intro">{hp.templatesDesc}</p>
        <Row code={hp.tplArticle}  desc={hp.tplArticleDesc} />
        <Row code={hp.tplNotes}    desc={hp.tplNotesDesc} />
        <Row code={hp.tplHomework} desc={hp.tplHomeworkDesc} />
        <Row code={hp.tplTheorems} desc={hp.tplTheoremsDesc} />
        <Row code={hp.tplResearch} desc={hp.tplResearchDesc} />
      </Section>

      {/* ── Greek letters ── */}
      <Section title={hp.greekLetters}>
        <div className="hp-greek-grid">
          {[
            "\\alpha","\\beta","\\gamma","\\delta","\\epsilon","\\varepsilon",
            "\\zeta","\\eta","\\theta","\\vartheta","\\iota","\\kappa",
            "\\lambda","\\mu","\\nu","\\xi","\\pi","\\rho",
            "\\sigma","\\tau","\\phi","\\varphi","\\chi","\\psi","\\omega",
            "\\Gamma","\\Delta","\\Theta","\\Lambda","\\Pi","\\Sigma",
            "\\Phi","\\Psi","\\Omega",
          ].map((cmd) => (
            <div key={cmd} className="hp-greek-item">
              <code className="hp-code-sm">{cmd}</code>
              <span dangerouslySetInnerHTML={{ __html: math(cmd) }} />
            </div>
          ))}
        </div>
      </Section>

      {/* ── Operators ── */}
      <Section title={hp.operators}>
        <div className="hp-sym-grid">
          {[
            "\\infty","\\partial","\\nabla","\\forall","\\exists",
            "\\in","\\notin","\\subset","\\subseteq","\\cup","\\cap","\\emptyset",
            "\\times","\\cdot","\\pm","\\leq","\\geq","\\neq",
            "\\approx","\\equiv","\\sim","\\to","\\Rightarrow","\\Leftrightarrow",
            "\\oplus","\\otimes","\\ldots","\\cdots",
          ].map((cmd) => (
            <div key={cmd} className="hp-greek-item">
              <code className="hp-code-sm">{cmd}</code>
              <span dangerouslySetInnerHTML={{ __html: math(cmd) }} />
            </div>
          ))}
        </div>
      </Section>

    </div>
  )
}
