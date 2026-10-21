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

import { activeDocLanguage, activeDocTerms, envTitle, type DocLang } from "./docLang"

export const NUMBERED_ENVS: Record<string, { es: string; latex: string }> = {
  theorem: { es: "Teorema", latex: "theorem" },
  lemma: { es: "Lema", latex: "lemma" },
  corollary: { es: "Corolario", latex: "corollary" },
  proposition: { es: "Proposición", latex: "proposition" },
  definition: { es: "Definición", latex: "definition" },
  example: { es: "Ejemplo", latex: "example" },
  exercise: { es: "Ejercicio", latex: "exercise" },
}

export const UNNUMBERED_ENVS: Record<string, { es: string; latex: string }> = {
  proof: { es: "Demostración", latex: "proof" },
  remark: { es: "Observación", latex: "remark" },
  note: { es: "Nota", latex: "note" },
  // Callout-style environments (no numbering, themed icon via CSS class)
  tip: { es: "Consejo", latex: "tip" },
  hint: { es: "Pista", latex: "hint" },
  info: { es: "Información", latex: "info" },
  warning: { es: "Advertencia", latex: "warning" },
  caution: { es: "Precaución", latex: "caution" },
  attention: { es: "Atención", latex: "attention" },
  important: { es: "Importante", latex: "important" },
  danger: { es: "Peligro", latex: "danger" },
  error: { es: "Error", latex: "error" },
  failure: { es: "Fallo", latex: "failure" },
  success: { es: "Éxito", latex: "success" },
  check: { es: "Verificado", latex: "check" },
  done: { es: "Hecho", latex: "done" },
  question: { es: "Pregunta", latex: "question" },
  help: { es: "Ayuda", latex: "help" },
  faq: { es: "FAQ", latex: "faq" },
  quote: { es: "Cita", latex: "quote" },
  cite: { es: "Referencia", latex: "cite" },
  abstract: { es: "Resumen", latex: "abstract" },
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
const ENV_RE = () =>
  /^:::(?:(sm|lg)\s+)?([\w]+)(?:\[([^\]]*)\])?(?:\s*\{#([\w:.-]+)\})?\s*\n([\s\S]*?)^:::\s*$/gm

// ── HTML rendering ────────────────────────────────────────────────────────────

import { pseudocodeToFlowchart } from "./pseudocodeFlowchart"
import { renderTruthTableHTML } from "./truthTable"
import { renderGraphSVG } from "./graphViz"
import { renderPlotHTML } from "./functionPlot"
import { renderCommDiagSVG } from "./commDiag"

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Inline error box for a special block whose renderer throws, so a single
// malformed `:::plot` / `:::graph` / … shows an error in place instead of
// letting the exception bubble up and blank the ENTIRE preview pane.
function specialEnvError(kind: string, e: unknown): string {
  return `<pre class="math-error">Error in :::${kind}: ${escHtml(String(e))}</pre>`
}

// ── Mermaid SVG cache for `:::flowchart` ─────────────────────────────────────
// Pre-rendered SVGs keyed by their mermaid source. Populated by App.tsx after
// mermaid finishes; consumed below so subsequent re-renders embed the SVG
// inline (no flash of source code, no async wait, no GPU repaint loop).
const flowchartSvgCache = new Map<string, string>()
export function setFlowchartSvg(source: string, svg: string): void {
  // Bounded like specialRenderCache: every edit of a diagram creates a new key
  // and stale entries were never evicted, growing for the whole session.
  if (flowchartSvgCache.size >= 300) flowchartSvgCache.clear()
  flowchartSvgCache.set(source, svg)
}
export function clearFlowchartSvgCache(): void {
  flowchartSvgCache.clear()
}
// The cache is only valid for the palette the SVGs were drawn with. The App
// reports the active palette's key; when it changes the entries are dropped, so
// a theme switch can never serve an SVG drawn with the old colours. Returns
// true when an earlier palette was replaced (callers re-render).
let flowchartThemeKey = ""
export function setFlowchartThemeKey(key: string): boolean {
  if (key === flowchartThemeKey) return false
  const hadPalette = flowchartThemeKey !== ""
  flowchartThemeKey = key
  flowchartSvgCache.clear()
  return hadPalette
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
  // Bounded: keys are whole base64 scenes and values full SVGs, with embedded
  // images both can reach MBs, and every save of a drawing mints a new key, so
  // an unbounded map is a session-long leak. Wholesale clear (the project's
  // cache pattern) just re-renders visible drawings once via the App effect.
  if (excalidrawSvgCache.size >= 30) excalidrawSvgCache.clear()
  excalidrawSvgCache.set(sceneB64, svg)
}
export function getExcalidrawSvg(sceneB64: string): string | undefined {
  return excalidrawSvgCache.get(sceneB64)
}
export function clearExcalidrawSvgCache(): void {
  excalidrawSvgCache.clear()
}

// ── Memo cache for the pure, synchronous special-block renderers ─────────────
// `truth` / `graph` (Graphviz layout) / `plot` (function sampling) / `commdiag`
// are non-trivial pure functions of (title, content, number) with no async or
// browser dependency. They were recomputed on EVERY (debounced) preview render;
// a small doc like comdtex.md holds several of them, so editing prose around
// them re-ran every layout each time. Memoize by source so an unchanged block
// is rendered once and reused. The output uses `currentColor`, so it's
// theme-independent and safe to cache across theme/macros changes.
const specialRenderCache = new Map<string, string>()
function memoSpecial(
  kind: string,
  title: string,
  content: string,
  number: string,
  render: () => string,
): string {
  const key = `${kind}\x00${number}\x00${title}\x00${content}`
  const hit = specialRenderCache.get(key)
  if (hit !== undefined) return hit
  const html = render()
  if (specialRenderCache.size >= 1000) specialRenderCache.clear()
  specialRenderCache.set(key, html)
  return html
}
export function clearSpecialRenderCache(): void {
  specialRenderCache.clear()
}

let excalidrawPlaceholderText = "Excalidraw: clic para editar"
export function setExcalidrawPlaceholderText(text: string): void {
  excalidrawPlaceholderText = text
}

function buildExcalidrawHTML(title: string, number: string, sceneB64: string): string {
  const header = title ? `Excalidraw ${number}: ${escHtml(title)}` : `Excalidraw ${number}`
  const safeB64 = escHtml(sceneB64)
  const cachedSvg = sceneB64 ? excalidrawSvgCache.get(sceneB64) : undefined
  const body = cachedSvg
    ? `<div class="excalidraw-canvas">${cachedSvg}</div>`
    : `<div class="excalidraw-placeholder">${escHtml(excalidrawPlaceholderText)}</div>`
  return [
    `<div class="excalidraw-block" data-excalidraw-scene="${safeB64}">`,
    `<div class="excalidraw-header"><span class="excalidraw-title">${header}</span>`,
    // The scene lives ONCE on the parent block's data-excalidraw-scene; the
    // edit button must not repeat it: with image-heavy scenes the duplicate
    // attribute doubled the preview HTML that gets parsed + sanitized +
    // morphed on every debounced render.
    `<button class="excalidraw-edit" data-line="$LINE$" title="${escHtml(excalidrawPlaceholderText)}">✏</button>`,
    `</div>`,
    body,
    `</div>`,
  ].join("")
}

function buildPseudocodeHTML(title: string, number: string, content: string): string {
  const KEYWORDS =
    /\b(INPUT|OUTPUT|FOR|TO|DOWNTO|DO|END\s+FOR|WHILE|END\s+WHILE|IF|THEN|ELSE\s+IF|ELSE|END\s+IF|RETURN|FUNCTION|END\s+FUNCTION|PROCEDURE|END\s+PROCEDURE|ALGORITHM|REQUIRE|ENSURE|BEGIN|END|SWAP|REPEAT|UNTIL|BREAK|CONTINUE|PRINT|LET|SET)\b/g

  const lines = content.split("\n").filter((line) => line !== undefined)
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

  const header = title ? `Algorithm ${number}: ${escHtml(title)}` : `Algorithm ${number}`

  const mermaidChart = pseudocodeToFlowchart(content)

  // Read the same cache used by `:::flowchart`. Without this, every preview
  // re-render re-emits a `<pre><code class="language-mermaid">` block, which
  // makes the mermaid effect re-run, bump `mermaidVersion`, recompute
  // `previewHtml`, and re-fire the effect: an infinite loop that pegs the
  // WebView at >100% CPU until it OOMs. With the cache hit, the second pass
  // emits a `<div class="mermaid-diagram">` (no `language-mermaid`), the
  // effect's "needs mermaid" gate goes false, and the loop terminates.
  const cachedSvg = flowchartSvgCache.get(mermaidChart)
  const sourceB64 =
    typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(mermaidChart))) : ""
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

/**
 * The visible heading of an environment, e.g. `Teorema 2 (Pitagoras)`. The
 * preview and every non-LaTeX export build their headings here so the numbering
 * scheme has a single definition. `title` is used as given (callers escape it
 * for HTML when needed).
 */
export function envDisplayLabel(
  envName: string,
  number: string,
  title: string,
  lang?: DocLang,
): string {
  const info = ALL_ENVS[envName]
  if (!info) return title
  return [envTitle(envName, lang) || info.es, number, title ? `(${title})` : ""]
    .filter(Boolean)
    .join(" ")
}

/** Advances `counters` for `envName` and returns its number ("" when unnumbered). */
export function nextEnvNumber(counters: Record<string, number>, envName: string): string {
  if (!NUMBERED_ENVS[envName]) return ""
  counters[envName] = (counters[envName] ?? 0) + 1
  return String(counters[envName])
}

const QED_SPAN = `<span class="math-env-qed" aria-hidden="true">□</span>`

/**
 * Puts the end-of-proof mark at the end of the last line of the body, not in a
 * block of its own below it. A proof body that does not end in a paragraph
 * (a list, a display equation) gets the mark appended after it.
 */
function withQedMark(innerHTML: string): string {
  const trimmed = innerHTML.trimEnd()
  if (trimmed.endsWith("</p>")) return `${trimmed.slice(0, -4)}${QED_SPAN}</p>`
  return `${trimmed}${QED_SPAN}`
}

/**
 * A proof gets its end mark from the environment, so a QED symbol the author
 * typed at the end of the body (`$\square$`, `\blacksquare`, `□`, `∎`) would
 * show up twice. It is removed here and the environment's mark stands in for it.
 */
const TRAILING_QED_RE =
  /(?:\$\s*\\(?:square|blacksquare|Box|qed|qedsymbol|qedhere)\s*\$|\\(?:square|blacksquare|Box|qed)(?![A-Za-z])|[□■∎◻◼▫▪])\s*$/

export function stripTrailingQed(content: string): string {
  return content.replace(TRAILING_QED_RE, "").trimEnd()
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
      `<span class="math-env-label">${escHtml(title) || activeDocTerms().collapsed}</span>`,
      `<span class="math-env-folded-toggle">▸</span>`,
      `</div>`,
      `<div class="math-env-body folded">${innerHTML}</div>`,
      `</div>`,
    ].join("\n")
  }

  const info = ALL_ENVS[envName]
  if (!info) return innerHTML

  const isProof = envName === "proof"
  const displayLabel = envDisplayLabel(envName, number, escHtml(title))
  const sizeClass = size ? ` math-env-${size}` : ""
  const idAttr = label ? ` id="env-${escHtml(label)}"` : ""

  return [
    `<div class="math-env math-env-${envName}${sizeClass}"${idAttr}>`,
    `<div class="math-env-header"><span class="math-env-label">${displayLabel}${isProof ? "" : "."}</span>${label ? `<span class="math-env-anchor">${escHtml(label)}</span>` : ""}</div>`,
    `<div class="math-env-body">${isProof ? withQedMark(innerHTML) : innerHTML}</div>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n")
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
  rawSource?: string,
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
  // Newlines in rawSource[0, rawCursor). Maintained incrementally so resolving
  // each env's source line is O(1) amortized; the previous `slice(0, idx)
  // .split("\n")` re-walked from the document start for every env → O(n²) on a
  // large, env-heavy file. `rawCursor` only advances, so total work is O(n).
  let rawCursorNewlines = 0
  const countNewlines = (s: string, from: number, to: number): number => {
    let n = 0
    for (let i = from; i < to; i++) if (s.charCodeAt(i) === 10) n++
    return n
  }
  const escRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  // The opening as the editor may spell it: optional spaces between the
  // parts (`:::theorem[T] {#thm:x}` is what a callout reopened from disk
  // becomes), any indentation. `parts` are the pieces ENV_RE captured.
  const openingRe = (parts: string[]): RegExp =>
    new RegExp(`^[ \\t]*${parts.map(escRe).join("[ \\t]*")}[ \\t]*$`, "gm")
  const lineOfInRaw = (parts: string[]): number => {
    const re = openingRe(parts)
    re.lastIndex = rawCursor
    let m = re.exec(rawSource!)
    // Nested environments are rewritten inner-first, so an outer opening can
    // sit before the cursor: look again from the top before giving up.
    if (!m) {
      re.lastIndex = 0
      m = re.exec(rawSource!)
      if (!m) return 0
      return countNewlines(rawSource!, 0, m.index) + 1
    }
    const idx = m.index
    const newlinesBeforeIdx = rawCursorNewlines + countNewlines(rawSource!, rawCursor, idx)
    rawCursorNewlines = newlinesBeforeIdx + countNewlines(rawSource!, idx, idx + m[0].length)
    rawCursor = idx + m[0].length
    return newlinesBeforeIdx + 1
  }
  const lineOfInText = (idx: number): number => text.slice(0, idx).split("\n").length

  // Line 0 means "not found": no attribute, so the preview's own matcher
  // (renderer.ts annotateSourceLinesIn) can still place the block's contents.
  const wrapWithSourceLine = (html: string, line: number): string =>
    line > 0
      ? `<div class="env-wrap" data-source-line="${line}">${html}</div>`
      : `<div class="env-wrap">${html}</div>`

  // Pre-pass: extract `:::code [language]` blocks before the generic ENV_RE.
  // The body must be preserved verbatim (HTML-escaped, no shorthand expansion,
  // no markdown formatting). Language goes after a SPACE, e.g. `:::code python`.
  // Supports `:::code` with no language (no class on <code>).
  const CODE_ENV_RE = /^:::code(?:[ \t]+(\S+))?[ \t]*\n([\s\S]*?)^:::[ \t]*$/gm
  let current = text.replace(
    CODE_ENV_RE,
    (_match, lang: string | undefined, body: string, offset: number) => {
      const srcLine = haveRaw
        ? lineOfInRaw(lang ? [":::code", lang] : [":::code"])
        : lineOfInText(offset)
      // Body is verbatim: preserve the trailing newline that closes its last line
      // by NOT trimming. But strip the single trailing newline produced by `\n:::`.
      const verbatim = body.endsWith("\n") ? body.slice(0, -1) : body
      const cls = lang ? ` class="language-${escHtml(lang)}"` : ""
      const html = `<pre><code${cls}>${escHtml(verbatim)}</code></pre>`
      slots.push(wrapWithSourceLine(html, srcLine))
      return `\x02ENV${slots.length - 1}\x03`
    },
  )

  let changed = true
  while (changed) {
    const before = current
    current = current.replace(
      ENV_RE(),
      (match, size, rawName, title, label, content, offset: number) => {
        const envName = rawName.toLowerCase()
        // The opening's pieces, as in source: `:::[size ]name[title][{#label}]`.
        const openingParts = [
          ":::",
          ...(size ? [size] : []),
          rawName,
          ...(title !== undefined ? [`[${title}]`] : []),
          ...(label !== undefined ? [`{#${label}}`] : []),
        ]
        const srcLine = haveRaw ? lineOfInRaw(openingParts) : lineOfInText(offset)

        if (envName === "pseudocode") {
          counters["pseudocode"] = (counters["pseudocode"] ?? 0) + 1
          const pcNumber = String(counters["pseudocode"])
          let html: string
          // NOT memoized: buildPseudocodeHTML embeds a Mermaid flowchart and reads
          // the (async-populated) `flowchartSvgCache`, so its output must be
          // re-evaluated each render; otherwise the cached "no SVG yet" HTML keeps
          // re-triggering the mermaid effect in an infinite re-render loop.
          try {
            html = buildPseudocodeHTML(title ?? "", pcNumber, content.trim())
          } catch (e) {
            html = specialEnvError("pseudocode", e)
          }
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
            // shows the diagram immediately: no flash of source, no async wait.
            // The source is base64-encoded into a data attribute so the mermaid
            // effect can re-render via the toolbar button if the user requests it.
            const cachedSvg = flowchartSvgCache.get(mermaidChart)
            const sourceB64 =
              typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(mermaidChart))) : ""
            const body = cachedSvg
              ? `<div class="mermaid-diagram" data-mermaid-source-b64="${sourceB64}">${cachedSvg}</div>`
              : `<pre data-mermaid-source-b64="${sourceB64}"><code class="language-mermaid">${escHtml(mermaidChart)}</code></pre>`
            html = [`<div class="flowchart-block">`, headerHtml, body, `</div>`].join("")
          } catch (e) {
            html = specialEnvError("flowchart", e)
          }
          slots.push(wrapWithSourceLine(html, srcLine))
          return `\x02ENV${slots.length - 1}\x03`
        }

        if (envName === "truth") {
          counters["truth"] = (counters["truth"] ?? 0) + 1
          const num = String(counters["truth"])
          const body = content.trim()
          const t = title ?? ""
          let html: string
          try {
            html = memoSpecial("truth", t, body, num, () => renderTruthTableHTML(t, body, num))
          } catch (e) {
            html = specialEnvError("truth", e)
          }
          slots.push(wrapWithSourceLine(html, srcLine))
          return `\x02ENV${slots.length - 1}\x03`
        }

        if (envName === "graph") {
          counters["graph"] = (counters["graph"] ?? 0) + 1
          const num = String(counters["graph"])
          const body = content.trim()
          const t = title ?? ""
          let html: string
          try {
            html = memoSpecial("graph", t, body, num, () => renderGraphSVG(t, body, num))
          } catch (e) {
            html = specialEnvError("graph", e)
          }
          slots.push(wrapWithSourceLine(html, srcLine))
          return `\x02ENV${slots.length - 1}\x03`
        }

        if (envName === "plot") {
          counters["plot"] = (counters["plot"] ?? 0) + 1
          const num = String(counters["plot"])
          const body = content.trim()
          const t = title ?? ""
          let html: string
          try {
            html = memoSpecial("plot", t, body, num, () => renderPlotHTML(t, body, num))
          } catch (e) {
            html = specialEnvError("plot", e)
          }
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
          } catch (e) {
            html = specialEnvError("excalidraw", e)
          }
          slots.push(wrapWithSourceLine(html, srcLine))
          return `\x02ENV${slots.length - 1}\x03`
        }

        if (envName === "commdiag") {
          counters["commdiag"] = (counters["commdiag"] ?? 0) + 1
          const num = String(counters["commdiag"])
          const body = content.trim()
          const t = title ?? ""
          let html: string
          try {
            html = memoSpecial("commdiag", t, body, num, () => renderCommDiagSVG(t, body, num))
          } catch (e) {
            html = specialEnvError("commdiag", e)
          }
          slots.push(wrapWithSourceLine(html, srcLine))
          return `\x02ENV${slots.length - 1}\x03`
        }

        if (!ALL_ENVS[envName]) return match

        const number = nextEnvNumber(counters, envName)

        let innerHTML: string
        try {
          innerHTML = renderFn(
            envName === "proof" ? stripTrailingQed(content.trim()) : content.trim(),
          )
        } catch (e) {
          const msg = String(e).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          innerHTML = `<pre class="math-error">Error in environment: ${msg}</pre>`
        }

        let renderedLabel: string | undefined = label ?? undefined
        if (label) {
          const seen = (labelOccurrences[label] ?? 0) + 1
          labelOccurrences[label] = seen
          renderedLabel = seen === 1 ? label : `${label}-${seen}`
        }

        const html = buildEnvHTML(
          envName,
          title ?? "",
          number,
          innerHTML,
          size ?? undefined,
          renderedLabel,
        )
        slots.push(wrapWithSourceLine(html, srcLine))
        return `\x02ENV${slots.length - 1}\x03`
      },
    )
    changed = current !== before
  }

  return { text: current, slots }
}

