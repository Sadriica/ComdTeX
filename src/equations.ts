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

const DISPLAY_MATH_RE = /\$\$([\s\S]+?)\$\$(?:\s*\{#([\w:.-]+)\})?/g

export function prescanEquations(text: string): Map<string, number> {
  const labels = new Map<string, number>()
  let n = 0
  DISPLAY_MATH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DISPLAY_MATH_RE.exec(text)) !== null) {
    n++
    if (m[2]) labels.set(m[2], n)
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
