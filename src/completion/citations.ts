// `[@key]` completion from references.bib.
//
// Searchable by key, authors, title and year (a researcher remembers "the 2017
// Levin and Peres book", not `levin2017`), with a documentation card per entry
// and completion after `;` and `, ` inside `[@a; @b, p. 3]`.

import type * as monacoApi from "monaco-editor"
import { getBibEntries, completionText, type BibEntry } from "./state"
import type { CompletionSource } from "./types"
import { closerPlan, escapeSnippet, makeRange, MAX_ITEMS } from "./util"

/** An open `[@...` span that has not been closed yet. */
const SPAN_RE = /\[@[^\]\n]*$/
/** A key being typed right after `[@`, or after `; @` / `, @` of a multi-cite. */
const AT_TOKEN_RE = /(?:\[@|[;,]\s*@)([^\s;,\]@]*)$/
/** A key being typed after `;` without its `@` yet (`[@a; lev`). */
const BARE_TOKEN_RE = /;\s*([^\s;,\]@]*)$/

export interface CiteContext {
  partial: string
  /** True when the `@` is missing and the inserted key must bring its own. */
  needsAt: boolean
}

export function citeContext(before: string): CiteContext | null {
  const span = SPAN_RE.exec(before)
  if (!span) return null
  const text = span[0]
  const at = AT_TOKEN_RE.exec(text)
  if (at) return { partial: at[1], needsAt: false }
  const bare = BARE_TOKEN_RE.exec(text)
  if (bare) return { partial: bare[1], needsAt: true }
  return null
}

function authorSummary(author: string): string {
  if (!author) return ""
  const names = author
    .split(/\s+and\s+/i)
    .map((a) => (a.includes(",") ? a.split(",")[0] : (a.trim().split(/\s+/).pop() ?? a)).trim())
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names[0]} et al.`
}

function card(entry: BibEntry): monacoApi.IMarkdownString {
  const f = entry.fields
  const lines: string[] = []
  if (entry.title) lines.push(`**${entry.title.replace(/[{}]/g, "")}**`)
  const who = [entry.author.replace(/\s+and\s+/gi, "; "), entry.year && `(${entry.year})`]
    .filter(Boolean)
    .join(" ")
  if (who) lines.push(who)
  const venue = f.journal ?? f.booktitle ?? f.publisher ?? f.howpublished ?? ""
  const where = [venue && `*${venue.replace(/[{}]/g, "")}*`, f.volume, f.pages && `pp. ${f.pages}`]
    .filter(Boolean)
    .join(", ")
  if (where) lines.push(where)
  if (f.doi) lines.push(`doi:${f.doi}`)
  lines.push(`\`${entry.key}\`${entry.type ? ` · ${entry.type}` : ""}`)
  return { value: lines.join("\n\n") }
}

export const citationsSource: CompletionSource = (env) => {
  const ctx = citeContext(env.before)
  if (!ctx) return null
  const partialLc = ctx.partial.toLowerCase()
  const closer = closerPlan(env.after, "]")
  const range = makeRange(
    env,
    env.position.column - ctx.partial.length,
    env.position.column + closer.extend,
  )

  const matches: { entry: BibEntry; sort: string }[] = []
  for (const entry of getBibEntries()) {
    if (partialLc && !entry.haystack.includes(partialLc)) continue
    // Key matches outrank author/title matches; ties break on the key.
    const rank = entry.keyLc.startsWith(partialLc)
      ? "0"
      : entry.keyLc.includes(partialLc)
        ? "1"
        : "2"
    matches.push({ entry, sort: rank + entry.keyLc })
    if (matches.length >= MAX_ITEMS * 4) break
  }
  matches.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
  const truncated = matches.length > MAX_ITEMS

  const t = completionText()
  const suggestions: monacoApi.languages.CompletionItem[] = matches
    .slice(0, MAX_ITEMS)
    .map(({ entry, sort }) => {
      const who = authorSummary(entry.author)
      const description = [who, entry.year].filter(Boolean).join(" ")
      return {
        label: { label: entry.key, description },
        kind: env.monaco.languages.CompletionItemKind.Reference,
        detail: entry.title.replace(/[{}]/g, "") || t.citeKey,
        documentation: card(entry),
        // The caret stays before the `]`: next comes a locator (`, p. 3`) or `; @other`.
        insertText: closer.text
          ? escapeSnippet((ctx.needsAt ? "@" : "") + entry.key) + "$0" + closer.text
          : (ctx.needsAt ? "@" : "") + entry.key,
        insertTextRules: closer.text
          ? env.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        range,
        sortText: sort,
        filterText: `${entry.key} ${entry.author} ${entry.title} ${entry.year}`,
      }
    })
  return { suggestions, incomplete: truncated }
}
