// Static completion catalogs: block/shorthand snippets (Tab expansion and the
// suggest list) and the keyword grammar of each special block.

export interface Completion {
  label: string
  detail: string
  snippet: string
}

export const COMPLETIONS: Completion[] = [
  // ── Environments ─────────────────────────────────────────────────────────
  {
    label: "theorem",
    detail: ":::theorem → numbered theorem",
    snippet: ":::theorem[${1:title}]\n${2:statement}\n:::",
  },
  {
    label: "lemma",
    detail: ":::lemma → numbered lemma",
    snippet: ":::lemma[${1:title}]\n${2:statement}\n:::",
  },
  {
    label: "corollary",
    detail: ":::corollary → corollary",
    snippet: ":::corollary\n${1:statement}\n:::",
  },
  {
    label: "proposition",
    detail: ":::proposition → proposition",
    snippet: ":::proposition\n${1:statement}\n:::",
  },
  {
    label: "definition",
    detail: ":::definition → definition",
    snippet: ":::definition\n${1:definition}\n:::",
  },
  { label: "example", detail: ":::example → example", snippet: ":::example\n${1:example}\n:::" },
  {
    label: "exercise",
    detail: ":::exercise → exercise",
    snippet: ":::exercise\n${1:exercise}\n:::",
  },
  { label: "proof", detail: ":::proof → proof (with □)", snippet: ":::proof\n${1:proof}\n:::" },
  { label: "remark", detail: ":::remark → remark", snippet: ":::remark\n${1:remark}\n:::" },
  { label: "note", detail: ":::note → note", snippet: ":::note\n${1:note}\n:::" },
  {
    label: "flowchart",
    detail: ":::flowchart → flowchart block",
    snippet:
      ":::flowchart[${1:title}]\n${2:START\n  INPUT: value\n  IF condition THEN\n    OUTPUT: result\n  END IF}\n:::",
  },
  {
    label: "pseudocode",
    detail: ":::pseudocode → pseudocode block",
    snippet:
      ":::pseudocode[${1:title}]\n${2:INPUT: value\nFOR i ← 1 TO n DO\n  statement\nEND FOR}\n:::",
  },
  // ── Truth table ─────────────────────────────────────────────────────────────
  {
    label: ":::truth",
    detail: ":::truth → truth table block",
    snippet: ":::truth[${1:title}]\n${2:p ∧ q}\n:::",
  },
  // ── Graph visualizer ────────────────────────────────────────────────────────
  {
    label: ":::graph",
    detail: "Graph visualizer",
    snippet: ":::graph[${1:title}]\n${2:A -- B}\n${3:A -- C}\n:::",
  },
  // ── Function plotter ────────────────────────────────────────────────────────
  {
    label: ":::plot",
    detail: "Function plotter",
    snippet: ":::plot[${1:title}]\n${2:f(x) = sin(x)}\nrange: [${3:-6.28}, ${4:6.28}]\n:::",
  },
  // ── Commutative diagram ─────────────────────────────────────────────────────
  {
    label: ":::commdiag",
    detail: "Commutative diagram",
    snippet:
      ":::commdiag[${1:title}]\n${2:A} -> ${3:B} [${4:f}]\n${5:A} -> ${6:C} [${7:g}]\n${8:B} -> ${9:D} [${10:h}]\n${11:C} -> ${12:D} [${13:k}]\n:::",
  },
  // ── Pseudocode ──────────────────────────────────────────────────────────────
  {
    label: "#algo",
    detail: "#algo[Title] ... #end → algorithm block with flowchart",
    snippet:
      "#algo[${1:Algorithm name}]\nINPUT: ${2:description}\nOUTPUT: ${3:description}\n\n${4:FOR i ← 1 TO n DO\n  ${5:statement}\nEND FOR}\n#end",
  },
  {
    label: "FOR",
    detail: "pseudocode: FOR loop",
    snippet: "FOR ${1:i} ← ${2:1} TO ${3:n} DO\n  ${4}\nEND FOR",
  },
  {
    label: "WHILE",
    detail: "pseudocode: WHILE loop",
    snippet: "WHILE ${1:condition} DO\n  ${2}\nEND WHILE",
  },
  {
    label: "IF",
    detail: "pseudocode: IF statement",
    snippet: "IF ${1:condition} THEN\n  ${2}\nEND IF",
  },
  {
    label: "FUNCTION",
    detail: "pseudocode: FUNCTION block",
    snippet: "FUNCTION ${1:Name}(${2:args})\n  ${3}\n  RETURN ${4}\nEND FUNCTION",
  },
  { label: "RETURN", detail: "pseudocode: RETURN", snippet: "RETURN ${1:value}" },
  {
    label: "REPEAT",
    detail: "pseudocode: REPEAT...UNTIL loop",
    snippet: "REPEAT\n  ${1:statement}\nUNTIL ${2:condition}",
  },
  { label: "ELSE", detail: "pseudocode: ELSE branch", snippet: "ELSE\n  ${1:statement}" },
  { label: "INPUT", detail: "pseudocode: input (parallelogram)", snippet: "INPUT: ${1:variable}" },
  { label: "OUTPUT", detail: "pseudocode: output (parallelogram)", snippet: "OUTPUT: ${1:value}" },
  {
    label: "PROCEDURE",
    detail: "pseudocode: PROCEDURE block",
    snippet: "PROCEDURE ${1:Name}(${2:args})\n  ${3}\nEND PROCEDURE",
  },
  { label: "#end", detail: "pseudocode: close #algo block", snippet: "#end" },
  // ── Math shorthands ───────────────────────────────────────────────────────
  {
    label: "table",
    detail: "table(Col1, Col2, ...) → markdown table",
    snippet: "table(${1:Col1}, ${2:Col2}, ${3:Col3})",
  },
  {
    label: "mat",
    detail: "mat(v1, v2, ...) → auto-sized matrix",
    snippet: "mat(${1:1}, ${2:2}, ${3:3}, ${4:4})",
  },
  {
    label: "matf",
    detail: "matf(rows, cols, v1, ...) → explicit-size matrix",
    snippet: "matf(${1:2}, ${2:2})",
  },
  { label: "frac", detail: "frac(num, den) → a/b", snippet: "frac(${1:a}, ${2:b})" },
  {
    label: "si",
    detail: "si(value, unit) → quantity with units (siunitx)",
    snippet: "si(${1:9.81}, ${2:m/s^2})",
  },
  { label: "num", detail: "num(6.022e23) → formatted number", snippet: "num(${1:6.022e23})" },
  { label: "unit", detail: "unit(mol/L) → standalone unit", snippet: "unit(${1:mol/L})" },
  { label: "ce", detail: "ce(H2O) → chemical formula (mhchem)", snippet: "ce(${1:H2O})" },
  {
    label: "csv",
    detail: ":::csv block → table from a CSV selection",
    snippet: ":::csv[${1:Title}]\n${2:data.csv} (${3:A:C}) (${4:1:10})\n:::",
  },
  {
    label: "data",
    detail: ":::data block → a named dataset other blocks can use",
    snippet: ":::data{#data:${1:name}}\n${2:data.csv} (${3:A:D}) (${4:1:20})\n:::",
  },
  {
    label: "dataplot",
    detail: ":::plot from a dataset → line, scatter, bars, error bars",
    snippet:
      ":::plot[${1:Title}]\n@data:${2:name}\nx: ${3:time}\ny: (${4:S1, S2})\nkind: line\n:::",
  },
  { label: "sqrt", detail: "sqrt(x) → √x", snippet: "sqrt(${1:x})" },
  { label: "root", detail: "root(n, x) → ⁿ√x", snippet: "root(${1:n}, ${2:x})" },
  { label: "sum", detail: "sum(start, end) → Σ", snippet: "sum(${1:i=0}, ${2:n})" },
  { label: "int", detail: "int(a, b) → ∫", snippet: "int(${1:a}, ${2:b})" },
  { label: "lim", detail: "lim(var, val) → lim", snippet: "lim(${1:x}, ${2:0})" },
  { label: "vec", detail: "vec(v) → v⃗", snippet: "vec(${1:v})" },
  { label: "abs", detail: "abs(x) → |x|", snippet: "abs(${1:x})" },
  { label: "norm", detail: "norm(v) → ‖v‖", snippet: "norm(${1:v})" },
  { label: "ceil", detail: "ceil(x) → ⌈x⌉", snippet: "ceil(${1:x})" },
  { label: "floor", detail: "floor(x) → ⌊x⌋", snippet: "floor(${1:x})" },
  // Superscript / subscript
  { label: "sup", detail: "sup(x, n) → x^{n}", snippet: "sup(${1:x}, ${2:n})" },
  { label: "sub", detail: "sub(x, n) → x_{n}", snippet: "sub(${1:x}, ${2:n})" },
  // Decorators
  { label: "hat", detail: "hat(x) → x̂", snippet: "hat(${1:x})" },
  { label: "bar", detail: "bar(x) → x̄", snippet: "bar(${1:x})" },
  { label: "tilde", detail: "tilde(x) → x̃", snippet: "tilde(${1:x})" },
  { label: "dot", detail: "dot(x) → ẋ", snippet: "dot(${1:x})" },
  { label: "ddot", detail: "ddot(x) → ẍ", snippet: "ddot(${1:x})" },
  // Math fonts
  { label: "bf", detail: "bf(x) → 𝐱 (mathbf)", snippet: "bf(${1:x})" },
  { label: "cal", detail: "cal(A) → 𝒜 (mathcal)", snippet: "cal(${1:A})" },
  { label: "bb", detail: "bb(R) → ℝ (mathbb)", snippet: "bb(${1:R})" },
  // Derivatives
  { label: "pder", detail: "pder(f, x) → ∂f/∂x", snippet: "pder(${1:f}, ${2:x})" },
  { label: "der", detail: "der(f, x) → df/dx", snippet: "der(${1:f}, ${2:x})" },
  // Linear algebra
  { label: "inv", detail: "inv(A) → A⁻¹", snippet: "inv(${1:A})" },
  { label: "trans", detail: "trans(A) → Aᵀ", snippet: "trans(${1:A})" },
  // ── Trig / Math functions ──────────────────────────────────────────────────
  { label: "sin", detail: "sin(x) → \\sin(x)", snippet: "sin(${1:x})" },
  { label: "cos", detail: "cos(x) → \\cos(x)", snippet: "cos(${1:x})" },
  { label: "tan", detail: "tan(x) → \\tan(x)", snippet: "tan(${1:x})" },
  { label: "cot", detail: "cot(x) → \\cot(x)", snippet: "cot(${1:x})" },
  { label: "sec", detail: "sec(x) → \\sec(x)", snippet: "sec(${1:x})" },
  { label: "csc", detail: "csc(x) → \\csc(x)", snippet: "csc(${1:x})" },
  { label: "exp", detail: "exp(x) → \\exp(x)", snippet: "exp(${1:x})" },
  { label: "ln", detail: "ln(x) → \\ln(x)", snippet: "ln(${1:x})" },
  { label: "log", detail: "log(x) → \\log(x)", snippet: "log(${1:x})" },
]

