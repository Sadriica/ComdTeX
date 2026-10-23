// LaTeX as a Monaco language for `.tex` files.
//
// A compact Monarch grammar: commands, environments (`\begin{x}` / `\end{x}`),
// math in `$..$`, `$$..$$`, `\[..\]`, `\(..\)` and the math environments,
// `%` comments, braces, and the arguments that matter to a writer
// (`\label{}` / `\ref{}` / `\cite{}`). Verbatim-like environments are opaque.
// The token names are the ones comdtexLanguage.ts uses, so one set of theme
// rules (monacoThemes.ts) colours both languages.

import type * as monacoNs from "monaco-editor"

export const LATEX_LANGUAGE_ID = "latex"

const MATH_ENVS = "equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|math|split"
const VERBATIM_ENVS = "verbatim|lstlisting|minted|comment|Verbatim"
const CITE_COMMAND = String.raw`\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?`
const REF_COMMAND = String.raw`\\(?:[A-Za-z]*ref|eqref|cref|Cref|autoref|nameref|vref|pageref)\*?`

type Rule = monacoNs.languages.IMonarchLanguageRule

const mathCommon: Rule[] = [
  [/%.*$/, "comment"],
  [
    /(\\(?:begin|end))(\{)([A-Za-z*]+)(\})/,
    ["keyword.math", "delimiter.math", "keyword.env", "delimiter.math"],
  ],
  [/\\[A-Za-z@]+/, "keyword.math"],
  [/\\./, "keyword.math"],
  [/[A-Za-z]+/, "math"],
  [/\d+(?:\.\d+)?/, "number.math"],
  [/[{}^_&]/, "delimiter.math"],
  [/[^\\A-Za-z0-9{}^_&$%]+/, "math"],
]

/** Monarch definition of LaTeX source. Pure. */
export function buildLatexTokenizer(): monacoNs.languages.IMonarchLanguage {
  return {
    defaultToken: "",
    tokenPostfix: ".tex",
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        // verbatim-like environments are opaque until their \end
        [
          new RegExp(String.raw`(\\begin)(\{)(${VERBATIM_ENVS})(\})`),
          ["tag", "delimiter", { token: "keyword.env", next: "@verbatim.$3" }, "delimiter"],
        ],
        // math environments
        [
          new RegExp(String.raw`(\\begin)(\{)((?:${MATH_ENVS})\*?)(\})`),
          ["keyword", "delimiter", { token: "keyword.env", next: "@mathenv" }, "delimiter"],
        ],
        [
          /(\\(?:begin|end))(\{)([^}\n]*)(\})/,
          ["keyword", "delimiter", "keyword.env", "delimiter"],
        ],
        // labels and references: the argument is the interesting part
        [/(\\label)(\{)([^}\n]*)(\})/, ["tag", "delimiter", "tag.label", "delimiter"]],
        [
          new RegExp(String.raw`(${REF_COMMAND})(\{)([^}\n]*)(\})`),
          ["tag", "delimiter", "tag.ref", "delimiter"],
        ],
        [
          new RegExp(String.raw`(${CITE_COMMAND})((?:\[[^\]\n]*\]){0,2})(\{)([^}\n]*)(\})`),
          ["tag", "string", "delimiter", "string.cite", "delimiter"],
        ],
        // sectioning reads as structure
        [/\\(?:part|chapter|(?:sub)*section|paragraph|subparagraph)\*?/, "keyword"],
        // math
        [/\$\$/, { token: "delimiter.math", next: "@mathdd" }],
        [/\$/, { token: "delimiter.math", next: "@mathd" }],
        [/\\\[/, { token: "delimiter.math", next: "@mathbr" }],
        [/\\\(/, { token: "delimiter.math", next: "@mathpar" }],
        // commands and control symbols
        [/\\[A-Za-z@]+\*?/, "tag"],
        [/\\./, "escape"],
        [/[{}[\]]/, "delimiter"],
        [/[&~]/, "delimiter"],
      ],

      verbatim: [
        [
          /(\\end)(\{)($S2)(\})/,
          ["tag", "delimiter", { token: "keyword.env", next: "@pop" }, "delimiter"],
        ],
        [/.+/, "variable.source"],
      ],

      mathenv: [
        [
          /(\\end)(\{)((?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|math)\*?)(\})/,
          ["keyword", "delimiter", { token: "keyword.env", next: "@pop" }, "delimiter"],
        ],
        ...mathCommon,
      ],
      mathdd: [[/\$\$/, { token: "delimiter.math", next: "@pop" }], ...mathCommon],
      mathd: [[/\$/, { token: "delimiter.math", next: "@pop" }], ...mathCommon],
      mathbr: [[/\\\]/, { token: "delimiter.math", next: "@pop" }], ...mathCommon],
      mathpar: [[/\\\)/, { token: "delimiter.math", next: "@pop" }], ...mathCommon],
    },
  }
}

/** Register `latex` (id, extensions, editing configuration, tokenizer). Safe to
 *  call more than once. */
export function registerLatexLanguage(monaco: typeof monacoNs): void {
  if (!monaco.languages.getLanguages().some((l) => l.id === LATEX_LANGUAGE_ID)) {
    monaco.languages.register({
      id: LATEX_LANGUAGE_ID,
      extensions: [".tex"],
      aliases: ["LaTeX", "latex", "tex"],
    })
  }
  monaco.languages.setLanguageConfiguration(LATEX_LANGUAGE_ID, {
    comments: { lineComment: "%" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$", notIn: ["comment"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$" },
    ],
    folding: {
      markers: {
        start: /^\s*\\begin\{/,
        end: /^\s*\\end\{/,
      },
    },
  })
  monaco.languages.setMonarchTokensProvider(LATEX_LANGUAGE_ID, buildLatexTokenizer())
}
