import { describe, expect, it, vi } from "vitest"
import type { editor as MonacoEditor } from "monaco-editor"
import { applyGuardedLineEdit } from "./commands"

function fakeEditor(lines: string[], uri = "file:///a.md") {
  const executeEdits = vi.fn()
  const focus = vi.fn()
  const editor = {
    getModel: () => ({
      uri: { toString: () => uri },
      getLineCount: () => lines.length,
      getLineContent: (n: number) => lines[n - 1],
    }),
    executeEdits,
    focus,
  } as unknown as MonacoEditor.IStandaloneCodeEditor
  return { editor, executeEdits, focus }
}

const edit = { startColumn: 5, endColumn: 8, text: "lemma" }

describe("applyGuardedLineEdit", () => {
  it("edits when the line and the model are the ones the palette saw", () => {
    const { editor, executeEdits, focus } = fakeEditor(["x", ":::theorem"])
    expect(applyGuardedLineEdit(editor, "file:///a.md", 2, ":::theorem", edit)).toBe(true)
    expect(executeEdits).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalled()
  })

  it("does nothing when the line changed while the palette was open", () => {
    const { editor, executeEdits } = fakeEditor(["x", "a different line"])
    expect(applyGuardedLineEdit(editor, "file:///a.md", 2, ":::theorem", edit)).toBe(false)
    expect(executeEdits).not.toHaveBeenCalled()
  })

  it("does nothing when lines were deleted under the cursor", () => {
    const { editor, executeEdits } = fakeEditor(["x"])
    expect(applyGuardedLineEdit(editor, "file:///a.md", 2, ":::theorem", edit)).toBe(false)
    expect(executeEdits).not.toHaveBeenCalled()
  })

  it("does nothing when another file is now in the editor, even with identical text", () => {
    const { editor, executeEdits } = fakeEditor(["x", ":::theorem"], "file:///b.md")
    expect(applyGuardedLineEdit(editor, "file:///a.md", 2, ":::theorem", edit)).toBe(false)
    expect(executeEdits).not.toHaveBeenCalled()
  })
})
