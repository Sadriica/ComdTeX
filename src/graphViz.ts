/**
 * Graph Theory Visualizer for ComdTeX.
 *
 * Syntax:
 *   :::graph[Optional Title]
 *   A -- B          (undirected)
 *   A -> B          (directed)
 *   A -- B : 5      (weighted undirected)
 *   A -> B : 2.3    (weighted directed)
 *   :::
 */

let graphCounter = 0

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphEdge {
  from: string
  to: string
  weight?: string
  directed: boolean
}

interface ParsedGraph {
  nodes: string[]
  edges: GraphEdge[]
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseGraph(content: string): ParsedGraph {
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.length > 0)

  const nodeSet = new Set<string>()
  const nodeOrder: string[] = []
  const edges: GraphEdge[] = []

  const edgeRe = /^(.+?)\s*(--|-\->|->)\s*(.+?)(?:\s*:\s*(.+))?$/

  for (const line of lines) {
    const m = line.match(edgeRe)
    if (!m) {
      // Could be a standalone node declaration — treat it as a node with no edges
      const nodeName = line.trim()
      if (nodeName && !nodeSet.has(nodeName)) {
        nodeSet.add(nodeName)
        nodeOrder.push(nodeName)
      }
      continue
    }

    const from = m[1].trim()
    const op = m[2].trim()
    const to = m[3].trim()
    const weight = m[4]?.trim()
    const directed = op === "->" || op === "->>"

    for (const n of [from, to]) {
      if (!nodeSet.has(n)) {
        nodeSet.add(n)
        nodeOrder.push(n)
      }
    }

    edges.push({ from, to, weight, directed })
  }

  return { nodes: nodeOrder, edges }
}

// ── Layout ────────────────────────────────────────────────────────────────────

const CANVAS_W = 400
const CANVAS_H = 350
const CENTER_X = 200
const CENTER_Y = 175
const RADIUS = 140
const NODE_R = 18

function circularLayout(nodes: string[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const n = nodes.length
  if (n === 0) return positions
  if (n === 1) {
    positions.set(nodes[0], { x: CENTER_X, y: CENTER_Y })
    return positions
  }
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    positions.set(node, {
      x: CENTER_X + RADIUS * Math.cos(angle),
      y: CENTER_Y + RADIUS * Math.sin(angle),
    })
  })
  return positions
}

