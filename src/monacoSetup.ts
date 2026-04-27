import type * as monacoApi from "monaco-editor"
import type { VimAdapterInstance } from "monaco-vim"
import katex from "katex"
import { lintFile, type LintContext } from "./contentLinter"

interface Completion {
  label: string
  detail: string
  snippet: string
}

export const COMPLETIONS: Completion[] = [
  // ── Environments ─────────────────────────────────────────────────────────
  { label: "theorem",     detail: ":::theorem → numbered theorem",     snippet: ":::theorem[${1:title}]\n${2:statement}\n:::" },
  { label: "lemma",       detail: ":::lemma → numbered lemma",         snippet: ":::lemma[${1:title}]\n${2:statement}\n:::" },
  { label: "corollary",   detail: ":::corollary → corollary",          snippet: ":::corollary\n${1:statement}\n:::" },
  { label: "proposition", detail: ":::proposition → proposition",      snippet: ":::proposition\n${1:statement}\n:::" },
  { label: "definition",  detail: ":::definition → definition",        snippet: ":::definition\n${1:definition}\n:::" },
  { label: "example",     detail: ":::example → example",              snippet: ":::example\n${1:example}\n:::" },
  { label: "exercise",    detail: ":::exercise → exercise",            snippet: ":::exercise\n${1:exercise}\n:::" },
  { label: "proof",       detail: ":::proof → proof (with □)",         snippet: ":::proof\n${1:proof}\n:::" },
  { label: "remark",      detail: ":::remark → remark",                snippet: ":::remark\n${1:remark}\n:::" },
  { label: "note",        detail: ":::note → note",                    snippet: ":::note\n${1:note}\n:::" },
  // ── Truth table ─────────────────────────────────────────────────────────────
  { label: ":::truth", detail: ":::truth → truth table block", snippet: ":::truth[${1:title}]\n${2:p ∧ q}\n:::" },
  // ── Graph visualizer ────────────────────────────────────────────────────────
  { label: ":::graph", detail: "Graph visualizer", snippet: ":::graph[${1:title}]\n${2:A -- B}\n${3:A -- C}\n:::" },
  // ── Function plotter ────────────────────────────────────────────────────────
  { label: ":::plot", detail: "Function plotter", snippet: ":::plot[${1:title}]\n${2:f(x) = sin(x)}\nrange: [${3:-6.28}, ${4:6.28}]\n:::" },
  // ── Commutative diagram ─────────────────────────────────────────────────────
  { label: ":::commdiag", detail: "Commutative diagram", snippet: ":::commdiag[${1:title}]\n${2:A} -> ${3:B} [${4:f}]\n${5:A} -> ${6:C} [${7:g}]\n${8:B} -> ${9:D} [${10:h}]\n${11:C} -> ${12:D} [${13:k}]\n:::" },
  // ── Pseudocode ──────────────────────────────────────────────────────────────
  { label: "#algo",     detail: "#algo[Title] ... #end → algorithm block with flowchart", snippet: "#algo[${1:Algorithm name}]\nINPUT: ${2:description}\nOUTPUT: ${3:description}\n\n${4:FOR i ← 1 TO n DO\n  ${5:statement}\nEND FOR}\n#end" },
  { label: "FOR",       detail: "pseudocode: FOR loop",     snippet: "FOR ${1:i} ← ${2:1} TO ${3:n} DO\n  ${4}\nEND FOR" },
  { label: "WHILE",     detail: "pseudocode: WHILE loop",   snippet: "WHILE ${1:condition} DO\n  ${2}\nEND WHILE" },
  { label: "IF",        detail: "pseudocode: IF statement", snippet: "IF ${1:condition} THEN\n  ${2}\nEND IF" },
  { label: "FUNCTION",   detail: "pseudocode: FUNCTION block",       snippet: "FUNCTION ${1:Name}(${2:args})\n  ${3}\n  RETURN ${4}\nEND FUNCTION" },
  { label: "RETURN",    detail: "pseudocode: RETURN",                snippet: "RETURN ${1:value}" },
  { label: "REPEAT",    detail: "pseudocode: REPEAT...UNTIL loop",   snippet: "REPEAT\n  ${1:statement}\nUNTIL ${2:condition}" },
  { label: "ELSE",      detail: "pseudocode: ELSE branch",           snippet: "ELSE\n  ${1:statement}" },
  { label: "INPUT",     detail: "pseudocode: input (parallelogram)",  snippet: "INPUT: ${1:variable}" },
  { label: "OUTPUT",    detail: "pseudocode: output (parallelogram)", snippet: "OUTPUT: ${1:value}" },
  { label: "PROCEDURE", detail: "pseudocode: PROCEDURE block",       snippet: "PROCEDURE ${1:Name}(${2:args})\n  ${3}\nEND PROCEDURE" },
  { label: "#end",      detail: "pseudocode: close #algo block",     snippet: "#end" },
  // ── Math shorthands ───────────────────────────────────────────────────────
  { label: "table", detail: "table(Col1, Col2, ...) → markdown table",         snippet: "table(${1:Col1}, ${2:Col2}, ${3:Col3})" },
  { label: "mat",   detail: "mat(v1, v2, ...) → auto-sized matrix",            snippet: "mat(${1:1}, ${2:2}, ${3:3}, ${4:4})" },
  { label: "matf",  detail: "matf(rows, cols, v1, ...) → explicit-size matrix",snippet: "matf(${1:2}, ${2:2})" },
  { label: "frac",  detail: "frac(num, den) → a/b",                            snippet: "frac(${1:a}, ${2:b})" },
  { label: "sqrt",  detail: "sqrt(x) → √x",                                    snippet: "sqrt(${1:x})" },
  { label: "root",  detail: "root(n, x) → ⁿ√x",                               snippet: "root(${1:n}, ${2:x})" },
  { label: "sum",   detail: "sum(start, end) → Σ",                             snippet: "sum(${1:i=0}, ${2:n})" },
  { label: "int",   detail: "int(a, b) → ∫",                                   snippet: "int(${1:a}, ${2:b})" },
  { label: "lim",   detail: "lim(var, val) → lim",                             snippet: "lim(${1:x}, ${2:0})" },
  { label: "vec",   detail: "vec(v) → v⃗",                                       snippet: "vec(${1:v})" },
  { label: "abs",   detail: "abs(x) → |x|",                                      snippet: "abs(${1:x})" },
  { label: "norm",  detail: "norm(v) → ‖v‖",                                     snippet: "norm(${1:v})" },
  { label: "ceil",  detail: "ceil(x) → ⌈x⌉",                                    snippet: "ceil(${1:x})" },
  { label: "floor", detail: "floor(x) → ⌊x⌋",                                   snippet: "floor(${1:x})" },
  // Superscript / subscript
  { label: "sup",   detail: "sup(x, n) → x^{n}",                                snippet: "sup(${1:x}, ${2:n})" },
  { label: "sub",   detail: "sub(x, n) → x_{n}",                                snippet: "sub(${1:x}, ${2:n})" },
  // Decorators
  { label: "hat",   detail: "hat(x) → x̂",                                       snippet: "hat(${1:x})" },
  { label: "bar",   detail: "bar(x) → x̄",                                       snippet: "bar(${1:x})" },
  { label: "tilde", detail: "tilde(x) → x̃",                                     snippet: "tilde(${1:x})" },
  { label: "dot",   detail: "dot(x) → ẋ",                                        snippet: "dot(${1:x})" },
  { label: "ddot",  detail: "ddot(x) → ẍ",                                       snippet: "ddot(${1:x})" },
  // Math fonts
  { label: "bf",    detail: "bf(x) → 𝐱 (mathbf)",                               snippet: "bf(${1:x})" },
  { label: "cal",   detail: "cal(A) → 𝒜 (mathcal)",                             snippet: "cal(${1:A})" },
  { label: "bb",    detail: "bb(R) → ℝ (mathbb)",                                snippet: "bb(${1:R})" },
  // Derivatives
  { label: "pder",  detail: "pder(f, x) → ∂f/∂x",                               snippet: "pder(${1:f}, ${2:x})" },
  { label: "der",   detail: "der(f, x) → df/dx",                                 snippet: "der(${1:f}, ${2:x})" },
  // Linear algebra
  { label: "inv",   detail: "inv(A) → A⁻¹",                                      snippet: "inv(${1:A})" },
  { label: "trans", detail: "trans(A) → Aᵀ",                                     snippet: "trans(${1:A})" },
  // ── Trig / Math functions ──────────────────────────────────────────────────
  { label: "sin",   detail: "sin(x) → \\sin(x)",                                  snippet: "sin(${1:x})" },
  { label: "cos",   detail: "cos(x) → \\cos(x)",                                  snippet: "cos(${1:x})" },
  { label: "tan",   detail: "tan(x) → \\tan(x)",                                  snippet: "tan(${1:x})" },
  { label: "cot",   detail: "cot(x) → \\cot(x)",                                  snippet: "cot(${1:x})" },
  { label: "sec",   detail: "sec(x) → \\sec(x)",                                  snippet: "sec(${1:x})" },
  { label: "csc",   detail: "csc(x) → \\csc(x)",                                  snippet: "csc(${1:x})" },
  { label: "exp",   detail: "exp(x) → \\exp(x)",                                  snippet: "exp(${1:x})" },
  { label: "ln",    detail: "ln(x) → \\ln(x)",                                    snippet: "ln(${1:x})" },
  { label: "log",   detail: "log(x) → \\log(x)",                                  snippet: "log(${1:x})" },
]

