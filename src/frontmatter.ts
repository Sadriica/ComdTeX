/**
 * YAML frontmatter parsing and rendering.
 *
 * Format:
 *   ---
 *   title: My Document
 *   author: John Doe, Jane Smith
 *   date: 2024-01-15
 *   tags: [calculus, linear-algebra]
 *   abstract: |
 *     Multi-line
 *     abstract text
 *   ---
 */

export interface FrontmatterData {
  title?: string
  author?: string
  date?: string
  abstract?: string
  tags?: string[]
  [key: string]: unknown
}

// ── YAML value parsing ────────────────────────────────────────────────────────

/** Strip surrounding single or double quotes, handling escaped quotes inside. */
function unquote(s: string): string {
  if (s.length >= 2) {
    if ((s[0] === '"' && s[s.length - 1] === '"') ||
        (s[0] === "'" && s[s.length - 1] === "'")) {
      const inner = s.slice(1, -1)
      return s[0] === '"'
        ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : inner.replace(/\\'/, "'")
    }
  }
  return s
}

/** Parse an inline array `[a, b, "c d"]` into string[] */
function parseInlineArray(s: string): string[] {
  const inner = s.slice(1, -1)
  const items: string[] = []
  let current = ""
  let inStr = false
  let strChar = ""
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (inStr) {
      if (ch === "\\" && i + 1 < inner.length) { current += inner[++i]; continue }
      if (ch === strChar) { inStr = false; continue }
      current += ch
    } else if (ch === '"' || ch === "'") {
      inStr = true; strChar = ch
    } else if (ch === ",") {
      if (current.trim()) items.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  if (current.trim()) items.push(current.trim())
  return items.map(unquote)
}

/** Parse a flat YAML document. Handles: strings, quoted strings, inline arrays,
 *  bullet lists, and block scalars (| literal, > folded — collected as a single string). */
function parseYaml(text: string): FrontmatterData {
  const data: FrontmatterData = {}
  const lines = text.split("\n")
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const trimmed = raw.trim()
    i++

    if (!trimmed || trimmed.startsWith("#")) continue

    const colonIdx = trimmed.indexOf(":")
    if (colonIdx === -1) continue

    const key = trimmed.slice(0, colonIdx).trim()
    const rest = trimmed.slice(colonIdx + 1).trim()

    // Block scalar: | or >
    if (rest === "|" || rest === ">") {
      const fold = rest === ">"
      const blockLines: string[] = []
      // Determine indentation from first content line
      while (i < lines.length) {
        const nextRaw = lines[i]
        const nextTrimmed = nextRaw.trim()
        // Stop if next key-value found (unindented, non-empty, contains colon)
        if (nextTrimmed && !nextRaw.startsWith(" ") && !nextRaw.startsWith("\t")) break
        blockLines.push(fold ? nextTrimmed : (nextRaw.replace(/^\s{0,2}/, "")))
        i++
      }
      data[key] = blockLines.join(fold ? " " : "\n").trim()
      continue
    }

    // Bullet list start: value is empty
    if (rest === "") {
      const items: string[] = []
      while (i < lines.length) {
        const nextTrimmed = lines[i].trim()
        if (nextTrimmed.startsWith("- ")) {
          items.push(unquote(nextTrimmed.slice(2).trim()))
          i++
        } else {
          break
        }
      }
      if (items.length > 0) { data[key] = items; continue }
      data[key] = ""
      continue
    }

    // Inline array
    if (rest.startsWith("[") && rest.endsWith("]")) {
      data[key] = parseInlineArray(rest)
      continue
    }

    // Boolean
    if (rest === "true")  { data[key] = true;  continue }
    if (rest === "false") { data[key] = false; continue }

    // Number
    if (/^-?\d+(\.\d+)?$/.test(rest)) { data[key] = Number(rest); continue }

    // Plain string (possibly quoted)
    data[key] = unquote(rest)
  }

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

/** Serialize a FrontmatterData back to YAML string (for the properties panel). */
export function serializeFrontmatter(data: FrontmatterData): string {
  const lines: string[] = ["---"]
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined || val === null) continue
    if (Array.isArray(val)) {
      if (val.length === 0) continue
      lines.push(`${key}: [${val.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(", ")}]`)
    } else if (typeof val === "string" && val.includes("\n")) {
      lines.push(`${key}: |`)
      for (const l of val.split("\n")) lines.push(`  ${l}`)
    } else if (typeof val === "string") {
      const needsQuotes = val.includes(":") || val.startsWith('"') || val.startsWith("'")
      lines.push(`${key}: ${needsQuotes ? `"${val.replace(/"/g, '\\"')}"` : val}`)
    } else {
      lines.push(`${key}: ${val}`)
    }
  }
  lines.push("---")
  return lines.join("\n")
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Render frontmatter as a styled HTML header (inserted before main content). */
export function renderFrontmatterHeader(data: FrontmatterData): string {
  const parts: string[] = []

  if (data.title) {
    parts.push(`<h1 class="fm-title">${esc(String(data.title))}</h1>`)
  }

  const meta: string[] = []
  if (data.author) meta.push(`<span class="fm-author">${esc(String(data.author))}</span>`)
  if (data.date)   meta.push(`<span class="fm-date">${esc(String(data.date))}</span>`)
  if (meta.length) parts.push(`<div class="fm-meta">${meta.join(" · ")}</div>`)

  if (data.abstract) {
    parts.push(`<div class="fm-abstract">${esc(String(data.abstract))}</div>`)
  }

  if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
    const pills = data.tags
      .map((tag) => `<span class="fm-tag">${esc(String(tag))}</span>`)
      .join("")
    parts.push(`<div class="fm-tags">${pills}</div>`)
  }

  if (parts.length === 0) return ""
  return `<div class="frontmatter-header">${parts.join("")}</div>`
}

/** Extract all tags from a markdown document (frontmatter + inline #tags). */
export function extractTags(text: string): string[] {
  const tags = new Set<string>()

  // From frontmatter
  const parsed = extractFrontmatter(text)
  if (parsed?.data.tags && Array.isArray(parsed.data.tags)) {
    for (const t of parsed.data.tags) tags.add(String(t).toLowerCase())
  }

  // Inline #tags — not inside code blocks, not inside math
  const content = parsed ? parsed.content : text
  // Strip fenced code blocks and inline code first
  const clean = content
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]+\$/g, "")

  const tagRe = /(?:^|[\s,;(\[])#([a-zA-Z]\w*)/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(clean)) !== null) {
    tags.add(m[1].toLowerCase())
  }

  return [...tags].sort()
}
