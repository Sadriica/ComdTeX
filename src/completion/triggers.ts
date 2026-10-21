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

/**
 * True when the text before the caret leaves an inline `$` open. Follows
 * pandoc: an opening `$` is followed by a non-space, and a closing one is
 * preceded by a non-space and not followed by a digit, so "costs $5 and $6"
 * is two prices, not math. A `$` followed by a digit only opens when a closer
 * of that shape follows on the line.
 */
function inlineMathOpen(before: string): boolean {
  const text = before.replace(/\$\$/g, "  ").replace(/\\\$/g, "  ")
  let open = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "$") continue
    if (open) {
      open = false
      continue
    }
    const next = text[i + 1]
    if (next === undefined) return true
    if (/\s/.test(next)) continue
    if (/\d/.test(next) && !/^[^$]*?[^\s$]\$(?!\d)/.test(text.slice(i + 1))) continue
    open = true
  }
  return open
}

/** True when the cursor is inside `$...$` or a `$$` display block. */
export function isInMath(
  model: Pick<CompletionModel, "getLineContent">,
  lineNumber: number,
  before: string,
): boolean {
  const display = (before.match(/\$\$/g) ?? []).length
  if (display % 2 === 1) return true
  if (inlineMathOpen(before)) return true
  // A multi-line display block opened on an earlier line.
  let fences = 0
  for (let n = lineNumber - 1; n >= 1 && lineNumber - n <= 80; n--) {
    const text = model.getLineContent(n)
    if (!text.includes("$$")) continue
    fences += (text.match(/\$\$/g) ?? []).length
  }
  return fences % 2 === 1
}

/** Why typing the last character should (re)open the suggest widget, if it should. */
export type SuggestReason = "structure" | "math"

export function suggestReason(
  model: Pick<CompletionModel, "getLineContent" | "getLineCount">,
  lineNumber: number,
  before: string,
): SuggestReason | null {
  // A new key in a multi-cite: `[@a; ` has no trigger character after the space.
  if (/\[@[^\]\n]*;\s$/.test(before)) return "structure"

  // Frontmatter: first letter of a key, or the value after `key: `.
  if (lineNumber > 1 && model.getLineContent(1).trim() === "---") {
    if (/^[\w.-]+$/.test(before) || /^[\w.-]+:[ \t]+[^\s"'[\]{},]*$/.test(before)) {
      if (frontmatterEnd(model, lineNumber) !== undefined) return "structure"
    }
  }

  // :::csv / :::data bodies: the file name, or a column inside the parentheses.
  if (/^\s*[^\s(@{]+$/.test(before) || /^\s*\S+\s*\([^)]*$/.test(before)) {
    const type = findEnclosingSpecialBlock((n) => model.getLineContent(n), lineNumber, 60)
    if (type === "csv" || type === "data") return "structure"
  }

  // Math: shorthand names as you type, no backslash needed.
  if (/[A-Za-z]{2,}$/.test(before) && !/\\[A-Za-z]*$/.test(before)) {
    return isInMath(model, lineNumber, before) ? "math" : null
  }
  return null
}

/** Whether typing the last character should (re)open the suggest widget. */
export function wantsSuggest(
  model: Pick<CompletionModel, "getLineContent" | "getLineCount">,
  lineNumber: number,
  before: string,
): boolean {
  return suggestReason(model, lineNumber, before) !== null
}

export interface CompletionTriggers extends monacoApi.IDisposable {
  /**
   * True when Enter would accept a suggestion the user never chose: the widget
   * opened by itself on a word in math ("so $sum") and nobody moved the
   * selection. Enter then closes the widget and breaks the line instead.
   */
  refusesEnter(
    model: Pick<CompletionModel, "getLineContent">,
    position: { lineNumber: number; column: number },
  ): boolean
}

export function setupCompletionTriggers(
  editor: monacoApi.editor.IStandaloneCodeEditor,
): CompletionTriggers {
  let timer: ReturnType<typeof setTimeout> | null = null
  let autoMath = false
  let navigated = false
  // Arrow keys and Tab are the user choosing; Ctrl+Space is the user asking.
  const keys = editor.onKeyDown((e) => {
    if (e.ctrlKey && e.code === "Space") autoMath = false
    else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Tab"].includes(e.code))
      navigated = true
  })
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
      const reason = suggestReason(model, position.lineNumber, before)
      autoMath = reason === "math"
      navigated = false
      if (reason) {
        editor.trigger("comdtex", "editor.action.triggerSuggest", {})
      }
    }, 0)
  })
  return {
    refusesEnter(model, position) {
      if (!autoMath || navigated) return false
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      return isInMath(model, position.lineNumber, before)
    },
    dispose() {
      if (timer) clearTimeout(timer)
      sub.dispose()
      keys.dispose()
    },
  }
}
