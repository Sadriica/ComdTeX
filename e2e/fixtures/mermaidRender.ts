// Fixture for e2e/mermaid-labels.spec.ts.
//
// Mermaid can only be rendered in a real browser: with native SVG labels it
// measures text via `getComputedTextLength()`, which jsdom does not implement.
// So the label regression is proven here — real Mermaid, the real app config,
// and the real sanitizer, in real Chromium — rather than in a unit test that
// would have to stub the measurement away.
import mermaid from "mermaid"
import { sanitizeRenderedHtml } from "../../src/sanitizeRenderedHtml"
import { pseudocodeToFlowchart } from "../../src/pseudocodeFlowchart"
import { MERMAID_CONFIG } from "../../src/mermaidConfig"

export type RenderReport = {
  rawHasForeignObject: boolean
  safeHasForeignObject: boolean
  texts: string[]
  overflowing: string[]
}

async function renderReport(source: string, id: string): Promise<RenderReport> {
  mermaid.initialize(MERMAID_CONFIG)
  const { svg } = await mermaid.render(id, source)
  const safe = sanitizeRenderedHtml(svg)

  const holder = document.createElement("div")
  holder.innerHTML = safe
  document.body.appendChild(holder)

  const texts = [...holder.querySelectorAll("text")]
    .map((t) => (t.textContent ?? "").trim())
    .filter(Boolean)

  // A label overflowing its shape would mean htmlLabels:false broke wrapping.
  const overflowing: string[] = []
  for (const g of holder.querySelectorAll("g.node")) {
    const label = g.querySelector<SVGGraphicsElement>("text")
    const shape = g.querySelector<SVGGraphicsElement>("rect, polygon, circle, path")
    if (!label || !shape) continue
    const lb = label.getBBox()
    const sb = shape.getBBox()
    if (lb.width > sb.width + 1) overflowing.push(label.textContent ?? "")
  }

  return {
    rawHasForeignObject: /foreignObject/i.test(svg),
    safeHasForeignObject: /foreignObject/i.test(safe),
    texts,
    overflowing,
  }
}

// The user's real-world reproducer: the project decision cycle from their
// Evaluación Financiera notes.
const DECISION_CYCLE = `ALGORITHM Ciclo de decisiones del proyecto
    INPUT Idea (oportunidad o problema)
    IF No viable
        Descartar
    ELSE IF Aplazar
        Más estudio, plata y personas
    ELSE
        Perfilar el proyecto (Ante-proyecto)
    ENDIF
    RETURN Decisión
END`

// Exercises the `↺` loop-back edges and `≤` / `←` / accents that the old
// `securityLevel: "loose"` comment claimed to need.
const BINARY_SEARCH = `ALGORITHM Búsqueda binaria
    WHILE lo ≤ hi
        mid ← (lo + hi) / 2
        IF A[mid] = target
            RETURN mid
        ENDIF
    ENDWHILE
    RETURN -1
END`

async function main() {
  const out: Record<string, RenderReport | { error: string }> = {}
  const cases: Array<[string, string]> = [
    ["decisionCycle", pseudocodeToFlowchart(DECISION_CYCLE)],
    ["binarySearch", pseudocodeToFlowchart(BINARY_SEARCH)],
    // A raw ```mermaid fence can hold any diagram type — htmlLabels is a root
    // config in Mermaid 11, so one flag must cover them all.
    ["sequence", "sequenceDiagram\n  Alice->>Bob: Decisión útil\n  Bob-->>Alice: Sí"],
    ["classDiagram", "classDiagram\n  class Proyecto {\n    +evaluar() Decisión\n  }"],
    ["stateDiagram", "stateDiagram-v2\n  [*] --> Idea\n  Idea --> Descartar: No viable"],
    ["erDiagram", "erDiagram\n  PROYECTO ||--o{ ESTUDIO : incluye"],
    ["mindmap", "mindmap\n  root((Proyecto))\n    Idea\n    Estudio"],
  ]

  for (const [name, source] of cases) {
    try {
      out[name] = await renderReport(source, `e2e-${name}`)
    } catch (e) {
      out[name] = { error: String(e) }
    }
  }

  ;(window as unknown as { __MERMAID_REPORT__: unknown }).__MERMAID_REPORT__ = out
  ;(window as unknown as { __MERMAID_DONE__: boolean }).__MERMAID_DONE__ = true
}

void main()
