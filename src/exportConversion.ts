import { toStorageMd } from "./cmdxFormat"
import { exportToObsidianMarkdown } from "./obsidianExport"
import { stripKeepMarks } from "./keepMarks"
import { numberEnvironmentsForExport } from "./envExport"
import { seqBlockToMarkdown } from "./sequence"

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
  // Number environments and resolve their refs BEFORE toStorageMd, which would
  // turn them into callouts with no numbers (see envExport.ts).
  return exportToObsidianMarkdown(
    toStorageMd(numberEnvironmentsForExport(cmdxContent, "callout"), { envLabels: false }),
  )
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
  seq: "Sequence",
}

export function specialBlocksToPandoc(
  md: string,
  opts: { keep?: ReadonlySet<string> } = {},
): string {
  const lines = md.split("\n")
  const out: string[] = []
  let seqCount = 0
  let fence: string | null = null
  let i = 0
  while (i < lines.length) {
    // A `:::plot` shown inside a fenced code sample is documentation, not a block.
    const f = /^\s*(`{3,}|~{3,})/.exec(lines[i])
    if (f) {
      if (fence === null) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
    }
    if (f || fence !== null) {
      out.push(lines[i])
      i++
      continue
    }
    // Openers: ":::type", ":::type[Title]", and the ":::code python" language
    // variant (bare word after the type, code blocks only).
    const open =
      /^:::(pseudocode|flowchart|truth|graph|plot|commdiag|code|excalidraw|seq)(?:\[(.*?)\])?(?:[ \t]+(\S+))?[ \t]*$/.exec(
        lines[i],
      )
    if (!open || opts.keep?.has(open[1])) {
      out.push(lines[i])
      i++
      continue
    }
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && !/^:::\s*$/.test(lines[j])) {
      body.push(lines[j])
      j++
    }
    if (j >= lines.length) {
      out.push(lines[i])
      i++
      continue
    } // unclosed: leave as-is
    if (open[1] === "seq") {
      // Grouped, numbered text in a fence; highlights become a plain legend.
      seqCount++
      const md = seqBlockToMarkdown(open[2] ?? "", body.join("\n"), seqCount)
      if (md) {
        out.push(...md)
        i = j + 1
        continue
      }
    }
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
  // Environments are numbered after the special blocks degrade (so nested ones
  // are already fences) and before toStorageMd flattens them to callouts.
  return toStorageMd(
    numberEnvironmentsForExport(specialBlocksToPandoc(stripKeepMarks(cmdxContent)), "bold"),
    { envLabels: false },
  )
}
