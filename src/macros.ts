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

const NEWCOMMAND_RE = /\\newcommand\{(\\[\w@]+)\}(?:\[\d+\])?\{((?:[^{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*)\}/g

export function parseMacros(text: string): KatexMacros {
  const macros: KatexMacros = {}

  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("%")) continue

    NEWCOMMAND_RE.lastIndex = 0
    const m = NEWCOMMAND_RE.exec(trimmed)
    if (m) {
      // m[1] = "\R", m[2] = "\mathbb{R}"
      macros[m[1]] = m[2]
    }
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
