import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FileNode } from "./types"
import { flatFiles } from "./wikilinks"
import { displayBasename } from "./pathUtils"
import { extractFrontmatter } from "./frontmatter"
import { useT } from "./i18n"
import { useVaultSources, type LoadDiskSources } from "./vaultSources"
import { GraphCanvas } from "./graphCanvas"
import { LayoutRunner } from "./graphLayoutClient"
import {
  buildScene,
  commonDir,
  localNeighbourhood,
  topLevelFolder,
  type SceneNode,
} from "./graphScene"

interface GraphPanelProps {
  tree: FileNode[]
  openTabs: { path: string; content: string }[]
  /** Reads every vault text file (shared search index); open tabs override it. */
  loadDiskSources: LoadDiskSources
  activePath: string | null
  onOpenFile: (path: string) => void
}

interface GraphNode {
  id: string // file path
  label: string // display name
  folder: string // top-level folder under the vault root, "" for root files
  degree: number // total connections (in + out)
  tags: string[] // frontmatter tags
}

interface GraphEdge {
  source: string
  target: string
}

const WIKI_RE = /\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]/g

// Per-file parse cache keyed on the content string. `sources` is rebuilt on
// every keystroke, but only the edited tab has new text; every other note is a
// Map lookup instead of a regex scan plus a frontmatter parse.
const parseCache = new Map<string, { content: string; links: string[]; tags: string[] }>()

function parseDoc(path: string, content: string): { links: string[]; tags: string[] } {
  const hit = parseCache.get(path)
  if (hit && hit.content === content) return hit
  const links: string[] = []
  const wikiRe = new RegExp(WIKI_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = wikiRe.exec(content)) !== null) links.push(m[1].trim().toLowerCase())
  let tags: string[] = []
  const parsed = extractFrontmatter(content)
  if (parsed?.data.tags && Array.isArray(parsed.data.tags)) {
    tags = parsed.data.tags.map((t) => String(t).toLowerCase())
  }
  const entry = { content, links, tags }
  parseCache.set(path, entry)
  return entry
}

