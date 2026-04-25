import { extractFrontmatter } from "./frontmatter"

export type TransclusionResolver = (target: string) => string | null

const EMBED_RE = /!\[\[([^\]|#\n]+?)(?:#([^\]|]+?))?(?:\|([^\]\n]+?))?\]\]/g

function stripFrontmatter(content: string): string {
  return extractFrontmatter(content)?.content ?? content
}

function extractHeadingSection(content: string, heading: string): string {
  const lines = content.split("\n")
  const normalizedHeading = heading.trim().toLowerCase()
  const start = lines.findIndex((line) => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!match) return false
    return match[2].replace(/\s*\{#[\w:.-]+\}\s*$/, "").trim().toLowerCase() === normalizedHeading
  })
  if (start < 0) return content

  const level = /^(#{1,6})\s+/.exec(lines[start])?.[1].length ?? 1
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const match = /^(#{1,6})\s+/.exec(lines[i])
    if (match && match[1].length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join("\n")
}

export function resolveTransclusions(
  content: string,
  resolver?: TransclusionResolver,
  seen = new Set<string>(),
): string {
  if (!resolver) return content

  return content.replace(EMBED_RE, (full, target: string, heading?: string, label?: string) => {
    const key = `${target}#${heading ?? ""}`
    if (seen.has(key)) return `> [!warning] Transclusión circular: ${target}`

    const resolved = resolver(target.trim())
    if (resolved == null) return full

    seen.add(key)
    const body = heading
      ? extractHeadingSection(stripFrontmatter(resolved), heading)
      : stripFrontmatter(resolved)
    const nested = resolveTransclusions(body, resolver, seen)
    seen.delete(key)

    const title = label?.trim() || target.trim()
    return `\n\n<div class="transclusion" data-target="${title.replace(/"/g, "&quot;")}">\n\n${nested}\n\n</div>\n\n`
  })
}
