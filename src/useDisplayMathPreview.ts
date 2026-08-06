import type * as monacoApi from "monaco-editor"
import katex from "katex"
// mhchem extension: teaches KaTeX \ce{} so chemistry renders in the preview
// exactly as it will in the LaTeX export (which loads the mhchem package).
import "katex/contrib/mhchem"
import type { KatexMacros } from "./macros"

interface MathBlock {
  startLine: number
  endLine: number
  expr: string
}

function findDisplayMathBlocks(model: monacoApi.editor.ITextModel): MathBlock[] {
  const blocks: MathBlock[] = []
  const lineCount = model.getLineCount()
  let i = 1
  while (i <= lineCount) {
    const line = model.getLineContent(i).trim()
    if (line.startsWith("$$")) {
      const startLine = i
      const rest = line.slice(2).trimEnd()
      // Single-line: $$ expr $$
      if (rest.endsWith("$$") && rest.length > 2) {
        blocks.push({ startLine, endLine: i, expr: rest.slice(0, -2).trim() })
        i++
        continue
      }
      // Multi-line: collect until closing $$
      const exprLines: string[] = rest ? [rest] : []
      i++
      while (i <= lineCount) {
        const inner = model.getLineContent(i)
        if (inner.trim() === "$$") {
          blocks.push({ startLine, endLine: i, expr: exprLines.join("\n") })
          break
        }
        exprLines.push(inner)
        i++
      }
    }
    i++
  }
  return blocks
}

// Cache rendered display-math HTML by source. Without it, `update()` re-ran
// KaTeX for every visible block on every keystroke / cursor move: the dominant
// per-keystroke cost in a math-heavy document. Invalidated by macros reference
// (macros only change when macros.md is saved).
const mathHtmlCache = new Map<string, string | null>()
let mathHtmlCacheMacros: KatexMacros | null = null

function renderMathHtml(expr: string, macros: KatexMacros): string | null {
  if (macros !== mathHtmlCacheMacros) { mathHtmlCache.clear(); mathHtmlCacheMacros = macros }
  const key = expr.trim()
  const cached = mathHtmlCache.get(key)
  if (cached !== undefined) return cached
  let html: string | null
  try {
    html = katex.renderToString(key, { displayMode: true, throwOnError: false, macros })
  } catch {
    html = null
  }
  if (mathHtmlCache.size >= 2000) mathHtmlCache.clear()
  mathHtmlCache.set(key, html)
  return html
}

interface ActiveZone {
  id: string
  startLine: number
  endLine: number
  html: string
  domNode: HTMLElement
}

/**
 * Sets up live display math preview view zones in a Monaco editor.
 * Call from handleEditorMount; mirrors setupMathHover pattern.
 * Returns an IDisposable that cleans up all zones and listeners.
 */
export function setupDisplayMathPreview(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  getMacros: () => KatexMacros,
  getEnabled: () => boolean,
): monacoApi.IDisposable {
  let zones: ActiveZone[] = []
  let decorations: monacoApi.editor.IEditorDecorationsCollection | null = null

  function removeAllZones() {
    if (zones.length === 0) return
    editor.changeViewZones((acc) => {
      for (const z of zones) acc.removeZone(z.id)
    })
    zones = []
    decorations?.clear()
  }

  function update() {
    const model = editor.getModel()
    if (!model) { removeAllZones(); return }
    if (!getEnabled()) { removeAllZones(); return }
    try { updateZones(model) } catch {
      // Monaco can throw transient view-zone/layout errors during editor
      // (re)mount or rapid model changes (e.g. "this.domNode.domNode"); reset and
      // carry on instead of surfacing an unhandled error.
      try { removeAllZones() } catch { /* ignore */ }
    }
  }

  function updateZones(model: monacoApi.editor.ITextModel) {
    const cursorLine = editor.getPosition()?.lineNumber ?? 0
    const blocks = findDisplayMathBlocks(model)
    const macros = getMacros()

    const toShow = blocks.filter(
      (b) => !(cursorLine >= b.startLine && cursorLine <= b.endLine),
    )

    // Build decoration ranges to dim source lines
    const decorationRanges: monacoApi.editor.IModelDeltaDecoration[] = toShow.map((b) => ({
      range: {
        startLineNumber: b.startLine,
        startColumn: 1,
        endLineNumber: b.endLine,
        endColumn: model.getLineLength(b.endLine) + 1,
      },
      options: { inlineClassName: "math-preview-source" },
    }))

    const newKey = toShow.map((b) => `${b.startLine}-${b.endLine}`).join(",")
    const oldKey = zones.map((z) => `${z.startLine}-${z.endLine}`).join(",")

    if (newKey !== oldKey) {
      editor.changeViewZones((acc) => {
        for (const z of zones) acc.removeZone(z.id)
      })
      zones = []

      if (toShow.length > 0) {
        // Measure heights off-screen before creating zones
        const probe = document.createElement("div")
        probe.style.cssText = "position:absolute;visibility:hidden;top:0;left:0;padding:6px 0 8px;"
        probe.className = "math-preview-zone"
        document.body.appendChild(probe)

        const newZones: ActiveZone[] = []
        editor.changeViewZones((acc) => {
          for (const b of toShow) {
            const html = renderMathHtml(b.expr, macros)
            if (!html) continue

            probe.innerHTML = html
            const measuredH = Math.max(56, probe.scrollHeight + 4)

            const domNode = document.createElement("div")
            domNode.className = "math-preview-zone"
            domNode.innerHTML = html

            const id = acc.addZone({
              afterLineNumber: b.endLine,
              heightInPx: measuredH,
              domNode,
              suppressMouseDown: false,
            })
            newZones.push({ id, startLine: b.startLine, endLine: b.endLine, html, domNode })
          }
        })
        document.body.removeChild(probe)
        zones = newZones
      }
    } else {
      // Same block positions: re-render content using fresh scan to avoid stale line data
      for (let i = 0; i < zones.length; i++) {
        const fresh = toShow[i]
        if (!fresh) continue
        const html = renderMathHtml(fresh.expr, macros)
        if (html && html !== zones[i].html) {
          zones[i].html = html
          zones[i].domNode.innerHTML = html
        }
      }
    }

    if (!decorations) {
      decorations = editor.createDecorationsCollection(decorationRanges)
    } else {
      decorations.set(decorationRanges)
    }
  }

  // Debounce: typing fires content + cursor changes rapidly (2× per keystroke).
  // Running the full-document scan + KaTeX synchronously on each was the main
  // editor lag in math-heavy files. Coalesce into one update shortly after the
  // user pauses; the KaTeX cache above keeps that update cheap.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => { debounceTimer = null; update() }, 140)
  }

  // Defer the first pass: running it synchronously inside onMount (before the
  // editor's view is fully laid out) is what triggered the Monaco view-zone
  // "this.domNode.domNode" error when opening a math-heavy file.
  scheduleUpdate()

  const d1 = editor.onDidChangeCursorPosition(scheduleUpdate)
  const d2 = editor.onDidChangeModelContent(scheduleUpdate)
  const d3 = editor.onDidChangeModel(() => { removeAllZones(); scheduleUpdate() })

  return {
    dispose() {
      if (debounceTimer) clearTimeout(debounceTimer)
      d1.dispose()
      d2.dispose()
      d3.dispose()
      removeAllZones()
    },
  }
}
