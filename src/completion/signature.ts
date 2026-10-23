// Signature help for shorthands: typing `frac(a, ` highlights `b` in
// `frac(num, den)`. The argument counts come from the linter's EXPECTED_ARGS
// table (the same one that reports a wrong count), the names from the
// shorthand catalog, so the three cannot drift apart.

import type * as monacoApi from "monaco-editor"
import { EXPECTED_ARGS } from "../contentLinter"
import { COMPLETIONS, findEnclosingSpecialBlock, getSpecialBlockCompletions } from "./catalog"

export interface ShorthandSignature {
  name: string
  params: string[]
  /** True for shorthands with no fixed count (mat, matf, table). */
  variadic: boolean
  doc: string
}

let signatures: Map<string, ShorthandSignature> | null = null

/** Parameter names of a catalog entry: from its `name(a, b)` detail, else its tab stops. */
function paramNames(name: string, count: number | null): string[] {
  const entry = COMPLETIONS.find((c) => c.label === name)
  if (entry) {
    const fromDetail = new RegExp(`^${name}\\(([^)]*)\\)`).exec(entry.detail)
    if (fromDetail) {
      const names = fromDetail[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      if (count === null || names.length === count) return names
    }
    const stops = [...entry.snippet.matchAll(/\$\{\d+:([^}]*)\}/g)].map((m) => m[1])
    if (stops.length > 0 && (count === null || stops.length === count)) return stops
  }
  const n = count ?? 1
  return Array.from({ length: n }, (_, i) => `arg${i + 1}`)
}

export function getShorthandSignatures(): Map<string, ShorthandSignature> {
  if (signatures) return signatures
  signatures = new Map()
  for (const [name, count] of Object.entries(EXPECTED_ARGS)) {
    const entry = COMPLETIONS.find((c) => c.label === name)
    signatures.set(name, {
      name,
      params: paramNames(name, count),
      variadic: count === null,
      doc: entry?.detail ?? "",
    })
  }
  return signatures
}

export interface CallFrame {
  name: string
  /** Top-level commas before the cursor inside this call. */
  index: number
}

/**
 * The shorthand call the cursor is inside, from the line text before it.
 * Brackets nested in an argument keep their own commas (`mat(1, 2; [3, 4])`
 * has one argument per row cell, not per bracket cell).
 */
export function findShorthandCall(before: string): CallFrame | null {
  interface Frame {
    open: string
    name: string
    commas: number
  }
  const stack: Frame[] = []
  for (let i = 0; i < before.length; i++) {
    const ch = before[i]
    if (ch === "(" || ch === "[" || ch === "{") {
      let name = ""
      if (ch === "(") {
        const m = /([A-Za-z]+)$/.exec(before.slice(0, i))
        const start = m ? i - m[1].length : i
        if (m && before[start - 1] !== "\\") name = m[1]
      }
      stack.push({ open: ch, name, commas: 0 })
    } else if (ch === ")" || ch === "]" || ch === "}") {
      stack.pop()
    } else if (ch === ",") {
      const top = stack[stack.length - 1]
      if (top) top.commas++
    }
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const f = stack[i]
    if (f.open === "(" && f.name && f.name in EXPECTED_ARGS) {
      return { name: f.name, index: f.commas }
    }
  }
  return null
}

export function registerSignatureHelp(
  monaco: typeof monacoApi,
  language = "markdown",
): monacoApi.IDisposable {
  return monaco.languages.registerSignatureHelpProvider(language, {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [",", ")"],
    provideSignatureHelp(model, position) {
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      if (!before.includes("(")) return null
      // Inside a special block `sqrt(x)` is the block's own syntax, not a shorthand.
      const block = findEnclosingSpecialBlock((n) => model.getLineContent(n), position.lineNumber)
      if (block && getSpecialBlockCompletions(block)) return null

      const call = findShorthandCall(before)
      if (!call) return null
      const sig = getShorthandSignatures().get(call.name)
      if (!sig) return null

      const params = sig.params
      let label = `${sig.name}(`
      const offsets: [number, number][] = params.map((p, i) => {
        const start = label.length + (i > 0 ? 2 : 0)
        label += (i > 0 ? ", " : "") + p
        return [start, start + p.length]
      })
      label += sig.variadic ? ", …)" : ")"

      return {
        value: {
          signatures: [
            {
              label,
              documentation: sig.doc ? { value: sig.doc } : undefined,
              parameters: offsets.map((range) => ({ label: range })),
            },
          ],
          activeSignature: 0,
          activeParameter: Math.min(call.index, Math.max(params.length - 1, 0)),
        },
        dispose() {},
      }
    },
  })
}
