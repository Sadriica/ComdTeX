/**
 * Table numbering and cross-references.
 *
 * Syntax (both forms are accepted):
 *   | A | B |
 *   |---|---|
 *   | 1 | 2 |
 *   {#tbl:data}
 *
 *   | A | B |
 *   |---|---|
 *   | 1 | 2 |
 *
 *   {#tbl:data}
 *
 * Reference:
 *   @tbl:data -> "Tabla N", linking to the table's `#tbl-data` anchor.
 *
 * Note on the two forms: with no blank line, markdown-it treats the label as a
 * lazy continuation of the table and folds it into a trailing row; with a blank
 * line it renders as its own `<p>`. `wrapTables` consumes both shapes, and
 * `prescanTables` recognises both sources, so the two passes stay in agreement.
 */
import { stripCodeFences } from "./equations"
import { activeDocTerms } from "./docLang"
import { SUPPLEMENT_HTML_SRC, SUPPLEMENT_LINE_RE, supplementNumber } from "./supplement"

/** A table's printed number: `2` in the main text, `"S2"` after the supplement marker. */
export type TblNumber = number | string

const TABLE_ROW_RE = /^\s*\|.+\|\s*$/
const TABLE_DELIM_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/
const LABEL_LINE_RE = /^\s*\{#tbl:([\w:.-]+)\}\s*$/

/** Canonical anchor id for a table label/number (`tbl:data` | `data` -> `tbl-data`). */
function tableAnchorId(labelOrNumber: string): string {
  return `tbl-${labelOrNumber.replace(/^tbl:/, "")}`
}

/**
 * First pass: number every pipe table in source order and collect `{#tbl:...}`
 * labels. Keys include the `tbl:` prefix.
 *
 * Fenced code is stripped first so a pipe table written inside a code sample is
 * not counted; `wrapTables` only ever sees rendered `<table>` elements, so the
 * two passes must agree or `@tbl:` refs resolve to the wrong number.
 */
export function prescanTables(text: string): Map<string, TblNumber> {
  const labels = new Map<string, TblNumber>()
  const lines = stripCodeFences(text).split("\n")
  let count = 0
  let inSupplement = false

  for (let i = 0; i < lines.length; i++) {
    if (SUPPLEMENT_LINE_RE.test(lines[i])) {
      if (!inSupplement) {
        inSupplement = true
        count = 0
      }
      continue
    }
    if (!TABLE_ROW_RE.test(lines[i])) continue
    if (!TABLE_DELIM_RE.test(lines[i + 1] ?? "")) continue
    count++
    while (i + 1 < lines.length && TABLE_ROW_RE.test(lines[i + 1])) i++

    // Accept the label immediately after the last row, or after a single blank
    // line. Anything further away is ordinary prose, not a table label.
    let labelMatch = LABEL_LINE_RE.exec(lines[i + 1] ?? "")
    if (!labelMatch && (lines[i + 1] ?? "").trim() === "") {
      labelMatch = LABEL_LINE_RE.exec(lines[i + 2] ?? "")
    }
    if (labelMatch) labels.set(`tbl:${labelMatch[1]}`, supplementNumber(count, inSupplement))
  }

  return labels
}

export function resolveTableRefs(text: string, labels: Map<string, TblNumber>): string {
  const word = activeDocTerms().table
  return text.replace(/@tbl:([\w:-]+(?:\.\w+)*)/g, (_full, ref) => {
    if (/^\d+$/.test(ref)) {
      return `<a class="tbl-ref" href="#${tableAnchorId(ref)}">${word} ${ref}</a>`
    }
    const n = labels.get(`tbl:${ref}`)
    return n != null
      ? `<a class="tbl-ref" href="#${tableAnchorId(ref)}">${word} ${n}</a>`
      : `<span class="tbl-ref-broken">${word} (?)</span>`
  })
}

// A `{#tbl:...}` label that markdown-it folded into the table as a lazy
// continuation row: first cell holds the label, any remaining cells are empty.
const LAZY_LABEL_ROW_RE =
  /\s*<tr>\s*<td[^>]*>\s*\{#tbl:([\w:.-]+)\}\s*<\/td>(?:\s*<td[^>]*>\s*<\/td>)*\s*<\/tr>(?=\s*(?:<\/tbody>)?\s*$)/

const TABLE_OR_MARKER_RE = new RegExp(
  String.raw`(${SUPPLEMENT_HTML_SRC})|<table>([\s\S]*?)<\/table>(?:\s*<p>\{#tbl:([\w:.-]+)\}<\/p>)?`,
  "gi",
)

export function wrapTables(html: string, labels: Map<string, TblNumber>): string {
  const word = activeDocTerms().table
  let n = 0
  let inSupplement = false
  return html.replace(
    TABLE_OR_MARKER_RE,
    (match, marker: string | undefined, tableInner: string, paraLabel: string | undefined) => {
      if (marker !== undefined) {
        if (!inSupplement) {
          inSupplement = true
          n = 0
        }
        return match
      }
      n++

      // The no-blank-line form: pull the label out of the trailing row and drop
      // the row, so it never surfaces as table content.
      let label = paraLabel
      const lazy = LAZY_LABEL_ROW_RE.exec(tableInner)
      if (lazy) {
        tableInner = tableInner.replace(LAZY_LABEL_ROW_RE, "")
        label ??= lazy[1]
      }

      const printed = supplementNumber(n, inSupplement)
      const tableNumber = label ? (labels.get(`tbl:${label}`) ?? printed) : printed
      const id = tableAnchorId(label ?? String(tableNumber))
      return `<figure class="tbl-block" id="${id}">
<table>${tableInner}</table>
<figcaption><span class="tbl-number">${word} ${tableNumber}</span></figcaption>
</figure>`
    },
  )
}
