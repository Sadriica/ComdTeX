import { extractTocEntries } from "./toc"

export interface SectionReference {
  id: string
  number: string
  title: string
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

    if (explicit) sections.set(explicit[1], { id: explicit[1], number, title })
    return `${match[1]} ${number} ${title}`
  })

  for (const entry of extractTocEntries(content, 3)) {
    if (!sections.has(entry.slug)) sections.set(entry.slug, { id: entry.slug, number: "", title: entry.text })
  }

  return { content: lines.join("\n"), sections }
}

export function resolveSectionRefs(content: string, sections: Map<string, SectionReference>): string {
  return content.replace(/@sec:([\w:.-]+)/g, (full, id) => {
    const section = sections.get(id)
    if (!section) return full
    const label = section.number ? `sección ${section.number}` : section.title
    return `<a class="xref xref-sec" data-section="${id}" href="#${id}">${label}</a>`
  })
}
