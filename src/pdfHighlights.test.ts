import { describe, expect, it } from "vitest"
import {
  highlightAt,
  parseHighlights,
  selectionRectsOnPage,
  serializeHighlights,
  vaultRelative,
  type PdfHighlight,
} from "./pdfHighlights"

const h = (over: Partial<PdfHighlight> = {}): PdfHighlight => ({
  id: "a",
  page: 1,
  rects: [[10, 20, 100, 12]],
  color: "yellow",
  text: "spectral gap",
  createdAt: "2026-11-12T00:00:00.000Z",
  ...over,
})

describe("highlights file", () => {
  it("round-trips and drops malformed entries instead of failing", () => {
    const text = serializeHighlights({ version: 1, files: { "papers/a.pdf": [h()] } })
    expect(parseHighlights(text).files["papers/a.pdf"]).toEqual([h()])
    const broken = JSON.stringify({
      files: {
        "a.pdf": [h(), { id: "x", page: 0, rects: [], color: "red", text: "" }, "junk"],
        "b.pdf": "nope",
      },
    })
    expect(parseHighlights(broken).files).toEqual({ "a.pdf": [h()] })
    expect(parseHighlights("{not json").files).toEqual({})
  })

  it("leaves PDFs without highlights out of the file", () => {
    const text = serializeHighlights({ version: 1, files: { "a.pdf": [], "b.pdf": [h()] } })
    expect(Object.keys(JSON.parse(text).files)).toEqual(["b.pdf"])
  })

  it("keys PDFs by their vault-relative path", () => {
    expect(vaultRelative("/v/papers/a.pdf", "/v")).toBe("papers/a.pdf")
    expect(vaultRelative("C:\\v\\a.pdf", "C:\\v\\")).toBe("a.pdf")
    expect(vaultRelative("/elsewhere/a.pdf", "/v")).toBeNull()
  })
})

describe("selection to page rectangles", () => {
  const sheet = { left: 100, top: 50, right: 700, bottom: 900 }
  const r = (left: number, top: number, right: number, bottom: number) => ({
    left,
    top,
    right,
    bottom,
  })

  it("converts to page points at the sheet's scale and merges the runs of a line", () => {
    const rects = selectionRectsOnPage(
      [r(120, 70, 220, 90), r(220, 71, 300, 90), r(120, 100, 180, 120)],
      sheet,
      2,
    )
    expect(rects).toEqual([
      [10, 10, 90, 10],
      [10, 25, 30, 10],
    ])
  })

  it("clips to the sheet and drops slivers", () => {
    expect(selectionRectsOnPage([r(50, 40, 150, 60), r(200, 300, 200.5, 320)], sheet, 1)).toEqual([
      [0, 0, 50, 10],
    ])
  })
})

describe("hit testing", () => {
  it("finds the latest highlight under a point on that page only", () => {
    const list = [
      h({ id: "old" }),
      h({ id: "new", rects: [[50, 15, 20, 20]] }),
      h({ id: "p2", page: 2 }),
    ]
    expect(highlightAt(list, 1, 60, 25)?.id).toBe("new")
    expect(highlightAt(list, 1, 15, 25)?.id).toBe("old")
    expect(highlightAt(list, 1, 500, 500)).toBeNull()
    expect(highlightAt(list, 3, 15, 25)).toBeNull()
  })
})

describe("justified lines", () => {
  it("bridges word gaps on one line but not the gap between columns", () => {
    const sheet = { left: 0, top: 0, right: 1000, bottom: 1000 }
    const r = (left: number, right: number) => ({ left, top: 100, right, bottom: 112 })
    // Words 4px apart merge; a column 200px away stays separate.
    expect(selectionRectsOnPage([r(10, 60), r(64, 120), r(320, 400)], sheet, 1)).toEqual([
      [10, 100, 110, 12],
      [320, 100, 80, 12],
    ])
  })
})
