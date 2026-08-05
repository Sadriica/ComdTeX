// Typst as a first-class Monaco language.
//
// Typst is the modern typesetting system ComdTeX supports natively: .typ
// files live in the vault, open with this highlighting, and compile to PDF
// through the local `typst` binary (already in the shell allowlist and
// detected by checkDeps.ts). The grammar below is a pragmatic Monarch
// tokenizer for markup mode plus the pieces of code/math mode that dominate
// real documents; Typst's full grammar is context-dependent beyond what
// Monarch models, so edge cases fall back to plain text rather than
// mis-highlighting.

import type * as monacoNs from "monaco-editor"

export const TYPST_LANGUAGE_ID = "typst"

export function registerTypstLanguage(monaco: typeof monacoNs): void {
  if (monaco.languages.getLanguages().some((l) => l.id === TYPST_LANGUAGE_ID)) return

  monaco.languages.register({ id: TYPST_LANGUAGE_ID, extensions: [".typ"] })

  monaco.languages.setLanguageConfiguration(TYPST_LANGUAGE_ID, {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "$", close: "$", notIn: ["string", "comment"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "$", close: "$" },
      { open: "*", close: "*" },
      { open: "_", close: "_" },
    ],
  })

  monaco.languages.setMonarchTokensProvider(TYPST_LANGUAGE_ID, {
    defaultToken: "",
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@blockComment"],
        // headings: = Title, == Section, ...
        [/^\s*=+\s.*$/, "keyword"],
        // #function calls and #keywords (#let, #import, #show, #set, ...)
        [/#(let|set|show|import|include|if|else|for|while|return|context)\b/, "keyword"],
        [/#[A-Za-z_][A-Za-z0-9_-]*/, "type.identifier"],
        // labels <intro> and references @intro
        [/<[A-Za-z_][A-Za-z0-9_:.-]*>/, "tag"],
        [/@[A-Za-z_][A-Za-z0-9_:.-]*/, "tag"],
        // inline math
        [/\$/, { token: "string.escape", next: "@math" }],
        // raw blocks
        [/```/, { token: "string", next: "@raw" }],
        [/`[^`]*`/, "string"],
        // emphasis
        [/\*[^*\n]+\*/, "strong"],
        [/\b_[^_\n]+_\b/, "emphasis"],
        [/"([^"\\]|\\.)*"/, "string"],
      ],
      blockComment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      math: [
        [/\$/, { token: "string.escape", next: "@pop" }],
        [/[A-Za-z]+/, "variable"],
        [/[^$A-Za-z]+/, "string.escape"],
      ],
      raw: [
        [/```/, { token: "string", next: "@pop" }],
        [/.+/, "string"],
      ],
    },
  })
}
