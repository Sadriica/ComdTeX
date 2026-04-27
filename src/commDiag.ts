/**
 * Commutative diagram renderer for ComdTeX.
 *
 * Syntax:
 *   :::commdiag[optional title]
 *   A -> B [f]
 *   A -> C [g]
 *   B -> D [h]
 *   C -> D [k]
 *   :::
 *
 * Supported arrow styles: -> <- <-> ->> >-> ==>
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface CDNode { id: string }

interface CDEdge {
  from: string
  to: string
  label?: string
  style: "->" | "<-" | "<->" | "->>" | ">->" | "==>"
}

interface CDGraph { nodes: CDNode[]; edges: CDEdge[] }

type EdgeStyle = "->" | "<-" | "<->" | "->>" | ">->" | "==>"

// ── Parser ────────────────────────────────────────────────────────────────────

const EDGE_RE = /^(\w+)\s*(->|<-|<->|->>|>->|==>)\s*(\w+)(?:\s*\[([^\]]*)\])?/

export function parseCommDiag(content: string): CDGraph {
  const nodeMap = new Map<string, CDNode>()
  const edges: CDEdge[] = []

  function addNode(id: string) {
    if (!nodeMap.has(id)) nodeMap.set(id, { id })
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("//") || line.startsWith("#")) continue

    const m = EDGE_RE.exec(line)
    if (!m) continue

    const from = m[1]
    const style = m[2] as EdgeStyle
    const to = m[3]
    const label = m[4]?.trim() || undefined

    addNode(from)
    addNode(to)
    edges.push({ from, to, label, style })
  }

  return { nodes: Array.from(nodeMap.values()), edges }
}

// ── Layout ────────────────────────────────────────────────────────────────────

interface Point { x: number; y: number }

export function layoutDAG(graph: CDGraph): Map<string, Point> {
  const nodeIds = graph.nodes.map(n => n.id)
  const n = nodeIds.length

  if (n === 0) return new Map()

  // Build adjacency for layout (treat all edges as directed for layer computation)
  // For <- edges, the arrow goes from `to` to `from` visually, but for layout purposes
  // we use the declared from/to
  const outEdges = new Map<string, Set<string>>()
  const inEdges = new Map<string, Set<string>>()
  for (const id of nodeIds) {
    outEdges.set(id, new Set())
    inEdges.set(id, new Set())
  }

  // Normalize edges for layout: for <- style, flip direction
  const layoutEdges: Array<{ from: string; to: string }> = []
  for (const e of graph.edges) {
    const lf = e.style === "<-" ? e.to : e.from
    const lt = e.style === "<-" ? e.from : e.to
    // avoid self-loops in layout
    if (lf !== lt) {
      layoutEdges.push({ from: lf, to: lt })
    }
  }

  // Cycle detection & breaking: track which edges we've added to layout graph
  const addedEdges = new Set<string>()
  for (const le of layoutEdges) {
    const key = `${le.from}→${le.to}`
    if (addedEdges.has(key)) continue
    addedEdges.add(key)
    outEdges.get(le.from)!.add(le.to)
    inEdges.get(le.to)!.add(le.from)
  }

  // Detect cycles and break them (DFS)
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function breakCycles(node: string) {
    visited.add(node)
    inStack.add(node)
    const outs = Array.from(outEdges.get(node) ?? [])
    for (const next of outs) {
      if (!visited.has(next)) {
        breakCycles(next)
      } else if (inStack.has(next)) {
        // Break cycle: remove this edge
        outEdges.get(node)!.delete(next)
        inEdges.get(next)!.delete(node)
      }
    }
    inStack.delete(node)
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) breakCycles(id)
  }

  // Compute layers via longest path from sources
  const layer = new Map<string, number>()

  // Topological order via Kahn's algorithm
  const inDeg = new Map<string, number>()
  for (const id of nodeIds) inDeg.set(id, inEdges.get(id)!.size)

  const queue: string[] = []
  for (const id of nodeIds) {
    if (inDeg.get(id) === 0) queue.push(id)
  }

  const topoOrder: string[] = []
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]
    topoOrder.push(cur)
    for (const next of outEdges.get(cur) ?? []) {
      inDeg.set(next, inDeg.get(next)! - 1)
      if (inDeg.get(next) === 0) queue.push(next)
    }
  }

  // Any remaining nodes (shouldn't happen after cycle breaking, but be safe)
  for (const id of nodeIds) {
    if (!topoOrder.includes(id)) topoOrder.push(id)
  }

  // Assign layers using longest path
  for (const id of nodeIds) layer.set(id, 0)
  for (const id of topoOrder) {
    const l = layer.get(id)!
    for (const next of outEdges.get(id) ?? []) {
      if (layer.get(next)! < l + 1) layer.set(next, l + 1)
    }
  }

  // Group nodes by layer, preserving first-appearance order
  const layerGroups = new Map<number, string[]>()
  for (const id of nodeIds) {
    const l = layer.get(id)!
    if (!layerGroups.has(l)) layerGroups.set(l, [])
    layerGroups.get(l)!.push(id)
  }

  const maxLayer = Math.max(...Array.from(layer.values()))
  const maxNodesInLayer = Math.max(...Array.from(layerGroups.values()).map(g => g.length))

  const width = Math.max(300, (maxLayer + 1) * 120 + 60)
  const height = Math.max(200, maxNodesInLayer * 80 + 60)

  const positions = new Map<string, Point>()

  for (const [l, group] of layerGroups.entries()) {
    const lCount = group.length
    for (let i = 0; i < lCount; i++) {
      const id = group[i]
      // Center nodes vertically within the layer
      const totalHeight = lCount * 80
      const startY = (height - totalHeight) / 2 + 40
      positions.set(id, {
        x: l * 120 + 60,
        y: startY + i * 80,
      })
    }
  }

  // Expose canvas size in the map via a sentinel key (won't conflict with \w+ node ids)
  positions.set("__width__", { x: width, y: 0 })
  positions.set("__height__", { x: height, y: 0 })

  return positions
}

// ── SVG Renderer ──────────────────────────────────────────────────────────────

let diagCounter = 0

function escSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function renderCommDiagSVG(title: string, content: string): string {
  let graph: CDGraph
  try {
    graph = parseCommDiag(content)
  } catch (e) {
    return `<div class="commdiag-error">Diagram error: ${escSvg(String(e))}</div>`
  }

  if (graph.nodes.length === 0) {
    return `<div class="commdiag-error">Diagram error: no nodes found</div>`
  }

  if (graph.nodes.length > 15) {
    return `<div class="commdiag-error">Diagram error: too many nodes (max 15)</div>`
  }

  const uid = ++diagCounter
  const positions = layoutDAG(graph)

  const width = positions.get("__width__")?.x ?? 300
  const height = positions.get("__height__")?.y ?? 200

  // ── Defs (markers) ────────────────────────────────────────────────────────

  const markerColor = "#7c9cbf"

  const defs = `<defs>
    <!-- Standard arrow -->
    <marker id="cd-arr-${uid}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="${markerColor}"/>
    </marker>
    <!-- Two-headed arrow (->>) -->
    <marker id="cd-dbl-${uid}" markerWidth="12" markerHeight="8" refX="11" refY="3" orient="auto">
      <path d="M0,0 L0,6 L6,3 z" fill="${markerColor}"/>
      <path d="M4,0 L4,6 L10,3 z" fill="${markerColor}"/>
    </marker>
    <!-- Reverse arrow for <- -->
    <marker id="cd-rev-${uid}" markerWidth="8" markerHeight="8" refX="1" refY="3" orient="auto">
      <path d="M8,0 L8,6 L0,3 z" fill="${markerColor}"/>
    </marker>
    <!-- Tail marker for >-> (at start) -->
    <marker id="cd-tail-${uid}" markerWidth="6" markerHeight="8" refX="0" refY="3" orient="auto">
      <line x1="0" y1="0" x2="0" y2="6" stroke="${markerColor}" stroke-width="1.5"/>
    </marker>
    <!-- Double line marker for ==> -->
    <marker id="cd-double-${uid}" markerWidth="10" markerHeight="10" refX="9" refY="4" orient="auto">
      <path d="M0,1 L0,7 L9,4 z" fill="${markerColor}" stroke="${markerColor}" stroke-width="0.5"/>
    </marker>
    <!-- Bidirectional: start arrow -->
    <marker id="cd-bistart-${uid}" markerWidth="8" markerHeight="8" refX="1" refY="3" orient="auto">
      <path d="M8,0 L8,6 L0,3 z" fill="${markerColor}"/>
    </marker>
  </defs>`

  // Node radius for shortening
  const NODE_RX = 22
  const NODE_RY = 16
  const SHORTEN = 24 // px to shorten each end

  function shortenLine(
    x1: number, y1: number,
    x2: number, y2: number,
    amount: number,
  ): [number, number, number, number] {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) return [x1, y1, x2, y2]
    const ux = dx / len
    const uy = dy / len
    return [
      x1 + ux * amount,
      y1 + uy * amount,
      x2 - ux * amount,
      y2 - uy * amount,
    ]
  }

  // ── Edges ─────────────────────────────────────────────────────────────────

  const edgeSvg: string[] = []
  const labelSvg: string[] = []

  // Track parallel edges for offset
  const edgePairCount = new Map<string, number>()

  for (const e of graph.edges) {
    const fromPt = positions.get(e.from)
    const toPt = positions.get(e.to)
    if (!fromPt || !toPt) continue

    // Self-loop
    if (e.from === e.to) {
      const cx = fromPt.x + NODE_RX + 20
      const cy = fromPt.y - NODE_RY - 20
      const path = `M ${fromPt.x + 10} ${fromPt.y - NODE_RY} Q ${cx} ${cy} ${fromPt.x + NODE_RX} ${fromPt.y - 5}`
      edgeSvg.push(`<path d="${path}" fill="none" stroke="${markerColor}" stroke-width="1.5" marker-end="url(#cd-arr-${uid})"/>`)
      if (e.label) {
        labelSvg.push(`<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="11" fill="#b0c8e0" font-style="italic" font-family="serif">${escSvg(e.label)}</text>`)
      }
      continue
    }

    const pairKey = [e.from, e.to].sort().join("↔")
    const pairIndex = edgePairCount.get(pairKey) ?? 0
    edgePairCount.set(pairKey, pairIndex + 1)

    let [sx, sy, ex, ey] = shortenLine(fromPt.x, fromPt.y, toPt.x, toPt.y, SHORTEN)

    // For <- style, swap visual direction
    let markerEnd = `url(#cd-arr-${uid})`
    let markerStart = "none"
    let extraStroke = ""
    let strokeWidth = "1.5"

    if (e.style === "<-") {
      // Arrow points from `to` to `from` visually
      ;[sx, sy, ex, ey] = shortenLine(toPt.x, toPt.y, fromPt.x, fromPt.y, SHORTEN)
      markerEnd = `url(#cd-arr-${uid})`
    } else if (e.style === "<->") {
      markerEnd = `url(#cd-arr-${uid})`
      markerStart = `url(#cd-bistart-${uid})`
    } else if (e.style === "->>") {
      markerEnd = `url(#cd-dbl-${uid})`
    } else if (e.style === ">->") {
      markerStart = `url(#cd-tail-${uid})`
      markerEnd = `url(#cd-arr-${uid})`
    } else if (e.style === "==>") {
      // Double line effect: draw two parallel lines
      strokeWidth = "3"
      extraStroke = `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="var(--surface2, #1a1a1a)" stroke-width="1.5" stroke-linecap="round"/>`
      markerEnd = `url(#cd-double-${uid})`
    }

    let lineEl: string
    if (e.style === "==>") {
      lineEl = [
        `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${markerColor}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="${markerEnd}" marker-start="${markerStart}"/>`,
        extraStroke,
      ].join("\n")
    } else {
      lineEl = `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${markerColor}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="${markerEnd}" marker-start="${markerStart}"/>`
    }

    edgeSvg.push(lineEl)

    // Label: place at midpoint, offset perpendicularly
    if (e.label) {
      let mx: number, my: number
      if (e.style === "<-") {
        mx = (toPt.x + fromPt.x) / 2
        my = (toPt.y + fromPt.y) / 2
      } else {
        mx = (fromPt.x + toPt.x) / 2
        my = (fromPt.y + toPt.y) / 2
      }

      const dx = (e.style === "<-" ? fromPt.x - toPt.x : toPt.x - fromPt.x)
      const dy = (e.style === "<-" ? fromPt.y - toPt.y : toPt.y - fromPt.y)
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      // Perpendicular unit vector
      const px = -dy / len
      const py = dx / len
      // Alternate above/below for parallel edges
      const side = pairIndex % 2 === 0 ? 1 : -1
      const offset = 14 * side
      const lx = mx + px * offset
      const ly = my + py * offset

      const labelText = escSvg(e.label)
      const charW = 6.5
      const textW = labelText.length * charW + 6
      const textH = 14

      labelSvg.push([
        `<rect x="${(lx - textW / 2).toFixed(1)}" y="${(ly - textH / 2 - 1).toFixed(1)}" width="${textW.toFixed(1)}" height="${textH}" rx="2" fill="var(--surface2, #1a1a1a)" opacity="0.85"/>`,
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#b0c8e0" font-style="italic" font-family="serif">${labelText}</text>`,
      ].join("\n"))
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  const nodeSvg: string[] = []
  for (const node of graph.nodes) {
    const pt = positions.get(node.id)
    if (!pt) continue
    nodeSvg.push([
      `<ellipse cx="${pt.x}" cy="${pt.y}" rx="${NODE_RX}" ry="${NODE_RY}" fill="#1e2a3a" stroke="${markerColor}" stroke-width="1.5"/>`,
      `<text x="${pt.x}" y="${pt.y}" text-anchor="middle" dominant-baseline="central" font-size="13" fill="#e0e0e0" font-style="italic" font-family="serif">${escSvg(node.id)}</text>`,
    ].join("\n"))
  }

  // ── Assemble SVG ──────────────────────────────────────────────────────────

  const maxWidthPx = Math.round(width * 1.5)
  const svg = [
    `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${maxWidthPx}px" xmlns="http://www.w3.org/2000/svg">`,
    defs,
    `<rect width="${width}" height="${height}" fill="var(--surface2, #1a1a1a)" rx="8"/>`,
    ...edgeSvg,
    ...labelSvg,
    ...nodeSvg,
    `</svg>`,
  ].join("\n")

  const titleHtml = title
    ? `<div class="commdiag-title">${escSvg(title)}</div>`
    : ""

  return [
    `<div class="commdiag-block">`,
    titleHtml,
    `<div class="commdiag-svg-wrap">${svg}</div>`,
    `</div>`,
  ].filter(Boolean).join("\n")
}
