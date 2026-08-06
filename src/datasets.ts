// Data you import once and use everywhere.
//
// A `:::data` block declares a named selection over a vault CSV:
//
//   :::data{#data:growth}
//   growth.csv (A:D) (1:20)
//   :::
//
// It prints NOTHING. Like a macro definition, it exists so other blocks can
// point at it: a table (`:::csv` with `@data:growth`) or a plot. That is the
// difference from a figure or an equation, which are numbered and cited in
// prose; nobody writes "see Data 3". The label rides the same `{#kind:name}`
// grammar as the rest of the editor, so the Labels panel reports duplicate
// declarations, broken references and unused datasets for free.
//
// Loading is cached by pointer comparison against the resolver's return
// value: `renderMarkdown` runs on the typing debounce, so re-parsing a CSV
// on every keystroke is not acceptable. Same technique as the cross-file
// environment cache in environments.ts.

import {
  parseCsv,
  parseCsvBlock,
  selectCsv,
  type CsvBlockSpec,
  type CsvResolver,
} from "./csvRange"

/** A declared dataset: its label plus the selection it names. */
export interface DatasetDecl {
  label: string
  spec: CsvBlockSpec
}

/** A loaded dataset: the rows the selection resolves to. */
export interface LoadedDataset {
  header: string[]
  rows: string[][]
}

export type DatasetMap = Map<string, DatasetDecl>

// `:::data{#data:name}` or `:::data[Caption]{#data:name}`; the label may also
// be written on its own line inside the block for readability.
const DATA_BLOCK_RE =
  /^:::data(?:\[([^\]]*)\])?(?:\{#(data:[\w:.-]+)\})?[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gm

const INLINE_LABEL_RE = /^\{#(data:[\w:.-]+)\}\s*$/

/**
 * Find every `:::data` declaration and REMOVE it from the text: the block
 * declares, it does not print. Returns the declarations plus the cleaned
 * content.
 */
export function parseDataBlocks(text: string): { datasets: DatasetMap; content: string } {
  const datasets: DatasetMap = new Map()
  if (!text.includes(":::data")) return { datasets, content: text }

  const content = text.replace(
    DATA_BLOCK_RE,
    (_full, caption: string | undefined, label: string | undefined, body: string) => {
      const lines = body.split(/\r?\n/)
      let resolvedLabel = label ?? ""
      const specLines: string[] = []
      for (const line of lines) {
        const inline = INLINE_LABEL_RE.exec(line.trim())
        if (inline && !resolvedLabel) {
          resolvedLabel = inline[1]
          continue
        }
        specLines.push(line)
      }
      const spec = parseCsvBlock(specLines.join("\n"), caption ?? "")
      if (spec && resolvedLabel && !datasets.has(resolvedLabel)) {
        datasets.set(resolvedLabel, { label: resolvedLabel, spec })
      }
      // Declarations render as nothing at all.
      return ""
    },
  )
  return { datasets, content }
}

// ── Loading, cached by pointer ────────────────────────────────────────────────

interface CacheEntry {
  /** The exact string the resolver returned when this was parsed. */
  source: string
  table: string[][]
}

const csvCache = new Map<string, CacheEntry>()
let parseCount = 0

/** Test seam: how many times a CSV was actually parsed. */
export function datasetCacheStats(): { parses: number } {
  return { parses: parseCount }
}

export function clearDatasetCache(): void {
  csvCache.clear()
  parseCount = 0
}

function tableFor(file: string, resolver: CsvResolver): string[][] | null {
  const source = resolver(file)
  if (source == null) return null
  const hit = csvCache.get(file)
  // Pointer compare: an untouched vault file returns the same string
  // reference every render, so this costs nothing while typing.
  if (hit && hit.source === source) return hit.table
  const table = parseCsv(source)
  parseCount++
  csvCache.set(file, { source, table })
  return table
}

/**
 * Resolve a declared dataset to its rows. Returns null when the file is
 * missing or unreadable, so callers can say so instead of rendering silence.
 */
export function loadDataset(decl: DatasetDecl, resolver: CsvResolver): LoadedDataset | null {
  try {
    const table = tableFor(decl.spec.file, resolver)
    if (!table) return null
    return selectCsv(table, decl.spec)
  } catch {
    return null
  }
}

// ── References from other blocks ──────────────────────────────────────────────

/** True when a block's source field points at a declared dataset. */
export function isDatasetRef(source: string): boolean {
  return /^@data:[\w:.-]+$/.test(source.trim())
}

/** `@data:growth` to `data:growth`, the key datasets are stored under. */
export function datasetRefLabel(source: string): string {
  return source.trim().slice(1)
}

/**
 * Resolve a block whose source is either a file or a `@data:` reference,
 * applying the block's own selection ON TOP of the dataset's. A dataset
 * selects the region of interest once; a block narrows it further.
 */
export function resolveBlockSource(
  spec: CsvBlockSpec,
  datasets: DatasetMap,
  resolver: CsvResolver,
): { data: LoadedDataset | null; error: string | null } {
  if (!isDatasetRef(spec.file)) {
    const table = tableFor(spec.file, resolver)
    if (!table) return { data: null, error: `${spec.file}: not found in this vault` }
    return { data: selectCsv(table, spec), error: null }
  }

  const label = datasetRefLabel(spec.file)
  const decl = datasets.get(label)
  if (!decl) return { data: null, error: `@${label}: no dataset with that name is declared` }
  const base = loadDataset(decl, resolver)
  if (!base) return { data: null, error: `${decl.spec.file}: not found in this vault` }

  // Sub-select within the dataset's own result: the block's letters and row
  // numbers count over what the dataset already selected, which is what an
  // author means by "columns A and C of my growth data".
  const asTable = [base.header, ...base.rows]
  const narrowed = selectCsv(asTable, { cols: spec.cols, rows: spec.rows })
  return { data: narrowed, error: null }
}
