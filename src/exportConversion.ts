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
  // rewrites cross-references as backtick code spans — work not done by toStorageMd.
  return exportToObsidianMarkdown(toStorageMd(cmdxContent))
}

export function toPandocMarkdownInput(cmdxContent: string): string {
  // Keep marks are editor-only — strip before Pandoc sees the document, so no
  // `^^` reaches a .docx / .typ / Beamer / PDF output. See keepMarks.ts.
  return toStorageMd(stripKeepMarks(cmdxContent))
}