/** Nodes are every vault file; edges come from the wikilinks in `sources`. */
export function buildGraph(
  tree: FileNode[],
  sources: { path: string; content: string }[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const files = flatFiles(tree)
  const pathToNode = new Map<string, GraphNode>()
  const tabContent = new Map(sources.map((src) => [src.path, src.content]))
  const root = commonDir(files.map((f) => f.path))

  const nodes: GraphNode[] = files.map((f) => {
    const content = tabContent.get(f.path) ?? ""
    const tags = content ? parseDoc(f.path, content).tags : []
    return {
      id: f.path,
      label: displayBasename(f.path).replace(/\.[A-Za-z0-9]{1,5}$/, ""),
      folder: topLevelFolder(f.path, root),
      degree: 0,
      tags,
    }
  })
  nodes.forEach((n) => pathToNode.set(n.id, n))

  // Build edges from the [[wikilinks]] of every source (disk + open tabs)
  const nameToPath = new Map<string, string>()
  for (const f of files) {
    const base = f.name.replace(/\.[^.]+$/, "").toLowerCase()
    nameToPath.set(base, f.path)
  }

  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []
  for (const src of sources) {
    if (!pathToNode.has(src.path)) continue
    for (const target of parseDoc(src.path, src.content).links) {
      const targetPath = nameToPath.get(target)
      if (targetPath && targetPath !== src.path) {
        const key = [src.path, targetPath].sort().join("→")
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          edges.push({ source: src.path, target: targetPath })
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

// ── Layout memory ────────────────────────────────────────────────────────────

// Positions survive panel switches (the sidebar unmounts this panel) and seed
// the next layout, so a new note appears beside its neighbours instead of the
// whole graph reshuffling. The local graph keeps only its latest layout: the
// nodes of an old neighbourhood say nothing about the new one.
type PosMemory = Map<string, [number, number]>
const memory: { global: PosMemory; local: PosMemory } = { global: new Map(), local: new Map() }

let runner: LayoutRunner | null = null
function getRunner(): LayoutRunner {
  if (!runner) runner = new LayoutRunner()
  return runner
}

type Mode = "local" | "global"

interface LayoutDone {
  key: string
  ids: string[]
  pos: Float32Array
}

const NEIGHBOUR_LIST_MAX = 60

export default function GraphPanel({
  tree,
  openTabs,
  loadDiskSources,
  activePath,
  onOpenFile,
}: GraphPanelProps) {
  const t = useT()
  const { sources } = useVaultSources(loadDiskSources, openTabs)
  // `openTabs` is a new array on every keystroke. The raw graph is rebuilt
  // (linear), but the layout is keyed on the SHAPE of what is shown (its nodes
  // and edges), so typing prose leaves it alone.
  const graph = useMemo(() => buildGraph(tree, sources), [tree, sources])

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const e of graph.edges) {
      if (!map.has(e.source)) map.set(e.source, new Set())
      if (!map.has(e.target)) map.set(e.target, new Set())
      map.get(e.source)!.add(e.target)
      map.get(e.target)!.add(e.source)
    }
    return map
  }, [graph])

  // ── Mode: local (active note + depth) by default when a note is open ──────
  const [userMode, setUserMode] = useState<Mode | null>(null)
  const [depth, setDepth] = useState<1 | 2>(1)
  const activeInGraph = activePath !== null && graph.nodes.some((n) => n.id === activePath)
  const wantedMode: Mode = userMode ?? (activeInGraph ? "local" : "global")
  const mode: Mode = wantedMode === "local" && activeInGraph ? "local" : "global"

  const visible = useMemo(() => {
    let nodes = graph.nodes
    let edges = graph.edges
    if (mode === "local" && activePath) {
      const keep = localNeighbourhood(adjacency, activePath, depth)
      nodes = nodes.filter((n) => keep.has(n.id))
      edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target))
    }
    const key =
      mode +
      "\x1c" +
      nodes.map((n) => n.id).join("\x1e") +
      "\x1d" +
      edges.map((e) => `${e.source}\x1f${e.target}`).join("\x1e")
    return { nodes, edges, key }
  }, [graph, adjacency, mode, depth, activePath])

  // ── Layout (worker) ───────────────────────────────────────────────────────
  const [layout, setLayout] = useState<LayoutDone | null>(null)
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    if (visible.key === lastKey.current) return
    lastKey.current = visible.key
    const key = visible.key
    const ids = visible.nodes.map((n) => n.id)
    const index = new Map(ids.map((id, i) => [id, i]))
    const flat: number[] = []
    for (const e of visible.edges) {
      const a = index.get(e.source)
      const b = index.get(e.target)
      if (a !== undefined && b !== undefined) flat.push(a, b)
    }
    const mem = mode === "local" ? memory.local : memory.global
    const prev = new Float32Array(2 * ids.length).fill(NaN)
    ids.forEach((id, i) => {
      const p = mem.get(id)
      if (p) {
        prev[2 * i] = p[0]
        prev[2 * i + 1] = p[1]
      }
    })
    void getRunner()
      .run({ ids, edges: Uint32Array.from(flat), prev })
      .then((res) => {
        if (!res) return
        const next: PosMemory = mode === "local" ? new Map() : memory.global
        ids.forEach((id, i) => next.set(id, [res.pos[2 * i], res.pos[2 * i + 1]]))
        if (mode === "local") memory.local = next
        setLayout({ key, ids, pos: res.pos })
      })
  }, [visible, mode])

  const layoutDone = visible.nodes.length === 0 || layout?.key === visible.key

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("")
  const tagFilter = useMemo(() => {
    const m = /^tag:(.+)$/i.exec(filter.trim())
    return m ? m[1].trim().toLowerCase() : null
  }, [filter])

  // Folder -> palette slot, biggest folders first so the main ones differ.
  const folders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of graph.nodes) counts.set(n.folder, (counts.get(n.folder) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [graph.nodes])
  const folderSlot = useMemo(() => new Map(folders.map(([f], i) => [f, i])), [folders])

  const sceneNodes = useMemo<SceneNode[]>(() => {
    const s = search.trim().toLowerCase()
    return visible.nodes.map((n) => {
      const labelMatch = !s || n.label.toLowerCase().includes(s)
      const tagMatch = !tagFilter || n.tags.includes(tagFilter)
      return {
        id: n.id,
        label: n.label,
        group: folderSlot.get(n.folder) ?? 0,
        degree: n.degree,
        dim: !(labelMatch && tagMatch),
      }
    })
  }, [visible.nodes, search, tagFilter, folderSlot])

  // ── Canvas controller ─────────────────────────────────────────────────────
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctlRef = useRef<GraphCanvas | null>(null)
  const onOpenRef = useRef(onOpenFile)
  useEffect(() => {
    onOpenRef.current = onOpenFile
  }, [onOpenFile])
  const hasFiles = graph.nodes.length > 0
  const [sceneEpoch, setSceneEpoch] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const ctl = new GraphCanvas(canvas, stage, { onOpen: (id) => onOpenRef.current(id) })
    ctlRef.current = ctl
    // Theme: tokens are re-read when data-theme (or class) changes on `.app`.
    const appEl = stage.closest(".app") ?? document.documentElement
    const mo = new MutationObserver(() => ctl.refreshPalette())
    mo.observe(appEl, { attributes: true, attributeFilter: ["data-theme", "class"] })
    return () => {
      mo.disconnect()
      ctl.destroy()
      ctlRef.current = null
      // A remount builds a fresh controller; it needs the scene again.
      setSceneEpoch((e) => e + 1)
    }
  }, [hasFiles])

  // Fit the view when the picture changes character, not on every edit.
  const needFit = useRef(true)
  const centerKey = mode === "local" ? activePath : null
  useEffect(() => {
    needFit.current = true
  }, [mode, depth, centerKey])

  useEffect(() => {
    const ctl = ctlRef.current
    if (!ctl || !layout || layout.key !== visible.key) return
    const pos = new Map<string, [number, number]>()
    layout.ids.forEach((id, i) => pos.set(id, [layout.pos[2 * i], layout.pos[2 * i + 1]]))
    const scene = buildScene(
      sceneNodes,
      visible.edges.map((e) => [e.source, e.target]),
      (id) => pos.get(id),
    )
    ctl.setScene(scene, { fit: needFit.current })
    needFit.current = false
  }, [layout, visible, sceneNodes, sceneEpoch])

  useEffect(() => {
    ctlRef.current?.setActive(activePath)
  }, [activePath, layout, sceneEpoch])

  // ── Keyboard path: neighbours of the focus node ───────────────────────────
  const focusId = useMemo(() => {
    if (activeInGraph) return activePath
    let best: GraphNode | null = null
    for (const n of graph.nodes) if (!best || n.degree > best.degree) best = n
    return best?.id ?? null
  }, [activeInGraph, activePath, graph.nodes])
  const focusLabel = graph.nodes.find((n) => n.id === focusId)?.label ?? ""
  const neighbourList = useMemo(() => {
    if (!focusId) return []
    const labels = new Map(graph.nodes.map((n) => [n.id, n]))
    return [...(adjacency.get(focusId) ?? [])]
      .map((id) => labels.get(id))
      .filter((n): n is GraphNode => !!n)
      .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
      .slice(0, NEIGHBOUR_LIST_MAX)
  }, [focusId, adjacency, graph.nodes])

  const resetView = useCallback(() => ctlRef.current?.requestFit(), [])

  if (!hasFiles) {
    return <div className="tree-empty">{t.graphPanel.noFiles}</div>
  }

  const modeName = mode === "local" ? t.graphPanel.modeLocal : t.graphPanel.modeGlobal
  const shownFolders = folders.slice(0, 6)

  return (
    <div className="graph-panel" data-layout={layoutDone ? "done" : "pending"} data-mode={mode}>
      <div className="graph-toolbar">
        <div
          className="graph-seg"
          role="group"
          aria-label={t.graphPanel.modeLocal + " / " + t.graphPanel.modeGlobal}
        >
          <button
            type="button"
            className="graph-seg-btn"
            aria-pressed={mode === "local"}
            disabled={!activeInGraph}
            onClick={() => setUserMode("local")}
          >
            {t.graphPanel.modeLocal}
          </button>
          <button
            type="button"
            className="graph-seg-btn"
            aria-pressed={mode === "global"}
            onClick={() => setUserMode("global")}
          >
            {t.graphPanel.modeGlobal}
          </button>
        </div>
        {mode === "local" && (
          <div className="graph-seg" role="group" aria-label={t.graphPanel.depthLabel}>
            {([1, 2] as const).map((d) => (
              <button
                key={d}
                type="button"
                className="graph-seg-btn"
                aria-pressed={depth === d}
                aria-label={`${t.graphPanel.depthLabel} ${d}`}
                onClick={() => setDepth(d)}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="graph-btn"
          onClick={resetView}
          title={t.graphPanel.resetView}
          aria-label={t.graphPanel.resetView}
        >
          ⊕
        </button>
      </div>
      <div className="graph-toolbar graph-toolbar-filters">
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
      </div>
      <div
        ref={stageRef}
        className="graph-stage"
        // Zooms itself; keep the app-level Ctrl+wheel font zoom out (see
        // data-gesture-optout in useTouchpadGestures.ts).
        data-gesture-optout=""
      >
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          tabIndex={0}
          aria-label={t.graphPanel.canvasLabel(
            visible.nodes.length,
            visible.edges.length,
            modeName,
          )}
        />
        {!layoutDone && (
          <span className="graph-status" role="status">
            {t.graphPanel.layoutPending}
          </span>
        )}
        {focusId && (
          <ul className="graph-neighbours" aria-label={t.graphPanel.neighboursLabel(focusLabel)}>
            {neighbourList.length === 0 ? (
              <li className="graph-neighbours-empty">{t.graphPanel.noNeighbours}</li>
            ) : (
              neighbourList.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="graph-neighbour"
                    onClick={() => onOpenFile(n.id)}
                    onFocus={() => ctlRef.current?.setHighlight(n.id)}
                    onBlur={() => ctlRef.current?.setHighlight(null)}
                  >
                    {n.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <div className="graph-legend">
        {shownFolders.map(([folder], i) => (
          <span key={folder} className="graph-legend-item">
            <span className="graph-legend-dot" data-slot={i % 8} />
            {folder || t.graphPanel.root}
          </span>
        ))}
        {folders.length > shownFolders.length && (
          <span className="graph-legend-item">
            {t.graphPanel.moreFolders(folders.length - shownFolders.length)}
          </span>
        )}
      </div>
      <div className="graph-footer">
        <span className="graph-info">
          {t.graphPanel.graphInfo(visible.nodes.length, visible.edges.length)}
        </span>
      </div>
    </div>
  )
}