function gridLayout(nodes: string[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const n = nodes.length
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const cellW = (CANVAS_W - 40) / cols
  const cellH = (CANVAS_H - 40) / rows
  nodes.forEach((node, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.set(node, {
      x: 20 + cellW * col + cellW / 2,
      y: 20 + cellH * row + cellH / 2,
    })
  })
  return positions
}

function computeLayout(nodes: string[]): Map<string, { x: number; y: number }> {
  return nodes.length <= 12 ? circularLayout(nodes) : gridLayout(nodes)
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function shortenEndpoints(
  x1: number, y1: number,
  x2: number, y2: number,
  r: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return { x1, y1, x2, y2 }
  const sx = (dx / len) * r
  const sy = (dy / len) * r
  return { x1: x1 + sx, y1: y1 + sy, x2: x2 - sx, y2: y2 - sy }
}

// ── Main SVG renderer ─────────────────────────────────────────────────────────

export function renderGraphSVG(title: string, content: string): string {
  graphCounter++
  const uid = `g${graphCounter}`

  if (!content.trim()) {
    return `<div class="graph-error">Graph error: empty graph content</div>`
  }

  let parsed: ParsedGraph
  try {
    parsed = parseGraph(content)
  } catch (e) {
    return `<div class="graph-error">Graph error: ${esc(String(e))}</div>`
  }

  const { nodes, edges } = parsed

  if (nodes.length === 0) {
    return `<div class="graph-error">Graph error: no nodes found</div>`
  }

  if (nodes.length > 20) {
    return `<div class="graph-error">Graph error: too many nodes (max 20, got ${nodes.length})</div>`
  }

  const positions = computeLayout(nodes)

  // Track parallel edges between same pair to offset them
  const edgePairCount = new Map<string, number>()
  const edgePairIndex = new Map<string, number>()

  for (const edge of edges) {
    const key = [edge.from, edge.to].sort().join("\x00")
    edgePairCount.set(key, (edgePairCount.get(key) ?? 0) + 1)
  }

  const svgParts: string[] = []

  // ── defs: arrowhead marker ────────────────────────────────────────────────
  svgParts.push(`<defs>`)
  svgParts.push(
    `<marker id="arrow-${uid}" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">` +
    `<path d="M0,0 L0,6 L8,3 z" fill="#7c9cbf"/>` +
    `</marker>`,
  )
  svgParts.push(`</defs>`)

  // ── Edges ──────────────────────────────────────────────────────────────────
  for (const edge of edges) {
    const fromPos = positions.get(edge.from)
    const toPos = positions.get(edge.to)
    if (!fromPos || !toPos) continue

    const isSelfLoop = edge.from === edge.to
    if (isSelfLoop) {
      // Draw a small circle arc offset from the node
      const cx = fromPos.x + NODE_R
      const cy = fromPos.y - NODE_R
      svgParts.push(
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${NODE_R * 0.7}" ` +
        `fill="none" stroke="#7c9cbf" stroke-width="1.5"/>`,
      )
      if (edge.weight) {
        svgParts.push(
          `<text x="${(cx + NODE_R + 4).toFixed(1)}" y="${(cy - NODE_R).toFixed(1)}" ` +
          `font-size="9" fill="#a0bfd0" text-anchor="middle" dominant-baseline="central"` +
          ` font-family="monospace">${esc(edge.weight)}</text>`,
        )
      }
      continue
    }

    // Track parallel edges
    const pairKey = [edge.from, edge.to].sort().join("\x00")
    const pairIdx = edgePairIndex.get(pairKey) ?? 0
    edgePairIndex.set(pairKey, pairIdx + 1)
    const totalPairs = edgePairCount.get(pairKey) ?? 1
    const offset = totalPairs > 1 ? (pairIdx - (totalPairs - 1) / 2) * 8 : 0

    const { x1, y1, x2, y2 } = shortenEndpoints(
      fromPos.x, fromPos.y,
      toPos.x, toPos.y,
      NODE_R,
    )

    // Perpendicular offset for parallel edges
    const dx = toPos.x - fromPos.x
    const dy = toPos.y - fromPos.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const ox = len > 0 ? (-dy / len) * offset : 0
    const oy = len > 0 ? (dx / len) * offset : 0

    const rx1 = x1 + ox, ry1 = y1 + oy
    const rx2 = x2 + ox, ry2 = y2 + oy

    const markerAttr = edge.directed
      ? ` marker-end="url(#arrow-${uid})"`
      : ""

    svgParts.push(
      `<line x1="${rx1.toFixed(1)}" y1="${ry1.toFixed(1)}" x2="${rx2.toFixed(1)}" y2="${ry2.toFixed(1)}" ` +
      `stroke="#7c9cbf" stroke-width="1.5"${markerAttr}/>`,
    )

    // Weight label at midpoint
    if (edge.weight) {
      const mx = (rx1 + rx2) / 2 + (len > 0 ? (-dy / len) * 6 : 0)
      const my = (ry1 + ry2) / 2 + (len > 0 ? (dx / len) * 6 : 0)
      svgParts.push(
        `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-size="9" fill="#a0bfd0" ` +
        `text-anchor="middle" dominant-baseline="central" font-family="monospace">${esc(edge.weight)}</text>`,
      )
    }
  }

  // ── Nodes ──────────────────────────────────────────────────────────────────
  for (const node of nodes) {
    const pos = positions.get(node)
    if (!pos) continue
    const fontSize = node.length <= 3 ? 11 : 9
    svgParts.push(
      `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${NODE_R}" ` +
      `fill="#1e3a52" stroke="#7c9cbf" stroke-width="1.5"/>`,
    )
    svgParts.push(
      `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" ` +
      `font-size="${fontSize}" fill="#e0e0e0" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="monospace">${esc(node)}</text>`,
    )
  }

  const titleDiv = title
    ? `<div class="graph-title">${esc(title)}</div>`
    : ""

  const svg =
    `<svg viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="100%" style="max-width:500px">` +
    svgParts.join("") +
    `</svg>`

  return `<div class="graph-block">${titleDiv}${svg}</div>`
}
