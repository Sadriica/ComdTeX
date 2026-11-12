import { describe, expect, it } from "vitest"
import {
  highlightAt,
  parseHighlights,
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
