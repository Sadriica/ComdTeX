// ComdTeX Markdown as a Monarch grammar.
//
// Replaces Monaco's built-in markdown tokenizer for the editor. The built-in
// one knows nothing of what makes a ComdTeX note different: `$..$` and `$$..$$`
// math, `:::type[title]{#label}` fences, `@kind:name` references, `[@key]`
// citations, shorthands, `{{?}}` gaps, `^^keep^^` marks, frontmatter. It also
// mis-paints them (`{...}` as a link target, `_x_` emphasis inside math,
// headings and quotes inside `$$` bodies). This grammar keeps the language id
// "markdown" so every provider registered for it keeps working.
//
// Tokens (theme rules live in monacoThemes.ts, colours in themes.css):
//   delimiter.math / math / keyword.math / number.math   math content
//   function.shorthand                                   `frac(` and friends
//   delimiter.env / keyword.env / string.title / tag.label   `:::type[t]{#l}`
//   keyword.block / operator / type.identifier           special-block bodies
//   tag.ref / string.cite / delimiter.cite               `@eq:x`, `[@key; @k2]`
//   string.link / string.link.embed                      `[[note]]`, `![[note]]`
//   tag.footnote / keyword.task / mark                   `[^1]`, `- [ ]`, `==hl==`
//   invalid.gap / comment.keep                           `{{?}}`, `^^keep^^`
//   meta.frontmatter / meta.separator                    YAML header
//   delimiter.fence / variable.source                    fenced code (opaque)
//
// Recovery rules, because Monarch only sees one line at a time:
//   - inline `$..$` opens only when a closing `$` follows on the same line
//     (pandoc's rule: no space inside the dollars, no digit right after), so a
//     price like "$5 and $6" stays prose and nothing ever spans lines;
//   - display `$$` ends at a blank line, a `:::` line, a heading or a code
//     fence, whichever comes first. An unclosed `$$` therefore paints at most
//     one paragraph instead of the rest of the document (the linter reports
//     the missing closer; the renderer is more lenient about blank lines, which
//     is the one case where the highlight stops early on legitimate math);
//   - frontmatter ends at its closing `---` or at the first line that cannot be
//     YAML (a heading, prose), so a stray opening `---` never swallows the note;
//   - special-block bodies end at their `:::` or at the next `:::type` opener.
//
// Fenced code is opaque; common languages are embedded lazily through Monaco's
// own basic-language loaders (registered in monacoRuntime.ts).

import type * as monacoNs from "monaco-editor"

/** Languages the editor provides ComdTeX intelligence for. Providers are
 *  registered once per id listed here (latexLanguage.ts defines "latex"). */
export const EDITOR_LANGUAGES = ["markdown", "latex"] as const
export type EditorLanguage = (typeof EDITOR_LANGUAGES)[number]

/** Vocabulary the grammar highlights, injected so this module imports nothing
 *  from monacoSetup.ts (which calls it). */
export interface ComdtexVocabulary {
  /** Shorthand names (`frac`, `sqrt`, ...) highlighted when followed by `(`. */
  shorthands: readonly string[]
  /** Special-block catalogs by block type (pseudocode, truth, plot, ...). */
  blocks: Readonly<Record<string, readonly { label: string; snippet: string }[]>>
}

interface BlockWords {
  keywords: string[]
  functions: string[]
}

/** Keywords of one block catalog: upper-case words of its labels and snippets
 *  (IF, THEN, END FOR, AND), plus plain words whose snippet is just themselves
 *  (`pi`); functions are labels whose snippet is `label(...)`. */
export function blockWords(
  catalog: readonly { label: string; snippet: string }[] | undefined,
): BlockWords {
  const keywords = new Set<string>()
  const functions = new Set<string>()
  for (const c of catalog ?? []) {
    if (/^[A-Z]{2,}$/.test(c.label)) keywords.add(c.label)
    for (const w of c.snippet.match(/\b[A-Z]{2,}\b/g) ?? []) keywords.add(w)
    if (c.snippet === c.label && /^[A-Za-z]{2,}$/.test(c.label)) keywords.add(c.label)
    if (c.snippet.startsWith(`${c.label}(`) && /^[A-Za-z]{2,}$/.test(c.label))
      functions.add(c.label)
  }
  return { keywords: [...keywords], functions: [...functions] }
}

/** Shorthand names out of the completion catalog: entries whose snippet is
 *  `name(...)`. */
export function shorthandNames(catalog: readonly { label: string; snippet: string }[]): string[] {
  return catalog
    .filter((c) => /^[A-Za-z][A-Za-z0-9]*$/.test(c.label) && c.snippet.startsWith(`${c.label}(`))
    .map((c) => c.label)
}

