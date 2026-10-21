// `\command` completion. The command table (~1000 entries generated from
// KaTeX, see scripts/gen-latex-commands.mjs) is a separate chunk loaded the
// first time a backslash is typed, so it costs nothing at startup.

import type * as monacoApi from "monaco-editor"
import type { LatexCommandRow } from "../latexCommands"
import { completionText, getMacroCompletions } from "./state"
import type { CompletionSource } from "./types"
import { makeRange } from "./util"

type Rows = readonly LatexCommandRow[]
let rows: Rows | null = null
let loading: Promise<Rows> | null = null

/** Loads the generated table once; later calls return the same promise/array. */
export function loadLatexCommands(): Promise<Rows> {
  if (rows) return Promise.resolve(rows)
  loading ??= import("../latexCommands").then((mod) => (rows = mod.LATEX_COMMANDS))
  return loading
}

/** Test seam: install a table without the dynamic import. */
export function setLatexCommandsForTest(table: Rows | null) {
  rows = table
  loading = null
  baseCache = null
}

// `\name`, or `\begin{env` while an environment name is being typed.
const LATEX_RE = /\\([A-Za-z]+\{[A-Za-z*]*|[A-Za-z]*)$/

/** The `\` + letters being typed, or null when the backslash is escaped (`\\`). */
export function latexTyped(before: string): string | null {
  const m = LATEX_RE.exec(before)
  if (!m) return null
  const start = m.index
  let slashes = 0
  for (let i = start; i >= 0 && before[i] === "\\"; i--) slashes++
  return slashes % 2 === 1 ? m[0] : null
}

interface BaseItem {
  name: string
  item: Omit<monacoApi.languages.CompletionItem, "range">
}

let baseCache: { monaco: typeof monacoApi; items: BaseItem[] } | null = null

function baseItems(monaco: typeof monacoApi, table: Rows): BaseItem[] {
  if (baseCache && baseCache.monaco === monaco) return baseCache.items
  const kinds = monaco.languages.CompletionItemKind
  const items = table.map(([name, glyph, snippet, group]) => {
    const isSnippet = snippet.includes("$")
    return {
      name,
      item: {
        label: glyph ? { label: name, description: glyph } : name,
        kind: group === "s" ? kinds.Keyword : group === "e" ? kinds.Snippet : kinds.Function,
        detail: glyph || undefined,
        insertText: snippet || `\\${name}`,
        insertTextRules: isSnippet
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        filterText: name,
        sortText: "1" + name,
      },
    }
  })
  baseCache = { monaco, items }
  return items
}

export const latexSource: CompletionSource = (env) => {
  const typed = latexTyped(env.before)
  if (typed === null) return null
  return loadLatexCommands().then((table) => {
    const suffix = typed.slice(1)
    // Typing `\begin{pm` sits inside braces the editor already closed.
    const swallowBrace = suffix.includes("{") && env.after.startsWith("}")
    const range = makeRange(
      env,
      env.position.column - typed.length,
      env.position.column + (swallowBrace ? 1 : 0),
    )
    const t = completionText()
    const suggestions: monacoApi.languages.CompletionItem[] = []
    for (const macro of getMacroCompletions()) {
      if (!macro.startsWith("\\") || !macro.slice(1).startsWith(suffix)) continue
      suggestions.push({
        label: macro.slice(1),
        detail: t.userMacro,
        kind: env.monaco.languages.CompletionItemKind.Variable,
        insertText: macro,
        range,
        sortText: "0" + macro.slice(1),
      })
    }
    for (const { name, item } of baseItems(env.monaco, table)) {
      if (name.startsWith(suffix)) suggestions.push({ ...item, range })
    }
    return { suggestions }
  })
}
