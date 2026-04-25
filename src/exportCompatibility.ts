export interface CompatibilityIssue {
  target: "latex" | "obsidian"
  severity: "warning" | "info"
  message: string
  line: number
}

export interface CompatibilityReport {
  latexScore: number
  obsidianScore: number
  latexIssues: CompatibilityIssue[]
  obsidianIssues: CompatibilityIssue[]
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length
}

function collect(text: string, target: "latex" | "obsidian", rules: Array<[RegExp, "warning" | "info", string]>): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = []
  for (const [re, severity, message] of rules) {
    let match: RegExpExecArray | null
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)
    while ((match = global.exec(text)) !== null) {
      issues.push({ target, severity, message, line: lineOf(text, match.index) })
      if (match[0].length === 0) global.lastIndex++
    }
  }
  return issues
}

function score(issues: CompatibilityIssue[]): number {
  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "warning" ? 8 : 3), 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}

export function analyzeExportCompatibility(markdown: string): CompatibilityReport {
  const latexIssues = collect(markdown, "latex", [
    [/<(iframe|video|audio|canvas|script|style)\b/i, "warning", "HTML embebido no tiene equivalente LaTeX directo"],
    [/```mermaid\b/i, "warning", "Mermaid debe exportarse como imagen para máxima compatibilidad Overleaf"],
    [/>\s*\[![A-Z]+\]/, "info", "Callouts se exportan como contenido degradado, no como entorno LaTeX nativo"],
    [/\[\[[^\]]+\]\]/, "info", "Wikilinks no existen en LaTeX; se exportan como texto/enlaces planos"],
    [/\{#(?!sec:|eq:|fig:|tbl:|thm:|lem:|cor:|prop:|def:|ex:|exc:)[\w:.-]+\}/, "warning", "Label con prefijo no reconocido por el exportador LaTeX"],
  ])

  const obsidianIssues = collect(markdown, "obsidian", [
    [/@(?:eq|fig|tbl|sec|thm|lem|cor|prop|def|ex|exc):[\w:.-]+/, "info", "Referencia estructural se conserva como texto/código, no como referencia dinámica Obsidian"],
    [/\{#(?:eq|fig|tbl|sec|thm|lem|cor|prop|def|ex|exc):[\w:.-]+\}/, "info", "Labels estructurales se ocultan o eliminan en Markdown Obsidian"],
    [/\[@[A-Za-z0-9:_-]+(?:[,\]])/, "info", "Citas BibTeX requieren plugin externo en Obsidian"],
    [/\\newcommand\b/, "warning", "Macros LaTeX globales requieren MathJax/KaTeX configurado en Obsidian"],
  ])

  return {
    latexScore: score(latexIssues),
    obsidianScore: score(obsidianIssues),
    latexIssues,
    obsidianIssues,
  }
}
