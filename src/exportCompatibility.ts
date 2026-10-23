import { getUiLanguage } from "./docLang"
import { en } from "./i18n/en"
import { es } from "./i18n/es"
import type { T } from "./i18n/types"

export type CompatibilityMessages = T["documentLab"]["compat"]

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

function collect(
  text: string,
  target: "latex" | "obsidian",
  rules: Array<[RegExp, "warning" | "info", string]>,
): CompatibilityIssue[] {
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

export function analyzeExportCompatibility(
  markdown: string,
  m: CompatibilityMessages = (getUiLanguage() === "en" ? en : es).documentLab.compat,
): CompatibilityReport {
  const latexIssues = collect(markdown, "latex", [
    [/<(iframe|video|audio|canvas|script|style)\b/i, "warning", m.html],
    [/```mermaid\b/i, "warning", m.mermaid],
    [/>\s*\[![A-Z]+\]/, "info", m.callout],
    [/\[\[[^\]]+\]\]/, "info", m.wikilink],
    [/\{#(?!sec:|eq:|fig:|tbl:|thm:|lem:|cor:|prop:|def:|ex:|exc:)[\w:.-]+\}/, "warning", m.label],
  ])

  const obsidianIssues = collect(markdown, "obsidian", [
    [/@(?:eq|fig|tbl|sec):[\w:.-]+/, "info", m.structuralRef],
    [/\{#(?:eq|fig|tbl|sec|thm|lem|cor|prop|def|ex|exc):[\w:.-]+\}/, "info", m.structuralLabel],
    [
      /@(?:thm|theorem|lem|lemma|cor|corollary|prop|proposition|def|definition|ex|example|exc|exercise):[\w:.-]+/,
      "info",
      m.envRef,
    ],
    [/@(?:\[[^\]\n]+\]|[A-Za-z0-9_./-]+)@[a-zA-Z]+:[\w-]+(?:\.\w+)*/, "warning", m.crossEnvRef],
    [/\[@[A-Za-z0-9:_-]+(?:[,;\]])/, "info", m.bibtex],
    [/\\newcommand\b/, "warning", m.macros],
  ])

  return {
    latexScore: score(latexIssues),
    obsidianScore: score(obsidianIssues),
    latexIssues,
    obsidianIssues,
  }
}

/**
 * Unique, warning-level messages for what the chosen export will lose or
 * degrade. Used right before exporting so the user hears about it once, in a
 * toast, without the export being blocked. `info` issues are left to the
 * Document Lab panel: they would fire on almost every document.
 */
export function lossyExportWarnings(
  markdown: string,
  target: "latex" | "obsidian",
  messages?: CompatibilityMessages,
): string[] {
  const report = analyzeExportCompatibility(markdown, messages)
  const issues = target === "latex" ? report.latexIssues : report.obsidianIssues
  return [
    ...new Set(
      issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    ),
  ]
}
