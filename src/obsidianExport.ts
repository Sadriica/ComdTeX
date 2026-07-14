/**
 * Convert ComdTeX-flavored Markdown to Obsidian-friendly Markdown.
 *
 * Goal: keep notes readable in Obsidian even when academic numbering is not
 * reproduced there. Structural labels are removed from visible text, and
 * editor-only keep marks (`^^def: …^^`) collapse to their plain text.
 */

import { stripKeepMarks } from "./keepMarks"

const ENV_LABELS: Record<string, string> = {
  theorem: "theorem",
  lemma: "lemma",
  corollary: "abstract",
  proposition: "abstract",
  definition: "note",
  example: "example",
  exercise: "question",
  proof: "success",
  remark: "info",
  note: "note",
}

export function exportToObsidianMarkdown(rawMarkdown: string): string {
  // Keep marks are editor-only. Strip first: `stripKeepMarks` is math/code-aware
  // and needs the document still shaped as prose. See keepMarks.ts.
  return stripKeepMarks(rawMarkdown)
    .replace(/^:::(?:(?:sm|lg)\s+)?([\w]+)(?:\[([^\]]*)\])?(?:\s*\{#[\w:.-]+\})?\s*\n([\s\S]*?)^:::\s*$/gm,
      (_full, rawName: string, title: string | undefined, body: string) => {
        const name = rawName.toLowerCase()
        const callout = ENV_LABELS[name] ?? "note"
        const heading = title?.trim() ? ` ${title.trim()}` : ` ${name.charAt(0).toUpperCase()}${name.slice(1)}`
        return [`> [!${callout}]${heading}`, ...body.trim().split("\n").map((line) => `> ${line}`)].join("\n")
      })
    .replace(/^(#{1,6}\s+.+?)\s*\{#sec:[\w:.-]+\}\s*$/gm, "$1")
    .replace(/\$\$([\s\S]+?)\$\$\s*\{#eq:[\w:.-]+\}/g, "$$$$ $1 $$$$")
    .replace(/(!\[[^\]]*\]\([^)]*\))\s*\{#fig:[\w:.-]+\}/g, "$1")
    .replace(/^\s*\{#tbl:[\w:.-]+\}\s*$/gm, "")
    .replace(/@([a-zA-Z]+):([\w-]+(?:\.[\w-]+)*)/g, "`$1:$2`")
}
