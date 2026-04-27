import { useRef, useState, useCallback, useMemo } from "react"
import type { FileNode } from "./types"
import { flatFiles } from "./wikilinks"
import { displayBasename } from "./pathUtils"
import { extractFrontmatter } from "./frontmatter"
import { useT } from "./i18n"

interface GraphPanelProps {
  tree: FileNode[]
  openTabs: { path: string; content: string }[]
  activePath: string | null
  onOpenFile: (path: string) => void
}

interface GraphNode {
  id: string       // file path
  label: string    // display name
  x: number
  y: number
  vx: number
  vy: number
  folder: string   // for coloring
  degree: number   // total connections (in + out)
  tags: string[]   // frontmatter tags
}

interface GraphEdge {
  source: string
  target: string
}

const FOLDER_COLORS = [
  "#569cd6", "#4ec9b0", "#ce9178", "#dcdcaa",
  "#c586c0", "#9cdcfe", "#d7ba7d", "#6a9955",
]

function buildGraph(
  tree: FileNode[],
  openTabs: { path: string; content: string }[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const files = flatFiles(tree)
  const pathToNode = new Map<string, GraphNode>()
  const folderSet = new Set<string>()
  const tabContent = new Map(openTabs.map((tab) => [tab.path, tab.content]))

  // Collect unique folder names for coloring
  for (const f of files) {
    const parts = f.path.split("/")
    const folder = parts.length > 1 ? parts[parts.length - 2] : ""
    folderSet.add(folder)
  }

  // Create nodes with random initial positions
  const W = 400, H = 400
  const nodes: GraphNode[] = files.map((f) => {
    const parts = f.path.split("/")
    const folder = parts.length > 1 ? parts[parts.length - 2] : ""
    const content = tabContent.get(f.path) ?? ""
    let tags: string[] = []
    if (content) {
      const parsed = extractFrontmatter(content)
      if (parsed?.data.tags && Array.isArray(parsed.data.tags)) {
        tags = parsed.data.tags.map((t) => String(t).toLowerCase())
      }
    }
    return {
      id: f.path,
      label: displayBasename(f.path),
      x: W / 2 + (Math.random() - 0.5) * W * 0.8,
      y: H / 2 + (Math.random() - 0.5) * H * 0.8,
      vx: 0,
      vy: 0,
      folder,
      degree: 0,
      tags,
    }
  })
  nodes.forEach((n) => pathToNode.set(n.id, n))

  // Build edges from [[wikilinks]] in open tabs
  const nameToPath = new Map<string, string>()
  for (const f of files) {
    const base = f.name.replace(/\.[^.]+$/, "").toLowerCase()
    nameToPath.set(base, f.path)
  }

  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []
  for (const tab of openTabs) {
    const wikiRe = /\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]/g
    let m: RegExpExecArray | null
    while ((m = wikiRe.exec(tab.content)) !== null) {
      const target = m[1].trim().toLowerCase()
      const targetPath = nameToPath.get(target)
      if (targetPath && targetPath !== tab.path) {
        const key = [tab.path, targetPath].sort().join("→")
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          edges.push({ source: tab.path, target: targetPath })
        }
      }
    }
  }

  // Compute degree
  const degMap = new Map<string, number>()
  for (const e of edges) {
    degMap.set(e.source, (degMap.get(e.source) ?? 0) + 1)
    degMap.set(e.target, (degMap.get(e.target) ?? 0) + 1)
  }
  for (const n of nodes) n.degree = degMap.get(n.id) ?? 0

  return { nodes, edges }
}

// ── Force simulation ──────────────────────────────────────────────────────────