/** Reference prefix (`@thm:x`) to the environment type it points at. */
export const ENV_REF_PREFIXES: Record<string, string> = {
  thm: "theorem",
  theorem: "theorem",
  lem: "lemma",
  lemma: "lemma",
  cor: "corollary",
  prop: "proposition",
  def: "definition",
  definition: "definition",
  ex: "example",
  example: "example",
  exc: "exercise",
  exercise: "exercise",
}

export interface EnvironmentReference {
  /** Environment type (`theorem`), not its title: the title depends on the language at display time. */
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
    const number = nextEnvNumber(localCounters, envName)
    if (label) {
      // Preserve the first occurrence so references stay stable; warn on dupes.
      if (labels.has(label)) {
        console.warn(`Duplicate environment label: ${label}`)
      } else {
        labels.set(label, { kind: envName, number, label })
      }
    }
  }
  return labels
}

/**
 * Resolves the text of another vault document, given a vault-relative path
 * WITHOUT extension (e.g. `gp/calendario`). Must be synchronous: it is called
 * from `renderMarkdown`, which runs on the typing debounce. Return `null` when
 * the document doesn't exist. Mirrors `TransclusionResolver` in transclusion.ts.
 */
export type EnvironmentDocResolver = (docPath: string) => string | null

export { BARE_PATH_RE, crossFileRefText, refPathTarget } from "./crossFileRef"

