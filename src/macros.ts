/**
 * User-defined LaTeX macros loaded from `macros.md` in the vault root.
 *
 * Format (one per line, same as LaTeX):
 *   \newcommand{\R}{\mathbb{R}}
 *   \newcommand{\norm}[1]{\left\|#1\right\|}
 *   \newcommand{\abs}[1]{\left|#1\right|}
 *
 * Lines starting with % are treated as comments and ignored.
 */

export type KatexMacros = Record<string, string>

/**
 * Extract the content of the first balanced `{...}` block starting at `pos`.
 * Returns null if there is no opening brace at `pos`.
 * Safe against deeply nested input — no regex backtracking.
 */
function extractBraceContent(s: string, pos: number): { content: string; end: number } | null {
  if (s[pos] !== "{") return null
  let depth = 0
  for (let i = pos; i < s.length; i++) {
    if (s[i] === "{") depth++
    else if (s[i] === "}") {
      depth--
      if (depth === 0) return { content: s.slice(pos + 1, i), end: i + 1 }
    }
  }
  return null // unclosed brace
}

export function parseMacros(text: string): KatexMacros {
  const macros: KatexMacros = {}

  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("%")) continue

    // Match \newcommand{\name} — command name is the first brace group
    const prefix = /^\\newcommand/.exec(trimmed)
    if (!prefix) continue

    let pos = prefix[0].length

    // First brace group: the command name, e.g. {\R}
    const nameBlock = extractBraceContent(trimmed, pos)
    if (!nameBlock) continue
    const name = nameBlock.content
    pos = nameBlock.end

    // Optional arity: [n]
    const arityMatch = /^\[\d+\]/.exec(trimmed.slice(pos))
    if (arityMatch) pos += arityMatch[0].length

    // Second brace group: the definition body
    const bodyBlock = extractBraceContent(trimmed, pos)
    if (!bodyBlock) continue

    macros[name] = bodyBlock.content
  }

  return macros
}

export const MACROS_FILENAME = "macros.md"

/** Template shown to users when they create a macros file */
export const MACROS_TEMPLATE = `% Macros personalizados — se aplican en todo el vault
% Sintaxis: \\newcommand{\\cmd}{definición}
%           \\newcommand{\\cmd}[n]{definición con #1...#n}

\\newcommand{\\R}{\\mathbb{R}}
\\newcommand{\\N}{\\mathbb{N}}
\\newcommand{\\Z}{\\mathbb{Z}}
\\newcommand{\\Q}{\\mathbb{Q}}
\\newcommand{\\C}{\\mathbb{C}}
\\newcommand{\\norm}[1]{\\left\\|#1\\right\\|}
\\newcommand{\\abs}[1]{\\left|#1\\right|}
\\newcommand{\\inner}[2]{\\langle #1,\\, #2 \\rangle}
`