function simulate(
  nodes: GraphNode[],
  edges: GraphEdge[],
  steps = 80,
): GraphNode[] {
  const ns = nodes.map((n) => ({ ...n }))
  const byId = new Map(ns.map((n) => [n.id, n]))

  const W = 400, H = 400
  const CENTER_X = W / 2, CENTER_Y = H / 2

  for (let step = 0; step < steps; step++) {
    const alpha = 1 - step / steps

    // Repulsion
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i], b = ns[j]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (800 / (dist * dist)) * alpha
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx -= fx; a.vy -= fy
        b.vx += fx; b.vy += fy
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = byId.get(edge.source), b = byId.get(edge.target)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const target = 80
      const force = ((dist - target) / dist) * 0.3 * alpha
      a.vx += dx * force; a.vy += dy * force
      b.vx -= dx * force; b.vy -= dy * force
    }

    // Gravity toward center
    for (const n of ns) {
      n.vx += (CENTER_X - n.x) * 0.02 * alpha
      n.vy += (CENTER_Y - n.y) * 0.02 * alpha
    }

    // Apply velocity with damping and boundary clamp
    for (const n of ns) {
      n.vx *= 0.6; n.vy *= 0.6
      n.x = Math.max(20, Math.min(W - 20, n.x + n.vx))
      n.y = Math.max(20, Math.min(H - 20, n.y + n.vy))
    }
  }

  return ns
}

const FOLDER_COLORS_LIST = FOLDER_COLORS

