import { describe, it, expect } from "vitest"
import { minimalEdit, diffLineSummary } from "./textDiff"

/** Apply an edit the way Monaco would, to check the round-trip. */
function apply(oldText: string, edit: ReturnType<typeof minimalEdit>): string {
  if (!edit) return oldText
  return oldText.slice(0, edit.start) + edit.text + oldText.slice(edit.end)
}

describe("minimalEdit", () => {
  it("returns null for identical text", () => {
    expect(minimalEdit("hola", "hola")).toBeNull()
  })

  it("narrows to just the changed span", () => {
    // The shared suffix is "o duerme": the trailing "o" of gato/perro counts,
    // so the edit is "gat" -> "perr", not "gato" -> "perro".
    const edit = minimalEdit("el gato duerme", "el perro duerme")
    expect(edit).toEqual({ start: 3, end: 6, text: "perr" })
    expect(apply("el gato duerme", edit)).toBe("el perro duerme")
  })

  it("handles a pure insertion", () => {
    expect(minimalEdit("ab", "axb")).toEqual({ start: 1, end: 1, text: "x" })
  })

  it("handles a pure deletion", () => {
    expect(minimalEdit("axb", "ab")).toEqual({ start: 1, end: 2, text: "" })
  })

  it("handles a full replacement", () => {
    expect(minimalEdit("abc", "xyz")).toEqual({ start: 0, end: 3, text: "xyz" })
  })

  it("handles empty sides", () => {
    expect(minimalEdit("", "nuevo")).toEqual({ start: 0, end: 0, text: "nuevo" })
    expect(minimalEdit("viejo", "")).toEqual({ start: 0, end: 5, text: "" })
  })

  it("never produces an inverted range on repetitive text", () => {
    // "aaa" -> "aaaa": prefix and suffix would both want the same characters.
    const edit = minimalEdit("aaa", "aaaa")!
    expect(edit.end).toBeGreaterThanOrEqual(edit.start)
    expect(apply("aaa", edit)).toBe("aaaa")
  })

  it("does not split a surrogate pair", () => {
    const edit = minimalEdit("x😀y", "x😀z")!
    expect(apply("x😀y", edit)).toBe("x😀z")
    // The emoji must survive intact, not be rebuilt from half a pair.
    expect(edit.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it("round-trips a realistic multi-line document change", () => {
    const before = "# Título\n\n- uno\n- dos\n\n## Sección\n\ntexto final\n"
    const after = "# Título\n\n- uno\n- DOS\n- tres\n\n## Sección\n\ntexto final\n"
    const edit = minimalEdit(before, after)!
    expect(apply(before, edit)).toBe(after)
    // The point of the exercise: the edit must be far smaller than the document.
    expect(edit.end - edit.start).toBeLessThan(before.length / 2)
  })
})

describe("diffLineSummary", () => {
  it("reports identical text", () => {
    expect(diffLineSummary("a\nb", "a\nb")).toEqual({ added: 0, removed: 0, identical: true })
  })

  it("counts added lines", () => {
    expect(diffLineSummary("a\nb", "a\nx\ny\nb")).toEqual({ added: 2, removed: 0, identical: false })
  })

  it("counts removed lines", () => {
    expect(diffLineSummary("a\nx\ny\nb", "a\nb")).toEqual({ added: 0, removed: 2, identical: false })
  })

  it("counts a modified line as one removed and one added", () => {
    expect(diffLineSummary("a\nviejo\nb", "a\nnuevo\nb")).toEqual({ added: 1, removed: 1, identical: false })
  })

  it("handles a completely different document", () => {
    const summary = diffLineSummary("a\nb\nc", "x\ny")
    expect(summary.removed).toBe(3)
    expect(summary.added).toBe(2)
  })

  it("never reports a negative count on repeated lines", () => {
    const summary = diffLineSummary("a\na\na", "a\na\na\na")
    expect(summary.added).toBeGreaterThanOrEqual(0)
    expect(summary.removed).toBeGreaterThanOrEqual(0)
  })
})
