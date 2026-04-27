/**
 * Anki export: extracts ::: math environments from a Markdown document and
 * converts them into Anki-importable cards (front/back, TSV-friendly format).
 *
 * Supported environment kinds:
 *   theorem, lemma, corollary, proposition, definition, example, exercise
 *
 * Cloze deletions:
 *   Inside a `:::definition` body, any `{{X}}` braces are converted into
 *   Anki cloze syntax `{{c1::X}}` (each cloze gets its own incrementing index).
 *   The card is exported with type "Cloze" so Anki recognises it.
 */

import { ALL_ENVS } from "./environments"

/** Environments that produce Anki cards. */
export const ANKI_EXPORT_ENVS: ReadonlySet<string> = new Set([
  "theorem",
  "lemma",
  "corollary",
  "proposition",
  "definition",
  "example",
  "exercise",
])

export type AnkiCardType = "Basic" | "Cloze"

export interface AnkiCard {
  type: AnkiCardType
  /** Environment kind (theorem, lemma, ...) */
  kind: string
  /** Optional title, e.g. ":::theorem[Pythagoras]" → "Pythagoras". */
  title: string
  /** Front of the card (question / prompt). */
  front: string
  /** Back of the card (answer / body, with cloze syntax for cloze cards). */
  back: string
}

// Same regex shape as in environments.ts: ::: kind[title]{#label}
const ENV_RE =
  /^:::(?:(?:sm|lg)\s+)?([\w]+)(?:\[([^\]]*)\])?(?:\s*\{#[\w:.-]+\})?\s*\n([\s\S]*?)^:::\s*$/gm

/**
 * Convert `{{X}}` cloze deletions inside a body into Anki's `{{c<N>::X}}`
 * syntax, with N starting at 1 and incrementing per occurrence.
 *
 * Returns the rewritten body and whether any clozes were found.
 */
export function applyClozeDeletions(body: string): { body: string; hasCloze: boolean } {
  let i = 0
  let hasCloze = false
  // Match {{...}} but skip over already-converted {{c1::...}} forms.
  const out = body.replace(/\{\{(?!c\d+::)([^{}]+)\}\}/g, (_m, inner) => {
    i += 1
    hasCloze = true
    return `{{c${i}::${inner}}}`
  })
  return { body: out, hasCloze }
}

/**
 * Extract Anki cards from a Markdown document.
 */
export function extractAnkiCards(markdown: string): AnkiCard[] {
  const cards: AnkiCard[] = []
  let m: RegExpExecArray | null
  // `replace`-style global regex requires resetting lastIndex when we use .exec
  ENV_RE.lastIndex = 0
  while ((m = ENV_RE.exec(markdown)) !== null) {
    const kind = m[1].toLowerCase()
    if (!ALL_ENVS[kind] || !ANKI_EXPORT_ENVS.has(kind)) continue

    const title = (m[2] ?? "").trim()
    const rawBody = m[3].trim()

    // Cloze handling: only `definition` per spec, but easy to extend.
    let type: AnkiCardType = "Basic"
    let body = rawBody
    if (kind === "definition") {
      const result = applyClozeDeletions(rawBody)
      body = result.body
      if (result.hasCloze) type = "Cloze"
    }

    const labelEs = ALL_ENVS[kind].es
    const front = title
      ? `${labelEs}: ${title}`
      : labelEs

    cards.push({ type, kind, title, front, back: body })
  }
  return cards
}

/** Escape a single field for TSV output (Anki accepts `\t`-separated rows). */
function escTsv(s: string): string {
  // Preserve newlines as `<br>` so Anki keeps multi-line content on a single row.
  return s.replace(/\r?\n/g, "<br>").replace(/\t/g, "    ")
}

/**
 * Build a TSV string suitable for Anki import.
 *
 * Columns: Type, Front, Back, Tags
 * The first row is a `#` comment header so Anki ignores it.
 */
export function exportAnkiTsv(cards: AnkiCard[], extraTags: string[] = []): string {
  const baseTags = ["comdtex", ...extraTags].join(" ")
  const lines: string[] = ["#separator:tab", "#html:true", "#notetype column:1", "#tags column:4"]
  for (const card of cards) {
    const tags = `${baseTags} ${card.kind}`.trim()
    lines.push([card.type, escTsv(card.front), escTsv(card.back), tags].join("\t"))
  }
  return lines.join("\n")
}
