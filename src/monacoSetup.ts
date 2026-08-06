import type * as monacoApi from "monaco-editor"
import type { VimAdapterInstance } from "monaco-vim"
import katex from "katex"
// mhchem extension: teaches KaTeX \ce{} so chemistry renders in the preview
// exactly as it will in the LaTeX export (which loads the mhchem package).
import "katex/contrib/mhchem"
import { lintFile, type LintContext } from "./contentLinter"
import { parseKeepMarks } from "./keepMarks"
import { computeFoldRanges, resolveEnterOverride } from "./markdownEditing"
import { pathBasename } from "./pathUtils"
import { registerTypstLanguage } from "./typstLanguage"

export interface Completion {
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
  { label: "flowchart",   detail: ":::flowchart → flowchart block",     snippet: ":::flowchart[${1:title}]\n${2:START\n  INPUT: value\n  IF condition THEN\n    OUTPUT: result\n  END IF}\n:::" },
  { label: "pseudocode",  detail: ":::pseudocode → pseudocode block",   snippet: ":::pseudocode[${1:title}]\n${2:INPUT: value\nFOR i ← 1 TO n DO\n  statement\nEND FOR}\n:::" },
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
  { label: "si",    detail: "si(value, unit) → quantity with units (siunitx)",     snippet: "si(${1:9.81}, ${2:m/s^2})" },
  { label: "num",   detail: "num(6.022e23) → formatted number",                    snippet: "num(${1:6.022e23})" },
  { label: "unit",  detail: "unit(mol/L) → standalone unit",                       snippet: "unit(${1:mol/L})" },
  { label: "ce",    detail: "ce(H2O) → chemical formula (mhchem)",                 snippet: "ce(${1:H2O})" },
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

// ── Precomputed lowercase labels for fast prefix matching ────────────────────
// Avoids re-lowercasing on every keystroke and fixes mixed-case label comparison.
const COMPLETIONS_LC: string[] = COMPLETIONS.map((c) => c.label.toLowerCase())

// ── In-block completions for special blocks ──────────────────────────────────
// Static catalogs (~40 entries total; negligible footprint). Keyword grammar
// mirrors the real parsers (pseudocodeFlowchart.ts, truthTable.ts,
// graphViz.ts, functionPlot.ts, commDiag.ts).

const PSEUDOCODE_BLOCK_COMPLETIONS: Completion[] = [
  { label: "INPUT",  detail: "INPUT: value (I/O)",            snippet: "INPUT: ${1:valor}" },
  { label: "OUTPUT", detail: "OUTPUT: result (I/O)",          snippet: "OUTPUT: ${1:resultado}" },
  { label: "PRINT",  detail: "PRINT message (I/O)",           snippet: "PRINT ${1:mensaje}" },
  { label: "IF",     detail: "IF … THEN / END IF",            snippet: "IF ${1:condición} THEN\n  ${2}\nEND IF" },
  { label: "IFELSE", detail: "IF … THEN / ELSE / END IF",     snippet: "IF ${1:condición} THEN\n  ${2}\nELSE\n  ${3}\nEND IF" },
  { label: "ELSEIF", detail: "ELSE IF … THEN",                snippet: "ELSE IF ${1:condición} THEN\n  ${2}" },
  { label: "ELSE",   detail: "ELSE branch",                   snippet: "ELSE\n  ${1}" },
  { label: "FOR",    detail: "FOR i ← 1 TO n DO / END FOR",   snippet: "FOR ${1:i} ← ${2:1} TO ${3:n} DO\n  ${4}\nEND FOR" },
  { label: "WHILE",  detail: "WHILE … DO / END WHILE",        snippet: "WHILE ${1:condición} DO\n  ${2}\nEND WHILE" },
  { label: "REPEAT", detail: "REPEAT / UNTIL …",              snippet: "REPEAT\n  ${1}\nUNTIL ${2:condición}" },
  { label: "SWAP",   detail: "SWAP a ↔ b",                    snippet: "SWAP ${1:A[i]} ↔ ${2:A[j]}" },
  { label: "RETURN", detail: "RETURN value (terminal)",       snippet: "RETURN ${1:valor}" },
  { label: "END",    detail: "END (terminal)",                snippet: "END" },
]

const SPECIAL_BLOCK_COMPLETIONS: Record<string, Completion[]> = {
  pseudocode: PSEUDOCODE_BLOCK_COMPLETIONS,
  flowchart: PSEUDOCODE_BLOCK_COMPLETIONS,
  truth: [
    { label: "AND",     detail: "p ∧ q (also * or &&)",   snippet: "∧ " },
    { label: "OR",      detail: "p ∨ q (also + or ||)",   snippet: "∨ " },
    { label: "NOT",     detail: "¬p (also !)",            snippet: "¬" },
    { label: "IMPLIES", detail: "p → q (also ->)",        snippet: "→ " },
    { label: "IFF",     detail: "p ↔ q (also <-> or ≡)",  snippet: "↔ " },
  ],
  graph: [
    { label: "edge",     detail: "A -- B (undirected)",     snippet: "${1:A} -- ${2:B}" },
    { label: "arrow",    detail: "A -> B (directed)",       snippet: "${1:A} -> ${2:B}" },
    { label: "weighted", detail: "A -- B : 5 (with weight)", snippet: "${1:A} -- ${2:B} : ${3:5}" },
  ],
  plot: [
    { label: "f",     detail: "f(x) = expression",            snippet: "f(${1:x}) = ${2:sin(x)}" },
    { label: "range", detail: "range: [-5, 5] (x domain)",    snippet: "range: [${1:-5}, ${2:5}]" },
    { label: "sin",  detail: "sin(x)",  snippet: "sin(${1:x})" },
    { label: "cos",  detail: "cos(x)",  snippet: "cos(${1:x})" },
    { label: "tan",  detail: "tan(x)",  snippet: "tan(${1:x})" },
    { label: "sqrt", detail: "sqrt(x)", snippet: "sqrt(${1:x})" },
    { label: "abs",  detail: "abs(x)",  snippet: "abs(${1:x})" },
    { label: "exp",  detail: "exp(x)",  snippet: "exp(${1:x})" },
    { label: "log",  detail: "log(x)",  snippet: "log(${1:x})" },
    { label: "pi",   detail: "π",       snippet: "pi" },
  ],
  commdiag: [
    { label: "arrow",  detail: "A -> B [f]",                  snippet: "${1:A} -> ${2:B} [${3:f}]" },
    { label: "iso",    detail: "A <-> B [f] (isomorphism)",   snippet: "${1:A} <-> ${2:B} [${3:f}]" },
    { label: "epi",    detail: "A ->> B [f] (epimorphism)",   snippet: "${1:A} ->> ${2:B} [${3:f}]" },
    { label: "mono",   detail: "A >-> B [f] (monomorphism)",  snippet: "${1:A} >-> ${2:B} [${3:f}]" },
    { label: "double", detail: "A ==> B [f]",                 snippet: "${1:A} ==> ${2:B} [${3:f}]" },
    { label: "square", detail: "full commutative square",     snippet: "${1:A} -> ${2:B} [${3:f}]\n${1:A} -> ${4:C} [${5:g}]\n${2:B} -> ${6:D} [${7:h}]\n${4:C} -> ${6:D} [${8:k}]" },
  ],
}

/** In-block catalog for a special-block type. Returns null for types with no
 *  catalog (math environments, code, excalidraw). */
export function getSpecialBlockCompletions(type: string): Completion[] | null {
  return SPECIAL_BLOCK_COMPLETIONS[type] ?? null
}

/** Walks upward from the line ABOVE `lineNumber` looking for an unclosed
 *  `:::type` opener. A bare `:::` closer found first means we're outside.
 *  Bounded scan: O(maxScan) string work, no allocation beyond trims. */
export function findEnclosingSpecialBlock(
  getLine: (line: number) => string,
  lineNumber: number,
  maxScan = 400,
): string | null {
  for (let n = lineNumber - 1; n >= 1 && lineNumber - n <= maxScan; n--) {
    const line = getLine(n).trim()
    if (line === ":::") return null
    const m = /^:::(?:sm\s+|lg\s+)?([A-Za-z][\w-]*)/.exec(line)
    if (m) return m[1].toLowerCase()
  }
  return null
}

/** Tab-expansion resolution restricted to an in-block catalog: unique prefix
 *  or exact label match wins (case-insensitive). */
export function resolveSpecialBlockTabCompletion(
  completions: Completion[],
  word: string,
): TabCompletionResolution | null {
  if (!word) return null
  const typed = word.toLowerCase()
  const matches = completions.filter((c) => c.label.toLowerCase().startsWith(typed))
  const completion =
    matches.length === 1
      ? matches[0]
      : matches.find((c) => c.label.toLowerCase() === typed)
  return completion ? { completion, overwriteBefore: word.length } : null
}

export interface TabCompletionResolution {
  completion: Completion
  overwriteBefore: number
}

export function resolveTabCompletion(beforeCursor: string, word: string): TabCompletionResolution | null {
  const blockPrefixMatch = /:::([A-Za-z][\w:-]*)$/.exec(beforeCursor)
  const triggerText = blockPrefixMatch?.[0] ?? word
  if (!triggerText || triggerText.length < 1) return null

  const typed = triggerText.toLowerCase()
  const normalizedTyped = typed.startsWith(":::") ? typed.slice(3) : typed
  // After a ::: prefix only block snippets qualify; otherwise `:::t` would
  // match shorthands like `table`/`tan` and expand them mid-block.
  const matches = COMPLETIONS.filter((c) => {
    if (blockPrefixMatch && !c.snippet.startsWith(":::")) return false
    const label = c.label.toLowerCase()
    const normalizedLabel = label.startsWith(":::") ? label.slice(3) : label
    return label.startsWith(typed) || normalizedLabel.startsWith(normalizedTyped)
  })
  const completion =
    matches.length === 1
      ? matches[0]
      : matches.find((c) => {
          const label = c.label.toLowerCase()
          const normalizedLabel = label.startsWith(":::") ? label.slice(3) : label
          return label === typed || normalizedLabel === normalizedTyped
        })

  return completion ? { completion, overwriteBefore: triggerText.length } : null
}

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

// Precomputed: command name without leading `\` (matched against the user's
// typed suffix). Done once at module load instead of `cmd.slice(1)` per call.
const LATEX_COMMAND_NAMES: string[] = LATEX_COMMANDS.map(([, cmd]) => cmd.slice(1))

// Precomputed footnote label strings ("1".."50"); avoids allocating new
// strings + per-keystroke `padStart` calls inside the provider.
const FOOTNOTE_LABELS: { label: string; sort: string }[] = Array.from({ length: 50 }, (_, i) => {
  const n = (i + 1).toString()
  return { label: n, sort: n.padStart(3, "0") }
})

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
  registerTypstLanguage(monaco)
  providerDisposable?.dispose()
  providerDisposable = monaco.languages.registerCompletionItemProvider("markdown", {
    triggerCharacters: ["[", "@", "\\", "^", ":"],
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
            ...LATEX_COMMANDS.reduce<monacoApi.languages.CompletionItem[]>((acc, [glyph, cmd], i) => {
              const name = LATEX_COMMAND_NAMES[i]
              if (name.startsWith(typedSuffix)) {
                acc.push({
                  label: name,
                  detail: glyph,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: cmd,
                  range: latexRange,
                  sortText: "0" + name,
                })
              }
              return acc
            }, []),
          ],
        }
      }

      const word = model.getWordUntilPosition(position)
      // Bare `:::` (no letters yet) also triggers, listing every block type.
      const blockPrefixMatch = /:::([A-Za-z][\w:-]*)?$/.exec(beforeCursor)

      // Context-aware suggestions inside special blocks (catalog lazy-loads on
      // first use). Inside such a block the global shorthands don't apply.
      const enclosingBlock = findEnclosingSpecialBlock((n) => model.getLineContent(n), position.lineNumber)
      const inBlockCompletions = enclosingBlock ? getSpecialBlockCompletions(enclosingBlock) : null
      if (inBlockCompletions) {
        // A ::: being typed here is the block's closing fence, not an opener.
        if (blockPrefixMatch) return { suggestions: [] }
        const partial = word.word.toLowerCase()
        const wordRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }
        return {
          suggestions: inBlockCompletions
            .filter((c) => !partial || c.label.toLowerCase().startsWith(partial))
            .map((c) => ({
              label: { label: c.label, description: c.detail },
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: c.snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: wordRange,
              sortText: "0" + c.label,
            })),
        }
      }

      if (!blockPrefixMatch && word.word.length < 2) return { suggestions: [] }
      const completionQuery = (blockPrefixMatch ? blockPrefixMatch[1] ?? "" : word.word).toLowerCase()
      const range = blockPrefixMatch ? {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - blockPrefixMatch[0].length,
        endColumn: position.column,
      } : {
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
        const suggestions: monacoApi.languages.CompletionItem[] = []
        for (let i = 0; i < FOOTNOTE_LABELS.length; i++) {
          const f = FOOTNOTE_LABELS[i]
          if (!f.label.startsWith(partial)) continue
          suggestions.push({
            label: f.label,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: f.label + "]",
            range: footnoteRange,
            sortText: f.sort,
          })
        }
        return { suggestions }
      }

      const userSnippetSuggestions: monacoApi.languages.CompletionItem[] = []
      for (let i = 0; i < userSnippets.length; i++) {
        const c = userSnippets[i]
        // In ::: block context only offer block snippets (never `frac`, `table`…).
        if (blockPrefixMatch && !c.snippet.startsWith(":::")) continue
        const label = c.label.toLowerCase()
        const normalizedLabel = label.startsWith(":::") ? label.slice(3) : label
        if (!label.startsWith(completionQuery) && !normalizedLabel.startsWith(completionQuery)) continue
        userSnippetSuggestions.push({
          label: { label: c.label, description: c.detail },
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: c.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: "00" + c.label,
          // The range swallows the ::: prefix, so Monaco's own filter must
          // match against a :::-prefixed term or it hides unprefixed labels.
          ...(blockPrefixMatch ? { filterText: ":::" + normalizedLabel } : {}),
        })
      }

      const builtinSuggestions: monacoApi.languages.CompletionItem[] = []
      for (let i = 0; i < COMPLETIONS.length; i++) {
        const c = COMPLETIONS[i]
        if (blockPrefixMatch && !c.snippet.startsWith(":::")) continue
        const label = COMPLETIONS_LC[i]
        const normalizedLabel = label.startsWith(":::") ? label.slice(3) : label
        if (!label.startsWith(completionQuery) && !normalizedLabel.startsWith(completionQuery)) continue
        builtinSuggestions.push({
          label: { label: c.label, description: c.detail },
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: c.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: "0" + c.label,
          ...(blockPrefixMatch ? { filterText: ":::" + normalizedLabel } : {}),
        })
      }

      return {
        suggestions: [...userSnippetSuggestions, ...builtinSuggestions],
      }
    },
  })

  // Auto-close $ pairs and surrounding selection in $...$
  //
  // NOTE: setLanguageConfiguration REPLACES markdown's built-in configuration
  // rather than merging into it. An earlier version of this call passed only the
  // pair options, which silently dropped markdown's `onEnterRules`; that is why
  // lists, task items and quotes stopped continuing on Enter. Everything the
  // default config provided has to be restated here.
  //
  // List/quote/table continuation is NOT reinstated as `onEnterRules`: those can
  // only append a constant string, so they cannot increment an ordered list,
  // count a table's columns, or clear an abandoned marker. `setupEditorCommands`
  // handles Enter explicitly via `resolveEnterOverride` instead: one mechanism,
  // so the two can never both fire on the same keystroke.
  monaco.languages.setLanguageConfiguration("markdown", {
    comments: { blockComment: ["<!--", "-->"] },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
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
    folding: {
      markers: { start: /^\s*<!--\s*#region\b/, end: /^\s*<!--\s*#endregion\b/ },
    },
  })

  // Folding provider for ::: blocks
  // Folding for ::: blocks AND heading sections. Heading folding is what makes a
  // single long per-subject file navigable; the range logic is pure and tested
  // in markdownEditing.test.ts.
  monaco.languages.registerFoldingRangeProvider("markdown", {
    provideFoldingRanges(model) {
      return computeFoldRanges(model.getLinesContent()).map((range) => ({
        start: range.start,
        end: range.end,
        // Region for both: Comment/Imports would put these in the wrong bucket
        // for "fold all comments"-style commands.
        kind: monaco.languages.FoldingRangeKind.Region,
      }))
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
export interface ContentLinterHandle extends monacoApi.IDisposable {
  /**
   * Force an immediate re-lint of the current model. Use when external linter
   * state changes (e.g. the spell-check setting is toggled, the active
   * spell-check language changes, or a dictionary finishes loading async).
   */
  relint(): void
}

export function setupContentLinter(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  getContext: () => LintContext,
): ContentLinterHandle {
  let debounce: ReturnType<typeof setTimeout> | null = null

  const run = () => {
    const model = editor.getModel()
    if (!model) return
    const filename = pathBasename(model.uri.path)
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
    relint: run,
    dispose() {
      contentDisposable.dispose()
      modelDisposable.dispose()
      if (debounce) clearTimeout(debounce)
    },
  }
}

// ── Math hover preview (KaTeX overlay widget) ─────────────────────────────────

// Cache hover-widget KaTeX by source, so re-rendering while the caret sits in a
// math block (every cursor move / keystroke fires the handler) is free.
const hoverKatexCache = new Map<string, string | null>()
let hoverKatexCacheMacros: Record<string, string> | null = null
function renderHoverKatex(expr: string, displayMode: boolean, macros: Record<string, string>): string | null {
  if (macros !== hoverKatexCacheMacros) { hoverKatexCache.clear(); hoverKatexCacheMacros = macros }
  const key = (displayMode ? "D\x00" : "I\x00") + expr.trim()
  const cached = hoverKatexCache.get(key)
  if (cached !== undefined) return cached
  let html: string | null
  try { html = katex.renderToString(expr.trim(), { displayMode, throwOnError: false, macros }) }
  catch { html = null }
  if (hoverKatexCache.size >= 2000) hoverKatexCache.clear()
  hoverKatexCache.set(key, html)
  return html
}

/**
 * Attach a math preview overlay to the editor.
 * When the cursor is inside `$...$` or `$$...$$`, renders the expression
 * with KaTeX in a floating widget above the cursor.
 */
export function setupMathHover(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  getMacros: () => Record<string, string>,
  isEnabled: () => boolean = () => true,
): monacoApi.IDisposable {
  let currentWidget: monacoApi.editor.IOverlayWidget | null = null

  const removeWidget = () => {
    if (currentWidget) {
      editor.removeOverlayWidget(currentWidget)
      currentWidget = null
    }
  }

  const updateHover = () => {
    // Gated by the same "Math preview" setting as the display-math view zones,
    // so turning the setting off hides the floating overlay too.
    if (!isEnabled()) { removeWidget(); return }
    const model = editor.getModel()
    const cursor = editor.getPosition()
    if (!model || !cursor) { removeWidget(); return }

    try {
    const lineText = model.getLineContent(cursor.lineNumber)
    const col = cursor.column - 1 // 0-indexed

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
      const cursorLine = cursor.lineNumber

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

    const rendered = renderHoverKatex(mathExpr, displayMode, getMacros())
    if (rendered === null) { removeWidget(); return }

    // Get pixel position of the match start within the editor
    const screenPos = editor.getScrolledVisiblePosition({
      lineNumber: cursor.lineNumber,
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
    } catch {
      // Swallow transient Monaco overlay/layout errors (e.g. "this.domNode.domNode")
      // during (re)mount or rapid cursor changes.
      try { removeWidget() } catch { /* ignore */ }
    }
  }

  // Debounce: the cursor moves on every keystroke; rendering KaTeX + scanning
  // for the enclosing block on each was a per-keystroke cost. Coalesce.
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  const disposable = editor.onDidChangeCursorPosition(() => {
    if (hoverTimer) clearTimeout(hoverTimer)
    hoverTimer = setTimeout(updateHover, 120)
  })

  return {
    dispose() {
      if (hoverTimer) clearTimeout(hoverTimer)
      disposable.dispose()
      removeWidget()
    },
  }
}

// ── Tab expansion via onKeyDown ───────────────────────────────────────────────

export function setupEditorCommands(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  /** Read per keystroke so toggling the setting takes effect without a remount. */
  isListContinuationEnabled: () => boolean = () => true,
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

    const lineText = model.getLineContent(position.lineNumber)
    const beforeCursor = lineText.slice(0, position.column - 1)
    const word = model.getWordUntilPosition(position)
    // Inside a special block only its own keywords expand; never the global
    // shorthands (`sin` inside :::plot must stay plain sin(), not \sin).
    const enclosingBlock = findEnclosingSpecialBlock((n) => model.getLineContent(n), position.lineNumber)
    const inBlockCompletions = enclosingBlock ? getSpecialBlockCompletions(enclosingBlock) : null
    const resolution = inBlockCompletions
      ? resolveSpecialBlockTabCompletion(inBlockCompletions, word.word)
      : resolveTabCompletion(beforeCursor, word.word)
    if (!resolution) return

    // Take control of Tab: prevent any other handler
    e.preventDefault()
    e.stopPropagation()

    // Close the suggestion widget if open
    editor.trigger("keyboard", "hideSuggestWidget", null)

    // Insert the snippet using snippetController2
    ctrl?.insert(resolution.completion.snippet, {
      overwriteBefore: resolution.overwriteBefore,
      overwriteAfter: 0,
    })
  })

  // ── Enter: continue lists / task items / quotes / table rows ───────────────
  // Monaco's markdown `onEnterRules` cannot increment an ordered list, count a
  // table's columns, or clear an abandoned marker, so Enter is handled here.
  // Everything below is a single `executeEdits`, which keeps it in the native
  // undo stack: one Ctrl+Z undoes the continuation, exactly like typing it.
  editor.onKeyDown((e) => {
    if (e.keyCode !== monaco.KeyCode.Enter) return
    if (!isListContinuationEnabled()) return
    // Shift/Ctrl/Alt+Enter are other people's shortcuts; never shadow them.
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
    if (editor.getOption(monaco.editor.EditorOption.readOnly)) return

    // Enter belongs to the widget while a suggestion or snippet is active.
    if (snippetCtrl()?.isInSnippet?.()) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suggest = editor.getContribution<any>("editor.contrib.suggestController")
    if (suggest?.model?.state) return

    const model = editor.getModel()
    const selection = editor.getSelection()
    if (!model || !selection || !selection.isEmpty()) return

    const { lineNumber, column } = selection.getPosition()
    const lineText = model.getLineContent(lineNumber)
    // Mid-line Enter must split normally; continuing a marker there would
    // duplicate text the user meant to push onto the next line.
    if (column !== lineText.length + 1) return

    const override = resolveEnterOverride(lineText, model.getOptions().tabSize)
    if (!override) return

    e.preventDefault()
    e.stopPropagation()

    const fullLine = {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: lineText.length + 1,
    }
    if (override.kind === "replaceLine") {
      editor.executeEdits("markdownEnter", [{ range: fullLine, text: override.text }], [
        new monaco.Selection(lineNumber, override.text.length + 1, lineNumber, override.text.length + 1),
      ])
    } else {
      const eol = model.getEOL()
      const at = { ...fullLine, startColumn: lineText.length + 1 }
      editor.executeEdits("markdownEnter", [{ range: at, text: eol + override.text }], [
        new monaco.Selection(lineNumber + 1, override.text.length + 1, lineNumber + 1, override.text.length + 1),
      ])
      editor.revealPositionInCenterIfOutsideViewport({ lineNumber: lineNumber + 1, column: override.text.length + 1 })
    }
  })

  // quickSuggestions is off globally (App.tsx editor options) so the widget
  // doesn't pop while writing prose. Inside a special block with a catalog we
  // flip it on so keywords suggest as you type, and off again on exit. The
  // scan is bounded and only runs on cursor moves; options update only on
  // boundary crossings.
  let blockSuggestActive = false
  editor.onDidChangeCursorPosition((e) => {
    const model = editor.getModel()
    if (!model) return
    const type = findEnclosingSpecialBlock((n) => model.getLineContent(n), e.position.lineNumber)
    const active = type !== null && type in SPECIAL_BLOCK_COMPLETIONS
    if (active === blockSuggestActive) return
    blockSuggestActive = active
    editor.updateOptions({
      quickSuggestions: { other: active, comments: false, strings: false },
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
   * Replace the current set of glyphs. Cheap to call on every change:
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
  // Make sure the glyph margin is enabled; otherwise the gutter is hidden.
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
    // Line might host multiple comments; fire for the first one we find.
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

// ── Keep marks ───────────────────────────────────────────────────────────────

const KEEP_MARK_DEBOUNCE_MS = 400

export interface KeepMarkDecorationsHandle extends monacoApi.IDisposable {
  /** Re-scan the current model and refresh the decorations. */
  refresh(): void
}

/**
 * Decorate keep marks (`^^texto^^` / `^^def: texto^^`) in the editor.
 *
 * This is the ONLY surface where a keep mark is visible: the preview and every
 * export collapse it to plain text (see keepMarks.ts). The decoration is
 * deliberately subtle: a faint underline on the marked range plus a gutter
 * glyph, so the writer can see their own marks without the document looking
 * annotated.
 *
 * Scanning goes through `parseKeepMarks`, so math (`$x^{2^^3}$`, `^` is
 * LaTeX superscript) and code (`` `^^x^^` ``, fences) are excluded here exactly
 * as they are everywhere else.
 */
export function setupKeepMarkDecorations(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  onClickGlyph: () => void,
): KeepMarkDecorationsHandle {
  editor.updateOptions({ glyphMargin: true })
  const collection = editor.createDecorationsCollection([])
  let glyphLines = new Set<number>()

  const refresh = () => {
    const model = editor.getModel()
    if (!model) return
    const marks = parseKeepMarks(model.getValue())
    glyphLines = new Set(marks.map((m) => m.line))
    collection.set(marks.map((m) => {
      const start = model.getPositionAt(m.index)
      const end = model.getPositionAt(m.index + m.raw.length)
      return {
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: {
          inlineClassName: "keep-mark-inline",
          glyphMarginClassName: "keep-mark-glyph",
          hoverMessage: { value: m.category ? `${m.category}: ${m.text}` : m.text },
        },
      }
    }))
  }

  // Debounced like the content linter: a full-document scan on every keystroke
  // is exactly the class of work v1.9.5 spent a release removing.
  let debounce: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(refresh, KEEP_MARK_DEBOUNCE_MS)
  }

  const changeDisposable = editor.onDidChangeModelContent(schedule)
  const modelDisposable = editor.onDidChangeModel(schedule)
  const clickDisposable = editor.onMouseDown((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
    const line = e.target.position?.lineNumber
    if (line && glyphLines.has(line)) onClickGlyph()
  })
  refresh()

  return {
    refresh,
    dispose() {
      if (debounce) clearTimeout(debounce)
      changeDisposable.dispose()
      modelDisposable.dispose()
      clickDisposable.dispose()
      collection.clear()
    },
  }
}
