// Guards on Monaco's auto-closing pairs for Markdown.
//
// Monaco decides to close a `$` or a backtick from the characters around the
// caret alone; it cannot see that the caret is inside a code fence or that
// the `$` is a price. The guard lets Monaco do its work and then takes the
// closer back when the context says it does not belong:
//
//   - typing ``` leaves exactly three backticks (the fourth is the closer of
//     an inline-code pair that was never meant);
//   - a `$` is only closed when it can open inline math: after whitespace, the
//     start of the line or an opening bracket, outside code and outside math;
//   - the first digit typed right after an auto-closed `$` drops the closer,
//     because "$5 each" is a price far more often than math (`$2x$` costs the
//     author one typed `$`);
//
// The decisions are pure and tested; `setupAutoCloseGuards` wires them.

import type * as monacoApi from "monaco-editor"
import { isInMath } from "./completion/triggers"
import { inFencedCode } from "./fences"

type GetLine = (lineNumber: number) => string

function inInlineCode(before: string): boolean {
  return (before.match(/`/g) ?? []).length % 2 === 1
}

/**
 * Whether the `$` typed at 0-based `index` of its line may keep the closing `$`
 * Monaco just inserted after it.
 */
export function keepsAutoClosedDollar(
  getLine: GetLine,
  lineNumber: number,
  index: number,
): boolean {
  const before = getLine(lineNumber).slice(0, index)
  const prev = before.length > 0 ? before[before.length - 1] : undefined
  if (prev !== undefined && !/[\s([{"'“‘,;:/>-]/u.test(prev)) return false
  if (inFencedCode(getLine, lineNumber) || inInlineCode(before)) return false
  return !isInMath({ getLineContent: getLine }, lineNumber, before)
}

/** Whether the backtick typed at 0-based `index` may keep its auto-closed twin. */
export function keepsAutoClosedBacktick(
  getLine: GetLine,
  lineNumber: number,
  index: number,
): boolean {
  const before = getLine(lineNumber).slice(0, index)
  // The third backtick of a fence (and the fourth of a longer one).
  if (before.endsWith("``")) return false
  return !inFencedCode(getLine, lineNumber)
}

export function setupAutoCloseGuards(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
): monacoApi.IDisposable {
  let last: { text: string; rangeLength: number } | null = null
  const content = editor.onDidChangeModelContent((e) => {
    last =
      e.changes.length === 1
        ? { text: e.changes[0].text, rangeLength: e.changes[0].rangeLength }
        : null
  })
  // Present at runtime; missing from the published typings of this Monaco version.
  const onDidType = (
    editor as unknown as {
      onDidType(listener: (text: string) => void): monacoApi.IDisposable
    }
  ).onDidType.bind(editor)
  const type = onDidType((typed) => {
    const model = editor.getModel()
    const selection = editor.getSelection()
    if (!model || !selection || !selection.isEmpty() || model.getLanguageId() !== "markdown") return
    const { lineNumber, column } = selection.getPosition()
    const line = model.getLineContent(lineNumber)
    const getLine: GetLine = (n) => model.getLineContent(n)
    const dropNext = () =>
      editor.executeEdits("autoClose", [
        { range: new monaco.Range(lineNumber, column, lineNumber, column + 1), text: "" },
      ])

    // Monaco inserted open + close in one edit and left the caret between.
    const closedPair = last?.rangeLength === 0 && last.text === typed + typed
    if ((typed === "$" || typed === "`") && closedPair && line[column - 1] === typed) {
      const index = column - 2
      const keep =
        typed === "$"
          ? keepsAutoClosedDollar(getLine, lineNumber, index)
          : keepsAutoClosedBacktick(getLine, lineNumber, index)
      if (!keep) dropNext()
      return
    }

    // `$` + digit straight after an auto-closed pair: a price, not math.
    if (/^\d$/.test(typed) && line[column - 3] === "$" && line[column - 1] === "$") {
      if (line[column - 4] !== "$" && line[column - 4] !== "\\") dropNext()
    }
  })
  return {
    dispose() {
      content.dispose()
      type.dispose()
    },
  }
}
