import type * as monaco from "monaco-editor"

// Shared selection-aware snippet insertion.
//
// Behaviour (extracted verbatim from Toolbar's former `insert()`):
//   - Wrap-selection: if the snippet has a single `${1:...}` placeholder and the
//     editor has a non-empty selection, wrap the selected text with the
//     snippet's prefix/suffix (text before/after the placeholder) instead of
//     replacing the selection with a placeholder. Multi-placeholder snippets
//     (link, lists, code blocks, etc.) and placeholderless inserts fall through
//     to the normal snippet-insertion path.
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

  const phMatch = snippet.match(/\$\{1:[^}]*\}/)
  const hasOtherPlaceholders = /\$\{(?!1:)[0-9]+/.test(snippet) || /\$0/.test(snippet)
  if (phMatch && !hasOtherPlaceholders) {
    const sel = editor.getSelection()
    const model = editor.getModel()
    if (sel && model && !sel.isEmpty()) {
      const selected = model.getValueInRange(sel)
      const phIndex = phMatch.index ?? 0
      const prefix = snippet.slice(0, phIndex)
      const suffix = snippet.slice(phIndex + phMatch[0].length)
      const text = prefix + selected + suffix
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
  const isBlockSnippet = /^(```|~~~|\$\$|---|\|)/.test(snippet)
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