// ── LaTeX command list for \ autocomplete ─────────────────────────────────────

const LATEX_COMMANDS: [string, string][] = [
  ["α","\\alpha"],["β","\\beta"],["γ","\\gamma"],["δ","\\delta"],
  ["ε","\\epsilon"],["ζ","\\zeta"],["η","\\eta"],["θ","\\theta"],
  ["λ","\\lambda"],["μ","\\mu"],["ν","\\nu"],["ξ","\\xi"],
  ["π","\\pi"],["ρ","\\rho"],["σ","\\sigma"],["τ","\\tau"],
  ["φ","\\phi"],["χ","\\chi"],["ψ","\\psi"],["ω","\\omega"],
  ["Γ","\\Gamma"],["Δ","\\Delta"],["Θ","\\Theta"],["Λ","\\Lambda"],
  ["Σ","\\Sigma"],["Φ","\\Phi"],["Ψ","\\Psi"],["Ω","\\Omega"],
  ["∞","\\infty"],["∂","\\partial"],["∇","\\nabla"],["∈","\\in"],
  ["∉","\\notin"],["⊂","\\subset"],["⊆","\\subseteq"],["∪","\\cup"],
  ["∩","\\cap"],["∅","\\emptyset"],["∀","\\forall"],["∃","\\exists"],
  ["→","\\to"],["←","\\leftarrow"],["↔","\\leftrightarrow"],
  ["⇒","\\Rightarrow"],["⇐","\\Leftarrow"],["⇔","\\Leftrightarrow"],
  ["±","\\pm"],["×","\\times"],["÷","\\div"],["≤","\\leq"],
  ["≥","\\geq"],["≠","\\neq"],["≈","\\approx"],["≡","\\equiv"],
  ["·","\\cdot"],["…","\\ldots"],["⋯","\\cdots"],["⊕","\\oplus"],
  ["⊗","\\otimes"],["√","\\sqrt{}"],["∑","\\sum"],["∫","\\int"],
  ["∏","\\prod"],["lim","\\lim"],["sup","\\sup"],["inf","\\inf"],
  ["sin","\\sin"],["cos","\\cos"],["tan","\\tan"],["log","\\log"],
  ["ln","\\ln"],["det","\\det"],["dim","\\dim"],
  ["ℝ","\\mathbb{R}"],["ℕ","\\mathbb{N}"],["ℤ","\\mathbb{Z}"],
  ["ℚ","\\mathbb{Q}"],["ℂ","\\mathbb{C}"],
]