// A literal "@" in a Monarch regex has to be written "@@" (otherwise "@name"
// is an attribute reference), so the shared patterns spell it that way.
const REF_SOURCE = String.raw`@@(?:\[[^\]\n]+\]@@|[A-Za-z0-9_./\-]+@@)?[A-Za-z]+:[\w\-]+(?:\.\w+)*`
const LABEL_SOURCE = String.raw`\{#[\w:.\-]+\}`
const WORD = String.raw`[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ]`

type Rule = monacoNs.languages.IMonarchLanguageRule

/** Fence languages embedded lazily: Monaco language id, fence names. */
const EMBEDDED_FENCES: [string, string][] = [
  ["javascript", "js|javascript|jsx|mjs|cjs|json|json5"],
  ["typescript", "ts|typescript|tsx"],
  ["python", "py|python|python3"],
  ["shell", "sh|bash|zsh|shell"],
  ["yaml", "yaml|yml"],
  ["latex", "latex|tex"],
]

// Block type -> body state. Anything else is a Markdown body (theorem, proof,
// callouts, folded, ...).
const BODY_STATES: [string, string][] = [
  ["pseudocode|flowchart", "body_pseudo"],
  ["truth", "body_truth"],
  ["graph|commdiag", "body_arrows"],
  ["plot", "body_plot"],
  ["code|excalidraw", "body_opaque"],
  ["csv|data|dataplot", "body_data"],
]

const CLOSER: Rule = [
  /^(\s*)(:::)(\s*)$/,
  ["white", { token: "delimiter.env", next: "@pop" }, "white"],
]
const UNCLOSED_RECOVERY: Rule = [/^(?=\s*:::[A-Za-z])/, { token: "@rematch", next: "@pop" }]
const LINE_SCOPED_POP: Rule = [/^/, { token: "@rematch", next: "@pop" }]

