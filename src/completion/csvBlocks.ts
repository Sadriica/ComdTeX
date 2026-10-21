// `:::csv` and `:::data` bodies: vault CSV file names, then the column headers
// of the file named on the line (so `data.csv (` offers the real header names).

import type * as monacoApi from "monaco-editor"
import { indexToLetters, parseCsv } from "../csvRange"
import { findEnclosingSpecialBlock } from "./catalog"
import {
  completionText,
  getCurrentFile,
  getVaultCsvs,
  relPathOf,
  resolveCsv,
  type VaultCsv,
} from "./state"
import type { CompletionEnv, CompletionSource } from "./types"
import { makeRange } from "./util"

const headerCache = new Map<string, { source: string; headers: string[] }>()
const HEADER_CACHE_MAX = 50
const HEADER_SLICE = 16384

/** Header row of a vault CSV, cached by pointer so an untouched file costs nothing. */
export function csvHeaders(target: string): string[] {
  const source = resolveCsv(target)
  if (source == null) return []
  const hit = headerCache.get(target)
  if (hit && hit.source === source) return hit.headers
  // Only the first row is needed; do not parse a 50 MB export for it.
  const headers = (parseCsv(source.slice(0, HEADER_SLICE))[0] ?? []).map((h) => h.trim())
  if (headerCache.size >= HEADER_CACHE_MAX) headerCache.clear()
  headerCache.set(target, { source, headers })
  return headers
}

export function clearCsvHeaderCache(): void {
  headerCache.clear()
}

function pathItems(
  env: CompletionEnv,
  range: monacoApi.IRange,
  partial: string,
): monacoApi.languages.CompletionItem[] {
  const current = getCurrentFile()
  const currentDir = current ? relPathOf(current).split("/").slice(0, -1).join("/") : null
  const partialLc = partial.toLowerCase()
  const rows: { csv: VaultCsv; sort: string }[] = []
  for (const csv of getVaultCsvs()) {
    if (partialLc && !csv.target.toLowerCase().includes(partialLc)) continue
    rows.push({ csv, sort: (csv.dir === currentDir ? "0" : "1") + csv.target.toLowerCase() })
  }
  return rows.map(({ csv, sort }) => ({
    label: { label: csv.name, description: csv.dir || undefined },
    kind: env.monaco.languages.CompletionItemKind.File,
    detail: csv.target,
    insertText: csv.target,
    range,
    sortText: sort,
    filterText: csv.target,
  }))
}

function headerItems(
  env: CompletionEnv,
  range: monacoApi.IRange,
  file: string,
): monacoApi.languages.CompletionItem[] {
  const t = completionText()
  return csvHeaders(file).map((header, i) => ({
    label: { label: header || indexToLetters(i), description: t.column(indexToLetters(i)) },
    kind: env.monaco.languages.CompletionItemKind.Field,
    insertText: header || indexToLetters(i),
    range,
    sortText: String(i).padStart(4, "0"),
  }))
}

/** `file:` line of a key/value block, searched upward from the cursor. */
function fileOfBlock(env: CompletionEnv): string | null {
  for (let n = env.position.lineNumber - 1; n >= 1 && env.position.lineNumber - n < 12; n--) {
    const text = env.model.getLineContent(n)
    if (/^:::/.test(text.trim())) break
    const m = /^\s*file\s*:\s*(\S+)/i.exec(text)
    if (m) return m[1]
  }
  return null
}

export const csvBlocksSource: CompletionSource = (env) => {
  const type = findEnclosingSpecialBlock(
    (n) => env.model.getLineContent(n),
    env.position.lineNumber,
    60,
  )
  if (type !== "csv" && type !== "data") return null
  const before = env.before
  // `@data:name` is a reference; the label source owns it.
  if (/^\s*@/.test(before)) return null
  // A `{#data:name}` label line has nothing to complete here.
  if (/^\s*\{#/.test(before)) return null

  const tokenAfter = /^[^\s(]*/.exec(env.after)?.[0].length ?? 0

  const kv = /^\s*(file|cols|rows)\s*:\s*([^,]*)$/i.exec(before)
  if (kv) {
    const key = kv[1].toLowerCase()
    const partial = kv[2]
    if (key === "file") {
      const range = makeRange(
        env,
        env.position.column - partial.length,
        env.position.column + tokenAfter,
      )
      return { suggestions: pathItems(env, range, partial.trim()) }
    }
    if (key === "cols") {
      const file = fileOfBlock(env)
      const range = makeRange(env, env.position.column - partial.trimStart().length)
      return { suggestions: file ? headerItems(env, range, file) : [] }
    }
    return { suggestions: [] }
  }

  const pathTok = /^\s*([^\s(]*)$/.exec(before)
  if (pathTok) {
    const partial = pathTok[1]
    const range = makeRange(
      env,
      env.position.column - partial.length,
      env.position.column + tokenAfter,
    )
    return { suggestions: pathItems(env, range, partial) }
  }

  // `data.csv (A:B, ` : inside the first parenthesis group, the columns.
  const cols = /^\s*(\S+?)\s*\(([^)]*)$/.exec(before)
  if (cols) {
    const inner = cols[2]
    const partial = /[^,:(]*$/.exec(inner)?.[0].trimStart() ?? ""
    const range = makeRange(env, env.position.column - partial.length)
    return { suggestions: headerItems(env, range, cols[1]) }
  }
  return { suggestions: [] }
}
