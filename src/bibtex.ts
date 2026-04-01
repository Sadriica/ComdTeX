/**
 * Minimal BibTeX parser and citation renderer.
 *
 * In-text: [@key] or [@key, p. 42]
 * File:    references.bib in vault root
 */

export interface BibEntry {
  type: string
  key: string
  fields: Record<string, string>
}

export const BIBTEX_FILENAME = "references.bib"

// ── Parser ────────────────────────────────────────────────────────────────────

/** Extract balanced-brace content starting at position of opening '{'. */
function extractBraces(text: string, start: number): string {
  let depth = 0
  let i = start
  let result = ""
  while (i < text.length) {
    const ch = text[i]
    if (ch === "{") { depth++; if (depth > 1) result += ch }
    else if (ch === "}") { depth--; if (depth === 0) break; result += ch }
    else if (depth > 0) result += ch
    i++
  }
  return result
}

export function parseBibtex(src: string): Map<string, BibEntry> {
  const map = new Map<string, BibEntry>()
  // Match @type{key, ...}
  const entryRe = /@(\w+)\s*\{([^,\s]+)\s*,/g
  let m: RegExpExecArray | null

  while ((m = entryRe.exec(src)) !== null) {
    const type = m[1].toLowerCase()
    const key = m[2].trim()
    if (type === "string" || type === "preamble" || type === "comment") continue

    // Find the outer braces for this entry
    const entryStart = src.indexOf("{", m.index)
    const entryContent = extractBraces(src, entryStart)

    const fields: Record<string, string> = {}
    // Parse fields: name = {value} or name = "value" or name = 123
    // Supports two levels of nested braces (e.g. {The {\'e}l}  or \left\{...\right\})
    const fieldRe = /(\w+)\s*=\s*(?:\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}|"([^"]*?)"|(\d+))/g
    let f: RegExpExecArray | null
    while ((f = fieldRe.exec(entryContent)) !== null) {
      const name = f[1].toLowerCase()
      const val = (f[2] ?? f[3] ?? f[4] ?? "").replace(/\s+/g, " ").trim()
      fields[name] = val
    }

    map.set(key, { type, key, fields })
  }

  return map
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// ── Citation rendering ────────────────────────────────────────────────────────

/** Replace [@key] and [@key, note] with numbered citations. Returns modified
 *  text and the ordered list of cited keys. */
export function resolveCitations(
  text: string,
  bibMap: Map<string, BibEntry>
): { text: string; citedKeys: string[] } {
  const order: string[] = []
  const indexMap = new Map<string, number>()

  const result = text.replace(/\[@([\w:.-]+)(?:,\s*([^\]]*))?\]/g, (_, key, note) => {
    if (!indexMap.has(key)) {
      order.push(key)
      indexMap.set(key, order.length)
    }
    const n = indexMap.get(key)!
    const exists = bibMap.has(key)
    const cls = exists ? "cite-ref" : "cite-ref cite-broken"
    const title = exists
      ? `${bibMap.get(key)!.fields.author ?? ""} (${bibMap.get(key)!.fields.year ?? "?"})`
      : `Clave no encontrada: ${key}`
    const noteStr = note ? `, ${esc(note)}` : ""
    return `<sup><a class="${cls}" href="#bib-${esc(key)}" title="${esc(title)}">[${n}${noteStr}]</a></sup>`
  })

  return { text: result, citedKeys: order }
}

// ── Bibliography HTML ─────────────────────────────────────────────────────────

function formatAuthors(raw: string): string {
  // "Last, First and Last2, First2" → "Last F., Last2 F2."
  return raw
    .split(/\s+and\s+/i)
    .map((a) => {
      const parts = a.split(",").map((s) => s.trim())
      if (parts.length >= 2 && parts[1].trim().length > 0) return `${parts[0]}, ${parts[1].trim()[0]}.`
      return parts[0]
    })
    .join("; ")
}

function formatEntry(entry: BibEntry, n: number): string {
  const f = entry.fields
  const authors = f.author ? formatAuthors(f.author) : "?"
  const year = f.year ? `(${f.year})` : ""
  const title = f.title ?? "Sin título"

  let source = ""
  if (entry.type === "article") {
    source = [f.journal, f.volume ? `vol. ${f.volume}` : "", f.pages ? `pp. ${f.pages}` : ""]
      .filter(Boolean).join(", ")
  } else if (entry.type === "book") {
    source = [f.publisher, f.address].filter(Boolean).join(", ")
  } else if (entry.type === "inproceedings" || entry.type === "incollection") {
    source = f.booktitle ?? ""
  } else {
    source = f.publisher ?? f.journal ?? f.howpublished ?? ""
  }

  return [
    `<div class="bib-entry" id="bib-${esc(entry.key)}">`,
    `<span class="bib-number">[${n}]</span>`,
    `<span class="bib-content">`,
    `${esc(authors)} ${esc(year)}. <em>${esc(title)}</em>${source ? `. ${esc(source)}` : ""}.`,
    `</span></div>`,
  ].join("\n")
}

export function renderBibliography(
  citedKeys: string[],
  bibMap: Map<string, BibEntry>
): string {
  if (citedKeys.length === 0) return ""
  const items = citedKeys
    .map((key, i) => {
      const entry = bibMap.get(key)
      if (!entry) return `<div class="bib-entry bib-missing" id="bib-${key}">[${i + 1}] Referencia no encontrada: <code>${key}</code></div>`
      return formatEntry(entry, i + 1)
    })
    .join("\n")

  return `<div class="bibliography"><h2>Referencias</h2>${items}</div>`
}

// ── LaTeX cite commands ───────────────────────────────────────────────────────

export function citationsToLatex(text: string): string {
  return text.replace(/\[@([\w:.-]+)(?:,\s*[^\]]*)?\]/g, (_, key) => `\\cite{${key}}`)
}
