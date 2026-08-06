// Diagrams reach the export instead of degrading to code fences.
//
// The preview renders every special block visually; exports used to degrade
// them all to captioned code (exportConversion.ts), which read as a bug the
// moment a real flowchart shipped inside a PDF. This module turns each
// visual block into something the export pipelines already know how to
// carry:
//
//   graph / plot / commdiag  → their own pure SVG renderers → PNG file
//   flowchart (Mermaid)      → mermaid.render → SVG → PNG file
//   excalidraw               → @excalidraw/utils exportToSvg → SVG → PNG file
//   truth                    → a real Markdown table (native in every export)
//   pseudocode / code        → intentionally stay as captioned code
//
// PNG rasterization needs the webview (Image + canvas), so the replacement
// pass is async and lives behind a writeAsset callback: callers decide where
// files land (beside the compiled tex, beside the exported .tex, or as temp
// files for pandoc). Pure pieces (block scan, truth table, print palette)
// are exported separately and unit-tested.

import { renderGraphSVG } from "./graphViz"
import { renderPlotHTML } from "./functionPlot"
import { renderCommDiagSVG } from "./commDiag"
import { buildTruthTable } from "./truthTable"
import { MERMAID_CONFIG } from "./mermaidConfig"

export interface SpecialBlock {
  type: string
  /** Optional [name] after the type. */
  name: string
  /** Info string after the name (e.g. the code language). */
  info: string
  body: string
  /** Line span in the source, inclusive start, exclusive end. */
  start: number
  end: number
}

const OPEN_RE = /^:::(pseudocode|flowchart|truth|graph|plot|commdiag|code|excalidraw)(?:\[([^\]]*)\])?\s*(\S+)?\s*$/

/** Scan a document for special blocks (fenced code is respected). */
export function findSpecialBlocks(md: string): SpecialBlock[] {
  const lines = md.split("\n")
  const out: SpecialBlock[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i])) { inFence = !inFence; continue }
    if (inFence) continue
    const open = OPEN_RE.exec(lines[i])
    if (!open) continue
    let j = i + 1
    while (j < lines.length && !/^:::\s*$/.test(lines[j])) j++
    if (j >= lines.length) break // unclosed: leave to the degrader
    out.push({
      type: open[1],
      name: open[2] ?? "",
      info: open[3] ?? "",
      body: lines.slice(i + 1, j).join("\n"),
      start: i,
      end: j + 1,
    })
    i = j
  }
  return out
}

/** Caption text matching the preview's numbering ("Graph 2: name"). */
export const EXPORT_CAPTIONS: Record<string, string> = {
  flowchart: "Flowchart",
  graph: "Graph",
  plot: "Plot",
  commdiag: "Diagram",
  excalidraw: "Excalidraw",
  truth: "Truth Table",
}

/** The block types that become raster images in exports. */
export const RASTER_TYPES = new Set(["flowchart", "graph", "plot", "commdiag", "excalidraw"])

export function hasRasterBlocks(md: string): boolean {
  return findSpecialBlocks(md).some((b) => RASTER_TYPES.has(b.type))
}

/** A truth block as a plain Markdown table every export understands. */
export function truthBlockToMarkdown(body: string): string | null {
  try {
    const exprs = body.split("\n").map((l) => l.trim()).filter(Boolean)
    if (exprs.length === 0) return null
    const { vars, exprs: cols, rows } = buildTruthTable(exprs)
    const header = [...vars, ...cols]
    const md = [
      `| ${header.join(" | ")} |`,
      `|${header.map(() => "---").join("|")}|`,
      ...rows.map((r) => `| ${r.map((v) => (v ? "V" : "F")).join(" | ")} |`),
    ]
    return md.join("\n")
  } catch {
    return null
  }
}

// ── Print palette ─────────────────────────────────────────────────────────────
//
// The SVG renderers color through CSS variables with dark-theme fallbacks
// (they live inside the app's themed preview). Rasterized outside that CSS
// context the fallbacks would paint dark-on-dark for a white page, so every
// var() is resolved to a print value by name before rasterizing.

const PRINT_VARS: Record<string, string> = {
  "--surface": "#ffffff",
  "--surface2": "#f5f5f2",
  "--bg": "#ffffff",
  "--fg": "#1a1a1a",
  "--text": "#1a1a1a",
  "--muted": "#555555",
  "--border": "#bbbbbb",
  "--accent": "#1a5276",
}

export function svgForPrint(svg: string): string {
  let out = svg.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_m, name: string, fallback?: string) => {
    return PRINT_VARS[name] ?? (fallback ? fallback.trim() : "#1a1a1a")
  })
  // Rasterization needs explicit pixel dimensions; percentage widths render 0.
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(out)
  if (vb) {
    out = out.replace(/<svg([^>]*?)\swidth="100%"/, `<svg$1 width="${vb[1]}"`)
    if (!/<svg[^>]*\sheight="/.test(out)) {
      out = out.replace(/<svg /, `<svg height="${vb[2]}" `)
    }
  }
  return out
}