export default function GraphPanel({ tree, openTabs, activePath, onOpenFile }: GraphPanelProps) {
  const t = useT()
  const baseGraph = useMemo(() => {
    const { nodes: rawNodes, edges: rawEdges } = buildGraph(tree, openTabs)
    const simulated = simulate(rawNodes, rawEdges)
    const folders = [...new Set(simulated.map((n) => n.folder))]
    const fc = new Map(folders.map((f, i) => [f, FOLDER_COLORS_LIST[i % FOLDER_COLORS_LIST.length]]))
    return { nodes: simulated, edges: rawEdges, folderColors: fc }
  }, [tree, openTabs])

  // draggableNodes: user-dragged positions override the simulated layout.
  const [draggableNodes, setDraggableNodes] = useState<GraphNode[]>([])
  const nodes = draggableNodes.length > 0 ? draggableNodes : baseGraph.nodes
  const { edges, folderColors } = baseGraph
  const [hovered, setHovered] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("")
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<{ nodeId: string; ox: number; oy: number; moved: boolean } | null>(null)
  const panning = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)

  // ── Build neighbor adjacency for hover highlighting ─────────────────────
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set())
      if (!map.has(e.target)) map.set(e.target, new Set())
      map.get(e.source)!.add(e.target)
      map.get(e.target)!.add(e.source)
    }
    return map
  }, [edges])

  // ── Filter / search predicate. A node is "matched" when it passes both
  // filters. Non-matched nodes are dimmed instead of removed so the layout
  // remains stable while typing.
  const tagFilter = useMemo(() => {
    const m = /^tag:(.+)$/i.exec(filter.trim())
    return m ? m[1].trim().toLowerCase() : null
  }, [filter])

  const matchedIds = useMemo(() => {
    const s = search.trim().toLowerCase()
    const set = new Set<string>()
    for (const n of nodes) {
      const labelMatch = !s || n.label.toLowerCase().includes(s)
      const tagMatch = !tagFilter || n.tags.includes(tagFilter)
      if (labelMatch && tagMatch) set.add(n.id)
    }
    return set
  }, [nodes, search, tagFilter])

  const filterActive = search.trim() !== "" || tagFilter !== null

  // Top-N nodes by degree always show their labels (so the graph reads even
  // when nothing is hovered).
  const topLabelIds = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 8)
    return new Set(sorted.map((n) => n.id))
  }, [nodes])

  const getNodeAt = useCallback((path: string) => nodes.find((n) => n.id === path), [nodes])

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    const node = getNodeAt(nodeId)
    if (!node) return
    dragging.current = { nodeId, ox: e.clientX - node.x * zoom, oy: e.clientY - node.y * zoom, moved: false }
  }, [getNodeAt, zoom])

  const handleNodeClick = useCallback((nodeId: string) => {
    // Treat as a click only if the user did not drag.
    if (dragging.current?.moved) return
    onOpenFile(nodeId)
  }, [onOpenFile])

  const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if (dragging.current) return
    panning.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging.current) {
      const { nodeId, ox, oy } = dragging.current
      dragging.current.moved = true
      setDraggableNodes((prev) => {
        const base = prev.length > 0 ? prev : nodes
        return base.map((n) =>
          n.id === nodeId
            ? { ...n, x: (e.clientX - ox) / zoom, y: (e.clientY - oy) / zoom }
            : n
        )
      })
    } else if (panning.current) {
      const { sx, sy, px, py } = panning.current
      setPan({ x: px + (e.clientX - sx), y: py + (e.clientY - sy) })
    }
  }, [zoom, nodes])

  const handleMouseUp = useCallback(() => {
    dragging.current = null
    panning.current = null
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.max(0.3, Math.min(3, z * (e.deltaY < 0 ? 1.1 : 0.9))))
  }, [])

  if (flatFiles(tree).length === 0) {
    return <div className="tree-empty">{t.graphPanel.noFiles}</div>
  }

  return (
    <div className="graph-panel">
      <div className="graph-toolbar">
        <button className="graph-btn" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); setDraggableNodes([]) }} title={t.graphPanel.resetView}>⊕</button>
        <input
          className="graph-input"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.graphPanel.searchPlaceholder}
          aria-label={t.graphPanel.searchPlaceholder}
        />
        <input
          className="graph-input"
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t.graphPanel.filterPlaceholder}
          aria-label={t.graphPanel.filterPlaceholder}
        />
        <span className="graph-zoom-label">{Math.round(zoom * 100)}%</span>
        <span className="graph-info">{t.graphPanel.graphInfo(nodes.length, edges.length)}</span>
      </div>
      <svg
        ref={svgRef}
        className="graph-svg"
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: "grab" }}
      >
        <defs>
          <marker
            id="graph-arrow"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#666" />
          </marker>
          <marker
            id="graph-arrow-active"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#569cd6" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {edges.map((e, i) => {
            const a = nodes.find((n) => n.id === e.source)
            const b = nodes.find((n) => n.id === e.target)
            if (!a || !b) return null
            const isHighlighted = hovered === e.source || hovered === e.target
            // Dim edges whose endpoints aren't both in the matched set.
            const isMatched = !filterActive || (matchedIds.has(e.source) && matchedIds.has(e.target))
            const opacity = isHighlighted ? 0.95 : isMatched ? 0.5 : 0.1
            return (
              <line
                key={i}
                x1={a.x} y1={a.y}
                x2={b.x} y2={b.y}
                stroke={isHighlighted ? "#569cd6" : "#3a3a3a"}
                strokeWidth={isHighlighted ? 1.5 : 0.8}
                strokeOpacity={opacity}
                markerEnd={isHighlighted ? "url(#graph-arrow-active)" : "url(#graph-arrow)"}
              />
            )
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isActive = node.id === activePath
            const isHovered = node.id === hovered
            const isNeighbor = hovered != null && neighborMap.get(hovered)?.has(node.id)
            const isMatched = matchedIds.has(node.id)
            const color = folderColors.get(node.folder) ?? "#888"
            // Size by degree (clamped). Active/hovered get a small bump.
            const baseR = 4 + Math.min(8, node.degree)
            const r = isActive ? baseR + 2 : isHovered ? baseR + 1 : baseR
            const dimmed = (filterActive && !isMatched) || (hovered != null && !isHovered && !isNeighbor)
            const opacity = dimmed ? 0.18 : 1
            const showLabel = isHovered || isActive || topLabelIds.has(node.id)

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => handleNodeClick(node.id)}
                onDoubleClick={() => onOpenFile(node.id)}
                style={{ cursor: "pointer", opacity }}
              >
                <circle
                  r={r}
                  fill={isActive ? "#fff" : color}
                  stroke={isActive ? "#569cd6" : isHovered ? "#fff" : color}
                  strokeWidth={isActive ? 2 : 1}
                  fillOpacity={0.85}
                />
                {showLabel && (
                  <text
                    x={0}
                    y={r + 9}
                    textAnchor="middle"
                    fontSize="8"
                    fill={isActive ? "#fff" : "#ccc"}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      <div className="graph-legend">
        {[...folderColors.entries()].slice(0, 6).map(([folder, color]) => (
          <span key={folder} className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: color }} />
            {folder || t.graphPanel.root}
          </span>
        ))}
      </div>
    </div>
  )
}
