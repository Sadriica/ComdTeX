import { describe, expect, it } from "vitest"
import {
  CSS_UNITS,
  findInRuns,
  foldForSearch,
  nextZoomStep,
  percentToScale,
  scaleToPercent,
} from "./pdfViewerMath"

describe("zoom steps", () => {
  it("treats 100% as printed size", () => {
    expect(percentToScale(100)).toBeCloseTo(CSS_UNITS)
    expect(scaleToPercent(1)).toBeCloseTo(75)
  })

  it("moves one step from a step and to the nearest step from between two", () => {
    expect(nextZoomStep(100, 1)).toBe(110)
    expect(nextZoomStep(100, -1)).toBe(90)
    // A fitted width of 137% goes to 150% or 125%, never two steps.
    expect(nextZoomStep(137, 1)).toBe(150)
    expect(nextZoomStep(137, -1)).toBe(125)
  })

  it("stops at the ends", () => {
    expect(nextZoomStep(400, 1)).toBe(400)
    expect(nextZoomStep(25, -1)).toBe(25)
  })
})

describe("search in text runs", () => {
  it("ignores case and accents but keeps ñ", () => {
    expect(foldForSearch("Función ÁRBOL")).toBe("funcion arbol")
    expect(foldForSearch("Año")).toBe("año")
    expect(findInRuns(["La función continua"], "funcion")).toEqual([
      { run: 0, start: 3, length: 7 },
    ])
    expect(findInRuns(["ano", "año"], "año")).toEqual([{ run: 1, start: 0, length: 3 }])
  })

  it("finds every occurrence in reading order, never across runs", () => {
    const runs = ["gap and gap", "spectral ga", "p again"]
    expect(findInRuns(runs, "gap")).toEqual([
      { run: 0, start: 0, length: 3 },
      { run: 0, start: 8, length: 3 },
    ])
    expect(findInRuns(runs, "   ")).toEqual([])
  })
})
