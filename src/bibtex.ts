import { CITE_STYLES, type CiteStyle } from "./citeStyles"
import { activeDocTerms } from "./docLang"
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
    if (ch === "{") {
      depth++
      if (depth > 1) result += ch
    } else if (ch === "}") {
      depth--
      if (depth === 0) break
      result += ch
    } else if (depth > 0) result += ch
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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ── Citation rendering ────────────────────────────────────────────────────────

export interface CitationItem {
  key: string
  note?: string
}

/** Matches every bracket that opens with `[@`; `parseCitationGroup` decides if it is a citation. */
export const CITATION_GROUP_RE = /\[(@[^\]\n]*)\]/g

const CITE_ITEM_RE = /^@([\w:.-]+)(?:,\s*([\s\S]*))?$/

/**
 * Parses the inside of a citation bracket: `@a`, `@a, p. 3` or the pandoc
 * grouping `@a; @b, p. 3`. Returns null when it is not a citation at all.
 * A `;` that is not followed by another `@key` belongs to the note.
 */
export function parseCitationGroup(inner: string): CitationItem[] | null {
  const parts = inner.split(";").map((p) => p.trim())
  if (parts.length > 1 && parts.every((p) => CITE_ITEM_RE.test(p))) {
    return parts.map((p) => {
      const m = CITE_ITEM_RE.exec(p)!
      const note = m[2]?.trim()
      return note ? { key: m[1], note } : { key: m[1] }
    })
  }
  const m = CITE_ITEM_RE.exec(inner.trim())
  if (!m) return null
  const note = m[2]?.trim()
  return [note ? { key: m[1], note } : { key: m[1] }]
}

/** Replace [@key], [@key, note] and [@a; @b] with numbered citations. Returns
 *  modified text and the ordered list of cited keys. */
export function resolveCitations(
  text: string,
  bibMap: Map<string, BibEntry>,
  style: CiteStyle = CITE_STYLES.default,
): { text: string; citedKeys: string[] } {
  const order: string[] = []
  const indexMap = new Map<string, number>()

  const numberOf = (key: string) => {
    if (!indexMap.has(key)) {
      order.push(key)
      indexMap.set(key, order.length)
    }
    return indexMap.get(key)!
  }
  const linkFor = (key: string, body: string) => {
    const entry = bibMap.get(key)
    const cls = entry ? "cite-ref" : "cite-ref cite-broken"
    const title = entry
      ? `${entry.fields.author ?? ""} (${entry.fields.year ?? "?"})`
      : activeDocTerms().bibliography.keyNotFound(key)
    return `<a class="${cls}" href="#bib-${esc(key)}" title="${esc(title)}">${esc(body)}</a>`
  }
  const markerFor = (key: string, n: number) => {
    const entry = bibMap.get(key)
    return entry ? style.inText({ type: entry.type, fields: entry.fields, n }) : `[${n}]`
  }

  const result = text.replace(CITATION_GROUP_RE, (whole, inner: string) => {
    const items = parseCitationGroup(inner)
    if (!items) return whole

    if (items.length > 1) {
      const numbered = items.map((it) => ({ ...it, n: numberOf(it.key) }))
      const markers = numbered.map((it) => markerFor(it.key, it.n))
      const open = /^[[(]/.test(markers[0]) ? markers[0][0] : "["
      const close = open === "(" ? ")" : "]"
      const strip = (m: string) =>
        (m.startsWith(open) && m.endsWith(close) ? m.slice(1, -1) : m) as string
      const anyNote = numbered.some((it) => it.note)
      const links = numbered.map((it, i) => {
        const innerText = strip(markers[i]) + (it.note ? `, ${it.note}` : "")
        return linkFor(it.key, innerText)
      })
      const joined = `${open}${links.join(anyNote || !style.numbered ? "; " : ", ")}${close}`
      return style.numbered ? `<sup>${joined}</sup>` : joined
    }

    const { key, note } = items[0]
    const n = numberOf(key)
    const marker = markerFor(key, n)
    const noteStr = note ? `, ${esc(note)}` : ""
    // Numbered styles ride as superscript; author-year sits inline, which is
    // how those venues actually print it.
    const body = noteStr
      ? marker.replace(/([\])])?$/, "") +
        noteStr +
        (marker.endsWith("]") || marker.endsWith(")") ? marker.slice(-1) : "")
      : marker
    const link = linkFor(key, body)
    return style.numbered ? `<sup>${link}</sup>` : link
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
      if (parts.length >= 2 && parts[1].trim().length > 0)
        return `${parts[0]}, ${parts[1].trim()[0]}.`
      return parts[0]
    })
    .join("; ")
}

function formatEntry(entry: BibEntry, n: number, style: CiteStyle = CITE_STYLES.default): string {
  if (style.id !== "default") {
    const text = style.reference({ type: entry.type, fields: entry.fields, n })
    return [
      `<div class="bib-entry" id="bib-${esc(entry.key)}">`,
      style.numbered ? `<span class="bib-number">${n}.</span>` : "",
      `<span class="bib-content">${esc(text)}</span></div>`,
    ]
      .filter(Boolean)
      .join("\n")
  }
  return formatEntryDefault(entry, n)
}

function formatEntryDefault(entry: BibEntry, n: number): string {
  const f = entry.fields
  const authors = f.author ? formatAuthors(f.author) : "?"
  const year = f.year ? `(${f.year})` : ""
  const title = f.title ?? activeDocTerms().bibliography.untitled

  let source = ""
  if (entry.type === "article") {
    source = [f.journal, f.volume ? `vol. ${f.volume}` : "", f.pages ? `pp. ${f.pages}` : ""]
      .filter(Boolean)
      .join(", ")
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
  bibMap: Map<string, BibEntry>,
  style: CiteStyle = CITE_STYLES.default,
): string {
  if (citedKeys.length === 0) return ""
  const terms = activeDocTerms().bibliography
  const items = citedKeys
    .map((key, i) => {
      const entry = bibMap.get(key)
      if (!entry) {
        // Same grid parts as a found entry, so the text does not fall into
        // the narrow number column.
        const number = style.id === "default" ? `[${i + 1}]` : style.numbered ? `${i + 1}.` : ""
        return [
          `<div class="bib-entry bib-missing" id="bib-${esc(key)}">`,
          number ? `<span class="bib-number">${number}</span>` : "",
          `<span class="bib-content">${esc(terms.missing)}: <code>${esc(key)}</code></span></div>`,
        ]
          .filter(Boolean)
          .join("\n")
      }
      return formatEntry(entry, i + 1, style)
    })
    .join("\n")

  return `<div class="bibliography"><h2>${esc(terms.heading)}</h2>${items}</div>`
}

// ── LaTeX cite commands ───────────────────────────────────────────────────────

export function citationsToLatex(text: string): string {
  return text.replace(CITATION_GROUP_RE, (whole, inner: string) => {
    const items = parseCitationGroup(inner)
    return items ? `\\cite{${items.map((i) => i.key).join(",")}}` : whole
  })
}
