/**
 * YAML frontmatter parsing and rendering.
 *
 * Format:
 *   ---
 *   title: My Document
 *   author: John Doe
 *   date: 2024-01-15
 *   tags: [calculus, linear-algebra]
 *   ---
 */

export interface FrontmatterData {
  title?: string
  author?: string
  date?: string
  tags?: string[]
  [key: string]: unknown
}

/** Parse simple YAML (flat key: value, arrays as [a, b] or bullet lists). */
function parseYaml(text: string): FrontmatterData {
  const data: FrontmatterData = {}
  let currentKey = ""
  const arrayBuffer: string[] = []
  let inArray = false

  const flush = () => {
    if (inArray && currentKey) {
      data[currentKey] = arrayBuffer.slice()
      arrayBuffer.length = 0
      inArray = false
    }
  }

  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue

    // Bullet list item
    if (line.startsWith("- ") && inArray) {
      arrayBuffer.push(line.slice(2).trim().replace(/^['"]|['"]$/g, ""))
      continue
    }

    flush()

    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trim()

    if (val === "" || val === "|" || val === ">") {
      currentKey = key
      inArray = true
      continue
    }

    // Inline array [a, b, c]
    if (val.startsWith("[") && val.endsWith("]")) {
      data[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean)
      continue
    }

    data[key] = val.replace(/^['"]|['"]$/g, "")
    currentKey = key
  }

  flush()
  return data
}

export function extractFrontmatter(text: string): { data: FrontmatterData; content: string } | null {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return null
  const end = text.indexOf("\n---", 4)
  if (end === -1) return null
  const yaml = text.slice(4, end)
  const rest = text.slice(end + 4).replace(/^\r?\n/, "")
  return { data: parseYaml(yaml), content: rest }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Render frontmatter as a styled HTML header (inserted before main content). */
export function renderFrontmatterHeader(data: FrontmatterData): string {
  const parts: string[] = []

  if (data.title) {
    parts.push(`<h1 class="fm-title">${esc(data.title)}</h1>`)
  }

  const meta: string[] = []
  if (data.author) meta.push(`<span class="fm-author">${esc(data.author)}</span>`)
  if (data.date)   meta.push(`<span class="fm-date">${esc(data.date)}</span>`)
  if (meta.length) parts.push(`<div class="fm-meta">${meta.join(" · ")}</div>`)

  if (data.tags && data.tags.length > 0) {
    const pills = data.tags
      .map((t) => `<span class="fm-tag">${esc(t)}</span>`)
      .join("")
    parts.push(`<div class="fm-tags">${pills}</div>`)
  }

  if (parts.length === 0) return ""
  return `<div class="frontmatter-header">${parts.join("")}</div>`
}
