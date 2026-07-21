import type * as monaco from "monaco-editor"

function splitTrailingNewline(text: string): { body: string; trailing: string } {
  const match = /(\r?\n)$/.exec(text)
  return match ? { body: text.slice(0, -match[1].length), trailing: match[1] } : { body: text, trailing: "" }
}

function listReplacement(snippet: string, selected: string): string | null {
  const kind =
    /^- \[ \] \$\{1(?::[^}]*)?\}/.test(snippet) ? "task"
      : /^- \$\{1(?::[^}]*)?\}/.test(snippet) ? "bullet"
        : /^1\. \$\{1(?::[^}]*)?\}/.test(snippet) ? "ordered"
          : null
  if (!kind) return null

  const { body, trailing } = splitTrailingNewline(selected)
  const lines = body.split(/\r?\n/)
  let n = 1
  const transformed = lines.map((line) => {
    if (line.trim() === "") return line
    const indent = line.match(/^\s*/)?.[0] ?? ""
    const content = line.slice(indent.length)
    if (kind === "task") return `${indent}- [ ] ${content}`
    if (kind === "bullet") return `${indent}- ${content}`
    return `${indent}${n++}. ${content}`
  }).join("\n")
  return transformed + trailing
}

function isInlineMathWrapper(prefix: string, suffix: string): boolean {
  return (prefix === "$" || prefix === "\\$") && (suffix === "$" || suffix === "\\$")
}

function normalizeSnippetLiteral(text: string): string {
  return text.replace(/\\\$/g, "$")
}

function unwrapInlineMathSpans(text: string): string {
  return text.replace(/\$([^$\n]+?)\$/g, (match, inner: string, offset: number) => {
    const next = text[offset + match.length] ?? ""
    const needsCommandSpace = /\\[A-Za-z]+$/.test(inner) && /[A-Za-z]/.test(next)
    return inner + (needsCommandSpace ? " " : "")
  })
}

export function selectionAwareReplacement(snippet: string, selected: string): string | null {
  const list = listReplacement(snippet, selected)
  if (list !== null) return list

  const phMatch = snippet.match(/\$\{1(?::[^}]*)?\}/)
  const hasOtherPlaceholders = /\$\{(?!1(?:[:}]))[0-9]+/.test(snippet) || /\$0/.test(snippet)
  if (!phMatch || hasOtherPlaceholders) return null

  const phIndex = phMatch.index ?? 0
  const prefix = snippet.slice(0, phIndex)
  const suffix = snippet.slice(phIndex + phMatch[0].length)
  const normalizedPrefix = normalizeSnippetLiteral(prefix)
  const normalizedSuffix = normalizeSnippetLiteral(suffix)
  const normalizedSelected = isInlineMathWrapper(prefix, suffix)
    ? unwrapInlineMathSpans(selected)
    : selected
  return normalizedPrefix + normalizedSelected + normalizedSuffix
}

// Shared selection-aware snippet insertion.
//
// Behaviour (extracted verbatim from Toolbar's former `insert()`):
//   - Wrap-selection: if the snippet has a single `${1}` / `${1:...}` placeholder and the
//     editor has a non-empty selection, wrap the selected text with the
//     snippet's prefix/suffix (text before/after the placeholder) instead of
//     replacing the selection with a placeholder. Multi-placeholder snippets
//     (link, code blocks, etc.) and placeholderless inserts fall through
//     to the normal snippet-insertion path.
//   - List snippets applied to a multi-line selection transform the selected
//     lines into list items instead of replacing them with placeholder rows.
//   - Block-level snippets (fenced code, display math, rules, tables) are forced
//     to start at column 1 by prepending a newline when mid-line.
//   - Otherwise delegate to Monaco's snippetController2 (tab-stop aware), with a
//     plain executeEdits fallback when the controller is unavailable.
export function insertSnippet(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  snippetIn: string,
): void {
  if (!editor) return
  editor.focus()
  let snippet = snippetIn

  const sel = editor.getSelection()
  const model = editor.getModel()
  if (sel && model && !sel.isEmpty()) {
    const selected = model.getValueInRange(sel)
    const text = selectionAwareReplacement(snippet, selected)
    if (text !== null) {
      const startOffset = model.getOffsetAt({
        lineNumber: sel.startLineNumber,
        column: sel.startColumn,
      })
      editor.executeEdits("toolbar-wrap", [{ range: sel, text, forceMoveMarkers: true }])
      const newPos = model.getPositionAt(startOffset + text.length)
      if (newPos) editor.setPosition(newPos)
      editor.focus()
      return
    }
  }

  // Block-level snippets must start at column 1 to be valid Markdown.
  const isBlockSnippet = /^(```|~~~|\$\$|---|\||:::)/.test(snippet)
  if (isBlockSnippet) {
    const pos = editor.getPosition()
    if (pos && pos.column > 1) snippet = "\n" + snippet
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctrl = editor.getContribution<any>("snippetController2")
  if (ctrl) {
    ctrl.insert(snippet)
  } else {
    const sel = editor.getSelection()
    if (sel) editor.executeEdits("toolbar", [{ range: sel, text: snippet }])
  }
}
