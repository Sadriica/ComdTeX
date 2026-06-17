/**
 * Equation numbering for display math.
 *
 * Syntax:
 *   $$E = mc^2$$ {#eq:energy}   → numbered + labeled
 *   $$x^2 + y^2 = r^2$$         → auto-numbered only
 *   See @eq:energy or @eq:1     → inline reference → (N)
 */

// ── Per-render state ──────────────────────────────────────────────────────────

let eqCounter = 0

export function resetEqCounters() {
  eqCounter = 0
}

export function nextEqNumber(): number {
  return ++eqCounter
}

// ── First pass: build label → number map ──────────────────────────────────────

// Match a display-math block, optionally followed by a `{#label}` annotation.
// Capture groups:
//   1: math expression (between the $$ delimiters)
//   2: label (without leading `#`), if present
// IMPORTANT: keep this regex shape in sync with the render-time consumer in
// `renderer.ts` so prescan and render strip the same `{#label}` suffix.
export const DISPLAY_MATH_RE = /\$\$([\s\S]+?)\$\$(?:\s*\{#([\w:.-]+)\})?/g

// Match inline math followed by a REQUIRED `{#label}` annotation. Inline math
// without a label is normal text and should NOT be auto-numbered.
//   1: inline math expression (between the single $ delimiters)
//   2: label (without leading `#`)
export const INLINE_LABELED_MATH_RE = /\$([^\$\n]+?)\$\s*\{#([\w:.-]+)\}/g

// Combined regex used by prescan and pre-render to walk display + labeled
// inline math in textual order. Groups:
//   1: display body, 2: display label (optional)
//   3: inline body,  4: inline label (required for inline)
export const NUMBERED_MATH_RE =
  /\$\$([\s\S]+?)\$\$(?:\s*\{#([\w:.-]+)\})?|\$([^\$\n]+?)\$\s*\{#([\w:.-]+)\}/g

export function stripCodeFences(text: string): string {
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, "")
}

/**
 * Replace inline-code spans (`...`, ``...``) with whitespace placeholders so a
 * subsequent regex pass does not match `$$...$$` or `$..$ {#eq:label}`
 * patterns that appear inside a Markdown code span. Length is preserved so
 * line/column positions are unaffected.
 */
export function blankInlineCode(text: string): string {
  return text.replace(/(`+)([^`\n]*?)\1/g, (m) => " ".repeat(m.length))
}

export function prescanEquations(text: string): Map<string, number> {
  const labels = new Map<string, number>()
  let n = 0
  const stripped = blankInlineCode(stripCodeFences(text))
  NUMBERED_MATH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUMBERED_MATH_RE.exec(stripped)) !== null) {
    n++
    const label = m[2] ?? m[4]
    if (label) labels.set(label, n)
  }
  return labels
}

// ── Replace @eq:ref references in text ───────────────────────────────────────

export function resolveEqRefs(text: string, labels: Map<string, number>): string {
  // Regex: dots only allowed mid-label (e.g. eq:thm.1), not trailing punctuation
  return text.replace(/@eq:([\w:-]+(?:\.\w+)*)/g, (_, ref) => {
    // prescanEquations stores keys with the full "eq:" prefix
    const n = /^\d+$/.test(ref) ? parseInt(ref) : labels.get(`eq:${ref}`)
    return n != null
      ? `<span class="eq-ref">(${n})</span>`
      : `<span class="eq-ref-broken">(?)</span>`
  })
}

// ── Wrap a rendered KaTeX display block with number ───────────────────────────

export function wrapNumbered(katexHtml: string, n: number): string {
  return `<div class="eq-block">${katexHtml}<span class="eq-number">(${n})</span></div>`
}

/** Inline numbered math: keeps the math inline but appends a `(N)` marker. */
export function wrapInlineNumbered(katexHtml: string, n: number): string {
  return `<span class="eq-inline">${katexHtml}<span class="eq-number-inline">(${n})</span></span>`
}
