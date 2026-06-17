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
  proof:     { es: "Demostración", latex: "proof" },
  remark:    { es: "Observación",  latex: "remark" },
  note:      { es: "Nota",         latex: "note" },
  // Callout-style environments (no numbering, themed icon via CSS class)
  tip:       { es: "Consejo",      latex: "tip" },
  hint:      { es: "Pista",        latex: "hint" },
  info:      { es: "Información",  latex: "info" },
  warning:   { es: "Advertencia",  latex: "warning" },
  caution:   { es: "Precaución",   latex: "caution" },
  attention: { es: "Atención",     latex: "attention" },
  important: { es: "Importante",   latex: "important" },
  danger:    { es: "Peligro",      latex: "danger" },
  error:     { es: "Error",        latex: "error" },
  failure:   { es: "Fallo",        latex: "failure" },
  success:   { es: "Éxito",        latex: "success" },
  check:     { es: "Verificado",   latex: "check" },
  done:      { es: "Hecho",        latex: "done" },
  question:  { es: "Pregunta",     latex: "question" },
  help:      { es: "Ayuda",        latex: "help" },
  faq:       { es: "FAQ",          latex: "faq" },
  quote:     { es: "Cita",         latex: "quote" },
  cite:      { es: "Referencia",   latex: "cite" },
  abstract:  { es: "Resumen",      latex: "abstract" },
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

import { pseudocodeToFlowchart } from "./pseudocodeFlowchart"
import { renderTruthTableHTML } from "./truthTable"
import { renderGraphSVG } from "./graphViz"
import { renderPlotHTML } from "./functionPlot"
import { renderCommDiagSVG } from "./commDiag"

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Inline error box for a special block whose renderer throws — so a single
// malformed `:::plot` / `:::graph` / … shows an error in place instead of
// letting the exception bubble up and blank the ENTIRE preview pane.
function specialEnvError(kind: string, e: unknown): string {
  return `<pre class="math-error">Error in :::${kind} — ${escHtml(String(e))}</pre>`
}

// ── Mermaid SVG cache for `:::flowchart` ─────────────────────────────────────
// Pre-rendered SVGs keyed by their mermaid source. Populated by App.tsx after
// mermaid finishes; consumed below so subsequent re-renders embed the SVG
// inline (no flash of source code, no async wait, no GPU repaint loop).
const flowchartSvgCache = new Map<string, string>()
export function setFlowchartSvg(source: string, svg: string): void {
  flowchartSvgCache.set(source, svg)
}
export function clearFlowchartSvgCache(): void {
  flowchartSvgCache.clear()
}

// ── Excalidraw SVG cache for `:::excalidraw` ─────────────────────────────────
// Pre-rendered SVGs keyed by their base64 scene. The renderer is synchronous
// but Excalidraw's `exportToSvg` (and the 18MB engine it pulls) is async and
// lazy-loaded. App.tsx populates this cache off the main thread after a render;
// until then the block shows a "click to edit" placeholder. Mirrors the
// flowchart-cache pattern so re-renders embed the SVG inline (no async wait,
// no repaint loop).
const excalidrawSvgCache = new Map<string, string>()
export function setExcalidrawSvg(sceneB64: string, svg: string): void {
  excalidrawSvgCache.set(sceneB64, svg)
}
export function getExcalidrawSvg(sceneB64: string): string | undefined {
  return excalidrawSvgCache.get(sceneB64)
}
export function clearExcalidrawSvgCache(): void {
  excalidrawSvgCache.clear()
}

let excalidrawPlaceholderText = "Excalidraw — clic para editar"
export function setExcalidrawPlaceholderText(text: string): void {
  excalidrawPlaceholderText = text
}

