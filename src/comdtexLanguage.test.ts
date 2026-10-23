import { describe, expect, it } from "vitest"
import { compile } from "monaco-editor/esm/vs/editor/standalone/common/monarch/monarchCompile.js"
import { MonarchTokenizer } from "monaco-editor/esm/vs/editor/standalone/common/monarch/monarchLexer.js"
import {
  EDITOR_LANGUAGES,
  blockWords,
  buildComdtexTokenizer,
  shorthandNames,
  type ComdtexVocabulary,
} from "./comdtexLanguage"
import { buildLatexTokenizer } from "./latexLanguage"
import { COMPLETIONS, getSpecialBlockCompletions } from "./monacoSetup"

// These tests run the REAL Monarch compiler and lexer (the modules Monaco
// itself uses) with stubbed services, so the token types asserted here are the
// ones the editor paints. Embedded languages are not loaded (no language
// service), which is fine: the fence line and the closing line are what the
// grammar owns.

interface Tok {
  text: string
  type: string
}

const VOCAB: ComdtexVocabulary = {
  shorthands: ["frac", "sqrt", "table"],
  blocks: {
    pseudocode: [
      { label: "IF", snippet: "IF ${1:c} THEN\n  ${2}\nEND IF" },
      { label: "FOR", snippet: "FOR ${1:i} ← ${2:1} TO ${3:n} DO\n  ${4}\nEND FOR" },
      { label: "RETURN", snippet: "RETURN ${1:v}" },
    ],
    truth: [
      { label: "AND", snippet: "∧ " },
      { label: "OR", snippet: "∨ " },
    ],
    plot: [
      { label: "range", snippet: "range: [${1:-5}, ${2:5}]" },
      { label: "sin", snippet: "sin(${1:x})" },
      { label: "pi", snippet: "pi" },
    ],
  },
}

function makeTokenizer(json: unknown, id: string) {
  const lexer = compile(id, json)
  const service = {
    languageIdCodec: {},
    getLanguageIdByLanguageName: () => null,
    getLanguageIdByMimeType: () => null,
    isRegisteredLanguageId: () => false,
  }
  const config = { getValue: () => 20000, onDidChangeConfiguration: () => ({ dispose() {} }) }
  return new MonarchTokenizer(service, {}, id, lexer, config)
}

function run(tokenizer: MonarchTokenizer, text: string): Tok[][] {
  let state = tokenizer.getInitialState()
  return text.split("\n").map((line) => {
    const r = tokenizer.tokenize(line, true, state)
    state = r.endState
    return r.tokens.map((t, i) => ({
      text: line.slice(t.offset, r.tokens[i + 1]?.offset ?? line.length),
      type: t.type.replace(/\.(md|tex)$/, ""),
    }))
  })
}

const md = (text: string, vocab = VOCAB) =>
  run(makeTokenizer(buildComdtexTokenizer(vocab), "markdown"), text)

/** Types painted over a substring of one line (adjacent tokens of one type are merged). */
function typeOf(lines: Tok[][], line: number, text: string): string | undefined {
  return (
    lines[line].find((t) => t.text === text) ?? lines[line].find((t) => t.text.includes(text))
  )?.type
}

interface Case {
  name: string
  src: string
  /** [line, text, expected type]; `""` means unpainted. */
  expect: [number, string, string][]
}

