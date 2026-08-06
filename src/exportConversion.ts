import { toStorageMd } from "./cmdxFormat"
import { exportToObsidianMarkdown } from "./obsidianExport"
import { stripKeepMarks } from "./keepMarks"

/**
 * Export conversion starts from CMDX editor content but does not represent a
 * normal vault save. Keep these helpers separate from cmdxFormat storage
 * helpers so temporary Pandoc inputs and user-facing exports do not call
 * toStorage()/toDiskContent() directly.
 */

export function toExportMarkdownContent(cmdxContent: string): string {
  // toStorageMd converts :::env blocks to Obsidian callouts and preserves
  // structural labels ({#sec:…}, {#eq:…}, etc.) and cross-references (@eq:…).
  // exportToObsidianMarkdown then strips those labels from visible text and
  // rewrites cross-references as backtick code spans: work not done by toStorageMd.
  return exportToObsidianMarkdown(toStorageMd(cmdxContent))
}

// ComdTeX-only special blocks are preserved verbatim by toStorageMd (a
// data-safety invariant for saves), but Pandoc has no idea what `:::truth`
// means and typesets the raw markup as body text. For Pandoc inputs we
// degrade each block to a fenced code block with a bold caption line: the
// content stays legible in the PDF/DOCX even though it isn't rendered.
const SPECIAL_BLOCK_CAPTIONS: Record<string, string> = {
  pseudocode: "Algorithm",
  flowchart: "Flowchart",
  truth: "Truth Table",
  graph: "Graph",
  plot: "Plot",
  commdiag: "Diagram",
  code: "Code",
  excalidraw: "Excalidraw",
}

export function specialBlocksToPandoc(md: string): string {
  const lines = md.split("\n")
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    // Openers: ":::type", ":::type[Title]", and the ":::code python" language
    // variant (bare word after the type, code blocks only).
    const open = /^:::(pseudocode|flowchart|truth|graph|plot|commdiag|code|excalidraw)(?:\[(.*?)\])?(?:[ \t]+(\S+))?[ \t]*$/.exec(lines[i])
    if (!open) { out.push(lines[i]); i++; continue }
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && !/^:::\s*$/.test(lines[j])) { body.push(lines[j]); j++ }
    if (j >= lines.length) { out.push(lines[i]); i++; continue } // unclosed: leave as-is
    const caption = SPECIAL_BLOCK_CAPTIONS[open[1]] + (open[2] ? `: ${open[2]}` : "")
    out.push(`**${caption}**`, "")
    if (open[1] === "excalidraw") {
      // Body is a JSON scene dump, meaningless in print; keep the caption only.
      out.push("*(drawing omitted in this export)*")
    } else {
      const lang = open[1] === "code" && open[3] ? open[3] : ""
      out.push("```" + lang, ...body, "```")
    }
    i = j + 1
  }
  return out.join("\n")
}

export function toPandocMarkdownInput(cmdxContent: string): string {
  // Keep marks are editor-only: strip before Pandoc sees the document, so no
  // `^^` reaches a .docx / .typ / Beamer / PDF output. See keepMarks.ts.
  // Special blocks degrade to captioned code fences BEFORE toStorageMd so its
  // verbatim masking never sees them (export-only path; storage is untouched).
  return toStorageMd(specialBlocksToPandoc(stripKeepMarks(cmdxContent)))
}