function buildExcalidrawHTML(title: string, number: string, sceneB64: string): string {
  const header = title
    ? `Excalidraw ${number}: ${escHtml(title)}`
    : `Excalidraw ${number}`
  const safeB64 = escHtml(sceneB64)
  const cachedSvg = sceneB64 ? excalidrawSvgCache.get(sceneB64) : undefined
  const body = cachedSvg
    ? `<div class="excalidraw-canvas">${cachedSvg}</div>`
    : `<div class="excalidraw-placeholder">${escHtml(excalidrawPlaceholderText)}</div>`
  return [
    `<div class="excalidraw-block" data-excalidraw-scene="${safeB64}">`,
    `<div class="excalidraw-header"><span class="excalidraw-title">${header}</span>`,
    `<button class="excalidraw-edit" data-scene="${safeB64}" data-line="$LINE$" title="${escHtml(excalidrawPlaceholderText)}">✏</button>`,
    `</div>`,
    body,
    `</div>`,
  ].join("")
}

function buildPseudocodeHTML(title: string, number: string, content: string): string {
  const KEYWORDS = /\b(INPUT|OUTPUT|FOR|TO|DOWNTO|DO|END\s+FOR|WHILE|END\s+WHILE|IF|THEN|ELSE\s+IF|ELSE|END\s+IF|RETURN|FUNCTION|END\s+FUNCTION|PROCEDURE|END\s+PROCEDURE|ALGORITHM|REQUIRE|ENSURE|BEGIN|END|SWAP|REPEAT|UNTIL|BREAK|CONTINUE|PRINT|LET|SET)\b/g

  const lines = content.split("\n").filter(line => line !== undefined)
  let lineNum = 0

  const renderedLines = lines.map((line) => {
    if (!line.trim()) return `<div class="pc-line pc-empty"></div>`
    lineNum++
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0
    const indentLevel = Math.floor(indent / 2)
    const trimmed = escHtml(line.trim())
    const withKeywords = trimmed.replace(KEYWORDS, '<span class="pc-kw">$1</span>')
    return `<div class="pc-line" style="padding-left:${indentLevel * 1.5}em"><span class="pc-num">${lineNum}</span><span class="pc-content">${withKeywords}</span></div>`
  })

  const header = title
    ? `Algorithm ${number}: ${escHtml(title)}`
    : `Algorithm ${number}`

  const mermaidChart = pseudocodeToFlowchart(content)

  // Read the same cache used by `:::flowchart`. Without this, every preview
  // re-render re-emits a `<pre><code class="language-mermaid">` block, which
  // makes the mermaid effect re-run, bump `mermaidVersion`, recompute
  // `previewHtml`, and re-fire the effect — an infinite loop that pegs the
  // WebView at >100% CPU until it OOMs. With the cache hit, the second pass
  // emits a `<div class="mermaid-diagram">` (no `language-mermaid`), the
  // effect's "needs mermaid" gate goes false, and the loop terminates.
  const cachedSvg = flowchartSvgCache.get(mermaidChart)
  const sourceB64 = typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(mermaidChart)))
    : ""
  const flowchartBody = cachedSvg
    ? `<div class="mermaid-diagram" data-mermaid-source-b64="${sourceB64}">${cachedSvg}</div>`
    : `<pre data-mermaid-source-b64="${sourceB64}"><code class="language-mermaid">${escHtml(mermaidChart)}</code></pre>`

  return [
    `<div class="pseudocode-block">`,
    `<div class="pc-header">${header}</div>`,
    `<div class="pc-body">${renderedLines.join("")}</div>`,
    `<details class="pc-flowchart-section">`,
    `<summary class="pc-flowchart-toggle">Flowchart</summary>`,
    `<div class="pc-flowchart">${flowchartBody}</div>`,
    `</details>`,
    `</div>`,
  ].join("\n")
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
 *
 * Duplicate labels: the first occurrence keeps the canonical id (`env-<label>`),
 * subsequent occurrences get a suffix (`env-<label>-2`, `-3`, ...) so DOM ids
 * remain unique. References (`@thm:foo`) always resolve to the first one.
 */