const CASES: Case[] = [
  {
    name: "headings, with a label and inline math",
    src: "## Gap $\\lambda_1$ {#sec:gap}",
    expect: [
      [0, "## Gap ", "keyword"],
      [0, "$", "delimiter.math"],
      [0, "\\lambda", "keyword.math"],
      [0, "{#sec:gap}", "tag.label"],
    ],
  },
  {
    name: "inline math: commands, braces, scripts, numbers, no emphasis inside",
    src: "so $a_b^2 + \\frac{1}{2} * c * d$ ok",
    expect: [
      [0, "\\frac", "keyword.math"],
      [0, "_", "delimiter.math"],
      [0, "2", "number.math"],
      [0, "a", "math"],
    ],
  },
  {
    name: "prices are prose, not math",
    src: "it costs $5 and $6 today",
    expect: [[0, "it costs $5 and $6 today", ""]],
  },
  {
    name: "an escaped dollar is not math",
    src: "pay \\$x\\$ here",
    expect: [
      [0, "\\$", "escape"],
      [0, "pay ", ""],
    ],
  },
  {
    name: "shorthands are recognised in prose and in math",
    src: "use frac(1,2) and $sqrt(x) + other(y)$",
    expect: [
      [0, "frac", "function.shorthand"],
      [0, "sqrt", "function.shorthand"],
      [0, "other", "math"],
    ],
  },
  {
    name: "display math: multi-line body, no markdown structure inside",
    src: "$$\n- not a list\n> not a quote\n    not code\n\\begin{align} x &= 1 \\\\ y \\end{align}\n$$ {#eq:two}\nafter",
    expect: [
      [0, "$$", "delimiter.math"],
      [1, "- not a list", "math"],
      [2, "> not a quote", "math"],
      [3, "    not code", "math"],
      [4, "\\begin", "keyword.math"],
      [4, "align", "keyword.env"],
      [4, "&", "delimiter.math"],
      [4, "\\\\", "keyword.math"],
      [5, "$$", "delimiter.math"],
      [5, "{#eq:two}", "tag.label"],
      [6, "after", ""],
    ],
  },
  {
    name: "one-line display math with a label",
    src: "$$ E = mc^2 $$ {#eq:e}",
    expect: [
      [0, "$$", "delimiter.math"],
      [0, "{#eq:e}", "tag.label"],
    ],
  },
  {
    name: "environment fence line: delimiter, type, title, label",
    src: ":::theorem[Cheeger]{#thm:cheeger}\nBody with *emphasis* and $x$.\n:::",
    expect: [
      [0, ":::", "delimiter.env"],
      [0, "theorem", "keyword.env"],
      [0, "[Cheeger]", "string.title"],
      [0, "{#thm:cheeger}", "tag.label"],
      [1, "*emphasis*", "emphasis"],
      [1, "x", "math"],
      [2, ":::", "delimiter.env"],
    ],
  },
  {
    name: "size prefix on a fence",
    src: ":::sm remark\ntext\n:::",
    expect: [
      [0, "sm ", "keyword.env"],
      [0, "remark", "keyword.env"],
    ],
  },
  {
    name: "pseudocode body: keywords, no headings",
    src: ":::pseudocode\nIF x > 3 THEN\n# note\nRETURN 1\n:::\n# After",
    expect: [
      [1, "IF", "keyword.block"],
      [1, "THEN", "keyword.block"],
      [2, "# note", ""],
      [3, "RETURN", "keyword.block"],
      [3, "1", "number"],
      [4, ":::", "delimiter.env"],
      [5, "# After", "keyword"],
    ],
  },
  {
    name: "truth body",
    src: ":::truth\np AND q -> r\n:::",
    expect: [
      [1, "AND", "keyword.block"],
      [1, "->", "operator"],
    ],
  },
  {
    name: "graph and commdiag bodies: arrows and labels",
    src: ":::commdiag\nA ->> B [f]\n:::",
    expect: [
      [1, "->>", "operator"],
      [1, "[f]", "string"],
    ],
  },
  {
    name: "plot body: keys, functions, numbers, dataset refs",
    src: ":::plot\nrange: [-5, 5]\nf(x) = sin(x)\nx: @data:growth\n:::",
    expect: [
      [1, "range", "type.identifier"],
      [1, "5", "number"],
      [2, "sin", "function.shorthand"],
      [3, "@data:growth", "tag.ref"],
    ],
  },
  {
    name: "code blocks are opaque",
    src: ":::code python\n# comment\nx = $y\n:::",
    expect: [
      [1, "# comment", "variable.source"],
      [2, "x = $y", "variable.source"],
    ],
  },
  {
    name: "references: local, cross-file, bracketed path; trailing period excluded",
    src: "See @eq:main, @gp/calendar@def:x and @[a b/c]@thm:y. End @thm:z.",
    expect: [
      [0, "@eq:main", "tag.ref"],
      [0, "@gp/calendar@def:x", "tag.ref"],
      [0, "@[a b/c]@thm:y", "tag.ref"],
      [0, "@thm:z", "tag.ref"],
    ],
  },
  {
    name: "citations with several keys and a locator",
    src: "As in [@lubotzky1988; @k2, p. 3] clearly.",
    expect: [
      [0, "[", "delimiter.cite"],
      [0, "@lubotzky1988", "string.cite"],
      [0, ";", "delimiter.cite"],
      [0, "@k2", "string.cite"],
      [0, " p. 3", ""],
      [0, "]", "delimiter.cite"],
    ],
  },
  {
    name: "wikilinks, transclusions, footnotes, gaps, keep marks, highlights",
    src: "[[note#h|alias]] ![[embed]] [^1] {{? fill}} ^^keep^^ ==hl==\n[^1]: The note.",
    expect: [
      [0, "[[note#h|alias]]", "string.link"],
      [0, "![[embed]]", "string.link.embed"],
      [0, "[^1]", "tag.footnote"],
      [0, "{{? fill}}", "invalid.gap"],
      [0, "^^keep^^", "comment.keep"],
      [0, "==hl==", "mark"],
      [1, "[^1]", "tag.footnote"],
    ],
  },
  {
    name: "tasks, lists, quotes and callouts",
    src: "- [ ] todo\n- [x] done\n1. one\n> quote\n> [!note] Title",
    expect: [
      [0, "[ ]", "keyword.task"],
      [1, "[x]", "keyword.task"],
      [2, "1.", "keyword"],
      [3, ">", "comment"],
      [4, "[!note]", "keyword.env"],
    ],
  },
  {
    name: "emphasis and strong, with math nested inside",
    src: "**bold $z$** and _it_ and snake_case_name",
    expect: [
      [0, "**", "strong"],
      [0, "z", "math"],
      [0, "_", "emphasis"],
      [0, " snake_case_name", ""],
    ],
  },
  {
    name: "tables keep the built-in token shapes, with inline constructs in body cells",
    src: "| a | b |\n|---|---|\n| $x$ | @eq:y |",
    expect: [
      [0, "|", "keyword.table.left"],
      [1, "---", "keyword"],
      [2, "x", "math"],
      [2, "@eq:y", "tag.ref"],
    ],
  },
  {
    name: "fenced code is opaque and closes",
    src: "```\n# not a heading $x$\n```\n# real",
    expect: [
      [0, "```", "delimiter.fence"],
      [1, "# not a heading $x$", "variable.source"],
      [3, "# real", "keyword"],
    ],
  },
  {
    name: "a four-backtick fence holds a three-backtick one",
    src: "````\n```\ninner\n````\ndone",
    expect: [
      [1, "```", "variable.source"],
      [3, "````", "delimiter.fence"],
      [4, "done", ""],
    ],
  },
  {
    name: "HTML comments and tags as before",
    src: "<!-- note -->\n<u>x</u>",
    expect: [[1, "u", "tag"]],
  },
]

