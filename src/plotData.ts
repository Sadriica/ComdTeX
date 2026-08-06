// Plotting your measurements, not just your formulas.
//
// A `:::plot` block can name a dataset instead of a function:
//
//   :::plot[Growth by strain]
//   @data:growth
//   x: time
//   y: (S1, S2, S3)
//   kind: line
//   error: sd
//   :::
//
// This module resolves that reference against the declared datasets and
// rewrites the block into literal `series` lines, which functionPlot.ts
// already knows how to draw. Doing the resolution here, in the shared
// document pass, means the plot reaches the preview, the PDF and every
// export without functionPlot.ts ever needing a vault resolver, and it
// keeps that renderer pure and testable.

import { resolveColumns } from "./csvRange"
import { resolveBlockSource, type DatasetMap } from "./datasets"
import type { CsvResolver } from "./csvRange"

const PLOT_BLOCK_RE = /^:::plot(?:\[([^\]]*)\])?[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gm

interface PlotDataSpec {
  source: string
  xSel: string | null
  ySel: string[] | null
  errSel: string | null
  kind: string | null
  /** Lines that are not data directives and must survive untouched. */
  rest: string[]
}

/** Split a `(a, b, c)` or bare selector into atoms. */
function atoms(raw: string): string[] {
  return raw
    .trim()
    .replace(/^\((.*)\)$/s, "$1")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Read the data directives out of a plot body. Returns null when the block
 * names no dataset, so a classic function plot passes through untouched.
 */
export function parsePlotData(body: string): PlotDataSpec | null {
  let source = ""
  let xSel: string | null = null
  let ySel: string[] | null = null
  let errSel: string | null = null
  let kind: string | null = null
  const rest: string[] = []

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const ref = /^(?:data\s*:\s*)?(@data:[\w:.-]+)\s*$/.exec(line)
    if (ref) { source = ref[1]; continue }

    const dataFile = /^data\s*:\s*(\S+\.csv)\s*$/i.exec(line)
    if (dataFile) { source = dataFile[1]; continue }

    // `x:` only counts as a column selector when a dataset is in play;
    // otherwise it is the existing range syntax (`x: [-2, 5]`).
    const x = /^x\s*:\s*(.+)$/i.exec(line)
    if (x && !x[1].trim().startsWith("[")) { xSel = x[1].trim(); continue }

    const y = /^y\s*:\s*(.+)$/i.exec(line)
    if (y) { ySel = atoms(y[1]); continue }

    const err = /^(?:error|err)\s*:\s*(.+)$/i.exec(line)
    if (err) { errSel = err[1].trim(); continue }

    const k = /^kind\s*:\s*(.+)$/i.exec(line)
    if (k) { kind = k[1].trim(); continue }

    rest.push(rawLine)
  }

  if (!source) return null
  return { source, xSel, ySel, errSel, kind, rest }
}

/** A number, or null when the cell is not numeric. */
function num(v: string | undefined): number | null {
  if (v === undefined) return null
  const n = parseFloat(v.replace(",", "."))
  return isFinite(n) ? n : null
}

/**
 * Turn a plot block that references data into one with literal series.
 * Any failure becomes a visible note in the block, never silence.
 */
export function expandPlotData(
  content: string,
  datasets: DatasetMap,
  resolver?: CsvResolver,
): string {
  if (!resolver || !content.includes(":::plot")) return content

  return content.replace(PLOT_BLOCK_RE, (full, caption: string | undefined, body: string) => {
    const spec = parsePlotData(body)
    if (!spec) return full

    const { data, error } = resolveBlockSource(
      { file: spec.source, cols: null, rows: null, caption: "" },
      datasets,
      resolver,
    )
    if (error || !data) {
      return `**${caption || "Plot"}**\n\n*(${error ?? "data could not be read"})*`
    }

    const { header, rows } = data
    // x defaults to the first column, y to every remaining one: the shape
    // of a measurement table, so the common case needs no directives.
    const xIdx = spec.xSel ? resolveColumns([spec.xSel], header)[0] : 0
    const errIdx = spec.errSel ? resolveColumns([spec.errSel], header)[0] : undefined
    const yIdx = spec.ySel
      ? resolveColumns(spec.ySel, header)
      : header.map((_, i) => i).filter((i) => i !== xIdx && i !== errIdx)

    if (xIdx === undefined || xIdx < 0 || yIdx.length === 0) {
      return `**${caption || "Plot"}**\n\n*(the x or y columns do not exist in this data)*`
    }

    const lines: string[] = [...spec.rest]
    if (spec.kind) lines.push(`kind: ${spec.kind}`)
    lines.push(`xlabel: ${header[xIdx] ?? ""}`)
    if (yIdx.length === 1) lines.push(`ylabel: ${header[yIdx[0]] ?? ""}`)

    // A non-numeric x column (sample names, conditions) becomes evenly
    // spaced positions with their labels: what bars need.
    const xValues = rows.map((r) => num(r[xIdx]))
    const categorical = xValues.some((v) => v === null)
    if (categorical) {
      lines.push(`categories: ${rows.map((r) => r[xIdx] ?? "").join(" | ")}`)
    }

    for (const ci of yIdx) {
      const points: string[] = []
      rows.forEach((row, ri) => {
        const y = num(row[ci])
        if (y === null) return
        const x = categorical ? ri + 1 : xValues[ri]
        if (x === null) return
        const e = errIdx !== undefined && errIdx >= 0 ? num(row[errIdx]) : null
        points.push(e !== null ? `${x},${y},${e}` : `${x},${y}`)
      })
      if (points.length > 0) lines.push(`series ${header[ci] ?? `col${ci}`}: ${points.join(" ")}`)
    }

    const head = caption ? `:::plot[${caption}]` : ":::plot"
    return `${head}\n${lines.join("\n")}\n:::`
  })
}
