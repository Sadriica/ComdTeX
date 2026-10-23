// `{#` completion: the label slot after a heading, environment, equation or
// figure. Offers `kind:slug` with the slug taken from the environment title or
// heading text, made unique against every label in the vault.

import type * as monacoApi from "monaco-editor"
import { isKnownLabelId } from "./state"
import { ownLabels, canonicalKind } from "./labels"
import { RETRIGGER_COMMAND, type CompletionSource } from "./types"
import { closerPlan, makeRange, slugify } from "./util"

const SLOT = /\{#([\w:.-]*)$/
const ENV_OPEN = /^\s*:::(?:sm\s+|lg\s+)?([A-Za-z][\w-]*)(?:\[([^\]]*)\])?/
const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*\{#[\w:.-]*$/
const ENV_KIND: Record<string, string> = {
  theorem: "thm",
  lemma: "lem",
  corollary: "cor",
  proposition: "prop",
  definition: "def",
  example: "ex",
  exercise: "exc",
}

interface Host {
  kinds: string[]
  slug: string
}

/** What the label is attached to, judged from the line it sits on. */
export function labelHost(beforeSlot: string): Host {
  const heading = HEADING.exec(beforeSlot + "{#")
  if (heading) return { kinds: ["sec"], slug: slugify(heading[1]) }
  const env = ENV_OPEN.exec(beforeSlot)
  if (env) {
    const kind = ENV_KIND[env[1].toLowerCase()]
    if (kind) return { kinds: [kind], slug: slugify(env[2] ?? "") }
    return { kinds: [], slug: "" }
  }
  if (/^\s*\$\$/.test(beforeSlot) || /\$\s*$/.test(beforeSlot)) return { kinds: ["eq"], slug: "" }
  const image = /!\[([^\]]*)\]\([^)]*\)\s*$/.exec(beforeSlot)
  if (image) return { kinds: ["fig"], slug: slugify(image[1]) }
  return { kinds: ["eq", "fig", "tbl", "sec"], slug: "" }
}

export const labelSlotSource: CompletionSource = (env) => {
  const m = SLOT.exec(env.before)
  if (!m) return null
  const partial = m[1]
  const slotStart = env.before.length - m[0].length
  const host = labelHost(env.before.slice(0, slotStart))
  if (host.kinds.length === 0) return { suggestions: [] }

  const closer = closerPlan(env.after, "}")
  const range = makeRange(
    env,
    env.position.column - partial.length,
    env.position.column + closer.extend,
  )
  const taken = new Set(ownLabels(env.model).map((l) => l.id))
  const unique = (kind: string, slug: string): string => {
    let candidate = slug
    for (
      let n = 2;
      taken.has(`${kind}:${candidate}`) || isKnownLabelId(`${kind}:${candidate}`);
      n++
    ) {
      candidate = `${slug}-${n}`
    }
    return candidate
  }

  const suggestions: monacoApi.languages.CompletionItem[] = []
  host.kinds.forEach((kind, i) => {
    const kindName = canonicalKind(kind)
    if (host.slug) {
      const id = `${kindName}:${unique(kindName, host.slug)}`
      suggestions.push({
        label: id,
        kind: env.monaco.languages.CompletionItemKind.Reference,
        insertText: id + closer.text,
        range,
        sortText: "0" + i,
      })
    } else {
      suggestions.push({
        label: `${kindName}:`,
        kind: env.monaco.languages.CompletionItemKind.Keyword,
        insertText: `${kindName}:`,
        range,
        sortText: "1" + i,
        command: RETRIGGER_COMMAND,
      })
    }
  })
  return { suggestions }
}