// ── User snippets ─────────────────────────────────────────────────────────────

let userSnippets: Completion[] = []
export function updateUserSnippets(snippets: Completion[]) {
  userSnippets = snippets
}

// ── Macro completions (from macros.md \newcommand) ────────────────────────────

let macroCompletions: string[] = []
export function updateMacroCompletions(macros: string[]) {
  macroCompletions = macros
}

// ── Vault file names for wikilink autocomplete ────────────────────────────────

let vaultFileNames: string[] = []
export function updateVaultFileNames(names: string[]) { vaultFileNames = names }

// ── Open files snapshot for wikilink hover preview ───────────────────────────

let openFilesSnapshot: { name: string; content: string }[] = []
export function updateOpenFilesSnapshot(files: { name: string; content: string }[]) {
  openFilesSnapshot = files
}

// ── BibTeX key/metadata for citation autocomplete + hover ─────────────────────

interface BibSuggestion { key: string; detail: string }
let bibSuggestions: BibSuggestion[] = []
export function updateBibSuggestions(entries: { key: string; author?: string; title?: string; year?: string }[]) {
  bibSuggestions = entries.map((e) => ({
    key: e.key,
    detail: [e.author, e.title, e.year].filter(Boolean).join(", "),
  }))
}

interface BibHoverEntry { key: string; type: string; fields: Record<string, string> }
let bibHoverEntries: BibHoverEntry[] = []
export function updateBibHoverEntries(entries: BibHoverEntry[]) { bibHoverEntries = entries }

