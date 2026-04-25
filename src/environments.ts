/**
 * LaTeX-style environments for ComdTeX.
 *
 * Syntax:
 *   :::theorem[optional title]
 *   Content with markdown and $math$.
 *   :::
 *
 * Numbered: theorem, lemma, corollary, proposition, definition, example, exercise
 * Unnumbered: proof (adds □), remark, note
 *
 * Folding:
 *   :::folded[optional title]
 *   Collapsed content.
 *   :::
 */

export const NUMBERED_ENVS: Record<string, { es: string; latex: string }> = {
  theorem:     { es: "Teorema",     latex: "theorem" },
  lemma:       { es: "Lema",        latex: "lemma" },
  corollary:   { es: "Corolario",   latex: "corollary" },
  proposition: { es: "Proposición", latex: "proposition" },
  definition:  { es: "Definición",  latex: "definition" },
  example:     { es: "Ejemplo",     latex: "example" },
  exercise:    { es: "Ejercicio",   latex: "exercise" },
}

export const UNNUMBERED_ENVS: Record<string, { es: string; latex: string }> = {
  proof:  { es: "Demostración", latex: "proof" },
  remark: { es: "Observación",  latex: "remark" },
  note:   { es: "Nota",         latex: "note" },
}

export const FOLDED_ENV: { es: string; latex: string } = { es: "Colapsado", latex: "folded" }

export const ALL_ENVS: Record<string, { es: string; latex: string }> = {
  ...NUMBERED_ENVS,
  ...UNNUMBERED_ENVS,
}

export const ENV_NAMES = Object.keys(ALL_ENVS)

// ── Per-render counters ───────────────────────────────────────────────────────

let counters: Record<string, number> = {}

export function resetEnvCounters() {
  counters = {}
}

// ── ENV regex ─────────────────────────────────────────────────────────────────

// Matches :::envname[optional title]{#thm:label}\ncontent\n:::
// Also supports size prefix: :::sm envname[title]{#thm:label}
// Also supports folded: :::folded[title]\ncontent\n:::
const ENV_RE = () => /^:::(?:(sm|lg)\s+)?([\w]+)(?:\[([^\]]*)\])?(?:\s*\{#([\w:.-]+)\})?\s*\n([\s\S]*?)^:::\s*$/gm

// ── HTML rendering ────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function buildEnvHTML(
  envName: string,
  title: string,
  number: string,
  innerHTML: string,
  size?: string,
  label?: string,
): string {
  // Handle folded environment
  if (envName === "folded") {
    return [
      `<div class="math-env math-env-folded">`,
      `<div class="math-env-header math-env-folded-header" onclick="this.parentElement.querySelector('.math-env-body').classList.toggle('folded'); this.classList.toggle('folded')">`,
      `<span class="math-env-label">${escHtml(title) || "Contenido colapsado"}</span>`,
      `<span class="math-env-folded-toggle">▸</span>`,
      `</div>`,
      `<div class="math-env-body folded">${innerHTML}</div>`,
      `</div>`,
    ].join("\n")
  }

  const info = ALL_ENVS[envName]
  if (!info) return innerHTML

  const isProof = envName === "proof"
  const safeTitle = escHtml(title)
  const displayLabel = [info.es, number, safeTitle ? `(${safeTitle})` : ""].filter(Boolean).join(" ")
  const sizeClass = size ? ` math-env-${size}` : ""
  const idAttr = label ? ` id="env-${escHtml(label)}"` : ""

  return [
    `<div class="math-env math-env-${envName}${sizeClass}"${idAttr}>`,
    `<div class="math-env-header"><span class="math-env-label">${displayLabel}${isProof ? "" : "."}</span>${label ? `<span class="math-env-anchor">${escHtml(label)}</span>` : ""}</div>`,
    `<div class="math-env-body">${innerHTML}</div>`,
    isProof ? `<div class="math-env-qed">□</div>` : "",
    `</div>`,
  ].filter(Boolean).join("\n")
}

/**
 * Extracts :::env blocks from text, renders their inner content via `renderFn`,
 * and returns the text with `\x02ENVn\x03` placeholders + a map to restore them.
 *
 * Call resetEnvCounters() before the first (top-level) call.
 */
export function extractEnvironments(
  text: string,
  renderFn: (inner: string) => string
): { text: string; slots: string[] } {
  const slots: string[] = []

  // Process iteratively from innermost outward to support nested environments
  let current = text
  let changed = true
  while (changed) {
    const before = current
    current = current.replace(ENV_RE(), (match, size, rawName, title, label, content) => {
      const envName = rawName.toLowerCase()
      if (!ALL_ENVS[envName]) return match

      let number = ""
      if (NUMBERED_ENVS[envName]) {
        counters[envName] = (counters[envName] ?? 0) + 1
        number = String(counters[envName])
      }

      let innerHTML: string
      try { innerHTML = renderFn(content.trim()) }
      catch (e) {
        const msg = String(e).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        innerHTML = `<pre class="math-error">Error in environment: ${msg}</pre>`
      }
      const html = buildEnvHTML(envName, title ?? "", number, innerHTML, size ?? undefined, label ?? undefined)
      slots.push(html)
      return `\x02ENV${slots.length - 1}\x03`
    })
    changed = current !== before
  }

  return { text: current, slots }
}

const ENV_REF_PREFIXES: Record<string, string> = {
  thm: "Teorema",
  theorem: "Teorema",
  lem: "Lema",
  lemma: "Lema",
  cor: "Corolario",
  prop: "Proposición",
  def: "Definición",
  definition: "Definición",
  ex: "Ejemplo",
  example: "Ejemplo",
  exc: "Ejercicio",
  exercise: "Ejercicio",
}

export interface EnvironmentReference {
  kind: string
  number: string
  label: string
}

export function prescanEnvironmentLabels(text: string): Map<string, EnvironmentReference> {
  const labels = new Map<string, EnvironmentReference>()
  const localCounters: Record<string, number> = {}
  const re = ENV_RE()
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const envName = match[2].toLowerCase()
    const label = match[4]
    if (!ALL_ENVS[envName]) continue
    let number = ""
    if (NUMBERED_ENVS[envName]) {
      localCounters[envName] = (localCounters[envName] ?? 0) + 1
      number = String(localCounters[envName])
    }
    if (label) labels.set(label, { kind: ALL_ENVS[envName].es, number, label })
  }
  return labels
}

