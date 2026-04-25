/**
 * Table numbering and cross-references.
 *
 * Syntax:
 *   | A | B |
 *   |---|---|
 *   | 1 | 2 |
 *   {#tbl:data}
 *
 * Reference:
 *   @tbl:data -> "Tabla N"
 */

export function prescanTables(text: string): Map<string, number> {
  const labels = new Map<string, number>()
  const lines = text.split("\n")
  let count = 0

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|.+\|\s*$/.test(lines[i])) continue
    if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1] ?? "")) continue
    count++
    while (i + 1 < lines.length && /^\s*\|.+\|\s*$/.test(lines[i + 1])) i++
    const labelMatch = /^\s*\{#(tbl:[\w:.-]+)\}\s*$/.exec(lines[i + 1] ?? "")
    if (labelMatch) labels.set(labelMatch[1], count)
  }

  return labels
}

export function resolveTableRefs(text: string, labels: Map<string, number>): string {
  return text.replace(/@tbl:([\w:-]+(?:\.\w+)*)/g, (_full, ref) => {
    if (/^\d+$/.test(ref)) return `<a class="tbl-ref" href="#tbl-${ref}">Tabla ${ref}</a>`
    const n = labels.get(`tbl:${ref}`)
    return n != null
      ? `<a class="tbl-ref" href="#tbl-${ref}">Tabla ${n}</a>`
      : `<span class="tbl-ref-broken">Tabla (?)</span>`
  })
}

export function wrapTables(html: string, labels: Map<string, number>): string {
  let n = 0
  return html.replace(
    /<table>([\s\S]*?)<\/table>(?:\s*<p>\{#(tbl:[\w:.-]+)\}<\/p>)?/g,
    (_match, tableInner, label) => {
      n++
      const tableNumber = label ? (labels.get(label) ?? n) : n
      const id = label ? `tbl-${label}` : `tbl-${tableNumber}`
      return `<figure class="tbl-block" id="${id}">
<table>${tableInner}</table>
<figcaption><span class="tbl-number">Tabla ${tableNumber}</span></figcaption>
</figure>`
    },
  )
}