interface StructuralLabelSuggestion { id: string; kind: string; detail: string }
let structuralLabelSuggestions: StructuralLabelSuggestion[] = []
export function updateStructuralLabelSuggestions(labels: StructuralLabelSuggestion[]) {
  structuralLabelSuggestions = labels
}

// ── Completion provider (dropdown visual) ────────────────────────────────────

let providerDisposable: monacoApi.IDisposable | null = null
let hoverDisposable: monacoApi.IDisposable | null = null
let wikilinkHoverDisposable: monacoApi.IDisposable | null = null
let crossRefHoverDisposable: monacoApi.IDisposable | null = null
let footnoteHoverDisposable: monacoApi.IDisposable | null = null

export function setupMonaco(monaco: typeof monacoApi) {
  providerDisposable?.dispose()
  providerDisposable = monaco.languages.registerCompletionItemProvider("markdown", {
    triggerCharacters: ["[", "@", "\\", "^"],
    provideCompletionItems(model, position) {
      const lineText = model.getLineContent(position.lineNumber)
      const beforeCursor = lineText.slice(0, position.column - 1)

      // LaTeX command autocomplete: \word
      const latexMatch = /\\([\w]*)$/.exec(beforeCursor)
      if (latexMatch) {
        const typed = latexMatch[0]   // e.g. "\alp"
        const latexRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - typed.length,
          endColumn: position.column,
        }
        const typedSuffix = typed.slice(1)
        const macroSuggestions = macroCompletions
          .filter((macro) => macro.startsWith("\\") && macro.slice(1).startsWith(typedSuffix))
          .map((macro) => ({
            label: macro.slice(1),
            detail: "user macro",
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: macro,
            range: latexRange,
            sortText: "000" + macro.slice(1),
          }))
        return {
          suggestions: [
            ...macroSuggestions,
            ...LATEX_COMMANDS
              .filter(([, cmd]) => cmd.slice(1).startsWith(typedSuffix))
              .map(([glyph, cmd]) => ({
                label: cmd.slice(1),
                detail: glyph,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: cmd,
                range: latexRange,
                sortText: "0" + cmd.slice(1),
              })),
          ],
        }
      }

      const word = model.getWordUntilPosition(position)
      if (word.word.length < 2) return { suggestions: [] }
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      // Check if we're inside [[ for wikilink autocomplete
      const wikiMatch = /\[\[([^\]|]*)$/.exec(beforeCursor)

      if (wikiMatch) {
        const partial = wikiMatch[1].toLowerCase()
        const wikiRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - partial.length,
          endColumn: position.column,
        }
        return {
          suggestions: vaultFileNames
            .filter((n) => n.toLowerCase().startsWith(partial))
            .map((n) => ({
              label: n,
              kind: monaco.languages.CompletionItemKind.File,
              insertText: n + "]]",
              range: wikiRange,
              sortText: "0" + n,
            })),
        }
      }

      // Citation autocomplete: [@key] from BibTeX
      const bibMatch = /\[@([^\]\s,]*)$/.exec(beforeCursor)
      if (bibMatch) {
        const partial = bibMatch[1].toLowerCase()
        const bibRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - partial.length,
          endColumn: position.column,
        }
        return {
          suggestions: bibSuggestions
            .filter((b) => b.key.toLowerCase().startsWith(partial))
            .map((b) => ({
              label: { label: b.key, description: b.detail },
              kind: monaco.languages.CompletionItemKind.Reference,
              insertText: b.key + "]",
              range: bibRange,
              sortText: "0" + b.key,
              detail: b.detail,
            })),
        }
      }

      // Structural reference autocomplete: @eq:, @fig:, @tbl:, @sec:, @thm:, ...
      const labelMatch = /@([a-zA-Z]+):([\w.-]*)$/.exec(beforeCursor)
      if (labelMatch) {
        const rawKind = labelMatch[1].toLowerCase()
        const partial = labelMatch[2].toLowerCase()
        const labelRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - partial.length,
          endColumn: position.column,
        }
        const aliases: Record<string, string> = {
          theorem: "thm",
          lemma: "lem",
          definition: "def",
          example: "ex",
          exercise: "exc",
        }
        const wantedKind = aliases[rawKind] ?? rawKind
        return {
          suggestions: structuralLabelSuggestions
            .filter((label) => label.kind === wantedKind && label.id.split(":").slice(1).join(":").toLowerCase().startsWith(partial))
            .map((label) => {
              const insertText = label.id.split(":").slice(1).join(":")
              return {
                label: { label: insertText, description: label.detail },
                kind: monaco.languages.CompletionItemKind.Reference,
                insertText,
                range: labelRange,
                sortText: "0" + insertText,
                detail: label.id,
              }
            }),
        }
      }

      // Footnote autocomplete: [^1]
      const footnoteMatch = /\[\^([^\]]*)\]/.exec(beforeCursor)
      if (footnoteMatch) {
        const partial = footnoteMatch[1]
        const footnoteRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - partial.length - 2,
          endColumn: position.column,
        }
        const suggestions = []
        for (let i = 1; i <= 50; i++) {
          suggestions.push({
            label: i.toString(),
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: `${i}]`,
            range: footnoteRange,
            sortText: i.toString().padStart(3, "0"),
          })
        }
        return {
          suggestions: suggestions.filter((s) => s.label.startsWith(partial)),
        }
      }

      const wordLower = word.word.toLowerCase()
      const userSnippetSuggestions = userSnippets
        .filter((c) => c.label.startsWith(wordLower))
        .map((c) => ({
          label: { label: c.label, description: c.detail },
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: c.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: "00" + c.label,
        }))

      const builtinSuggestions = COMPLETIONS
        .filter((c) => c.label.startsWith(wordLower))
        .map((c) => ({
          label: { label: c.label, description: c.detail },
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: c.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: "0" + c.label,
        }))

      return {
        suggestions: [...userSnippetSuggestions, ...builtinSuggestions],
      }
    },
  })

  // Auto-close $ pairs and surrounding selection in $...$
  monaco.languages.setLanguageConfiguration("markdown", {
    surroundingPairs: [
      { open: "$", close: "$" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: "`", close: "`" },
      { open: "*", close: "*" },
      { open: "_", close: "_" },
    ],
    autoClosingPairs: [
      { open: "$", close: "$" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: "`", close: "`" },
    ],
  })

  // Folding provider for ::: blocks
  monaco.languages.registerFoldingRangeProvider("markdown", {
    provideFoldingRanges(model) {
      const ranges: monacoApi.languages.FoldingRange[] = []
      const lines = model.getLinesContent()
      const stack: number[] = []
      lines.forEach((line, i) => {
        if (/^:::[\w]/.test(line.trim())) {
          stack.push(i + 1) // 1-indexed
        } else if (line.trim() === ":::") {
          const start = stack.pop()
          if (start !== undefined) {
            ranges.push({ start, end: i + 1, kind: monaco.languages.FoldingRangeKind.Region })
          }
        }
      })
      return ranges
    },
  })

  // Citation hover: [@key] → show BibTeX entry info
  hoverDisposable?.dispose()
  hoverDisposable = monaco.languages.registerHoverProvider("markdown", {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber)
      const col = position.column - 1
      // Find [@key] at cursor position
      const citeRe = /\[@([\w:.-]+)\]/g
      let m: RegExpExecArray | null
      while ((m = citeRe.exec(line)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
          const key = m[1]
          const entry = bibHoverEntries.find((e) => e.key === key)
          if (!entry) break
          const f = entry.fields
          const lines: string[] = []
          if (f.title)   lines.push(`**${f.title}**`)
          if (f.author)  lines.push(`_${f.author}_`)
          const meta = [f.year, f.journal ?? f.booktitle ?? f.publisher].filter(Boolean).join(", ")
          if (meta) lines.push(meta)
          lines.push(`\`@${entry.type}{${key}}\``)
          return {
            range: new monaco.Range(position.lineNumber, m.index + 1, position.lineNumber, m.index + m[0].length + 1),
            contents: [{ value: lines.join("\n\n"), isTrusted: true }],
          }
        }
      }
      return null
    },
  })

  // Wikilink hover: [[noteName]] → show first 12 non-empty lines of file content
  wikilinkHoverDisposable?.dispose()
  wikilinkHoverDisposable = monaco.languages.registerHoverProvider("markdown", {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber)
      const col = position.column - 1 // 0-indexed
      const wikilinkRe = /\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]/g
      let m: RegExpExecArray | null
      while ((m = wikilinkRe.exec(line)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
          const noteName = m[1].trim().replace(/\.md$/i, "")
          const entry = openFilesSnapshot.find(
            (f) => f.name.replace(/\.md$/i, "").toLowerCase() === noteName.toLowerCase()
          )
          if (!entry) return null
          const nonEmptyLines = entry.content.split("\n").filter((l) => l.trim() !== "")
          const preview = nonEmptyLines.slice(0, 12)
          const hasMore = nonEmptyLines.length > 12
          const body = preview.join("\n") + (hasMore ? "\n…" : "")
          return {
            range: new monaco.Range(
              position.lineNumber,
              m.index + 1,
              position.lineNumber,
              m.index + m[0].length + 1
            ),
            contents: [
              { value: `**${entry.name}**`, isTrusted: true },
              { value: body, isTrusted: true },
            ],
          }
        }
      }
      return null
    },
  })

  // Cross-reference hover: @eq:label / @fig:label → show equation number + source
  crossRefHoverDisposable?.dispose()
  crossRefHoverDisposable = monaco.languages.registerHoverProvider("markdown", {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber)
      const col = position.column - 1 // 0-indexed
      const crossRefRe = /@([a-zA-Z]+):([\w-]+(?:\.[\w-]+)*)/g
      let m: RegExpExecArray | null
      while ((m = crossRefRe.exec(line)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
          const kind = m[1]
          const refKey = m[2]
          if (kind !== "eq") {
            const id = `${kind}:${refKey}`
            const label = structuralLabelSuggestions.find((candidate) => candidate.id === id)
            return {
              range: new monaco.Range(
                position.lineNumber,
                m.index + 1,
                position.lineNumber,
                m.index + m[0].length + 1,
              ),
              contents: [{ value: label ? `**${label.id}**\n\n${label.detail}` : `Reference: \`${id}\``, isTrusted: true }],
            }
          }
          // kind === "eq": search document for matching $$...$$  {#eq:label}
          const content = model.getValue()
          const eqRe = /\$\$([\s\S]+?)\$\$(?:\s*\{#eq:([\w:.-]+)\})?/g
          let eqM: RegExpExecArray | null
          let eqIndex = 0
          while ((eqM = eqRe.exec(content)) !== null) {
            eqIndex++
            const label = eqM[2] ?? null
            if (label === refKey) {
              const texSource = eqM[1].trim()
              const value = `**Equation (${eqIndex})**\n\n\`\`\`tex\n${texSource}\n\`\`\``
              return {
                range: new monaco.Range(
                  position.lineNumber,
                  m.index + 1,
                  position.lineNumber,
                  m.index + m[0].length + 1,
                ),
                contents: [{ value, isTrusted: true }],
              }
            }
          }
          return null
        }
      }
      return null
    },
  })

  // Footnote hover: [^label] (reference) → show definition text
  footnoteHoverDisposable?.dispose()
  footnoteHoverDisposable = monaco.languages.registerHoverProvider("markdown", {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber)
      const col = position.column - 1 // 0-indexed
      const footnoteRefRe = /\[\^([\w-]+)\]/g
      let m: RegExpExecArray | null
      while ((m = footnoteRefRe.exec(line)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
          const label = m[1]
          const content = model.getValue()
          const defRe = new RegExp(`^\\[\\^${label}\\]:\\s*(.+)$`, "m")
          const defMatch = defRe.exec(content)
          if (!defMatch) return null
          const definitionText = defMatch[1]
          return {
            range: new monaco.Range(
              position.lineNumber,
              m.index + 1,
              position.lineNumber,
              m.index + m[0].length + 1,
            ),
            contents: [{ value: `**Footnote:** ${definitionText}`, isTrusted: true }],
          }
        }
      }
      return null
    },
  })
}

