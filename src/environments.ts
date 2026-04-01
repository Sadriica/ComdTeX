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

// Matches :::envname[optional title]\ncontent\n:::
// Also supports size prefix: :::sm envname[title] or :::lg envname[title]
const ENV_RE = () => /^:::(?:(sm|lg)\s+)?([\w]+)(?:\[([^\]]*)\])?\s*\n([\s\S]*?)^:::\s*$/gm

// ── HTML rendering ────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function buildEnvHTML(
  envName: string,
  title: string,
  number: string,
  innerHTML: string,
  size?: string
): string {
  const info = ALL_ENVS[envName]
  if (!info) return innerHTML

  const isProof = envName === "proof"
  const safeTitle = escHtml(title)
  const label = [info.es, number, safeTitle ? `(${safeTitle})` : ""].filter(Boolean).join(" ")
  const sizeClass = size ? ` math-env-${size}` : ""

  return [
    `<div class="math-env math-env-${envName}${sizeClass}">`,
    `<div class="math-env-header"><span class="math-env-label">${label}${isProof ? "" : "."}</span></div>`,
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
    current = current.replace(ENV_RE(), (match, size, rawName, title, content) => {
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
      const html = buildEnvHTML(envName, title ?? "", number, innerHTML, size ?? undefined)
      slots.push(html)
      return `\x02ENV${slots.length - 1}\x03`
    })
    changed = current !== before
  }

  return { text: current, slots }
}

// ── LaTeX export helpers ──────────────────────────────────────────────────────

export function envToLatex(envName: string, title: string, content: string): string {
  const info = ALL_ENVS[envName]
  if (!info) return content

  const optTitle = title ? `[${title}]` : ""
  const latex = info.latex

  if (latex === "proof") {
    // amsthm provides proof natively
    return `\\begin{proof}${optTitle}\n${content}\n\\end{proof}`
  }

  return `\\begin{${latex}}${optTitle}\n${content}\n\\end{${latex}}`
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