export function extractEnvironments(
  text: string,
  renderFn: (inner: string) => string,
  rawSource?: string
): { text: string; slots: string[] } {
  const slots: string[] = []
  const labelOccurrences: Record<string, number> = {}

  // Resolve the source line of each block from the EDITOR's raw text so that
  // editor → preview click-sync targets the right place. `text` (the post-
  // preprocess input) has different line counts from `raw` because callouts
  // and display-math collapse to single-line placeholders. We look up each
  // env's opening line `:::name[title]` in `rawSource` (advancing a cursor
  // so multiple envs with identical openings still resolve in document order)
  // and fall back to the local-text line when raw isn't provided.
  const haveRaw = typeof rawSource === "string" && rawSource.length > 0
  let rawCursor = 0
  const lineOfInRaw = (opening: string): number => {
    const idx = rawSource!.indexOf(opening, rawCursor)
    if (idx === -1) return 1
    rawCursor = idx + opening.length
    return rawSource!.slice(0, idx).split("\n").length
  }
  const lineOfInText = (idx: number): number =>
    text.slice(0, idx).split("\n").length

  const wrapWithSourceLine = (html: string, line: number): string =>
    `<div class="env-wrap" data-source-line="${line}">${html}</div>`

  // Pre-pass: extract `:::code [language]` blocks before the generic ENV_RE.
  // The body must be preserved verbatim (HTML-escaped, no shorthand expansion,
  // no markdown formatting). Language goes after a SPACE, e.g. `:::code python`.
  // Supports `:::code` with no language (no class on <code>).
  const CODE_ENV_RE = /^:::code(?:[ \t]+(\S+))?[ \t]*\n([\s\S]*?)^:::[ \t]*$/gm
  let current = text.replace(CODE_ENV_RE, (_match, lang: string | undefined, body: string, offset: number) => {
    const opening = lang ? `:::code ${lang}` : `:::code`
    const srcLine = haveRaw ? lineOfInRaw(opening) : lineOfInText(offset)
    // Body is verbatim — preserve the trailing newline that closes its last line
    // by NOT trimming. But strip the single trailing newline produced by `\n:::`.
    const verbatim = body.endsWith("\n") ? body.slice(0, -1) : body
    const cls = lang ? ` class="language-${escHtml(lang)}"` : ""
    const html = `<pre><code${cls}>${escHtml(verbatim)}</code></pre>`
    slots.push(wrapWithSourceLine(html, srcLine))
    return `\x02ENV${slots.length - 1}\x03`
  })

  let changed = true
  while (changed) {
    const before = current
    current = current.replace(ENV_RE(), (match, size, rawName, title, label, content, offset: number) => {
      const envName = rawName.toLowerCase()
      // Build the exact opening as it appears in source: `:::[size ]name[title][{#label}]`
      const sizeStr = size ? `${size} ` : ""
      const titleStr = title !== undefined ? `[${title}]` : ""
      const labelStr = label !== undefined ? `{#${label}}` : ""
      const opening = `:::${sizeStr}${rawName}${titleStr}${labelStr}`
      const srcLine = haveRaw ? lineOfInRaw(opening) : lineOfInText(offset)

      if (envName === "pseudocode") {
        counters["pseudocode"] = (counters["pseudocode"] ?? 0) + 1
        const pcNumber = String(counters["pseudocode"])
        let html: string
        try { html = buildPseudocodeHTML(title ?? "", pcNumber, content.trim()) }
        catch (e) { html = specialEnvError("pseudocode", e) }
        slots.push(wrapWithSourceLine(html, srcLine))
        return `\x02ENV${slots.length - 1}\x03`
      }

      if (envName === "flowchart") {
        counters["flowchart"] = (counters["flowchart"] ?? 0) + 1
        const fcNumber = String(counters["flowchart"])
        let html: string
        try {
        const mermaidChart = pseudocodeToFlowchart(content.trim())
        const headerHtml = title
          ? `<div class="flowchart-header"><span class="flowchart-title">Flowchart ${fcNumber}: ${escHtml(title)}</span></div>`
          : `<div class="flowchart-header"><span class="flowchart-title">Flowchart ${fcNumber}</span></div>`
        // Cache hit: embed pre-rendered SVG inline so the next React paint
        // shows the diagram immediately — no flash of source, no async wait.
        // The source is base64-encoded into a data attribute so the mermaid
        // effect can re-render via the toolbar button if the user requests it.
        const cachedSvg = flowchartSvgCache.get(mermaidChart)
        const sourceB64 = typeof btoa !== "undefined"
          ? btoa(unescape(encodeURIComponent(mermaidChart)))
          : ""
        const body = cachedSvg
          ? `<div class="mermaid-diagram" data-mermaid-source-b64="${sourceB64}">${cachedSvg}</div>`
          : `<pre data-mermaid-source-b64="${sourceB64}"><code class="language-mermaid">${escHtml(mermaidChart)}</code></pre>`
        html = [
          `<div class="flowchart-block">`,
          headerHtml,
          body,
          `</div>`,
        ].join("")
        } catch (e) { html = specialEnvError("flowchart", e) }
        slots.push(wrapWithSourceLine(html, srcLine))
        return `\x02ENV${slots.length - 1}\x03`
      }

      if (envName === "truth") {
        counters["truth"] = (counters["truth"] ?? 0) + 1
        let html: string
        try { html = renderTruthTableHTML(title ?? "", content.trim(), String(counters["truth"])) }
        catch (e) { html = specialEnvError("truth", e) }
        slots.push(wrapWithSourceLine(html, srcLine))
        return `\x02ENV${slots.length - 1}\x03`
      }

      if (envName === "graph") {
        counters["graph"] = (counters["graph"] ?? 0) + 1
        let html: string
        try { html = renderGraphSVG(title ?? "", content.trim(), String(counters["graph"])) }
        catch (e) { html = specialEnvError("graph", e) }
        slots.push(wrapWithSourceLine(html, srcLine))
        return `\x02ENV${slots.length - 1}\x03`
      }

      if (envName === "plot") {
        counters["plot"] = (counters["plot"] ?? 0) + 1
        let html: string
        try { html = renderPlotHTML(title ?? "", content.trim(), String(counters["plot"])) }
        catch (e) { html = specialEnvError("plot", e) }
        slots.push(wrapWithSourceLine(html, srcLine))
        return `\x02ENV${slots.length - 1}\x03`
      }

      if (envName === "excalidraw") {
        counters["excalidraw"] = (counters["excalidraw"] ?? 0) + 1
        let html: string
        try {
          // Body is a single line of base64 JSON (may be empty for a fresh block).
          const sceneB64 = content.replace(/\s+/g, "")
          html = buildExcalidrawHTML(title ?? "", String(counters["excalidraw"]), sceneB64)
          // Embed the source line so App can replace exactly this block's body.
          html = html.replace("$LINE$", String(srcLine))
        } catch (e) { html = specialEnvError("excalidraw", e) }
        slots.push(wrapWithSourceLine(html, srcLine))
        return `\x02ENV${slots.length - 1}\x03`
      }

      if (envName === "commdiag") {
        counters["commdiag"] = (counters["commdiag"] ?? 0) + 1
        let html: string
        try { html = renderCommDiagSVG(title ?? "", content.trim(), String(counters["commdiag"])) }
        catch (e) { html = specialEnvError("commdiag", e) }
        slots.push(wrapWithSourceLine(html, srcLine))
        return `\x02ENV${slots.length - 1}\x03`
      }

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

      let renderedLabel: string | undefined = label ?? undefined
      if (label) {
        const seen = (labelOccurrences[label] ?? 0) + 1
        labelOccurrences[label] = seen
        renderedLabel = seen === 1 ? label : `${label}-${seen}`
      }

      const html = buildEnvHTML(envName, title ?? "", number, innerHTML, size ?? undefined, renderedLabel)
      slots.push(wrapWithSourceLine(html, srcLine))
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
    if (label) {
      // Preserve the first occurrence so references stay stable; warn on dupes.
      if (labels.has(label)) {
        console.warn(`Duplicate environment label: ${label}`)
      } else {
        labels.set(label, { kind: ALL_ENVS[envName].es, number, label })
      }
    }
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