// ── Typewriter mode ───────────────────────────────────────────────────────────

export function applyTypewriterMode(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  enabled: boolean,
) {
  editor.updateOptions({
    cursorSurroundingLines: enabled ? 999 : 0,
    cursorSurroundingLinesStyle: enabled ? "all" : "default",
  })
}

// ── Vim mode ─────────────────────────────────────────────────────────────────

export async function enableVimMode(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  statusEl: HTMLElement
): Promise<VimAdapterInstance> {
  const { initVimMode } = await import("monaco-vim")
  return initVimMode(editor, statusEl)
}

// ── Content linter (Monaco markers) ──────────────────────────────────────────

const LINTER_SOURCE = "comdtex"
const LINTER_DEBOUNCE_MS = 600

/**
 * Attach the content linter to `editor`. Runs on every model-content change
 * (debounced) and on model switch. Returns a disposable to detach.
 *
 * @param getContext  Called on each lint pass to get the current vault state.
 */
export function setupContentLinter(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  getContext: () => LintContext,
): monacoApi.IDisposable {
  let debounce: ReturnType<typeof setTimeout> | null = null

  const run = () => {
    const model = editor.getModel()
    if (!model) return
    const filename = model.uri.path.split("/").pop() ?? ""
    const markers = lintFile(model.getValue(), filename, getContext(), monaco.MarkerSeverity)
    monaco.editor.setModelMarkers(model, LINTER_SOURCE, markers)
  }

  const schedule = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(run, LINTER_DEBOUNCE_MS)
  }

  const contentDisposable = editor.onDidChangeModelContent(schedule)
  // Re-run when the user switches tabs (model changes)
  const modelDisposable = editor.onDidChangeModel(schedule)

  // Initial pass
  setTimeout(run, 0)

  return {
    dispose() {
      contentDisposable.dispose()
      modelDisposable.dispose()
      if (debounce) clearTimeout(debounce)
    },
  }
}