// Matches, in priority order:
//   1. `@[my folder/my note]@def:label`: escaped path (needed for anything outside `A-Za-z0-9_./-`)
//   2. `@gp/calendario@def:label`       : bare vault-relative path
//   3. `@def:label`                     : local ref (legacy form, unchanged)
//
// The cross-file alternatives MUST come first: the old local-only pattern
// `/@([a-zA-Z]+):([\w.-]+)/` happily matches the INNER `@def:label` of
// `@gp/calendario@def:label` and would render it as a broken LOCAL ref while
// leaving `@gp/calendario` as stray prose. Ordered alternation consumes the
// whole cross-file ref at the leading `@`, so the inner form never wins.
// A dot may appear INSIDE a label (`thm:1.2`) but a trailing one is sentence
// punctuation: `[\w.-]+` swallows the period in "ver @thm:main." and leaves the
// ref unresolved. Same id shape as the `@tbl:` / `@fig:` patterns.
const ENV_REF_RE =
  /@(?:\[([^\]\n]+)\]|([A-Za-z0-9_./-]+))@([a-zA-Z]+):([\w-]+(?:\.\w+)*)|@([a-zA-Z]+):([\w-]+(?:\.\w+)*)/g

// ── Cross-file label cache ───────────────────────────────────────────────────
// An environment's NUMBER is a property of its file (it is that file's Nth
// definition), so resolving `@doc@def:x` means prescanning `doc`. That prescan
// must not run per keystroke: `renderMarkdown` re-runs on a ~150-700ms debounce
// while typing, and a vault-wide re-prescan there is exactly the class of bug
// v1.9.5 shipped to fix.
//
// The resolver hands us the target's text from an in-memory, keystroke-
// independent cache (App.tsx `vaultTextCache`, rebuilt only when the SET of
// vault files changes), so for any document the user is not currently editing
// the returned string is the SAME reference every render. `hit.content ===
// content` is then a pointer compare that short-circuits before any scan:
// O(1) per ref per render, zero disk I/O, zero re-prescan.
interface CrossDocCacheEntry {
  content: string
  labels: Map<string, EnvironmentReference>
}
const crossDocCache = new Map<string, CrossDocCacheEntry>()

