import { scanStructuralLabels } from "./structuralLabels"
import { pathBasename } from "./pathUtils"
import { imageCandidates } from "./imagePaths"
import { CITATION_GROUP_RE, parseCitationGroup } from "./bibtex"
import { es } from "./i18n/es"
import type { T } from "./i18n/types"

export type DiagnosticMessages = T["documentLab"]["diag"]

/** What the vault holds besides the documents themselves. */
export interface DiagnosticOptions {
  /** Citation keys already known (the vault bibliography, parsed). */
  bibKeys?: Iterable<string>
  /** Paths of every non-document file (images, figures, assets). */
  assetPaths?: Iterable<string>
  /** Vault root, used to resolve image paths the way the preview does. */
  vaultPath?: string
  /** UI-language messages; Spanish when omitted. */
  messages?: DiagnosticMessages
}

export type DiagnosticSeverity = "error" | "warning" | "info"
export type DiagnosticCategory =
  "references" | "citations" | "assets" | "math" | "tables" | "export" | "structure"

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
  issues.push({
    severity,
    category,
    message,
    filePath: file.path,
    fileName: file.name,
    line,
    context,
  })
}

function collectBibKeys(files: DiagnosticFile[], extra?: Iterable<string>): Set<string> {
  const keys = new Set<string>(extra ?? [])
  for (const file of files) {
    if (!file.name.endsWith(".bib") && file.name !== "references.bib") continue
    const re = /@\w+\s*\{\s*([^,\s]+)\s*,/g
    let match: RegExpExecArray | null
    while ((match = re.exec(file.content)) !== null) keys.add(match[1])
  }
  return keys
}

function scanCitations(
  files: DiagnosticFile[],
  issues: DiagnosticIssue[],
  bibKeys: Set<string>,
  msg: DiagnosticMessages,
) {
  for (const file of files) {
    if (!file.name.endsWith(".md") && !file.name.endsWith(".tex")) continue
    const re = new RegExp(CITATION_GROUP_RE.source, "g")
    let match: RegExpExecArray | null
    while ((match = re.exec(file.content)) !== null) {
      for (const { key } of parseCitationGroup(match[1]) ?? []) {
        if (bibKeys.has(key)) continue
        push(
          issues,
          file,
          "warning",
          "citations",
          msg.citationNotFound(key),
          lineOf(file.content, match.index),
        )
      }
    }
  }
}

function scanImages(
  files: DiagnosticFile[],
  issues: DiagnosticIssue[],
  opts: DiagnosticOptions,
  msg: DiagnosticMessages,
) {
  const paths = [...files.map((f) => f.path), ...(opts.assetPaths ?? [])]
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase()
  const known = new Set(paths.map(norm))
  const basenames = new Set(paths.map((p) => pathBasename(p).toLowerCase()))
  const vaultRoot = opts.vaultPath?.replace(/[\\/]+$/, "")
  for (const file of files) {
    if (!file.name.endsWith(".md")) continue
    const re = /!\[[^\]]*\]\(([^)]+)\)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(file.content)) !== null) {
      const src = match[1].trim().replace(/^<|>$/g, "").split(/\s+/)[0]
      if (/^(https?:|data:|file:|blob:)/i.test(src)) continue
      const clean = src.replace(/^\.\//, "")
      const candidates = [clean, ...imageCandidates(src, file.path, vaultRoot)]
      const found =
        candidates.some((c) => known.has(norm(c))) ||
        basenames.has(pathBasename(clean).toLowerCase())
      if (!found) {
        push(
          issues,
          file,
          "warning",
          "assets",
          msg.imageNotFound(src),
          lineOf(file.content, match.index),
        )
      }
    }
  }
}

function scanMath(file: DiagnosticFile, issues: DiagnosticIssue[], msg: DiagnosticMessages) {
  const dollars = [...file.content.matchAll(/\$\$/g)]
  if (dollars.length % 2 !== 0) {
    const last = dollars[dollars.length - 1]
    push(
      issues,
      file,
      "error",
      "math",
      msg.unclosedMath,
      last ? lineOf(file.content, last.index ?? 0) : 1,
    )
  }
}

function countCells(row: string): number {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").length
}

function scanTables(file: DiagnosticFile, issues: DiagnosticIssue[], msg: DiagnosticMessages) {
  const lines = file.content.split("\n")
  for (let i = 0; i < lines.length - 1; i++) {
    if (
      !lines[i].includes("|") ||
      !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    )
      continue
    const expected = countCells(lines[i])
    let j = i + 2
    while (j < lines.length && lines[j].includes("|") && !/^\s*\{#tbl:/.test(lines[j])) {
      const cells = countCells(lines[j])
      if (cells !== expected) {
        push(
          issues,
          file,
          "warning",
          "tables",
          msg.tableColumns(cells, expected),
          j + 1,
          lines[j].trim(),
        )
      }
      j++
    }
  }
}

function scanExportRisks(file: DiagnosticFile, issues: DiagnosticIssue[], msg: DiagnosticMessages) {
  const checks: Array<[RegExp, string]> = [
    [/<(iframe|video|audio|details|script|style)\b/i, msg.exportHtml],
    [/```mermaid\b/i, msg.exportMermaid],
    [/>\s*\[![A-Z]+\]/, msg.exportCallout],
    [/!\[\[[^\]]+\]\]/, msg.exportTransclusion],
  ]
  for (const [re, message] of checks) {
    const match = re.exec(file.content)
    if (match) push(issues, file, "info", "export", message, lineOf(file.content, match.index))
  }
}

function scanAcademicStructure(
  file: DiagnosticFile,
  issues: DiagnosticIssue[],
  msg: DiagnosticMessages,
) {
  if (!file.name.endsWith(".md")) return
  if (/^---[\s\S]*?^---/m.test(file.content) && !/^---[\s\S]*?title\s*:/m.test(file.content)) {
    push(issues, file, "info", "structure", msg.noTitle, 1)
  }
  const theoremRe = /^:::theorem(?:\[([^\]]*)\])?(?:\s*\{#[^}]+\})?/gm
  let match: RegExpExecArray | null
  while ((match = theoremRe.exec(file.content)) !== null) {
    const after = file.content.slice(match.index, match.index + 1200)
    if (!/^:::proof\b/m.test(after)) {
      push(issues, file, "info", "structure", msg.theoremNoProof, lineOf(file.content, match.index))
    }
  }
}

export function diagnoseDocuments(
  files: DiagnosticFile[],
  opts: DiagnosticOptions = {},
): DiagnosticSummary {
  const msg = opts.messages ?? es.documentLab.diag
  const issues: DiagnosticIssue[] = []
  const index = scanStructuralLabels(files)

  for (const ref of index.broken) {
    issues.push({
      severity: "error",
      category: "references",
      message: msg.brokenRef(ref.id),
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
        message: msg.duplicateLabel(id),
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
      message: msg.unusedLabel(label.id),
      filePath: label.filePath,
      fileName: label.fileName,
      line: label.line,
      context: label.context,
    })
  }

  scanCitations(files, issues, collectBibKeys(files, opts.bibKeys), msg)
  scanImages(files, issues, opts, msg)
  for (const file of files) {
    scanMath(file, issues, msg)
    scanTables(file, issues, msg)
    scanExportRisks(file, issues, msg)
    scanAcademicStructure(file, issues, msg)
  }

  return {
    issues: issues.sort((a, b) => {
      const severity = { error: 0, warning: 1, info: 2 }
      return (
        severity[a.severity] - severity[b.severity] ||
        a.fileName.localeCompare(b.fileName) ||
        a.line - b.line
      )
    }),
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  }
}
