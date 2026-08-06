import { describe, expect, it } from "vitest"
import { buildTexLineMap, lineSignature, nearestTexLine } from "./texLineMap"
import { exportToTex } from "./exporter"

describe("lineSignature", () => {
  it("keeps prose and drops markup, labels and math", () => {
    expect(lineSignature("## La transformada de Fourier {#sec:fourier}")).toBe(
      "la transformada de fourier",
    )
    expect(lineSignature("$$ E = mc^2 $$")).toBeNull()
    expect(lineSignature(":::theorem[Bolzano]")).toBeNull()
    expect(lineSignature("```python")).toBeNull()
    expect(lineSignature("corta")).toBeNull()
  })

  it("truncates long lines at a word boundary", () => {
    const sig = lineSignature(
      "Una línea de prosa deliberadamente larga que debería recortarse en un límite de palabra para no depender del final",
    )
    expect(sig!.length).toBeLessThanOrEqual(60)
    expect(sig!.endsWith(" ")).toBe(false)
  })
})

describe("buildTexLineMap against a real export", () => {
  const source = [
    "---",
    "title: Nota",
    "---",
    "# Primera sección con nombre distintivo",
    "",
    "Este es el primer párrafo con suficiente prosa para anclar.",
    "",
    "$$ x^2 + y^2 = z^2 $$",
    "",
    "# Segunda sección igualmente distintiva",
    "",
    "El segundo párrafo también tiene prosa suficiente para anclar.",
  ].join("\n")
  const tex = exportToTex(source, "", "Nota")
  const map = buildTexLineMap(source, tex)
  const texLines = tex.split("\n")

  it("anchors each section heading to its source line", () => {
    const texIdx1 = texLines.findIndex((l) => l.includes("Primera secci")) + 1
    const texIdx2 = texLines.findIndex((l) => l.includes("Segunda secci")) + 1
    expect(texIdx1).toBeGreaterThan(0)
    expect(texIdx2).toBeGreaterThan(0)
    expect(map[texIdx1]).toBe(4)
    expect(map[texIdx2]).toBe(10)
  })

  it("anchors prose paragraphs to their exact source lines", () => {
    const texIdx = texLines.findIndex((l) => l.includes("primer p")) + 1
    expect(texIdx).toBeGreaterThan(0)
    expect(map[texIdx]).toBe(6)
  })

  it("maps unanchored tex lines to the previous anchor (paragraph accuracy)", () => {
    const texIdx1 = texLines.findIndex((l) => l.includes("Primera secci")) + 1
    const texIdx2 = texLines.findIndex((l) => l.includes("Segunda secci")) + 1
    for (let t = texIdx1; t < texIdx2; t++) {
      expect(map[t]).toBeGreaterThanOrEqual(4)
      expect(map[t]).toBeLessThan(10)
    }
  })

  it("maps preamble lines to the first anchor instead of zero", () => {
    expect(map[1]).toBe(4)
  })

  it("nearestTexLine inverts the map monotonically", () => {
    const texIdx2 = texLines.findIndex((l) => l.includes("Segunda secci")) + 1
    const t = nearestTexLine(map, 10)
    expect(t).toBe(texIdx2)
    // A source line past every anchor still lands on the last mapped line.
    expect(nearestTexLine(map, 9999)).not.toBeNull()
  })
})

describe("buildTexLineMap edge cases", () => {
  it("returns an all-zero map when nothing anchors", () => {
    const map = buildTexLineMap("$$x$$\n$$y$$", "\\documentclass{article}")
    expect(map.every((v) => v === 0)).toBe(true)
    expect(nearestTexLine(map, 1)).toBeNull()
  })

  it("never anchors transcluded text that is absent from the editor", () => {
    const source = "Párrafo presente en el editor con prosa suficiente."
    const tex = [
      "\\documentclass{article}",
      "\\begin{document}",
      "Texto transcluido desde otro archivo que el editor no muestra.",
      "Párrafo presente en el editor con prosa suficiente.",
      "\\end{document}",
    ].join("\n")
    const map = buildTexLineMap(source, tex)
    expect(map[4]).toBe(1)
    expect(map[3]).toBe(1) // inherits the first anchor, never a false match
  })
})
