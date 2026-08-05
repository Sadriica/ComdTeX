/**
 * Figure numbering and cross-references for ComdTeX.
 *
 * Syntax:
 *   ![Caption text](image.png){#fig:label}     : labeled figure
 *   ![Caption text](image.png)                  : unlabeled figure (still numbered)
 *
 * Reference:
 *   @fig:label  →  "Figura N" link
 *   @fig:1      →  "Figura 1" (direct numeric)
 */
import { blankInlineCode, stripCodeFences } from "./equations"

let figCounter = 0
const figLabels = new Map<string, number>()

export function resetFigCounters(): void {
  figCounter = 0
  figLabels.clear()
}

export function nextFigNumber(): number {
  return ++figCounter
}

/**
 * First pass: scan for all figure labels and assign sequential numbers.
 * Returns a Map<label, number> including the "fig:" prefix.
 */
export function prescanFigures(text: string): Map<string, number> {
  const labels = new Map<string, number>()
  let counter = 0

  // Strip fenced + inline code first so an `![...](...)` written inside a code
  // sample isn't counted: `wrapFigures` only counts rendered <img> tags, which
  // never come from code blocks, so the two passes must agree or `@fig:` refs
  // resolve to the wrong number.
  const stripped = blankInlineCode(stripCodeFences(text))

  // Match: ![...](...)  optionally followed by {#fig:label}
  const re = /!\[[^\]]*\]\([^)]*\)(?:\s*\{#(fig:[\w:.-]+)\})?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped)) !== null) {
    counter++
    if (m[1]) labels.set(m[1], counter)
  }

  return labels
}

/**
 * Replace `@fig:label` references in HTML text.
 * `@fig:1` style numeric refs are always resolved to "Figura N".
 */
export function resolveFigRefs(
  text: string,
  labels: Map<string, number>,
): string {
  return text.replace(/@fig:([\w:-]+(?:\.\w+)*)/g, (_full, ref) => {
    // Direct numeric reference
    if (/^\d+$/.test(ref)) {
      return `<a class="fig-ref" href="#${figureAnchorId(ref)}">Figura ${ref}</a>`
    }
    const n = labels.get(`fig:${ref}`)
    if (n !== undefined) {
      return `<a class="fig-ref" href="#${figureAnchorId(ref)}">Figura ${n}</a>`
    }
    return `<span class="fig-ref-broken">Figura (?)</span>`
  })
}

/** Canonical anchor id for a figure label/number (`fig:map` | `map` -> `fig-map`). */
function figureAnchorId(labelOrNumber: string): string {
  return `fig-${labelOrNumber.replace(/^fig:/, "")}`
}

/**
 * Transform `![caption](src){#fig:label}` and `![caption](src)` into
 * a figure block with number and caption. Called during HTML post-processing.
 */
const FIG_LABEL_TITLE_RE = /\s*title="fig-label:(fig:[\w:.-]+)"/

export function wrapFigures(html: string, labels: Map<string, number>): string {
  // Reset a local counter for this pass
  let n = 0

  return html.replace(
    /<img([^>]*?)alt="([^"]*)"([^>]*?)>/g,
    (_match, before: string, alt: string, after: string) => {
      n++
      // `preprocessFigureLabels` smuggles the label through markdown-it in the
      // title slot as `title="fig-label:fig:name"`. Recover it, then strip the
      // attribute so the label never shows up as a browser tooltip.
      const labelMatch = FIG_LABEL_TITLE_RE.exec(before + after)
      const label = labelMatch ? labelMatch[1] : null
      if (label) {
        before = before.replace(FIG_LABEL_TITLE_RE, "")
        after = after.replace(FIG_LABEL_TITLE_RE, "")
      }
      const figNum = label ? (labels.get(label) ?? n) : n
      const id = figureAnchorId(label ?? String(figNum))
      const escapedAlt = alt.replace(/</g, "&lt;").replace(/>/g, "&gt;")

      return `<figure class="fig-block" id="${id}">
  <img${before}alt="${alt}"${after}>
  ${escapedAlt ? `<figcaption><span class="fig-number">Figura ${figNum}.</span> ${escapedAlt}</figcaption>` : `<figcaption><span class="fig-number">Figura ${figNum}</span></figcaption>`}
</figure>`
    },
  )
}

/**
 * Pre-process markdown text to embed fig labels as data attributes on img tags
 * before markdown-it renders them, so `wrapFigures` can retrieve them.
 *
 * `![caption](src){#fig:label}` → `![caption](src "data-fig-label=fig:label")`
 * (Abuse the title slot since markdown-it exposes it as an attribute.)
 */
export function preprocessFigureLabels(text: string): string {
  return text.replace(
    /!\[([^\]]*)\]\(([^)]*)\)\s*\{#(fig:[\w:.-]+)\}/g,
    (_match, alt, src, label) => `![${alt}](${src} "fig-label:${label}")`,
  )
}