// ── Precomputed lowercase labels for fast prefix matching ────────────────────
// Avoids re-lowercasing on every keystroke and fixes mixed-case label comparison.
export const COMPLETIONS_LC: string[] = COMPLETIONS.map((c) => c.label.toLowerCase())

// ── In-block completions for special blocks ──────────────────────────────────
// Static catalogs (~40 entries total; negligible footprint). Keyword grammar
// mirrors the real parsers (pseudocodeFlowchart.ts, truthTable.ts,
// graphViz.ts, functionPlot.ts, commDiag.ts).

const PSEUDOCODE_BLOCK_COMPLETIONS: Completion[] = [
  { label: "INPUT", detail: "INPUT: value (I/O)", snippet: "INPUT: ${1:valor}" },
  { label: "OUTPUT", detail: "OUTPUT: result (I/O)", snippet: "OUTPUT: ${1:resultado}" },
  { label: "PRINT", detail: "PRINT message (I/O)", snippet: "PRINT ${1:mensaje}" },
  { label: "IF", detail: "IF … THEN / END IF", snippet: "IF ${1:condición} THEN\n  ${2}\nEND IF" },
  {
    label: "IFELSE",
    detail: "IF … THEN / ELSE / END IF",
    snippet: "IF ${1:condición} THEN\n  ${2}\nELSE\n  ${3}\nEND IF",
  },
  { label: "ELSEIF", detail: "ELSE IF … THEN", snippet: "ELSE IF ${1:condición} THEN\n  ${2}" },
  { label: "ELSE", detail: "ELSE branch", snippet: "ELSE\n  ${1}" },
  {
    label: "FOR",
    detail: "FOR i ← 1 TO n DO / END FOR",
    snippet: "FOR ${1:i} ← ${2:1} TO ${3:n} DO\n  ${4}\nEND FOR",
  },
  {
    label: "WHILE",
    detail: "WHILE … DO / END WHILE",
    snippet: "WHILE ${1:condición} DO\n  ${2}\nEND WHILE",
  },
  { label: "REPEAT", detail: "REPEAT / UNTIL …", snippet: "REPEAT\n  ${1}\nUNTIL ${2:condición}" },
  { label: "SWAP", detail: "SWAP a ↔ b", snippet: "SWAP ${1:A[i]} ↔ ${2:A[j]}" },
  { label: "RETURN", detail: "RETURN value (terminal)", snippet: "RETURN ${1:valor}" },
  { label: "END", detail: "END (terminal)", snippet: "END" },
]