describe("comdtexLanguage: constructs", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const lines = md(c.src)
      for (const [line, text, type] of c.expect) {
        const found = lines[line].filter((t) => t.text === text || t.text.includes(text))
        const hit = found.find((t) => t.text === text) ?? found[0]
        expect(hit, `"${text}" on line ${line}: ${JSON.stringify(lines[line])}`).toBeDefined()
        expect(hit!.type, `"${text}" on line ${line}`).toBe(type)
      }
    })
  }
})

describe("comdtexLanguage: frontmatter", () => {
  it("paints keys, scalars and separators, then returns to Markdown", () => {
    const lines = md('---\ntitle: "Spectral gap"\ntags: [a, b]\n---\n# H')
    expect(typeOf(lines, 0, "---")).toBe("meta.separator")
    expect(typeOf(lines, 1, "title")).toBe("type.identifier")
    expect(typeOf(lines, 1, '"Spectral gap"')).toBe("string")
    expect(typeOf(lines, 2, "[")).toBe("delimiter")
    expect(typeOf(lines, 3, "---")).toBe("meta.separator")
    expect(lines[4][0].type).toBe("keyword")
  })

  it("only opens on the first line", () => {
    const lines = md("intro\n---\nkey: value")
    expect(lines[1][0].type).toBe("meta.separator")
    expect(typeOf(lines, 2, "key: value")).toBe("")
  })

  it("an unclosed header ends at the first line that is not YAML", () => {
    const lines = md("---\ntitle: x\n\n# A heading\ntext $x$")
    expect(lines[3][0].type).toBe("keyword")
    expect(typeOf(lines, 4, "x")).toBe("math")
  })
})

describe("comdtexLanguage: recovery", () => {
  it("an unclosed $$ ends at the next blank line", () => {
    const lines = md("$$\nx = 1\n\nplain $y$ text")
    expect(typeOf(lines, 1, "x")).toBe("math")
    expect(typeOf(lines, 3, "y")).toBe("math")
    expect(lines[3][0]).toEqual({ text: "plain ", type: "" })
  })

  it("an unclosed $$ ends at a structural line", () => {
    const heading = md("$$\nx\n# Title")
    expect(heading[2][0].type).toBe("keyword")
    const fence = md("$$\nx\n:::theorem\nbody\n:::")
    expect(fence[2][0].type).toBe("delimiter.env")
    expect(fence[2][1].type).toBe("keyword.env")
  })

  it("an unclosed special block ends at the next fence opener", () => {
    const lines = md(":::plot\nrange: [0, 1]\n:::theorem\nA *claim*.\n:::")
    expect(lines[2].map((t) => t.type)).toContain("keyword.env")
    expect(typeOf(lines, 3, "*claim*")).toBe("emphasis")
  })

  it("an inline $ without a closer on the line stays prose and never spans lines", () => {
    const lines = md("start $x and more\nnext line $y$")
    expect(lines[0].every((t) => !t.type.includes("math"))).toBe(true)
    expect(typeOf(lines, 1, "y")).toBe("math")
  })

  it("a tokenizer pass over a long document stays fast", () => {
    const block = "## H $a$\ntext @eq:x [@k] and frac(1,2)\n$$\nx\n$$ {#eq:a}\n:::lemma\nb\n:::\n"
    const text = block.repeat(2000)
    const t0 = performance.now()
    md(text)
    expect(performance.now() - t0).toBeLessThan(3000)
  })
})

