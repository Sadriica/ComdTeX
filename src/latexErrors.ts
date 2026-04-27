export interface LatexDiagnostic {
  severity: "error" | "warning"
  message: string
  line?: number
  context?: string
  suggestion?: string
}

export function parseLatexStderr(stderr: string): LatexDiagnostic[] {
  const lines = stderr.split("\n")
  const diags: LatexDiagnostic[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Pattern 7 — Overfull hbox (warning)
    const overfullMatch = /Overfull \\hbox \((\d+(?:\.\d+)?)pt too wide\)/.exec(line)
    if (overfullMatch) {
      diags.push({
        severity: "warning",
        message: `Line too wide (${overfullMatch[1]}pt overflow)`,
        suggestion: "Add a line break, reduce font size, or use \\sloppy for this paragraph.",
      })
      i++
      continue
    }

    // Pattern 9 — Font warning
    if (/LaTeX Font Warning:|Font shape .+ undefined/.test(line)) {
      const msg = line.replace(/^.*LaTeX Font Warning:\s*/, "").trim() || line.trim()
      diags.push({ severity: "warning", message: msg })
      i++
      continue
    }

    // Pattern 5 — LaTeX Error (environment/package)
    const latexErrMatch = /LaTeX Error:\s*(.+)/.exec(line)
    if (latexErrMatch) {
      const msg = latexErrMatch[1].trim()
      let suggestion: string | undefined
      const envMatch = /Environment (.+?) undefined/.exec(msg)
      if (envMatch) {
        suggestion = `Unknown environment '${envMatch[1]}'. Check spelling or add the required package.`
      }
      // Pattern 6 — File not found (LaTeX Error variant)
      const fileMatch = /File `(.+?)' not found/.exec(msg)
      if (fileMatch) {
        const fname = fileMatch[1]
        suggestion = `Missing package file '${fname}'. Install it or remove the \\usepackage command.`
      }
      diags.push({ severity: "error", message: msg, suggestion })
      i++
      continue
    }

    // Pattern 1–4, 6, 8, 10 — lines starting with "!"
    const fatalMatch = /^!\s*(.+)/.exec(line)
    if (fatalMatch) {
      const rawMsg = fatalMatch[1].trim()
      let message = rawMsg
      let suggestion: string | undefined
      let lineNum: number | undefined
      let context: string | undefined

      // Look ahead for "l.<n> <context>" line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1]
        const lMatch = /^l\.(\d+)\s*(.+)/.exec(nextLine)
        if (lMatch) {
          lineNum = parseInt(lMatch[1], 10)
          context = lMatch[2].trim()
        }
      }

      // Pattern 2 — Missing $
      if (/Missing \$/.test(rawMsg)) {
        suggestion = "Math command used outside math mode. Wrap content in $...$ or $$...$$"
      }
      // Pattern 3 — Extra alignment tab
      else if (/Extra alignment tab/.test(rawMsg)) {
        suggestion = "Too many & separators in a row. Check column count in matrix or align environment."
      }
      // Pattern 4 — Runaway argument / missing brace
      else if (/Runaway argument|Missing \}/.test(rawMsg)) {
        suggestion = "Unclosed brace { — check that every { has a matching }"
      }
      // Pattern 6 — File not found (! variant)
      else if (/I can't find file/.test(rawMsg)) {
        const fnMatch = /`(.+?)'/.exec(rawMsg)
        const fname = fnMatch ? fnMatch[1] : "unknown"
        suggestion = `Missing package file '${fname}'. Install it or remove the \\usepackage command.`
      }
      // Pattern 8 — Missing \begin{document}
      else if (/Missing \\begin\{document\}/.test(rawMsg)) {
        suggestion = "The document is missing \\begin{document}. This is added automatically on PDF export — the error may be in a custom header file."
      }
      // Pattern 1 — Undefined control sequence
      else if (/Undefined control sequence/.test(rawMsg) && context) {
        // context typically is "\commandname" or text containing it
        const cmdMatch = /\\(\w+)/.exec(context)
        if (cmdMatch) {
          suggestion = `Unknown command \\${cmdMatch[1]} — check spelling or define it in macros.md`
        } else {
          suggestion = "Unknown command — check spelling or define it in macros.md"
        }
        message = "Undefined control sequence"
      }

      if (lineNum !== undefined) i++ // skip the l.<n> line too

      diags.push({ severity: "error", message, line: lineNum, context, suggestion })
      i++
      continue
    }

    i++
  }

  // Deduplicate: keep at most 3 of the same (severity, message) pair
  const counts = new Map<string, number>()
  const result: LatexDiagnostic[] = []
  for (const diag of diags) {
    const key = `${diag.severity}:${diag.message}`
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    if (count <= 3) {
      result.push(diag)
    } else if (count === 4) {
      // Add a note to the last kept entry
      const last = [...result].reverse().find((d: LatexDiagnostic) => `${d.severity}:${d.message}` === key)
      if (last) last.message += " (and more similar)"
    }
  }

  // Sort: errors first, then warnings
  result.sort((a, b) => {
    if (a.severity === b.severity) return 0
    return a.severity === "error" ? -1 : 1
  })

  // Fallback: if nothing matched but stderr is non-empty
  if (result.length === 0 && stderr.trim()) {
    const firstLine = stderr.split("\n").find((l) => l.trim()) ?? "Unknown error"
    return [{ severity: "error", message: firstLine }]
  }

  return result
}

export function formatDiagnosticsText(diags: LatexDiagnostic[]): string {
  return diags.map((d) => {
    const lineStr = d.line !== undefined ? ` (line ${d.line})` : ""
    const label = d.severity === "error" ? "Error" : "Warning"
    let out = `${label}${lineStr}: ${d.message}`
    if (d.context) out += `\n  Context: ${d.context}`
    if (d.suggestion) out += `\n  → ${d.suggestion}`
    return out
  }).join("\n\n")
}
