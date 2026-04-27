import { extractFrontmatter } from "./frontmatter"

export type TransclusionResolver = (target: string) => string | null

// `#^id` (block id) takes priority over `#heading` because `^` is illegal in
// heading text. The current syntax `#([^\]|]+?)` already captures both.
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

const BLOCK_ID_TRAILING_RE = /\s*\^([\w-]+)\s*$/

/**
 * Extract the paragraph (block) whose trailing `^id` matches `id`. A block is
 * the maximal contiguous run of non-blank lines ending with `^id` (the marker
 * is stripped from the returned text).
 */
function extractBlockSection(content: string, id: string): string | null {
  const target = id.trim().toLowerCase()
  const lines = content.split("\n")
  const matchIdx = lines.findIndex((line) => {
    const m = BLOCK_ID_TRAILING_RE.exec(line)
    return m != null && m[1].toLowerCase() === target
  })
  if (matchIdx < 0) return null

  // Walk backwards to the start of the block.
  let start = matchIdx
  while (start > 0 && lines[start - 1].trim() !== "") start--

  const block = lines.slice(start, matchIdx + 1).join("\n")
  return block.replace(BLOCK_ID_TRAILING_RE, "")
}

export function resolveTransclusions(
  content: string,
  resolver?: TransclusionResolver,
  seen = new Set<string>(),
): string {
  if (!resolver) return content

  return content.replace(EMBED_RE, (_full, target: string, heading?: string, label?: string) => {
    const key = `${target}#${heading ?? ""}`
    if (seen.has(key)) return `> [!warning] Transclusión circular: ${target}`

    const resolved = resolver(target.trim())
    if (resolved == null) {
      const cleanTarget = target.trim().replace(/"/g, "&quot;")
      const suffix = heading ? `#${heading.trim().replace(/"/g, "&quot;")}` : ""
      return `<div class="transclusion transclusion-missing" data-target="${cleanTarget}"><div class="transclusion-header">${cleanTarget}${suffix}</div><em>Not found</em></div>`
    }

    seen.add(key)
    const stripped = stripFrontmatter(resolved)
    let body: string
    if (heading && heading.startsWith("^")) {
      const blockBody = extractBlockSection(stripped, heading.slice(1))
      body = blockBody ?? `<em>Block not found: ^${heading.slice(1)}</em>`
    } else if (heading) {
      body = extractHeadingSection(stripped, heading)
    } else {
      body = stripped
    }
    const nested = resolveTransclusions(body, resolver, seen)
    seen.delete(key)

    const title = label?.trim() || target.trim()
    const sourceLabel = heading
      ? `${target.trim()}${heading.startsWith("^") ? `#${heading}` : `#${heading}`}`
      : target.trim()
    return `\n\n<div class="transclusion" data-target="${title.replace(/"/g, "&quot;")}" data-source="${target.trim().replace(/"/g, "&quot;")}"><div class="transclusion-header">from: ${sourceLabel.replace(/"/g, "&quot;")}</div>\n\n${nested}\n\n</div>\n\n`
  })
}

/**
 * Pre-pass: rewrite lines ending in `^block-id` so the id survives markdown
 * rendering. The marker is replaced with an inline placeholder
 * `<!--block:id-->` that markdown-it preserves verbatim with `html: true`.
 *
 * The placeholder is hoisted to the parent block's `id` attribute by
 * `attachBlockIds` after the markdown pipeline finishes.
 */
export function processBlockIds(text: string): string {
  const lines = text.split("\n")
  let inFence = false
  return lines.map((line) => {
    if (/^```/.test(line.trim())) { inFence = !inFence; return line }
    if (inFence) return line
    const m = BLOCK_ID_TRAILING_RE.exec(line)
    if (!m) return line
    const id = m[1]
    return line.replace(BLOCK_ID_TRAILING_RE, ` <!--block:${id}-->`)
  }).join("\n")
}

/**
 * DOM post-pass that finds `<!--block:id-->` comment placeholders in the
 * rendered HTML, removes them, and assigns `id="block-id"` to their nearest
 * block-level ancestor.
 */
export function attachBlockIds(html: string): string {
  if (typeof DOMParser === "undefined") return html
  if (!html.includes("<!--block:")) return html

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html")
  const root = doc.getElementById("root")
  if (!root) return html

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const found: { node: Comment; id: string }[] = []
  let n: Node | null
  while ((n = walker.nextNode())) {
    const text = (n as Comment).data
    const m = /^block:([\w-]+)$/.exec(text.trim())
    if (m) found.push({ node: n as Comment, id: m[1] })
  }

  for (const { node, id } of found) {
    let parent: Element | null = node.parentElement
    while (parent && !/^(P|LI|BLOCKQUOTE|H[1-6]|DIV|FIGURE)$/.test(parent.tagName)) {
      parent = parent.parentElement
    }
    if (parent && !parent.hasAttribute("id")) {
      parent.setAttribute("id", `block-${id}`)
    }
    node.remove()
  }

  return root.innerHTML
}
