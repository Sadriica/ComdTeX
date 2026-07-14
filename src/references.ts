import { extractTocEntries, headingAnchorId } from "./toc"

export interface SectionReference {
  /** The heading's DOM id — what a `@sec:` link must point at. */
  id: string
  number: string
  title: string
}

/**
 * Marker appended to a heading that carries an explicit `{#sec:label}`, so the
 * id survives markdown-it and can be stamped onto the rendered `<h*>` by
 * `attachSectionIds` in `renderer.ts`. Uses the same \x02…\x03 control-char
 * convention as the other renderer placeholders.
 */
export const SECTION_ID_MARKER_RE = /\x02SECID:([\w:.-]+)\x03/

function sectionIdMarker(id: string): string {
  return `\x02SECID:${id}\x03`
}

export function numberHeadings(content: string): { content: string; sections: Map<string, SectionReference> } {
  const counters = [0, 0, 0]
  const sections = new Map<string, SectionReference>()
  const lines = content.split("\n").map((line) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line)
    if (!match) return line

    const level = match[1].length
    const rawTitle = match[2].trim()
    const explicit = /\{#([\w:.-]+)\}\s*$/.exec(rawTitle)
    const title = rawTitle.replace(/\s*\{#[\w:.-]+\}\s*$/, "")
    counters[level - 1]++
    counters.fill(0, level, 3)
    const number = counters.slice(0, level).join(".")

    if (!explicit) return `${match[1]} ${number} ${title}`

    const label = explicit[1]
    const id = headingAnchorId(label, title)
    const ref: SectionReference = { id, number, title }
    // `@sec:decisiones` is the documented form; `@sec:sec:decisiones` (the
    // literal label) is also accepted since older notes were written that way.
    sections.set(label.replace(/^sec:/, ""), ref)
    sections.set(label, ref)
    return `${match[1]} ${number} ${title} ${sectionIdMarker(id)}`
  })

  // Unlabeled headings are still referenceable by their slug.
  for (const entry of extractTocEntries(content, 3)) {
    if (entry.label) continue
    if (!sections.has(entry.slug)) {
      sections.set(entry.slug, { id: headingAnchorId(null, entry.text), number: "", title: entry.text })
    }
  }

  return { content: lines.join("\n"), sections }
}

export function resolveSectionRefs(content: string, sections: Map<string, SectionReference>): string {
  // Same shape as the `@tbl:` / `@fig:` ref patterns: dots are allowed *inside*
  // a label (`sec:1.2`) but a trailing one is sentence punctuation, not part of
  // the label — `[\w:.-]+` would swallow the period in "ver @sec:intro."
  return content.replace(/@sec:([\w:-]+(?:\.\w+)*)/g, (_full, id: string) => {
    const section = sections.get(id)
    // Unknown label: show a broken-reference marker rather than leaking the raw
    // `@sec:…` source text, matching how `@tbl:` / `@fig:` degrade.
    if (!section) return `<span class="xref-broken">sección (?)</span>`
    const label = section.number ? `sección ${section.number}` : section.title
    return `<a class="xref xref-sec" data-section="${section.id}" href="#${section.id}">${label}</a>`
  })
}
