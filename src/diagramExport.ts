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
import { getActiveMermaidConfig } from "./mermaidConfig"
import { pseudocodeToFlowchart } from "./pseudocodeFlowchart"

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

const OPEN_RE =
  /^:::(pseudocode|flowchart|truth|graph|plot|commdiag|code|excalidraw|seq)(?:\[([^\]]*)\])?\s*(\S+)?\s*$/

/** Scan a document for special blocks (fenced code is respected). */
export function findSpecialBlocks(md: string): SpecialBlock[] {
  const lines = md.split("\n")
  const out: SpecialBlock[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i])) {
      inFence = !inFence
      continue
    }
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
  seq: "Sequence",
}

/** The block types that become raster images in exports. */
export const RASTER_TYPES = new Set(["flowchart", "graph", "plot", "commdiag", "excalidraw"])

export function hasRasterBlocks(md: string): boolean {
  return findSpecialBlocks(md).some((b) => RASTER_TYPES.has(b.type)) || hasLocalSvgImages(md)
}

// ── Local SVG images ─────────────────────────────────────────────────────────
// No LaTeX engine ComdTeX drives reads SVG: xelatex, pdflatex and tectonic stop
// at `\includegraphics{x.svg}` ("Cannot determine size of graphic"). One SVG
// figure therefore failed every local engine, the compile fell through to the
// WASM engine with the original content, and every plot, graph and flowchart
// in the PDF printed as source code. They are rasterized like the diagrams.

/** `![alt](path.svg "title")` or `![alt](<a path.svg>)`: group 1 is everything
 *  up to the path, group 2 a bracketed path, group 3 a plain one. */
const SVG_IMAGE_RE = /(!\[[^\]\n]*\]\(\s*<?)(?:([^<>\n]+\.svg)(?=>)|([^)\s<>]+\.svg)(?=[\s)]))/gi

/** Each local `.svg` image path outside fenced code, with its line and column. */
export function findLocalSvgImages(
  md: string,
): Array<{ line: number; index: number; src: string }> {
  const out: Array<{ line: number; index: number; src: string }> = []
  let fence: string | null = null
  md.split("\n").forEach((text, line) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(text)
    if (f) {
      if (fence === null) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      return
    }
    if (fence !== null) return
    SVG_IMAGE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SVG_IMAGE_RE.exec(text)) !== null) {
      const src = m[2] ?? m[3]
      if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(src)) continue // remote or data URL
      out.push({ line, index: m.index + m[1].length, src })
    }
  })
  return out
}

export function hasLocalSvgImages(md: string): boolean {
  return findLocalSvgImages(md).length > 0
}

/** A truth block as a plain Markdown table every export understands. */
export function truthBlockToMarkdown(body: string): string | null {
  try {
    const exprs = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
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
  let out = svg.replace(
    /var\((--[\w-]+)(?:,\s*([^)]+))?\)/g,
    (_m, name: string, fallback?: string) => {
      return PRINT_VARS[name] ?? (fallback ? fallback.trim() : "#1a1a1a")
    },
  )
  // As a standalone image an <svg> without its namespace is not SVG at all:
  // the decode fails and the block stayed as source code in the PDF (the
  // graph renderer emits inline SVG with no xmlns).
  if (!/<svg[^>]*\sxmlns="/.test(out)) {
    out = out.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  if (/\sxlink:/.test(out) && !/<svg[^>]*\sxmlns:xlink="/.test(out)) {
    out = out.replace(/<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  }
  // Rasterization needs explicit pixel dimensions; percentage widths render 0.
  // Mermaid's viewBox does not start at 0 0 (`-8 -8 412 590`); matching only
  // `0 0 w h` left its flowcharts sizeless, rasterized tiny and upscaled.
  const vb = /<svg[^>]*\sviewBox="\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(
    out,
  )
  if (vb) {
    if (/<svg[^>]*\swidth="[\d.]*%"/.test(out) || !/<svg[^>]*\swidth="/.test(out)) {
      out = out.replace(/<svg([^>]*?)\swidth="[\d.]*%"/, "<svg$1")
      out = out.replace(/<svg\b/, `<svg width="${vb[1]}"`)
    }
    if (!/<svg[^>]*\sheight="/.test(out) || /<svg[^>]*\sheight="[\d.]*%"/.test(out)) {
      out = out.replace(/<svg([^>]*?)\sheight="[\d.]*%"/, "<svg$1")
      out = out.replace(/<svg\b/, `<svg height="${vb[2]}"`)
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
        mermaid.initialize({
          ...getActiveMermaidConfig(),
          theme: "neutral",
          themeVariables: { background: "#ffffff" },
        } as Parameters<typeof mermaid.initialize>[0])
        try {
          // The block holds pseudocode, exactly as the preview reads it; Mermaid
          // got it raw before, failed to parse, and the PDF printed the source.
          const chart = pseudocodeToFlowchart(block.body.trim())
          const { svg } = await mermaid.render(
            `comdtex-export-${Math.abs(hash(block.body))}`,
            chart,
          )
          return extractSvg(svg)
        } finally {
          mermaid.initialize(getActiveMermaidConfig() as Parameters<typeof mermaid.initialize>[0])
        }
      }
      case "excalidraw": {
        const scene = JSON.parse(block.body)
        const { exportToSvg } = await import("@excalidraw/excalidraw")
        const el = await exportToSvg({
          elements: scene.elements ?? [],
          appState: {
            ...(scene.appState ?? {}),
            exportBackground: true,
            viewBackgroundColor: "#ffffff",
          },
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
      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      )
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
  (index: number, block: SpecialBlock | null, png: Uint8Array): Promise<string>
}

export interface DiagramExportOptions {
  /**
   * Reads a local SVG image by the path the document wrote (resolved against
   * the document's folder, then the vault root). Null when it cannot be read;
   * the image is then left as written. Without it SVG images are untouched.
   */
  readSvg?: (src: string) => Promise<string | null>
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
  opts: DiagramExportOptions = {},
): Promise<{ content: string; assets: number }> {
  const blocks = findSpecialBlocks(md)
  const svgImages = opts.readSvg ? findLocalSvgImages(md) : []
  if (blocks.length === 0 && svgImages.length === 0) return { content: md, assets: 0 }

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
      if (table)
        replacements.push({
          start: block.start,
          end: block.end,
          text: [`**${caption}**`, "", table],
        })
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

  // SVG images first, on the untouched lines (block replacements change line
  // counts). Right to left within a line so earlier columns stay valid. A
  // block body never holds Markdown images, so the two edits cannot overlap.
  const pngBySrc = new Map<string, string>()
  for (const img of [...svgImages].reverse()) {
    let ref = pngBySrc.get(img.src)
    if (ref === undefined) {
      const svg = await opts.readSvg!(img.src).catch(() => null)
      const png = svg ? await svgToPngBytes(svg) : null
      if (!png) continue
      assetIndex++
      ref = await writeAsset(assetIndex, null, png)
      pngBySrc.set(img.src, ref)
    }
    const text = lines[img.line]
    lines[img.line] = text.slice(0, img.index) + ref + text.slice(img.index + img.src.length)
  }

  for (const r of replacements.reverse()) {
    lines.splice(r.start, r.end - r.start, ...r.text)
  }
  return { content: lines.join("\n"), assets: assetIndex }
}
