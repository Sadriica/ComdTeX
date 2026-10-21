// A minimal stand-in for Monaco, enough to drive the completion sources
// without a browser: a text model with a word pattern, the enum constants the
// sources read, and helpers that apply a suggestion the way the editor does.
// Test support only; nothing in the app imports this.

import type * as monacoApi from "monaco-editor"
import { provideCompletion } from "./index"
import type { CompletionModel } from "./types"

export const fakeMonaco = {
  languages: {
    CompletionItemKind: {
      Method: 0,
      Function: 1,
      Variable: 4,
      Field: 3,
      File: 16,
      Keyword: 17,
      Snippet: 27,
      Reference: 17,
      Value: 12,
      Property: 9,
      EnumMember: 19,
      Constant: 14,
    },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
  },
} as unknown as typeof monacoApi

const WORD = /[\p{L}\p{N}_]/u

export class FakeModel implements CompletionModel {
  private lines: string[]
  private version = 1
  constructor(text: string) {
    this.lines = text.split("\n")
  }
  setText(text: string) {
    this.lines = text.split("\n")
    this.version++
  }
  getLineContent(n: number) {
    return this.lines[n - 1] ?? ""
  }
  getLineCount() {
    return this.lines.length
  }
  getVersionId() {
    return this.version
  }
  getWordUntilPosition(position: { lineNumber: number; column: number }) {
    const line = this.getLineContent(position.lineNumber)
    let start = position.column - 1
    while (start > 0 && WORD.test(line[start - 1])) start--
    return {
      word: line.slice(start, position.column - 1),
      startColumn: start + 1,
      endColumn: position.column,
    }
  }
  text() {
    return this.lines.join("\n")
  }
}

/** `text` with a `|` marking the caret; returns the model and caret position. */
export function parseCaret(text: string): {
  model: FakeModel
  position: { lineNumber: number; column: number }
} {
  const lines = text.split("\n")
  const lineIndex = lines.findIndex((l) => l.includes("|"))
  if (lineIndex < 0) throw new Error("no caret marker in test text")
  const column = lines[lineIndex].indexOf("|") + 1
  lines[lineIndex] = lines[lineIndex].replace("|", "")
  return { model: new FakeModel(lines.join("\n")), position: { lineNumber: lineIndex + 1, column } }
}

export async function complete(text: string): Promise<{
  suggestions: monacoApi.languages.CompletionItem[]
  incomplete?: boolean
  model: FakeModel
  position: { lineNumber: number; column: number }
}> {
  const { model, position } = parseCaret(text)
  const list = await provideCompletion(fakeMonaco, model, position)
  return { ...list, model, position }
}

export function labelOf(item: monacoApi.languages.CompletionItem): string {
  return typeof item.label === "string" ? item.label : item.label.label
}

function expandSnippet(snippet: string): { text: string; caret: number } {
  let caret = -1
  let out = ""
  let i = 0
  while (i < snippet.length) {
    const rest = snippet.slice(i)
    const placeholder = /^\$\{(\d+)(?::([^}]*))?\}/.exec(rest)
    if (placeholder) {
      if (caret < 0 || placeholder[1] === "0") caret = caret < 0 ? out.length : caret
      out += placeholder[2] ?? ""
      i += placeholder[0].length
      continue
    }
    const bare = /^\$(\d+)/.exec(rest)
    if (bare) {
      if (caret < 0) caret = out.length
      i += bare[0].length
      continue
    }
    out += snippet[i]
    i++
  }
  return { text: out, caret }
}

/** The document after accepting `item`, with `|` where the caret lands. */
export function accept(textWithCaret: string, item: monacoApi.languages.CompletionItem): string {
  const { model, position } = parseCaret(textWithCaret)
  const range = item.range as monacoApi.IRange
  const line = model.getLineContent(position.lineNumber)
  const isSnippet =
    item.insertTextRules === fakeMonaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  const raw = item.insertText
  const { text, caret } = isSnippet ? expandSnippet(raw) : { text: raw, caret: raw.length }
  const before = line.slice(0, range.startColumn - 1)
  const after = line.slice(range.endColumn - 1)
  const edited = `${before}${text.slice(0, caret)}|${text.slice(caret)}${after}`
  const lines = model.text().split("\n")
  lines[position.lineNumber - 1] = edited
  return lines.join("\n")
}
