// `[[note]]` and `[[note#heading]]` completion.
//
// Notes show their folder, and a name shared by two notes is inserted as the
// shortest unique path (`physics/intro`) instead of the ambiguous bare name.

import type * as monacoApi from "monaco-editor"
import {
  completionText,
  getCurrentFile,
  getHeadings,
  getVaultDocs,
  relPathOf,
  type VaultDoc,
} from "./state"
import type { CompletionSource } from "./types"
import { closerPlan, makeRange, MAX_ITEMS } from "./util"

const HEADING_CTX = /\[\[([^\]|#\n]*)#([^\]|\n]*)$/
const NOTE_CTX = /\[\[([^\]|#\n]*)$/

function findDoc(target: string): VaultDoc | null {
  const t = target.trim().toLowerCase()
  if (!t) return null
  const docs = getVaultDocs()
  return (
    docs.find((d) => d.wikiTarget.toLowerCase() === t) ??
    docs.find((d) => d.relLc === t) ??
    docs.find((d) => d.relLc.endsWith("/" + t)) ??
    docs.find((d) => d.baseLc === t) ??
    null
  )
}

function provideHeadings(
  env: Parameters<CompletionSource>[0],
  target: string,
  partial: string,
): monacoApi.languages.CompletionList {
  const doc = findDoc(target)
  const path = target.trim() ? doc?.path : getCurrentFile()
  const headings = path ? getHeadings(path) : []
  const closer = closerPlan(env.after, "]]")
  const range = makeRange(
    env,
    env.position.column - partial.length,
    env.position.column + closer.extend,
  )
  const t = completionText()
  const seen = new Set<string>()
  const suggestions: monacoApi.languages.CompletionItem[] = []
  headings.forEach((heading, i) => {
    if (seen.has(heading)) return
    seen.add(heading)
    suggestions.push({
      label: heading,
      kind: env.monaco.languages.CompletionItemKind.Reference,
      detail: t.wikilinkHeading,
      insertText: heading + closer.text,
      range,
      // Document order, not alphabetical: a note reads top to bottom.
      sortText: String(i).padStart(5, "0"),
    })
  })
  return { suggestions }
}

export const wikilinksSource: CompletionSource = (env) => {
  const heading = HEADING_CTX.exec(env.before)
  if (heading) return provideHeadings(env, heading[1], heading[2])

  const m = NOTE_CTX.exec(env.before)
  if (!m) return null
  const partial = m[1]
  const partialLc = partial.toLowerCase()
  const closer = closerPlan(env.after, "]]")
  const range = makeRange(
    env,
    env.position.column - partial.length,
    env.position.column + closer.extend,
  )

  const current = getCurrentFile()
  const currentDir = current ? relPathOf(current).split("/").slice(0, -1).join("/") : null

  const ranked: { doc: VaultDoc; sort: string }[] = []
  for (const doc of getVaultDocs()) {
    if (partialLc && !doc.relLc.includes(partialLc)) continue
    const prefix = doc.baseLc.startsWith(partialLc) || doc.relLc.startsWith(partialLc) ? "0" : "1"
    const sameDir = currentDir !== null && doc.dir === currentDir ? "0" : "1"
    ranked.push({ doc, sort: prefix + sameDir + doc.relLc })
  }
  ranked.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
  const truncated = ranked.length > MAX_ITEMS

  const suggestions: monacoApi.languages.CompletionItem[] = ranked
    .slice(0, MAX_ITEMS)
    .map(({ doc, sort }) => ({
      label: { label: doc.base, description: doc.dir || undefined },
      kind: env.monaco.languages.CompletionItemKind.File,
      detail: doc.rel,
      insertText: doc.wikiTarget + closer.text,
      range,
      sortText: sort,
      // The folder is searchable too: typing `physics/` narrows to that folder.
      filterText: doc.rel,
    }))
  return { suggestions, incomplete: truncated }
}
