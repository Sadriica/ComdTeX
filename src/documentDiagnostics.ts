import { scanStructuralLabels } from "./structuralLabels"

export type DiagnosticSeverity = "error" | "warning" | "info"
export type DiagnosticCategory = "references" | "citations" | "assets" | "math" | "tables" | "export" | "structure"

export interface DiagnosticIssue {
  severity: DiagnosticSeverity
  category: DiagnosticCategory
  message: string
  filePath: string
  fileName: string
  line: number
  context?: string
}

export interface DiagnosticSummary {
  issues: DiagnosticIssue[]
  errors: number
  warnings: number
  info: number
}

interface DiagnosticFile {
  path: string
  name: string
  content: string
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length
}

function push(
  issues: DiagnosticIssue[],
  file: DiagnosticFile,
  severity: DiagnosticSeverity,
  category: DiagnosticCategory,
  message: string,
  line: number,
  context?: string,
) {
  issues.push({ severity, category, message, filePath: file.path, fileName: file.name, line, context })
}

function collectBibKeys(files: DiagnosticFile[]): Set<string> {
  const keys = new Set<string>()
  for (const file of files) {
    if (!file.name.endsWith(".bib") && file.name !== "references.bib") continue
    const re = /@\w+\s*\{\s*([^,\s]+)\s*,/g
    let match: RegExpExecArray | null
    while ((match = re.exec(file.content)) !== null) keys.add(match[1])
  }
  return keys
}

function scanCitations(files: DiagnosticFile[], issues: DiagnosticIssue[]) {
  const bibKeys = collectBibKeys(files)
  for (const file of files) {
    if (!file.name.endsWith(".md") && !file.name.endsWith(".tex")) continue
    const re = /\[@([A-Za-z0-9:_-]+)(?:[,\]])/g
    let match: RegExpExecArray | null
    while ((match = re.exec(file.content)) !== null) {
      if (!bibKeys.has(match[1])) {
        push(issues, file, "warning", "citations", `Cita no encontrada: @${match[1]}`, lineOf(file.content, match.index))
      }
    }
  }
}

function scanImages(files: DiagnosticFile[], issues: DiagnosticIssue[]) {
  const known = new Set(files.map((file) => file.path.toLowerCase()))
  const basenames = new Set(files.map((file) => file.name.toLowerCase()))
  for (const file of files) {
    if (!file.name.endsWith(".md")) continue
    const re = /!\[[^\]]*\]\(([^)]+)\)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(file.content)) !== null) {
      const src = match[1].trim().replace(/^<|>$/g, "").split(/\s+/)[0]
      if (/^(https?:|data:|file:)/i.test(src)) continue
      const clean = src.replace(/^\.\//, "")
      if (!known.has(clean.toLowerCase()) && !basenames.has(clean.split("/").pop()?.toLowerCase() ?? "")) {
        push(issues, file, "warning", "assets", `Imagen local no encontrada: ${src}`, lineOf(file.content, match.index))
      }
    }
  }
}

function scanMath(file: DiagnosticFile, issues: DiagnosticIssue[]) {
  const dollars = [...file.content.matchAll(/\$\$/g)]
  if (dollars.length % 2 !== 0) {
    const last = dollars[dollars.length - 1]
    push(issues, file, "error", "math", "Bloque $$ sin cerrar", last ? lineOf(file.content, last.index ?? 0) : 1)
  }
}

function countCells(row: string): number {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").length
}

function scanTables(file: DiagnosticFile, issues: DiagnosticIssue[]) {
  const lines = file.content.split("\n")
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes("|") || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) continue
    const expected = countCells(lines[i])
    let j = i + 2
    while (j < lines.length && lines[j].includes("|") && !/^\s*\{#tbl:/.test(lines[j])) {
      const cells = countCells(lines[j])
      if (cells !== expected) {
        push(issues, file, "warning", "tables", `Fila de tabla con ${cells} columnas; se esperaban ${expected}`, j + 1, lines[j].trim())
      }
      j++
    }
  }
}

function scanExportRisks(file: DiagnosticFile, issues: DiagnosticIssue[]) {
  const checks: Array<[RegExp, string]> = [
    [/<(iframe|video|audio|details|script|style)\b/i, "HTML embebido puede degradarse en LaTeX/Overleaf"],
    [/```mermaid\b/i, "Mermaid no se exporta como diagrama nativo en LaTeX"],
    [/>\s*\[![A-Z]+\]/, "Callout estilo Obsidian se degrada en LaTeX"],
    [/!\[\[[^\]]+\]\]/, "Transclusión: verifica que el archivo exista antes de exportar"],
  ]
  for (const [re, message] of checks) {
    const match = re.exec(file.content)
    if (match) push(issues, file, "info", "export", message, lineOf(file.content, match.index))
  }
}

function scanAcademicStructure(file: DiagnosticFile, issues: DiagnosticIssue[]) {
  if (!file.name.endsWith(".md")) return
  if (/^---[\s\S]*?^---/m.test(file.content) && !/^---[\s\S]*?title\s*:/m.test(file.content)) {
    push(issues, file, "info", "structure", "Frontmatter sin title", 1)
  }
  const theoremRe = /^:::theorem(?:\[([^\]]*)\])?(?:\s*\{#[^}]+\})?/gm
  let match: RegExpExecArray | null
  while ((match = theoremRe.exec(file.content)) !== null) {
    const after = file.content.slice(match.index, match.index + 1200)
    if (!/^:::proof\b/m.test(after)) {
      push(issues, file, "info", "structure", "Teorema sin demostración cercana", lineOf(file.content, match.index))
    }
  }
}

export function diagnoseDocuments(files: DiagnosticFile[]): DiagnosticSummary {
  const issues: DiagnosticIssue[] = []
  const index = scanStructuralLabels(files)

  for (const ref of index.broken) {
    issues.push({
      severity: "error",
      category: "references",
      message: `Referencia rota: @${ref.id}`,
      filePath: ref.filePath,
      fileName: ref.fileName,
      line: ref.line,
      context: ref.context,
    })
  }
  for (const [id, labels] of index.duplicates) {
    for (const label of labels) {
      issues.push({
        severity: "warning",
        category: "references",
        message: `Label duplicado: ${id}`,
        filePath: label.filePath,
        fileName: label.fileName,
        line: label.line,
        context: label.context,
      })
    }
  }
  for (const label of index.unused) {
    issues.push({
      severity: "info",
      category: "references",
      message: `Label sin uso: ${label.id}`,
      filePath: label.filePath,
      fileName: label.fileName,
      line: label.line,
      context: label.context,
    })
  }

  scanCitations(files, issues)
  scanImages(files, issues)
  for (const file of files) {
    scanMath(file, issues)
    scanTables(file, issues)
    scanExportRisks(file, issues)
    scanAcademicStructure(file, issues)
  }

  return {
    issues: issues.sort((a, b) => {
      const severity = { error: 0, warning: 1, info: 2 }
      return severity[a.severity] - severity[b.severity] || a.fileName.localeCompare(b.fileName) || a.line - b.line
    }),
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  }
}