// ── Math hover preview (KaTeX overlay widget) ─────────────────────────────────

/**
 * Attach a math preview overlay to the editor.
 * When the cursor is inside `$...$` or `$$...$$`, renders the expression
 * with KaTeX in a floating widget above the cursor.
 */
export function setupMathHover(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  getMacros: () => Record<string, string>,
): monacoApi.IDisposable {
  let currentWidget: monacoApi.editor.IOverlayWidget | null = null

  const removeWidget = () => {
    if (currentWidget) {
      editor.removeOverlayWidget(currentWidget)
      currentWidget = null
    }
  }

  const disposable = editor.onDidChangeCursorPosition((e) => {
    const model = editor.getModel()
    if (!model) { removeWidget(); return }

    const lineText = model.getLineContent(e.position.lineNumber)
    const col = e.position.column - 1 // 0-indexed

    let mathExpr: string | null = null
    let displayMode = false
    let matchStart = -1

    // Try display math $$ ... $$ on the same line first
    // Use (?:.|$(?!\$))+? to match at least one char but allow escaped $
    const displayRe = /\$\$((?:.|\$(?!\$))+?)\$\$/g
    let m: RegExpExecArray | null
    while ((m = displayRe.exec(lineText)) !== null) {
      if (col >= m.index && col <= m.index + m[0].length) {
        mathExpr = m[1]; displayMode = true; matchStart = m.index; break
      }
    }

    // Try inline math $ ... $
    if (!mathExpr) {
      const inlineRe = /\$([^$\n]+?)\$/g
      while ((m = inlineRe.exec(lineText)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
          mathExpr = m[1]; displayMode = false; matchStart = m.index; break
        }
      }
    }

    // Try multi-line $$ block
    if (!mathExpr) {
      const lineCount = model.getLineCount()
      const cursorLine = e.position.lineNumber

      // Scan upward for opening $$
      let openLine = -1
      for (let ln = cursorLine; ln >= 1; ln--) {
        if (model.getLineContent(ln).trim() === "$$") { openLine = ln; break }
        // Stop if we hit another line that starts a new block or clearly exits
        if (ln < cursorLine && model.getLineContent(ln).trim() === "") break
      }

      // Scan downward for closing $$
      let closeLine = -1
      if (openLine !== -1) {
        for (let ln = cursorLine; ln <= lineCount; ln++) {
          if (ln === openLine) continue
          if (model.getLineContent(ln).trim() === "$$") { closeLine = ln; break }
        }
      }

      if (openLine !== -1 && closeLine !== -1) {
        const exprLines: string[] = []
        for (let ln = openLine + 1; ln < closeLine; ln++) {
          exprLines.push(model.getLineContent(ln))
        }
        mathExpr = exprLines.join("\n")
        displayMode = true
        matchStart = 0
      }
    }

    if (!mathExpr) { removeWidget(); return }

    let rendered: string
    try {
      rendered = katex.renderToString(mathExpr.trim(), {
        displayMode,
        throwOnError: false,
        macros: getMacros(),
      })
    } catch { removeWidget(); return }

    // Get pixel position of the match start within the editor
    const screenPos = editor.getScrolledVisiblePosition({
      lineNumber: e.position.lineNumber,
      column: matchStart + 1,
    })
    if (!screenPos) { removeWidget(); return }

    removeWidget()

    const domNode = document.createElement("div")
    domNode.className = "math-hover-widget"
    domNode.innerHTML = rendered
    // Position above the cursor line
    domNode.style.top = `${Math.max(0, screenPos.top - 4)}px`
    domNode.style.left = `${screenPos.left}px`

    const widget: monacoApi.editor.IOverlayWidget = {
      getId: () => "math-hover-preview",
      getDomNode: () => domNode,
      getPosition: () => null,
    }

    editor.addOverlayWidget(widget)
    currentWidget = widget
  })

  return {
    dispose() {
      disposable.dispose()
      removeWidget()
    },
  }
}

