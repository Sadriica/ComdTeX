import { describe, expect, it, vi } from "vitest"
import { applySuggestion, resolveAtCursor, resolveEverything } from "./criticEditor"
import { en } from "./i18n/en"

vi.mock("./toastService", () => ({ showToast: vi.fn() }))
import { showToast } from "./toastService"

/** A text model and editor with just the surface criticEditor touches. */
function fake(initial: string, sel: [number, number]) {
  let text = initial
  let selection = sel
  const offsetToPos = (o: number) => {
    const before = text.slice(0, o).split("\n")
    return { lineNumber: before.length, column: before[before.length - 1].length + 1 }
  }
  const posToOffset = (p: { lineNumber: number; column: number }) => {
    const lines = text.split("\n")
    let o = 0
    for (let i = 0; i < p.lineNumber - 1; i++) o += lines[i].length + 1
    return o + p.column - 1
  }
  const model = {
    getValue: () => text,
    getOffsetAt: posToOffset,
    getPositionAt: offsetToPos,
  }
  const editor = {
    getModel: () => model,
    getSelection: () => ({
      getStartPosition: () => offsetToPos(selection[0]),
      getEndPosition: () => offsetToPos(selection[1]),
    }),
    getPosition: () => offsetToPos(selection[1]),
    pushUndoStop: vi.fn(),
    focus: vi.fn(),
    setSelection: (r: {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number
    }) => {
      selection = [
        posToOffset({ lineNumber: r.startLineNumber, column: r.startColumn }),
        posToOffset({ lineNumber: r.endLineNumber, column: r.endColumn }),
      ]
    },
    executeEdits: (
      _s: string,
      edits: Array<{
        range: {
          startLineNumber: number
          startColumn: number
          endLineNumber: number
          endColumn: number
        }
        text: string
      }>,
    ) => {
      const abs = edits
        .map((e) => ({
          a: posToOffset({ lineNumber: e.range.startLineNumber, column: e.range.startColumn }),
          b: posToOffset({ lineNumber: e.range.endLineNumber, column: e.range.endColumn }),
          t: e.text,
        }))
        .sort((x, y) => y.a - x.a)
      for (const e of abs) text = text.slice(0, e.a) + e.t + text.slice(e.b)
    },
  }
  return {
    editor: editor as never,
    get text() {
      return text
    },
    get sel() {
      return selection
    },
  }
}

describe("editor commands", () => {
  it("insert addition around the selection", () => {
    const f = fake("one two three", [4, 7])
    expect(applySuggestion(f.editor, "add", en)).toBe(true)
    expect(f.text).toBe("one {++two++} three")
    expect(f.text.slice(f.sel[0], f.sel[1])).toBe("two")
  })

  it("insert comment with no selection leaves the caret inside", () => {
    const f = fake("ab", [1, 1])
    applySuggestion(f.editor, "comment", en)
    expect(f.text).toBe("a{>><<}b")
    expect(f.sel).toEqual([4, 4])
  })

  it("refuses to cut through a mark and tells the user", () => {
    const f = fake("a {++b++} c", [0, 6])
    expect(applySuggestion(f.editor, "del", en)).toBe(false)
    expect(f.text).toBe("a {++b++} c")
    expect(showToast).toHaveBeenCalledWith(en.tracked.overlap, "info")
  })

  it("accept and reject at the cursor", () => {
    const a = fake("x {++y++} z", [5, 5])
    expect(resolveAtCursor(a.editor, "accept", en)).toBe(true)
    expect(a.text).toBe("x y z")
    const r = fake("x {++y++} z", [5, 5])
    resolveAtCursor(r.editor, "reject", en)
    expect(r.text).toBe("x  z")
    const none = fake("x y", [1, 1])
    expect(resolveAtCursor(none.editor, "accept", en)).toBe(false)
  })

  it("accept all and reject all", () => {
    const src = "{++a++} {--b--} {~~c~>d~~} {>>n<<} $x$"
    const a = fake(src, [0, 0])
    expect(resolveEverything(a.editor, "accept", en)).toBe(4)
    expect(a.text).toBe("a  d  $x$")
    const r = fake(src, [0, 0])
    resolveEverything(r.editor, "reject", en)
    expect(r.text).toBe(" b c  $x$")
  })
})
