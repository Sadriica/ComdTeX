export interface TocEntry {
  level: number
  text: string
  slug: string
  line: number
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