export function resolveEnvironmentRefs(text: string, labels: Map<string, EnvironmentReference>): string {
  return text.replace(/@([a-zA-Z]+):([\w.-]+)/g, (full, prefix, id) => {
    if (!ENV_REF_PREFIXES[prefix]) return full
    const label = `${prefix}:${id}`
    const ref = labels.get(label)
    if (!ref) return `<span class="env-ref-broken">${ENV_REF_PREFIXES[prefix]} (?)</span>`
    const display = ref.number ? `${ref.kind} ${ref.number}` : ref.kind
    return `<a class="env-ref" href="#env-${label}">${display}</a>`
  })
}

// ── LaTeX export helpers ──────────────────────────────────────────────────────

export function envToLatex(envName: string, title: string, content: string, label?: string): string {
  const info = ALL_ENVS[envName]
  if (!info) return content

  const optTitle = title ? `[${title}]` : ""
  const latex = info.latex
  const labelLine = label ? `\n\\label{${label}}` : ""

  if (latex === "proof") {
    // amsthm provides proof natively
    return `\\begin{proof}${optTitle}${labelLine}\n${content}\n\\end{proof}`
  }

  return `\\begin{${latex}}${optTitle}${labelLine}\n${content}\n\\end{${latex}}`
}

/** Build the \newtheorem declarations for the preamble */
export function buildTheoremPreamble(): string {
  const lines: string[] = [
    "\\usepackage{amsthm}",
    "\\newtheorem{theorem}{Teorema}",
    "\\newtheorem{lemma}[theorem]{Lema}",
    "\\newtheorem{corollary}[theorem]{Corolario}",
    "\\newtheorem{proposition}[theorem]{Proposición}",
    "\\newtheorem*{definition}{Definición}",
    "\\newtheorem*{example}{Ejemplo}",
    "\\newtheorem*{exercise}{Ejercicio}",
    "\\newtheorem*{remark}{Observación}",
    "\\newtheorem*{note}{Nota}",
  ]
  return lines.join("\n")
}
