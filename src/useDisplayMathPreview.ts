import type * as monacoApi from "monaco-editor"
import katex from "katex"
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

function renderMathHtml(expr: string, macros: KatexMacros): string | null {
  try {
    return katex.renderToString(expr.trim(), {
      displayMode: true,
      throwOnError: false,
      macros,
    })
  } catch {
    return null
  }
}

interface ActiveZone {
  id: string
  startLine: number
  endLine: number
  domNode: HTMLElement
}

/**
 * Sets up live display math preview view zones in a Monaco editor.
 * Call from handleEditorMount — mirrors setupMathHover pattern.
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
            newZones.push({ id, startLine: b.startLine, endLine: b.endLine, domNode })
          }
        })
        document.body.removeChild(probe)
        zones = newZones
      }
    } else {
      // Same block positions — re-render content using fresh scan to avoid stale line data
      for (let i = 0; i < zones.length; i++) {
        const fresh = toShow[i]
        if (!fresh) continue
        const html = renderMathHtml(fresh.expr, macros)
        if (html) zones[i].domNode.innerHTML = html
      }
    }

    if (!decorations) {
      decorations = editor.createDecorationsCollection(decorationRanges)
    } else {
      decorations.set(decorationRanges)
    }
  }

  update()

  const d1 = editor.onDidChangeCursorPosition(() => update())
  const d2 = editor.onDidChangeModelContent(() => update())
  const d3 = editor.onDidChangeModel(() => { removeAllZones(); update() })

  return {
    dispose() {
      d1.dispose()
      d2.dispose()
      d3.dispose()
      removeAllZones()
    },
  }
}