export const SPECIAL_BLOCK_COMPLETIONS: Record<string, Completion[]> = {
  pseudocode: PSEUDOCODE_BLOCK_COMPLETIONS,
  flowchart: PSEUDOCODE_BLOCK_COMPLETIONS,
  truth: [
    { label: "AND", detail: "p ∧ q (also * or &&)", snippet: "∧ " },
    { label: "OR", detail: "p ∨ q (also + or ||)", snippet: "∨ " },
    { label: "NOT", detail: "¬p (also !)", snippet: "¬" },
    { label: "IMPLIES", detail: "p → q (also ->)", snippet: "→ " },
    { label: "IFF", detail: "p ↔ q (also <-> or ≡)", snippet: "↔ " },
  ],
  graph: [
    { label: "edge", detail: "A -- B (undirected)", snippet: "${1:A} -- ${2:B}" },
    { label: "arrow", detail: "A -> B (directed)", snippet: "${1:A} -> ${2:B}" },
    { label: "weighted", detail: "A -- B : 5 (with weight)", snippet: "${1:A} -- ${2:B} : ${3:5}" },
  ],
  plot: [
    { label: "f", detail: "f(x) = expression", snippet: "f(${1:x}) = ${2:sin(x)}" },
    { label: "range", detail: "range: [-5, 5] (x domain)", snippet: "range: [${1:-5}, ${2:5}]" },
    { label: "sin", detail: "sin(x)", snippet: "sin(${1:x})" },
    { label: "cos", detail: "cos(x)", snippet: "cos(${1:x})" },
    { label: "tan", detail: "tan(x)", snippet: "tan(${1:x})" },
    { label: "sqrt", detail: "sqrt(x)", snippet: "sqrt(${1:x})" },
    { label: "abs", detail: "abs(x)", snippet: "abs(${1:x})" },
    { label: "exp", detail: "exp(x)", snippet: "exp(${1:x})" },
    { label: "log", detail: "log(x)", snippet: "log(${1:x})" },
    { label: "pi", detail: "π", snippet: "pi" },
  ],
  commdiag: [
    { label: "arrow", detail: "A -> B [f]", snippet: "${1:A} -> ${2:B} [${3:f}]" },
    { label: "iso", detail: "A <-> B [f] (isomorphism)", snippet: "${1:A} <-> ${2:B} [${3:f}]" },
    { label: "epi", detail: "A ->> B [f] (epimorphism)", snippet: "${1:A} ->> ${2:B} [${3:f}]" },
    { label: "mono", detail: "A >-> B [f] (monomorphism)", snippet: "${1:A} >-> ${2:B} [${3:f}]" },
    { label: "double", detail: "A ==> B [f]", snippet: "${1:A} ==> ${2:B} [${3:f}]" },
    {
      label: "square",
      detail: "full commutative square",
      snippet:
        "${1:A} -> ${2:B} [${3:f}]\n${1:A} -> ${4:C} [${5:g}]\n${2:B} -> ${6:D} [${7:h}]\n${4:C} -> ${6:D} [${8:k}]",
    },
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
    matches.length === 1 ? matches[0] : matches.find((c) => c.label.toLowerCase() === typed)
  return completion ? { completion, overwriteBefore: word.length } : null
}

export interface TabCompletionResolution {
  completion: Completion
  overwriteBefore: number
}

export function resolveTabCompletion(
  beforeCursor: string,
  word: string,
): TabCompletionResolution | null {
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
