// Keywords of the special blocks (pseudocode, truth, graph, plot, commdiag):
// inside one, completion switches to that block's own grammar.

import type * as monacoApi from "monaco-editor"
import { findEnclosingSpecialBlock, getSpecialBlockCompletions } from "./catalog"
import type { CompletionSource } from "./types"
import { makeRange } from "./util"

export const BLOCK_PREFIX_RE = /:::([A-Za-z][\w:-]*)?$/

export const inBlockSource: CompletionSource = (env) => {
  const enclosing = findEnclosingSpecialBlock(
    (n) => env.model.getLineContent(n),
    env.position.lineNumber,
  )
  const catalog = enclosing ? getSpecialBlockCompletions(enclosing) : null
  if (!catalog) return null
  // A ::: being typed here is the block's closing fence, not an opener.
  if (BLOCK_PREFIX_RE.test(env.before)) return { suggestions: [] }

  const word = env.model.getWordUntilPosition(env.position)
  const partial = word.word.toLowerCase()
  const range = makeRange(env, word.startColumn, word.endColumn)
  const suggestions: monacoApi.languages.CompletionItem[] = catalog
    .filter((c) => !partial || c.label.toLowerCase().startsWith(partial))
    .map((c) => ({
      label: { label: c.label, description: c.detail },
      kind: env.monaco.languages.CompletionItemKind.Keyword,
      insertText: c.snippet,
      insertTextRules: env.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      sortText: "0" + c.label,
    }))
  return { suggestions }
}
