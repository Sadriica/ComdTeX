import { describe, it, expect } from "vitest"
import { parseSyncTex, inverseSync, forwardSync } from "./synctex"

// A tiny but structurally-real uncompressed SyncTeX snippet. Coordinates are in
// TeX scaled points (sp); 65536 sp = 1 pt. Two input files, one page, with a
// few box/glyph records on distinct source lines.
const SAMPLE = [
  "SyncTeX Version:1",
  "Input:1:/vault/main.tex",
  "Input:2:/vault/chapter.tex",
  "Magnification:1000",
  "Unit:1",
  "X Offset:0",
  "Y Offset:0",
  "Content:",
  "{1",
  // vertical box from main.tex line 10 at (100pt, 50pt), 400x12pt
  "(1,10:6553600,3276800:26214400,786432,0",
  // glyph run, main.tex line 10
  "x1,10:6553600,3276800",
  ")",
  // horizontal box from chapter.tex line 42 at (100pt, 700pt)
  "[2,42:6553600,45875200:26214400,786432,0",
  "x2,42:6553600,45875200",
  "]",
  "}1",
  "",
].join("\n")

describe("parseSyncTex", () => {
  it("parses the preamble and input-file table", () => {
    const d = parseSyncTex(SAMPLE)
    expect(d.unit).toBe(1)
    expect(d.magnification).toBe(1000)
    expect(d.files.get(1)).toBe("/vault/main.tex")
    expect(d.files.get(2)).toBe("/vault/chapter.tex")
    expect(d.tags.get("/vault/main.tex")).toBe(1)
  })

  it("extracts geometry records with (tag,line,page) and pt coordinates", () => {
    const d = parseSyncTex(SAMPLE)
    expect(d.boxes.length).toBeGreaterThan(0)
    const mainBox = d.boxes.find((b) => b.tag === 1 && b.line === 10)
    expect(mainBox).toBeTruthy()
    expect(mainBox!.page).toBe(1)
    // 6553600 sp / 65536 = 100 pt
    expect(mainBox!.x).toBeCloseTo(100, 3)
    expect(mainBox!.y).toBeCloseTo(50, 3)
  })

  it("never throws on malformed input and returns empty boxes", () => {
    const d = parseSyncTex("garbage line\n((( not a record\nInput:notanumber:foo")
    expect(d.boxes).toEqual([])
  })
})

describe("inverseSync (PDF click -> source line)", () => {
  it("maps a click near the main.tex box back to line 10", () => {
    const d = parseSyncTex(SAMPLE)
    const r = inverseSync(d, 1, 101, 51)
    expect(r).toBeTruthy()
    expect(r!.file).toBe("/vault/main.tex")
    expect(r!.line).toBe(10)
  })

  it("maps a click near the chapter.tex box back to line 42", () => {
    const d = parseSyncTex(SAMPLE)
    const r = inverseSync(d, 1, 100, 700)
    expect(r).toBeTruthy()
    expect(r!.file).toBe("/vault/chapter.tex")
    expect(r!.line).toBe(42)
  })

  it("returns null when no records exist on the page", () => {
    const d = parseSyncTex(SAMPLE)
    expect(inverseSync(d, 99, 0, 0)).toBeNull()
  })
})

describe("forwardSync (source line -> PDF region)", () => {
  it("resolves an exact line by file path", () => {
    const d = parseSyncTex(SAMPLE)
    const b = forwardSync(d, "/vault/chapter.tex", 42)
    expect(b).toBeTruthy()
    expect(b!.page).toBe(1)
    expect(b!.x).toBeCloseTo(100, 3)
    expect(b!.y).toBeCloseTo(700, 3)
  })

  it("resolves by tag number", () => {
    const d = parseSyncTex(SAMPLE)
    const b = forwardSync(d, 1, 10)
    expect(b).toBeTruthy()
    expect(b!.line).toBe(10)
  })

  it("falls back to basename when the exact path key misses", () => {
    const d = parseSyncTex(SAMPLE)
    const b = forwardSync(d, "main.tex", 10)
    expect(b).toBeTruthy()
    expect(b!.tag).toBe(1)
  })

  it("returns the nearest recorded line when the exact line is absent", () => {
    const d = parseSyncTex(SAMPLE)
    const b = forwardSync(d, "/vault/main.tex", 11)
    expect(b).toBeTruthy()
    // nearest recorded line for tag 1 is 10
    expect(b!.line).toBe(10)
  })
})
