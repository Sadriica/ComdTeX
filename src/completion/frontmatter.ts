// YAML frontmatter completion: keys, then values for the keys that have a
// closed vocabulary (`lang`, `comdtex.texclass`, `comdtex.citestyle`,
// `comdtex.domain`) and today's date for `date`.

import type * as monacoApi from "monaco-editor"
import { CITE_STYLES } from "../citeStyles"
import { completionText } from "./state"
import { RETRIGGER_COMMAND, type CompletionModel, type CompletionSource } from "./types"
import { makeRange } from "./util"

const SCAN_LIMIT = 120

/**
 * Frontmatter region around `lineNumber`: the document must open with `---` on
 * line 1 and the cursor must sit before the closing `---`. Returns the closing
 * line (or null while it is not typed yet), or undefined outside the region.
 */
export function frontmatterEnd(
  model: Pick<CompletionModel, "getLineContent" | "getLineCount">,
  lineNumber: number,
): number | null | undefined {
  if (lineNumber < 2 || model.getLineContent(1).trim() !== "---") return undefined
  const last = Math.min(model.getLineCount(), SCAN_LIMIT)
  for (let n = 2; n <= last; n++) {
    const text = model.getLineContent(n).trim()
    if (text === "---" || text === "...") return n >= lineNumber ? n : undefined
  }
  // No closing fence in reach: the header is either still being typed or it was
  // never a header (a thematic break above prose). Line 2 may be the line being
  // typed; further down, the lines above the cursor must look like YAML, the
  // second one a key or a list item, or this is prose and stays quiet.
  if (lineNumber > SCAN_LIMIT) return undefined
  if (lineNumber === 2) return null
  for (let n = 2; n < lineNumber; n++) {
    const text = model.getLineContent(n)
    if (n === 2 ? !YAML_ENTRY.test(text) : text.trim() !== "" && !YAML_LINE.test(text)) {
      return undefined
    }
  }
  return null
}

// A key, a list item or a comment (line 2), and any line the YAML tokenizer would also accept.
const YAML_ENTRY = /^\s*(?:-\s|[\w.-]+\s*:(?:\s|$)|#)/
const YAML_LINE = /^(?:\s+\S|-\s|[\w.-]+\s*:(?:\s|$)|#)/

function existingKeys(model: CompletionModel, end: number | null, cursorLine: number): Set<string> {
  const keys = new Set<string>()
  const last = Math.min(end ?? SCAN_LIMIT, model.getLineCount(), SCAN_LIMIT)
  for (let n = 2; n <= last; n++) {
    if (n === cursorLine) continue
    const m = /^([\w.-]+)\s*:/.exec(model.getLineContent(n))
    if (m) keys.add(m[1])
  }
  return keys
}

export const FRONTMATTER_KEYS = [
  "title",
  "author",
  "date",
  "abstract",
  "tags",
  "lang",
  "comdtex.texclass",
  "comdtex.citestyle",
  "comdtex.domain",
] as const

const KEY_SNIPPETS: Record<string, string> = {
  tags: "tags: [${1}]",
  abstract: "abstract: |\n  ${1}",
}

const DOMAIN_VALUES = ["biology", "microbiology", "biomedicine"]

function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

async function valuesFor(key: string): Promise<{ value: string; note: string }[]> {
  const t = completionText()
  switch (key) {
    case "lang":
      return Object.keys(t.langValues).map((v) => ({ value: v, note: t.langValues[v] }))
    case "comdtex.texclass": {
      // The exporter is large; its class table is only needed when this key is edited.
      const { TEX_CLASSES } = await import("../exporter")
      return Object.keys(TEX_CLASSES).map((v) => ({ value: v, note: t.texclassValues[v] ?? "" }))
    }
    case "comdtex.citestyle":
      return Object.keys(CITE_STYLES).map((v) => ({ value: v, note: t.citestyleValues[v] ?? "" }))
    case "comdtex.domain":
      return DOMAIN_VALUES.map((v) => ({ value: v, note: t.domainValues[v] ?? "" }))
    case "date":
      return [{ value: todayIso(), note: t.todayDate }]
    default:
      return []
  }
}

export const frontmatterSource: CompletionSource = (env) => {
  const end = frontmatterEnd(env.model, env.position.lineNumber)
  if (end === undefined) return null
  const t = completionText()
  const kinds = env.monaco.languages.CompletionItemKind

  const valueCtx = /^([\w.-]+):[ \t]*([^\s"'[\]{},]*)$/.exec(env.before)
  if (valueCtx) {
    const [, key, partial] = valueCtx
    const range = makeRange(env, env.position.column - partial.length)
    return valuesFor(key).then((values) => ({
      suggestions: values.map(({ value, note }, i) => ({
        label: { label: value, description: note },
        kind: kinds.EnumMember,
        insertText: value,
        range,
        sortText: String(i).padStart(3, "0"),
      })),
    }))
  }

  const keyCtx = /^([\w.-]*)$/.exec(env.before)
  if (keyCtx) {
    const partial = keyCtx[1]
    const range = makeRange(env, env.position.column - partial.length)
    const used = existingKeys(env.model, end, env.position.lineNumber)
    const suggestions: monacoApi.languages.CompletionItem[] = []
    FRONTMATTER_KEYS.forEach((key, i) => {
      if (used.has(key)) return
      const snippet = KEY_SNIPPETS[key]
      suggestions.push({
        label: { label: key, description: t.frontmatterKeys[key] },
        kind: kinds.Property,
        insertText: snippet ?? `${key}: `,
        insertTextRules: snippet
          ? env.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        range,
        sortText: String(i).padStart(2, "0"),
        command: snippet ? undefined : RETRIGGER_COMMAND,
      })
    })
    return { suggestions }
  }
  // Inside frontmatter but on something else (a list item, a quoted value): stay quiet.
  return { suggestions: [] }
}