describe("comdtexLanguage: vocabulary", () => {
  it("derives keywords and functions from a block catalog", () => {
    const w = blockWords(VOCAB.blocks.plot)
    expect(w.functions).toEqual(["sin"])
    expect(w.keywords).toContain("pi")
    const p = blockWords(VOCAB.blocks.pseudocode)
    expect(p.keywords).toEqual(expect.arrayContaining(["IF", "THEN", "END", "FOR", "TO", "DO"]))
  })

  it("picks shorthands out of the real completion catalog", () => {
    const names = shorthandNames(COMPLETIONS)
    expect(names).toEqual(expect.arrayContaining(["frac", "sqrt", "sum", "int"]))
    expect(names).not.toContain("theorem")
    const pseudo = blockWords(getSpecialBlockCompletions("pseudocode") ?? [])
    expect(pseudo.keywords).toEqual(expect.arrayContaining(["IF", "WHILE", "RETURN"]))
  })

  it("compiles with the real vocabulary", () => {
    const real: ComdtexVocabulary = {
      shorthands: shorthandNames(COMPLETIONS),
      blocks: Object.fromEntries(
        ["pseudocode", "flowchart", "truth", "graph", "plot", "commdiag"].map((t) => [
          t,
          getSpecialBlockCompletions(t) ?? [],
        ]),
      ),
    }
    const lines = md(":::pseudocode\nWHILE x DO\n:::\n$frac(a,b)$", real)
    expect(typeOf(lines, 1, "WHILE")).toBe("keyword.block")
    expect(typeOf(lines, 3, "frac")).toBe("function.shorthand")
  })

  it("lists the languages the editor provides intelligence for", () => {
    expect([...EDITOR_LANGUAGES]).toEqual(["markdown", "latex"])
  })
})

describe("latexLanguage", () => {
  const tex = (text: string) => run(makeTokenizer(buildLatexTokenizer(), "latex"), text)

  it("paints commands, environments, comments and labels", () => {
    const lines = tex(
      "\\section{Intro} % note\n\\begin{theorem}\\label{thm:a}\nSee \\ref{thm:a} and \\citep[p.~3]{k1,k2}.\n\\end{theorem}",
    )
    expect(typeOf(lines, 0, "\\section")).toBe("keyword")
    expect(typeOf(lines, 0, "% note")).toBe("comment")
    expect(typeOf(lines, 1, "theorem")).toBe("keyword.env")
    expect(typeOf(lines, 1, "thm:a")).toBe("tag.label")
    expect(typeOf(lines, 2, "thm:a")).toBe("tag.ref")
    expect(typeOf(lines, 2, "k1,k2")).toBe("string.cite")
    expect(typeOf(lines, 3, "theorem")).toBe("keyword.env")
  })

  it("paints math in every delimiter, and treats an escaped percent as text", () => {
    const lines = tex("$x^2$ \\[ \\alpha \\] \\( \\beta \\) $$ \\gamma $$ 50\\% done % c")
    expect(typeOf(lines, 0, "\\alpha")).toBe("keyword.math")
    expect(typeOf(lines, 0, "\\beta")).toBe("keyword.math")
    expect(typeOf(lines, 0, "\\gamma")).toBe("keyword.math")
    expect(typeOf(lines, 0, "% c")).toBe("comment")
    expect(lines[0].some((t) => t.type === "comment" && t.text.includes("done"))).toBe(false)
  })

  it("math environments are math until their end, verbatim is opaque", () => {
    const lines = tex(
      "\\begin{align}\n x &= \\sum_i a_i \\\\\n\\end{align}\n\\begin{verbatim}\n\\not $math$\n\\end{verbatim}\n\\textbf{x}",
    )
    expect(typeOf(lines, 1, "\\sum")).toBe("keyword.math")
    expect(typeOf(lines, 4, "\\not $math$")).toBe("variable.source")
    expect(typeOf(lines, 6, "\\textbf")).toBe("tag")
  })
})