// ── Tab expansion via onKeyDown ───────────────────────────────────────────────

export function setupEditorCommands(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snippetCtrl = () => editor.getContribution<any>("snippetController2")

  editor.onKeyDown((e) => {
    if (e.keyCode !== monaco.KeyCode.Tab) return

    const ctrl = snippetCtrl()

    // Active snippet → advance to next placeholder (Monaco handles it internally)
    if (ctrl?.isInSnippet?.()) return

    const position = editor.getPosition()
    const model = editor.getModel()
    if (!position || !model) return

    const word = model.getWordUntilPosition(position)
    if (!word.word || word.word.length < 1) return

    const typed = word.word.toLowerCase()
    const matches = COMPLETIONS.filter((c) => c.label.startsWith(typed))
    const match =
      matches.length === 1
        ? matches[0]
        : matches.find((c) => c.label === typed)

    if (!match) return

    // Take control of Tab: prevent any other handler
    e.preventDefault()
    e.stopPropagation()

    // Close the suggestion widget if open
    editor.trigger("keyboard", "hideSuggestWidget", null)

    // Insert the snippet using snippetController2
    ctrl?.insert(match.snippet, {
      overwriteBefore: word.endColumn - word.startColumn,
      overwriteAfter: 0,
    })
  })
}

// ── Per-line comment decorations (gutter glyphs) ─────────────────────────────