// Prescan accounting: the cache's contract is "no re-prescan while typing",
// which is only meaningfully testable by counting actual prescans.
let crossDocPrescans = 0
export function envRefCacheStats(): { prescans: number; size: number } {
  return { prescans: crossDocPrescans, size: crossDocCache.size }
}
export function clearEnvRefCache(): void {
  crossDocCache.clear()
  crossDocPrescans = 0
}

function labelsForDoc(
  docPath: string,
  resolver: EnvironmentDocResolver,
): Map<string, EnvironmentReference> | null {
  let content: string | null
  try {
    content = resolver(docPath)
  } catch {
    return null
  }
  if (content == null) return null

  const hit = crossDocCache.get(docPath)
  if (hit && hit.content === content) return hit.labels

  const labels = prescanEnvironmentLabels(content)
  crossDocPrescans++
  if (crossDocCache.size >= 200) crossDocCache.clear()
  crossDocCache.set(docPath, { content, labels })
  return labels
}

export function resolveEnvironmentRefs(
  text: string,
  labels: Map<string, EnvironmentReference>,
  resolver?: EnvironmentDocResolver,
  format: "html" | "text" = "html",
  lang: DocLang = activeDocLanguage(),
): string {
  // "text" is for exports that cannot carry the preview's links (Markdown,
  // Pandoc inputs, Reveal): same resolved wording, no anchor markup.
  const asText = format === "text"
  return text.replace(
    ENV_REF_RE,
    (
      full: string,
      bracketPath: string | undefined,
      barePath: string | undefined,
      crossPrefix: string | undefined,
      crossId: string | undefined,
      localPrefix: string | undefined,
      localId: string | undefined,
    ) => {
      // ── Cross-file: `@doc@prefix:id` / `@[doc with spaces]@prefix:id` ────────
      if (crossPrefix !== undefined && crossId !== undefined) {
        const kindName = ENV_REF_PREFIXES[crossPrefix]
        if (!kindName) return full
        const kind = envTitle(kindName, lang)
        const docPath = (bracketPath ?? barePath ?? "").trim()
        const label = `${crossPrefix}:${crossId}`
        // Missing file and missing label degrade identically to a broken LOCAL
        // ref: a cross-ref must never throw out of the render pipeline.
        const docLabels = resolver && docPath ? labelsForDoc(docPath, resolver) : null
        const ref = docLabels?.get(label)
        if (!ref) return asText ? `${kind} (?)` : `<span class="env-ref-broken">${kind} (?)</span>`
        const refKind = envTitle(ref.kind, lang)
        const display = ref.number ? `${refKind} ${ref.number}` : refKind
        if (asText) return display
        const safeDoc = escHtml(docPath)
        const safeLabel = escHtml(label)
        return `<a class="env-ref env-ref-cross" data-target="${safeDoc}" data-env-label="${safeLabel}" title="${safeDoc}" href="#env-${safeLabel}">${display}</a>`
      }

      // ── Local: `@prefix:id` (unchanged behaviour) ────────────────────────────
      if (localPrefix === undefined || localId === undefined) return full
      if (!ENV_REF_PREFIXES[localPrefix]) return full
      const label = `${localPrefix}:${localId}`
      const ref = labels.get(label)
      if (!ref) {
        const kind = envTitle(ENV_REF_PREFIXES[localPrefix], lang)
        return asText ? `${kind} (?)` : `<span class="env-ref-broken">${kind} (?)</span>`
      }
      const refKind = envTitle(ref.kind, lang)
      const display = ref.number ? `${refKind} ${ref.number}` : refKind
      if (asText) return display
      return `<a class="env-ref" href="#env-${label}">${display}</a>`
    },
  )
}

// ── LaTeX export helpers ──────────────────────────────────────────────────────

export function envToLatex(
  envName: string,
  title: string,
  content: string,
  label?: string,
): string {
  const info = ALL_ENVS[envName]
  if (!info) return content

  const optTitle = title ? `[${title}]` : ""
  const latex = info.latex
  const labelLine = label ? `\n\\label{${label}}` : ""

  if (latex === "proof") {
    // amsthm provides proof natively
    return `\\begin{proof}${optTitle}${labelLine}\n${stripTrailingQed(content)}\n\\end{proof}`
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