function opener(): Rule {
  const cases: Record<string, monacoNs.languages.IMonarchLanguageAction> = {}
  for (const [types, state] of BODY_STATES) {
    cases[`$4~${types}`] = { token: "keyword.env", next: `@${state}` }
  }
  cases["@default"] = { token: "keyword.env", next: "@body_env" }
  return [
    /^(\s*)(:::)((?:(?:sm|lg)\s+)?)([A-Za-z][\w-]*)((?:\[[^\]\n]*\])?)((?:\s*\{#[\w:.\-]*\})?)(.*)$/,
    // The state switch rides on the type group: Monarch never reaches a
    // trailing group that matched nothing, so it cannot carry the action.
    ["white", "delimiter.env", "keyword.env", { cases }, "string.title", "tag.label", ""],
  ]
}

function fenceRules(): Rule[] {
  const rules: Rule[] = []
  for (const [id, names] of EMBEDDED_FENCES) {
    rules.push([
      new RegExp(String.raw`^\s*(?:\x60{3}|~{3})\s*(?:${names})(?![\w+#.-]).*$`),
      { token: "delimiter.fence", next: "@fence_embedded", nextEmbedded: id },
    ])
  }
  rules.push(
    [/^\s*`{4,}.*$/, { token: "delimiter.fence", next: "@fence4" }],
    [/^\s*`{3}.*$/, { token: "delimiter.fence", next: "@fence3" }],
    [/^\s*~{3,}.*$/, { token: "delimiter.fence", next: "@fence_tilde" }],
  )
  return rules
}

/** A state that paints `token` for plain text and still lets inline constructs
 *  (math, code, refs) through; pops at the end of the line. */
function inlineState(token: string, close: RegExp): Rule[] {
  return [
    LINE_SCOPED_POP,
    [close, { token, next: "@pop" }],
    [new RegExp(`${WORD}+(?:_${WORD}+)*`), token],
    { include: "@inline" },
    [/./, token],
  ]
}

/** Monarch definition of ComdTeX Markdown. Pure: no Monaco needed to build it. */
export function buildComdtexTokenizer(
  vocab: ComdtexVocabulary,
): monacoNs.languages.IMonarchLanguage {
  const pseudo = blockWords(vocab.blocks.pseudocode)
  const truth = blockWords(vocab.blocks.truth)
  const plot = blockWords(vocab.blocks.plot)
  const wordRule = (kw: string): Rule => [
    /[A-Za-z_][A-Za-z0-9_]*/,
    { cases: { [`@${kw}`]: "keyword.block", "@default": "" } },
  ]

  return {
    defaultToken: "",
    tokenPostfix: ".md",
    start: "start",

    shorthands: [...vocab.shorthands],
    pseudoKeywords: pseudo.keywords,
    truthKeywords: truth.keywords,
    plotKeywords: plot.keywords,
    plotFunctions: plot.functions,

    // `@escapes` is expanded inside regexes below.
    escapes: /\\[\\`*_{}\[\]()#+\-.!$@^=|~<>:%]/,

    tokenizer: {
      // Only the very first line can open frontmatter; after that the state is
      // switched to root for good.
      start: [
        [/^---[ \t]*$/, { token: "meta.separator", switchTo: "@frontmatter" }],
        [/^/, { token: "@rematch", switchTo: "@root" }],
      ],

      frontmatter: [
        [/^(?:---|\.\.\.)[ \t]*$/, { token: "meta.separator", switchTo: "@root" }],
        [/^[ \t]+#.*$/, "comment"],
        [
          /^(\s*)((?:-\s+)?)([\w.\-]+)(\s*:)(?=\s|$)/,
          ["white", "delimiter", "type.identifier", "delimiter"],
        ],
        [/^(\s*)(-)(?=\s)/, ["white", "delimiter"]],
        // Not YAML-shaped (prose, a heading): the header was never closed.
        [/^(?=\S)/, { token: "@rematch", switchTo: "@root" }],
        [/\s+#.*$/, "comment"],
        [/"(?:[^"\\]|\\.)*"|'[^']*'/, "string"],
        [/[[\]{},]/, "delimiter"],
        [/[+-]?\d[\d_.]*(?=\s|,|\]|\}|$)/, "number"],
        [/[^\s#"'[\]{},]+/, "string"],
        [/\s+/, "meta.frontmatter"],
      ],

      root: [{ include: "@blocks" }, { include: "@inline" }],

      blocks: [
        [/^\s*\|/, "@rematch", "@table_header"],
        [/^(\s*)(:::)(\s*)$/, ["white", "delimiter.env", "white"]],
        opener(),
        ...fenceRules(),
        // thematic break before list/setext so `---` is not a bullet
        [/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/, "meta.separator"],
        [/^(\s{0,3})(#{1,6})(?=\s|$)/, ["white", { token: "keyword", next: "@heading" }]],
        [/^\s*(=+|-+)\s*$/, "keyword"],
        [/^(\s*)(>+)(\s*)(\[![\w-]+\][+-]?)/, ["white", "comment", "white", "keyword.env"]],
        [/^\s*>+/, "comment"],
        [
          /^(\s*)([*+-]|\d+[.)])(\s+)(\[[ xX]\])(?=\s|$)/,
          ["white", "keyword", "white", "keyword.task"],
        ],
        [/^\s*([*+:-]|\d+[.)])(?=\s)/, "keyword"],
        [/^(\s*)(\[\^[^\]\s]+\])(:)/, ["white", "tag.footnote", "delimiter"]],
      ],

      heading: [
        LINE_SCOPED_POP,
        [new RegExp(`${WORD}+(?:_${WORD}+)*`), "keyword"],
        { include: "@inline" },
        [/./, "keyword"],
      ],

      // ── inline constructs, in priority order ─────────────────────────────
      inline: [
        [/&\w+;/, "string.escape"],
        [/@escapes/, "escape"],
        [/\$\$/, { token: "delimiter.math", next: "@dmath" }],
        [
          /\$(?=[^\s$])(?=(?:\\.|[^$\\])*?[^\s$\\]\$(?!\d))/,
          { token: "delimiter.math", next: "@imath" },
        ],
        [/(`+)(?:(?!\1)[^\n])+\1/, "variable"],
        [/\[(?=@@[\w])/, { token: "delimiter.cite", next: "@cite" }],
        [/!\[\[[^\]\n]*\]\]/, "string.link.embed"],
        [/\[\[[^\]\n]*\]\]/, "string.link"],
        [/\[\^[^\]\s]+\]/, "tag.footnote"],
        [/\{\{\?[^}\n]*\}\}/, "invalid.gap"],
        [/\^\^(?:[^^\n]|\^(?!\^))+\^\^/, "comment.keep"],
        [/==(?=[^\s=])(?:[^=\n]|=(?!=))+?==/, "mark"],
        [new RegExp(REF_SOURCE), "tag.ref"],
        [new RegExp(LABEL_SOURCE), "tag.label"],
        [
          /[A-Za-z][A-Za-z0-9]*(?=\()/,
          { cases: { "@shorthands": "function.shorthand", "@default": "" } },
        ],
        [new RegExp(`${WORD}+(?:_${WORD}+)*`), ""],
        [/\*\*(?=[^\s*])(?=.*?[^\s*]\*\*)/, { token: "strong", next: "@strong" }],
        [/__(?=[^\s_])(?=.*?[^\s_]__(?![A-Za-z0-9]))/, { token: "strong", next: "@strong_us" }],
        [/\*(?=[^\s*])(?=[^*]*[^\s*]\*)/, { token: "emphasis", next: "@emph" }],
        [/_(?=[^\s_])(?=[^_]*[^\s_]_(?![A-Za-z0-9]))/, { token: "emphasis", next: "@emph_us" }],
        [/(!?\[)((?:[^\]\\]|@escapes)*)(\]\([^)]+\))/, ["string.link", "", "string.link"]],
        [/(!?\[)((?:[^\]\\]|@escapes)*)(\])/, "string.link"],
        [/https?:\/\/[^\s)>\]]+/, "string.link"],
        { include: "html" },
      ],

      strong: inlineState("strong", /\*\*/),
      strong_us: inlineState("strong", /__/),
      emph: inlineState("emphasis", /\*/),
      emph_us: inlineState("emphasis", /_/),

      // ── math ─────────────────────────────────────────────────────────────
      imath: [
        LINE_SCOPED_POP,
        [/\$/, { token: "delimiter.math", next: "@pop" }],
        { include: "@mathcommon" },
      ],
      dmath: [
        // recovery: an unclosed `$$` never outlives its paragraph
        [/^\s*$/, { token: "", next: "@pop" }],
        [/^(?=\s*(?::::*|#{1,6}\s|`{3,}|~{3,}))/, { token: "@rematch", next: "@pop" }],
        [
          /(\$\$)(\s*)(\{#[\w:.\-]+\})/,
          ["delimiter.math", "white", { token: "tag.label", next: "@pop" }],
        ],
        [/\$\$/, { token: "delimiter.math", next: "@pop" }],
        { include: "@mathcommon" },
        [/\$/, "math"],
      ],
      mathcommon: [
        [
          /(\\(?:begin|end))(\{)([A-Za-z*]+)(\})/,
          ["keyword.math", "delimiter.math", "keyword.env", "delimiter.math"],
        ],
        [/\\[A-Za-z]+/, "keyword.math"],
        [/\\./, "keyword.math"],
        [
          /[A-Za-z][A-Za-z0-9]*(?=\()/,
          { cases: { "@shorthands": "function.shorthand", "@default": "math" } },
        ],
        [/[A-Za-z]+/, "math"],
        [/\d+(?:\.\d+)?/, "number.math"],
        [/[{}^_&]/, "delimiter.math"],
        [/[^\\A-Za-z0-9{}^_&$]+/, "math"],
      ],

      // ── citations `[@a; @b, p. 3]` ───────────────────────────────────────
      cite: [
        LINE_SCOPED_POP,
        [/\]/, { token: "delimiter.cite", next: "@pop" }],
        [/@@[\w:.\-]+/, "string.cite"],
        [/[;,]/, "delimiter.cite"],
        [/[^\]@;,]+/, ""],
      ],

      // ── fenced code (opaque) ─────────────────────────────────────────────
      fence3: [
        [/^\s*`{3,}\s*$/, { token: "delimiter.fence", next: "@pop" }],
        [/.+/, "variable.source"],
      ],
      fence4: [
        [/^\s*`{4,}\s*$/, { token: "delimiter.fence", next: "@pop" }],
        [/.+/, "variable.source"],
      ],
      fence_tilde: [
        [/^\s*~{3,}\s*$/, { token: "delimiter.fence", next: "@pop" }],
        [/.+/, "variable.source"],
      ],
      fence_embedded: [
        [
          /^\s*(?:`{3,}|~{3,})\s*$/,
          { token: "delimiter.fence", next: "@pop", nextEmbedded: "@pop" },
        ],
        [/.+/, "variable.source"],
      ],

      // ── `:::` bodies ─────────────────────────────────────────────────────
      body_env: [CLOSER, { include: "@root" }],

      body_pseudo: [
        CLOSER,
        UNCLOSED_RECOVERY,
        [/^\s*#(?:algo|end)\b.*$/, "keyword.block"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/\d+(?:\.\d+)?/, "number"],
        wordRule("pseudoKeywords"),
        [/←|→|↔|<-|->|<=|>=|!=|==/, "operator"],
        [new RegExp(REF_SOURCE), "tag.ref"],
        [/\{\{\?[^}\n]*\}\}/, "invalid.gap"],
      ],
      body_truth: [
        CLOSER,
        UNCLOSED_RECOVERY,
        wordRule("truthKeywords"),
        [/<->|->|&&|\|\||[∧∨¬→↔≡*+!&|]/, "operator"],
        [new RegExp(REF_SOURCE), "tag.ref"],
        [/\{\{\?[^}\n]*\}\}/, "invalid.gap"],
      ],
      body_arrows: [
        CLOSER,
        UNCLOSED_RECOVERY,
        [/<->|->>|>->|==>|->|--|=>/, "operator"],
        [/\[[^\]\n]*\]/, "string"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/\d+(?:\.\d+)?/, "number"],
        [new RegExp(REF_SOURCE), "tag.ref"],
        [/\{\{\?[^}\n]*\}\}/, "invalid.gap"],
      ],
      body_plot: [
        CLOSER,
        UNCLOSED_RECOVERY,
        [/[A-Za-z_]\w*(?=\s*:)/, "type.identifier"],
        [
          /[A-Za-z_][A-Za-z0-9_]*(?=\()/,
          { cases: { "@plotFunctions": "function.shorthand", "@default": "" } },
        ],
        wordRule("plotKeywords"),
        [/\d+(?:\.\d+)?(?:e[+-]?\d+)?/, "number"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [new RegExp(REF_SOURCE), "tag.ref"],
        [/\{\{\?[^}\n]*\}\}/, "invalid.gap"],
      ],
      body_data: [
        CLOSER,
        UNCLOSED_RECOVERY,
        [/[A-Za-z_]\w*(?=\s*:)/, "type.identifier"],
        [/\d+(?:\.\d+)?/, "number"],
        [new RegExp(REF_SOURCE), "tag.ref"],
        [/\{\{\?[^}\n]*\}\}/, "invalid.gap"],
      ],
      body_opaque: [CLOSER, UNCLOSED_RECOVERY, [/.+/, "variable.source"]],

      // ── tables (as the built-in grammar, with our inline rules) ──────────
      table_header: [{ include: "@table_common" }, [/[^|]+/, "keyword.table.header"]],
      table_body: [{ include: "@table_common" }, { include: "@inline" }],
      table_common: [
        [/\s*[-:]+\s*/, { token: "keyword", switchTo: "table_body" }],
        [/^\s*\|/, "keyword.table.left"],
        [/^\s*[^|]/, "@rematch", "@pop"],
        [/^\s*$/, "@rematch", "@pop"],
        [
          /\|/,
          {
            cases: {
              "@eos": "keyword.table.right",
              "@default": "keyword.table.middle",
            },
          },
        ],
      ],

      // ── inline HTML (same shape as the built-in grammar) ─────────────────
      html: [
        [/<(\w+)\/>/, "tag"],
        [/<(\w+)(-|\w)*/, { token: "tag", next: "@tag.$1" }],
        [/<\/(\w+)(-|\w)*\s*>/, { token: "tag" }],
        [/<!--/, "comment", "@comment"],
      ],
      comment: [
        [/[^<-]+/, "comment.content"],
        [/-->/, "comment", "@pop"],
        [/<!--/, "comment.content.invalid"],
        [/[<-]/, "comment.content"],
      ],
      tag: [
        [/[ \t\r\n]+/, "white"],
        [
          /(\w+)(\s*=\s*)("[^"]*"|'[^']*')/,
          ["attribute.name.html", "delimiter.html", "string.html"],
        ],
        [/\w+/, "attribute.name.html"],
        [/\/>/, "tag", "@pop"],
        [/>/, { token: "tag", next: "@pop" }],
      ],
    },
  }
}

/** Register the grammar as the tokenizer of the "markdown" language. */
export function registerComdtexLanguage(
  monaco: typeof monacoNs,
  vocab: ComdtexVocabulary,
): monacoNs.IDisposable {
  return monaco.languages.setMonarchTokensProvider("markdown", buildComdtexTokenizer(vocab))
}

/** Token type at a position, or "" when unknown. Re-tokenizes a bounded window
 *  above the line (state is rebuilt from `lookback` lines up), so use it for
 *  occasional decisions, not per keystroke. */
export function tokenAt(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.IPosition,
  lookback = 120,
): string {
  const first = Math.max(1, position.lineNumber - lookback)
  const lines: string[] = []
  for (let n = first; n <= position.lineNumber; n++) lines.push(model.getLineContent(n))
  const tokenised = monaco.editor.tokenize(lines.join("\n"), model.getLanguageId())
  const row = tokenised[tokenised.length - 1] ?? []
  let type = ""
  for (const t of row) {
    if (t.offset <= position.column - 1) type = t.type
    else break
  }
  return type
}