export interface CommentMarker {
  /** Stable comment id (used to fire onClick callbacks). */
  id: string
  /** 1-based line number to anchor the glyph on. */
  line: number
  /** Comment body for the hover tooltip. */
  body: string
  /** Whether the comment is resolved (used for muted styling). */
  resolved: boolean
  /** Optional: line snippet at the time of creation (used for drift hint). */
  lineSnippet?: string
  /** Optional: true if `lineSnippet` no longer matches the current line. */
  drifted?: boolean
}

export interface CommentDecorationsHandle extends monacoApi.IDisposable {
  /**
   * Replace the current set of glyphs. Cheap to call on every change —
   * Monaco reconciles the decoration deltas internally.
   */
  update(markers: CommentMarker[]): void
}

/**
 * Attach gutter glyphs for per-line comments and dispatch a click callback
 * when the user clicks on one of them. Returns an `update()` method so the
 * host can refresh the marker list whenever the underlying comments change.
 */
export function setupCommentDecorations(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  onClickMarker: (id: string) => void,
): CommentDecorationsHandle {
  // Make sure the glyph margin is enabled — otherwise the gutter is hidden.
  editor.updateOptions({ glyphMargin: true })

  const collection = editor.createDecorationsCollection([])
  let markers: CommentMarker[] = []

  const buildDecorations = (items: CommentMarker[]): monacoApi.editor.IModelDeltaDecoration[] =>
    items.map((m) => ({
      range: new monaco.Range(m.line, 1, m.line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: `comment-glyph${m.resolved ? " resolved" : ""}${m.drifted ? " drifted" : ""}`,
        glyphMarginHoverMessage: { value: m.body || "(empty)" },
      },
    }))

  const update = (next: CommentMarker[]) => {
    markers = next
    collection.set(buildDecorations(markers))
  }

  const clickDisposable = editor.onMouseDown((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
    const lineNumber = e.target.position?.lineNumber
    if (!lineNumber) return
    // Line might host multiple comments — fire for the first one we find.
    const hit = markers.find((m) => m.line === lineNumber)
    if (hit) onClickMarker(hit.id)
  })

  return {
    update,
    dispose() {
      clickDisposable.dispose()
      collection.clear()
    },
  }
}
