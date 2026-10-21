// `[^note]` completion: the footnotes this document already defines (`[^x]:`),
// footnotes used but not defined yet, and the next free number.

import type * as monacoApi from "monaco-editor"
import { completionText } from "./state"
import type { CompletionModel, CompletionSource } from "./types"
import { cachedByVersion, closerPlan, makeRange } from "./util"

const CTX = /\[\^([^\]\s]*)$/

export interface FootnoteScan {
  /** label -> line of its `[^label]:` definition. */
  defs: Map<string, number>
  /** labels referenced in the text, defined or not. */
  refs: Set<string>
}

export function scanFootnotes(model: CompletionModel): FootnoteScan {
  return cachedByVersion(model, "footnotes", () => {
    const defs = new Map<string, number>()
    const refs = new Set<string>()
    const count = model.getLineCount()
    for (let n = 1; n <= count; n++) {
      const line = model.getLineContent(n)
      if (!line.includes("[^")) continue
      const def = /^\s{0,3}\[\^([^\]\s]+)\]:/.exec(line)
      if (def && !defs.has(def[1])) defs.set(def[1], n)
      for (const m of line.matchAll(/\[\^([^\]\s]+)\](?!:)/g)) refs.add(m[1])
    }
    return { defs, refs }
  })
}

/** Smallest unused positive integer above every numeric footnote label in use. */
export function nextFreeFootnote(scan: FootnoteScan): string {
  let max = 0
  for (const label of [...scan.defs.keys(), ...scan.refs]) {
    if (/^\d+$/.test(label)) max = Math.max(max, Number(label))
  }
  return String(max + 1)
}

export const footnotesSource: CompletionSource = (env) => {
  const m = CTX.exec(env.before)
  if (!m) return null
  const partial = m[1]
  const closer = closerPlan(env.after, "]")
  const range = makeRange(
    env,
    env.position.column - partial.length,
    env.position.column + closer.extend,
  )
  const full = scanFootnotes(env.model)
  // The `[^partial]` being typed is itself a reference; it is not "used" yet.
  const refs = new Set(full.refs)
  if (partial && !full.defs.has(partial)) refs.delete(partial)
  const scan: FootnoteScan = { defs: full.defs, refs }
  const t = completionText()
  const kind = env.monaco.languages.CompletionItemKind.Value
  const suggestions: monacoApi.languages.CompletionItem[] = []

  const next = nextFreeFootnote(scan)
  if (next.startsWith(partial)) {
    suggestions.push({
      label: { label: next, description: t.nextFootnote },
      kind,
      insertText: next + closer.text,
      range,
      sortText: "0",
    })
  }

  const labels = new Set<string>([...scan.defs.keys(), ...scan.refs])
  const ordered = [...labels].sort((a, b) => {
    const na = /^\d+$/.test(a)
    const nb = /^\d+$/.test(b)
    if (na && nb) return Number(a) - Number(b)
    if (na !== nb) return na ? -1 : 1
    return a.localeCompare(b)
  })
  for (const label of ordered) {
    if (!label.startsWith(partial)) continue
    const line = scan.defs.get(label)
    suggestions.push({
      label: { label, description: line ? t.footnoteDefined(line) : t.footnoteUndefined },
      kind,
      insertText: label + closer.text,
      range,
      sortText: "1" + label.padStart(8, "0"),
    })
  }
  return { suggestions }
}
