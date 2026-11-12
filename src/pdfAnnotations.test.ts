import { describe, expect, it } from "vitest"
import {
  annotationsMarkdown,
  kindOf,
  notePathFor,
  quadBoxes,
  quoteMarkdown,
  rgbToHex,
  sortEntries,
  textInBoxes,
  tidy,
  type PdfAnnotationEntry,
  type TextItemLike,
} from "./pdfAnnotations"

// A line of 12 pt text at baseline y = 700, 6 pt per character.
const item = (str: string, x: number, y = 700): TextItemLike => ({
  str,
  transform: [12, 0, 0, 12, x, y],
  width: str.length * 6,
  height: 12,
})

const labels = {
  page: "p.",
  title: (n: string) => `Annotations: ${n}`,
  pageHeading: (p: number) => `Page ${p}`,
  kinds: { highlight: "Highlight", text: "Text box", ink: "Drawing", image: "Image", note: "Note" },
  empty: "No annotations.",
}

const entry = (over: Partial<PdfAnnotationEntry>): PdfAnnotationEntry => ({
  id: "a",
  page: 1,
  kind: "highlight",
  color: "#ffff98",
  text: "",
  comment: "",
  rect: [72, 690, 300, 712],
  live: false,
  ...over,
})

describe("kindOf", () => {
  it("names pdf.js annotation types", () => {
    expect(kindOf(9)).toBe("highlight")
    expect(kindOf(3)).toBe("text")
    expect(kindOf(15)).toBe("ink")
    expect(kindOf(13)).toBe("image")
    expect(kindOf(1)).toBe("note")
    expect(kindOf(2)).toBeNull()
  })

  it("reads a freehand highlight, saved as Ink, as a highlight", () => {
    expect(kindOf(15, "InkHighlight")).toBe("highlight")
  })
})

describe("rgbToHex", () => {
  it("turns pdf.js colours into CSS", () => {
    expect(rgbToHex([255, 255, 152])).toBe("#ffff98")
    expect(rgbToHex({ 0: 0, 1: 128, 2: 255, length: 3 })).toBe("#0080ff")
    expect(rgbToHex(null)).toBeNull()
  })
})

describe("textInBoxes", () => {
  const items = [item("Spectral gaps and mixing", 72), item("A second line here", 72, 680)]

  it("takes the words under a highlight's quads", () => {
    // "gaps" spans characters 9-12, x from 126 to 150.
    const boxes = quadBoxes([126, 712, 150, 712, 126, 697, 150, 697])
    expect(textInBoxes(items, boxes)).toBe("gaps")
  })

  it("leaves out lines the box does not cover", () => {
    expect(textInBoxes(items, [[72, 695, 400, 712]])).toBe("Spectral gaps and mixing")
  })

  it("joins several lines in order", () => {
    expect(
      textInBoxes(items, [
        [72, 695, 400, 712],
        [72, 676, 400, 692],
      ]),
    ).toBe("Spectral gaps and mixing A second line here")
  })
})

describe("tidy", () => {
  it("rejoins a word hyphenated across lines and collapses spaces", () => {
    expect(tidy("spec-  tral   gap\n here")).toBe("spectral gap here")
  })
})

describe("sortEntries", () => {
  it("orders by page, then top to bottom", () => {
    const sorted = sortEntries([
      entry({ id: "low", rect: [72, 100, 90, 120] }),
      entry({ id: "p2", page: 2 }),
      entry({ id: "high", rect: [72, 700, 90, 720] }),
    ])
    expect(sorted.map((e) => e.id)).toEqual(["high", "low", "p2"])
  })
})

describe("quoteMarkdown", () => {
  it("quotes the text and links back to the PDF page", () => {
    expect(quoteMarkdown("A large  gap", "paper.pdf", 3, labels)).toBe(
      "> A large gap\n>\n> ([[paper.pdf]], p. 3)\n",
    )
  })
})

describe("annotationsMarkdown", () => {
  it("writes highlights as quotes with their comments, grouped by page", () => {
    const md = annotationsMarkdown(
      "paper.pdf",
      [
        entry({ id: "1", page: 2, text: "Cheeger inequality", comment: "Check the converse" }),
        entry({ id: "2", page: 1, kind: "text", text: "TODO", color: null }),
        entry({ id: "3", page: 2, kind: "ink", rect: [0, 10, 5, 20] }),
        entry({ id: "4", page: 2, kind: "ink", comment: "Figure 2 is wrong", rect: [0, 5, 5, 8] }),
      ],
      labels,
    )
    expect(md).toBe(
      [
        "# Annotations: paper.pdf",
        "",
        "[[paper.pdf]]",
        "",
        "## Page 1",
        "",
        "- TODO (p. 1)",
        "",
        "## Page 2",
        "",
        "> Cheeger inequality",
        ">",
        "> ([[paper.pdf]], p. 2)",
        "",
        "Check the converse",
        "",
        "- Drawing (p. 2)",
        "  Figure 2 is wrong",
        "",
      ].join("\n"),
    )
  })

  it("says so when there is nothing", () => {
    expect(annotationsMarkdown("a.pdf", [], labels)).toContain("No annotations.")
  })
})

describe("notePathFor", () => {
  it("puts the note beside the PDF", () => {
    expect(notePathFor("/v/papers/Paper.PDF")).toBe("/v/papers/Paper-annotations.md")
  })
})
