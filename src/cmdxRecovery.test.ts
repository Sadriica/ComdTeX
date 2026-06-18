// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { toEditorContent } from "./cmdxFormat"

// Regression: an older buggy build flattened special blocks to a DOUBLE-prefixed
// callout — `:::flowchart[X]` → `:::note[Flowchart: X]` → `> [!note] Note: Flowchart: X`.
// The recovery used to require the title to start directly with the special name
// ("Flowchart:"), so the extra "Note: " kept these stuck as plain notes on open.
describe("cmdxFormat — recover double-prefixed special blocks", () => {
  const block = (label: string) => [
    `> [!note] Note: ${label}: Búsqueda binaria`,
    "> ALGORITHM BinarySearch(A, target)",
    ">     lo ← 0",
    ">     RETURN -1",
    "> END",
  ].join("\n")

  it("recovers flowchart and pseudocode from the Note:-prefixed form", () => {
    const editor = toEditorContent("/v/note.md", `${block("Flowchart")}\n\n${block("Pseudocode")}\n`)
    expect(editor).toContain(":::flowchart[Búsqueda binaria]")
    expect(editor).toContain(":::pseudocode[Búsqueda binaria]")
    expect(editor).not.toContain("[!note] Note: Flowchart")
    // The body is de-quoted back to the block's source.
    expect(editor).toContain("ALGORITHM BinarySearch(A, target)")
  })

  it("still recovers the single-prefix form (no regression)", () => {
    const single = [
      "> [!note] Flowchart: Búsqueda binaria",
      "> ALGORITHM X",
      "> END",
    ].join("\n")
    const editor = toEditorContent("/v/note.md", single)
    expect(editor).toContain(":::flowchart[Búsqueda binaria]")
  })

  it("recovers an ambiguous :::code (plain-text body) under the double-prefix signature", () => {
    const editor = toEditorContent("/v/note.md", "> [!note] Note: Code\n> texto plano sin resaltado\n")
    expect(editor).toContain(":::code")
    expect(editor).toContain("texto plano sin resaltado")
    expect(editor).not.toContain("[!note] Note: Code")
  })

  it("does NOT recover an ambiguous type from the SINGLE-prefix form with non-code body", () => {
    // No "Note: " signature + body doesn't look like code → stays a genuine note.
    const editor = toEditorContent("/v/note.md", "> [!note] Code\n> just a prose reminder\n")
    expect(editor).not.toContain(":::code")
    expect(editor).toContain(":::note")
  })

  it("leaves a genuine note untouched", () => {
    const genuine = "> [!note] Note: a reminder about the proof\n> remember to cite Smith\n"
    const editor = toEditorContent("/v/note.md", genuine)
    expect(editor).toContain(":::note")
    expect(editor).not.toContain(":::flowchart")
    expect(editor).not.toContain(":::pseudocode")
  })
})
