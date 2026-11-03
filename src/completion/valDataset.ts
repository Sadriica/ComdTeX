// `val(` completion: the first argument names a dataset declared in this
// document with `:::data{#data:name}` (see resultValues.ts). Written as the
// bare name, `@name` or `data:name`; the completion inserts the bare name,
// which `valueDatasetLabel` resolves.

import type * as monacoApi from "monaco-editor"
import { inFencedCode } from "../fences"
import { ownLabels } from "./labels"
import { foldText } from "./match"
import { completionText } from "./state"
import type { CompletionModel, CompletionSource } from "./types"
import { makeRange } from "./util"

/** `val(` and the dataset name typed so far (no comma yet). */
const VAL_RE = /(?<![\\\w.])val\(\s*(@?(?:data:)?[\w.-]*)$/

/** The source file a `:::data` declaration names, for the dim text of the row. */
function declaredFile(model: CompletionModel, labelLine: number): string | undefined {
  let open = labelLine
  while (open >= 1 && labelLine - open <= 6 && !/^:::data\b/.test(model.getLineContent(open)))
    open--
  if (open < 1 || !/^:::data\b/.test(model.getLineContent(open))) return undefined
  for (let n = open + 1; n <= model.getLineCount() && n - open <= 8; n++) {
    const text = model.getLineContent(n).trim()
    if (text.startsWith(":::")) return undefined
    if (!text || text.startsWith("{#")) continue
    return text
  }
  return undefined
}

export const valDatasetSource: CompletionSource = (env) => {
  const m = VAL_RE.exec(env.before)
  if (!m) return null
  if (inFencedCode((n) => env.model.getLineContent(n), env.position.lineNumber)) return null
  const partial = m[1]
  const typed = foldText(partial.replace(/^@/, "").replace(/^data:/, ""))
  const range = makeRange(env, env.position.column - partial.length)
  const t = completionText()
  const seen = new Set<string>()
  const suggestions: monacoApi.languages.CompletionItem[] = []
  for (const label of ownLabels(env.model)) {
    if (label.kind !== "data" || seen.has(label.name)) continue
    if (typed && !foldText(label.name).includes(typed)) continue
    seen.add(label.name)
    suggestions.push({
      label: { label: label.name, description: declaredFile(env.model, label.line) },
      kind: env.monaco.languages.CompletionItemKind.Reference,
      detail: t.valDataset,
      insertText: label.name,
      range,
      sortText:
        (foldText(label.name).startsWith(typed) ? "0" : "1") + String(label.line).padStart(6, "0"),
      filterText: `${partial} ${label.name}`,
    })
  }
  return { suggestions, incomplete: partial.length > 0 }
}
