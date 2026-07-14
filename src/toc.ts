export interface TocEntry {
  level: number
  text: string
  slug: string
  /** The explicit `{#label}` written on the heading, if any (without braces). */
  label: string | null
  line: number
}

/**
 * Canonical DOM id for a heading — the single source of truth shared by the
 * renderer (which stamps the id), `@sec:` references and the auto-TOC, so an
 * anchor can never disagree with the id it points at.
 *
 * An explicit `{#sec:label}` / `{#label}` becomes `sec-label`; an unlabeled
 * heading falls back to a slug of its visible text.
 */
export function headingAnchorId(explicitLabel: string | null | undefined, text: string): string {
  if (explicitLabel) return `sec-${explicitLabel.replace(/^sec:/, "")}`
  return slugifyHeading(text) || "section"
}

export function slugifyHeading(text: string): string {
  return text
    .replace(/\s*\{#[\w:.-]+\}\s*$/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function extractTocEntries(content: string, maxLevel = 3): TocEntry[] {
  const entries: TocEntry[] = []
  content.split("\n").forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!match) return
    const level = match[1].length
    if (level > maxLevel) return
    const rawText = match[2].trim()
    const explicit = /\{#([\w:.-]+)\}\s*$/.exec(rawText)
    const text = rawText.replace(/\s*\{#[\w:.-]+\}\s*$/, "")
    entries.push({
      level,
      text,
      slug: explicit?.[1] ?? slugifyHeading(text),
      label: explicit?.[1] ?? null,
      line: index + 1,
    })
  })
  return entries
}

export function buildTocMarkdown(content: string, maxLevel = 3): string {
  const entries = extractTocEntries(content, maxLevel)
  if (entries.length === 0) return ""
  const minLevel = Math.min(...entries.map((entry) => entry.level))
  return entries
    .map((entry) => `${"  ".repeat(entry.level - minLevel)}- [${entry.text}](#${entry.slug})`)
    .join("\n")
}