/** Pull the bare <svg> out of a renderer's HTML wrapper. */
export function extractSvg(html: string): string | null {
  const m = /<svg[\s\S]*?<\/svg>/.exec(html)
  return m ? m[0] : null
}

// ── SVG production per type (webview for mermaid/excalidraw) ─────────────────

let mermaidReady: Promise<typeof import("mermaid").default> | null = null
function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((mod) => mod.default)
  }
  return mermaidReady
}

export async function diagramToSvg(block: SpecialBlock): Promise<string | null> {
  const title = block.name
  try {
    switch (block.type) {
      case "graph":
        return extractSvg(renderGraphSVG(title, block.body))
      case "plot":
        return extractSvg(renderPlotHTML(title, block.body))
      case "commdiag":
        return extractSvg(renderCommDiagSVG(title, block.body))
      case "flowchart": {
        // mermaid.initialize is GLOBAL and the preview configures the dark
        // theme; switch to a print theme just for this render, then restore,
        // so an open preview never inherits the export's palette.
        const mermaid = await loadMermaid()
        mermaid.initialize({ ...MERMAID_CONFIG, theme: "neutral", themeVariables: { background: "#ffffff" } } as Parameters<typeof mermaid.initialize>[0])
        try {
          const { svg } = await mermaid.render(`comdtex-export-${Math.abs(hash(block.body))}`, block.body)
          return extractSvg(svg)
        } finally {
          mermaid.initialize(MERMAID_CONFIG as Parameters<typeof mermaid.initialize>[0])
        }
      }
      case "excalidraw": {
        const scene = JSON.parse(block.body)
        const { exportToSvg } = await import("@excalidraw/excalidraw")
        const el = await exportToSvg({
          elements: scene.elements ?? [],
          appState: { ...(scene.appState ?? {}), exportBackground: true, viewBackgroundColor: "#ffffff" },
          files: scene.files ?? null,
        })
        return el.outerHTML
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

/** SVG → PNG bytes via the webview's canvas. Null when anything fails. */
export async function svgToPngBytes(svg: string, scale = 2): Promise<Uint8Array | null> {
  try {
    const blob = new Blob([svg], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error("svg decode failed"))
        img.src = url
      })
      const w = img.naturalWidth || 800
      const h = img.naturalHeight || 600
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(w * scale))
      canvas.height = Math.max(1, Math.round(h * scale))
      const ctx = canvas.getContext("2d")
      if (!ctx) return null
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!pngBlob) return null
      return new Uint8Array(await pngBlob.arrayBuffer())
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

// ── The replacement pass ──────────────────────────────────────────────────────

export interface DiagramAssetWriter {
  /** Persist PNG bytes; returns the path/filename to reference in Markdown. */
  (index: number, block: SpecialBlock, png: Uint8Array): Promise<string>
}

/**
 * Replace visual special blocks with real content the export pipelines carry
 * natively: raster types become `![caption](file)` images (via writeAsset),
 * truth tables become Markdown tables. Anything that cannot be rendered is
 * left untouched for the honest code-fence degrader downstream. Captions are
 * numbered per type, matching the preview.
 */
export async function replaceDiagramsForExport(
  md: string,
  writeAsset: DiagramAssetWriter,
): Promise<{ content: string; assets: number }> {
  const blocks = findSpecialBlocks(md)
  if (blocks.length === 0) return { content: md, assets: 0 }

  const lines = md.split("\n")
  const counters: Record<string, number> = {}
  const replacements: Array<{ start: number; end: number; text: string[] }> = []
  let assetIndex = 0

  for (const block of blocks) {
    if (!RASTER_TYPES.has(block.type) && block.type !== "truth") continue
    counters[block.type] = (counters[block.type] ?? 0) + 1
    const caption = `${EXPORT_CAPTIONS[block.type]} ${counters[block.type]}${block.name ? `: ${block.name}` : ""}`

    if (block.type === "truth") {
      const table = truthBlockToMarkdown(block.body)
      if (table) replacements.push({ start: block.start, end: block.end, text: [`**${caption}**`, "", table] })
      continue
    }

    const svg = await diagramToSvg(block)
    if (!svg) continue
    const png = await svgToPngBytes(svgForPrint(svg))
    if (!png) continue
    assetIndex++
    const ref = await writeAsset(assetIndex, block, png)
    replacements.push({ start: block.start, end: block.end, text: [`![${caption}](${ref})`] })
  }

  for (const r of replacements.reverse()) {
    lines.splice(r.start, r.end - r.start, ...r.text)
  }
  return { content: lines.join("\n"), assets: assetIndex }
}
