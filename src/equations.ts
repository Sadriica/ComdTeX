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
let eqLabels = new Map<string, number>()

export function resetEqCounters() {
  eqCounter = 0
  eqLabels = new Map()
}

export function nextEqNumber(): number {
  return ++eqCounter
}

export function registerEqLabel(label: string, n: number) {
  eqLabels.set(label, n)
}

export function resolveEqRef(ref: string): number | null {
  if (/^\d+$/.test(ref)) return parseInt(ref)
  return eqLabels.get(ref) ?? null
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
  return text.replace(/@eq:([\w:.-]+)/g, (_, ref) => {
    const n = /^\d+$/.test(ref) ? parseInt(ref) : labels.get(ref)
    return n != null
      ? `<span class="eq-ref">(${n})</span>`
      : `<span class="eq-ref-broken">(?)</span>`
  })
}

// ── Wrap a rendered KaTeX display block with number ───────────────────────────

export function wrapNumbered(katexHtml: string, n: number): string {
  return `<div class="eq-block">${katexHtml}<span class="eq-number">(${n})</span></div>`
}
