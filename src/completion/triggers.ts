// Keeps the suggest widget coming while you type inside structural contexts,
// without turning `quickSuggestions` on for prose.
//
// Monaco opens the widget on trigger characters (`[`, `@`, `\`, ...) and keeps
// it filtering as long as the typed text continues the word. It does NOT open
// it for the first letter of a frontmatter key, a CSV path, the key after
// `; ` in `[@a; @b]`, or a math word. Those cases re-trigger it here, and only
// when the line before the cursor is in one of those contexts.

import type * as monacoApi from "monaco-editor"
import { findEnclosingSpecialBlock } from "./catalog"
import { frontmatterEnd } from "./frontmatter"
import type { CompletionModel } from "./types"

/** True when the cursor is inside `$...$` or a `$$` display block. */
export function isInMath(
  model: Pick<CompletionModel, "getLineContent">,
  lineNumber: number,
  before: string,
): boolean {
  const display = (before.match(/\$\$/g) ?? []).length
  if (display % 2 === 1) return true
  const singles = before.replace(/\$\$/g, "").replace(/\\\$/g, "").split("$").length - 1
  if (singles % 2 === 1) return true
  // A multi-line display block opened on an earlier line.
  let fences = 0
  for (let n = lineNumber - 1; n >= 1 && lineNumber - n <= 80; n--) {
    const text = model.getLineContent(n)
    if (!text.includes("$$")) continue
    fences += (text.match(/\$\$/g) ?? []).length
  }
  return fences % 2 === 1
}

/** Whether typing the last character should (re)open the suggest widget. */
export function wantsSuggest(
  model: Pick<CompletionModel, "getLineContent" | "getLineCount">,
  lineNumber: number,
  before: string,
): boolean {
  // A new key in a multi-cite: `[@a; ` has no trigger character after the space.
  if (/\[@[^\]\n]*;\s$/.test(before)) return true

  // Frontmatter: first letter of a key, or the value after `key: `.
  if (lineNumber > 1 && model.getLineContent(1).trim() === "---") {
    if (/^[\w.-]+$/.test(before) || /^[\w.-]+:[ \t]+[^\s"'[\]{},]*$/.test(before)) {
      if (frontmatterEnd(model, lineNumber) !== undefined) return true
    }
  }

  // :::csv / :::data bodies: the file name, or a column inside the parentheses.
  if (/^\s*[^\s(@{]+$/.test(before) || /^\s*\S+\s*\([^)]*$/.test(before)) {
    const type = findEnclosingSpecialBlock((n) => model.getLineContent(n), lineNumber, 60)
    if (type === "csv" || type === "data") return true
  }

  // Math: shorthand names as you type, no backslash needed.
  if (/[A-Za-z]{2,}$/.test(before) && !/\\[A-Za-z]*$/.test(before)) {
    return isInMath(model, lineNumber, before)
  }
  return false
}

export function setupCompletionTriggers(
  editor: monacoApi.editor.IStandaloneCodeEditor,
): monacoApi.IDisposable {
  let timer: ReturnType<typeof setTimeout> | null = null
  const sub = editor.onDidChangeModelContent((e) => {
    if (e.isUndoing || e.isRedoing || e.isFlush || e.changes.length !== 1) return
    const change = e.changes[0]
    // One typed character (an auto-closed pair arrives as two).
    if (change.text.length === 0 || change.text.length > 2 || change.text.includes("\n")) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const model = editor.getModel()
      const position = editor.getPosition()
      if (!model || !position || !editor.hasTextFocus()) return
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      if (wantsSuggest(model, position.lineNumber, before)) {
        editor.trigger("comdtex", "editor.action.triggerSuggest", {})
      }
    }, 0)
  })
  return {
    dispose() {
      if (timer) clearTimeout(timer)
      sub.dispose()
    },
  }
}
