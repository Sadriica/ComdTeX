export interface SectionCount {
  headingLine: number  // 1-based line number of the heading
  words: number        // word count of the section body (not including the heading itself)
}

function stripNonWords(text: string): string {
  // Remove frontmatter (handled before calling this)
  // Remove math blocks $$...$$
  text = text.replace(/\$\$[\s\S]*?\$\$/g, " ")
  // Remove inline math $...$
  text = text.replace(/\$[^$\n]+?\$/g, " ")
  // Remove code blocks ```...```
  text = text.replace(/```[\s\S]*?```/g, " ")
  // Remove inline code `...`
  text = text.replace(/`[^`\n]*`/g, " ")
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ")
  // Remove environment markers :::type[title] and :::
  text = text.replace(/^:::[a-z]*(\[.*?\])?$/gm, " ")
  // Replace wikilinks [[name]] → name (count "name" as a word)
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1")
  // Remove citations [@key]
  text = text.replace(/\[@[^\]]+\]/g, " ")
  // Remove labels {#label}
  text = text.replace(/\{#[^}]+\}/g, " ")
  // Remove URLs
  text = text.replace(/https?:\/\/\S+/g, " ")
  // Remove markdown markers: leading # for headings, *, _, **, __, ~~, `
  text = text.replace(/^#{1,6}\s+/gm, " ")
  text = text.replace(/[*_~`]+/g, " ")
  return text
}

function countWords(text: string): number {
  const stripped = stripNonWords(text)
  return stripped
    .split(/\s+/)
    .filter(token => token.length > 0 && /[a-zA-Z0-9À-ɏ]/.test(token))
    .length
}

function skipFrontmatter(lines: string[]): number {
  // Returns the index of the first line after frontmatter (or 0 if no frontmatter)
  if (lines.length === 0 || lines[0].trim() !== "---") return 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1
  }
  return 0
}

export function computeSectionWordCounts(content: string): Map<number, number> {
  const result = new Map<number, number>()
  const lines = content.split("\n")
  const fmEnd = skipFrontmatter(lines)

  // Identify heading lines: line number (1-based) and level
  interface HeadingInfo { lineIdx: number; level: number }
  const headings: HeadingInfo[] = []
  for (let i = fmEnd; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i])
    if (m) {
      headings.push({ lineIdx: i, level: m[1].length })
    }
  }

  for (let hi = 0; hi < headings.length; hi++) {
    const { lineIdx, level } = headings[hi]
    const headingLine = lineIdx + 1  // 1-based

    // Section body starts right after the heading line
    const bodyStart = lineIdx + 1

    // Section body ends before the next heading of equal or higher level (fewer or equal #)
    let bodyEnd = lines.length
    for (let hj = hi + 1; hj < headings.length; hj++) {
      if (headings[hj].level <= level) {
        bodyEnd = headings[hj].lineIdx
        break
      }
    }

    const bodyLines = lines.slice(bodyStart, bodyEnd)
    const bodyText = bodyLines.join("\n")
    result.set(headingLine, countWords(bodyText))
  }

  return result
}

export function totalWordCount(content: string): number {
  const lines = content.split("\n")
  const fmEnd = skipFrontmatter(lines)
  const body = lines.slice(fmEnd).join("\n")
  return countWords(body)
}
