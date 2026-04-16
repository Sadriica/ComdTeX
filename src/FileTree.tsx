import { useRef, useMemo, useState } from "react"
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import type { FileNode } from "./types"
import ContextMenu from "./ContextMenu"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"

interface FileTreeProps {
  vaultPath: string | null
  tree: FileNode[]
  activePath: string | null
  isLoading?: boolean
  onSelectVault: () => void
  onOpenFile: (node: FileNode) => void
  onCreateFile: (name: string) => void
  onCreateFolder: (name: string) => void
  onDeleteFile: (path: string) => void
  onRenameFile: (oldPath: string, newName: string) => void
  onMoveFile?: (from: string, toFolder: string) => void
}

interface CtxState {
  x: number
  y: number
  node: FileNode
}

function FileNodeRow({
  node,
  depth,
  activePath,
  focusedPath,
  onOpenFile,
  onDelete,
  onRename,
  onContextMenu,
  onFocus,
  onMoveFile,
}: {
  node: FileNode
  depth: number
  activePath: string | null
  focusedPath: string | null
  onOpenFile: (n: FileNode) => void
  onDelete: (path: string) => void
  onRename: (path: string, newName: string) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  onFocus: (path: string) => void
  onMoveFile?: (from: string, toFolder: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const renameRef = useRef<HTMLInputElement>(null)
  const isActive = node.path === activePath
  const isFocused = node.path === focusedPath
  const indent = depth * 12

  const startRename = () => {
    setRenameVal(node.name)
    setRenaming(true)
    setTimeout(() => renameRef.current?.select(), 0)
  }

  const submitRename = () => {
    const val = renameVal.trim()
    if (val && val !== node.name) onRename(node.path, val)
    setRenaming(false)
  }

  if (node.type === "dir") {
    return (
      <div role="treeitem" aria-expanded={open}>
        <div
          className={`tree-row tree-dir${isDragOver ? " tree-drop-target" : ""}`}
          style={{ paddingLeft: 8 + indent }}
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
          onFocus={() => onFocus(node.path)}
          onContextMenu={(e) => onContextMenu(e, node)}
          aria-label={t.fileTree.folderLabel(node.name)}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            const fromPath = e.dataTransfer.getData("text/plain")
            if (fromPath && fromPath !== node.path) onMoveFile?.(fromPath, node.path)
          }}
        >
          <span className="tree-icon" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span className="tree-name">{node.name}</span>
        </div>
        {open && node.children?.map((child) => (
          <FileNodeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            focusedPath={focusedPath}
            onOpenFile={onOpenFile}
            onDelete={onDelete}
            onRename={onRename}
            onContextMenu={onContextMenu}
            onFocus={onFocus}
            onMoveFile={onMoveFile}
          />
        ))}
      </div>
    )
  }

  const icon = node.ext === "tex" ? "τ" : node.ext === "bib" ? "β" : "M"

  return (
    <div
      role="treeitem"
      aria-selected={isActive}
      className={`tree-row tree-file ${isActive ? "tree-active" : ""} ${isFocused ? "tree-focused" : ""}`}
      style={{ paddingLeft: 8 + indent }}
      tabIndex={isFocused ? 0 : -1}
      onClick={() => !renaming && onOpenFile(node)}
      onDoubleClick={startRename}
      onFocus={() => onFocus(node.path)}
      onContextMenu={(e) => onContextMenu(e, node)}
      aria-label={node.name}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", node.path); e.dataTransfer.effectAllowed = "move" }}
    >
      <span className="tree-icon" aria-hidden="true">{icon}</span>
      {renaming ? (
        <input
          ref={renameRef}
          className="tree-rename-input"
          value={renameVal}
          autoFocus
          onChange={(e) => setRenameVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename()
            if (e.key === "Escape") setRenaming(false)
            e.stopPropagation()
          }}
          onBlur={submitRename}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="tree-name">{node.name}</span>
      )}
    </div>
  )
}

function sortTree(nodes: FileNode[], asc: boolean): FileNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1
      return asc
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    })
    .map(n => n.type === "dir" && n.children
      ? { ...n, children: sortTree(n.children, asc) }
      : n
    )
}

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return nodes
  const q = query.toLowerCase()
  return nodes.reduce<FileNode[]>((acc, node) => {
    if (node.type === "dir" && node.children) {
      const filtered = filterTree(node.children, query)
      if (filtered.length > 0) acc.push({ ...node, children: filtered })
    } else if (node.name.toLowerCase().includes(q)) {
      acc.push(node)
    }
    return acc
  }, [])
}

export default function FileTree({
  vaultPath,
  tree,
  activePath,
  isLoading = false,
  onSelectVault,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onRenameFile,
  onMoveFile,
}: FileTreeProps) {
  const t = useT()
  const [sortAsc, setSortAsc] = useState(true)
  const [filterQuery, setFilterQuery] = useState("")

  const sortedTree = useMemo(() => sortTree(tree, sortAsc), [tree, sortAsc])
  const filteredTree = useMemo(() => filterTree(sortedTree, filterQuery), [sortedTree, filterQuery])

  const [creating, setCreating] = useState<"file" | "folder" | null>(null)
  const [newName, setNewName] = useState("")
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [renamingCtx, setRenamingCtx] = useState<FileNode | null>(null)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  const submitCreate = () => {
    if (!newName.trim()) { setCreating(null); return }
    if (creating === "file") onCreateFile(newName.trim())
    else onCreateFolder(newName.trim())
    setCreating(null)
    setNewName("")
  }

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, node })
  }

  const handleConfirmDelete = async (node: FileNode) => {
    try {
      const ok = await tauriConfirm(
        t.fileTree.confirmDelete(node.name),
        { title: t.fileTree.confirmDeleteTitle, kind: "warning" }
      )
      if (ok) onDeleteFile(node.path)
    } catch {
      // If the dialog fails, do not delete
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const allNodes: FileNode[] = []
    const collectAll = (nodes: FileNode[]) => {
      for (const n of nodes) {
        allNodes.push(n)
        if (n.type === "dir" && n.children) collectAll(n.children)
      }
    }
    collectAll(filteredTree)

    const currentIdx = allNodes.findIndex((n) => n.path === focusedPath)
    const focused = allNodes[currentIdx]

    if (e.key === "ArrowDown") {
      e.preventDefault()
      const next = allNodes[currentIdx + 1]
      if (next) setFocusedPath(next.path)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const prev = allNodes[currentIdx - 1]
      if (prev) setFocusedPath(prev.path)
    } else if (e.key === "Enter" && focused?.type === "file") {
      e.preventDefault()
      onOpenFile(focused)
    } else if (e.key === "F2" && focused?.type === "file") {
      e.preventDefault()
      setNewName(focused.name)
      setRenamingCtx(focused)
    } else if (e.key === "Delete" && focused?.type === "file") {
      e.preventDefault()
      handleConfirmDelete(focused)
    }
  }

  if (!vaultPath) {
    return (
      <div className="sidebar-empty">
        <p>{t.fileTree.noVault}</p>
        <button className="btn-vault" onClick={onSelectVault}>
          {t.fileTree.openFolder}
        </button>
      </div>
    )
  }

  const vaultName = displayBasename(vaultPath)

  return (
    <div
      className="file-tree"
      role="tree"
      aria-label={t.fileTree.vaultFiles}
      onKeyDown={handleKeyDown}
    >
      <div className="tree-header">
        <span className="tree-vault-name" title={vaultPath}>{vaultName}</span>
        <div className="tree-actions">
          <button title={t.fileTree.newFile} aria-label={t.fileTree.newFileLabel} onClick={() => { setNewName(""); setCreating("file") }}>+</button>
          <button title={t.fileTree.newFolder} aria-label={t.fileTree.newFolderLabel} onClick={() => { setNewName(""); setCreating("folder") }}>⊞</button>
          <button
            title={sortAsc ? t.fileTree.sortZA : t.fileTree.sortAZ}
            aria-label={sortAsc ? t.fileTree.sortZA : t.fileTree.sortAZ}
            onClick={() => setSortAsc(a => !a)}
          >{sortAsc ? "↑A" : "↓Z"}</button>
          <button title={t.fileTree.changeVault} aria-label={t.fileTree.changeVault} onClick={onSelectVault}>⊙</button>
        </div>
      </div>

      <div className="tree-filter">
        <input
          className="tree-filter-input"
          type="search"
          placeholder={t.fileTree.filterPlaceholder}
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          aria-label={t.fileTree.filterPlaceholder}
        />
        {filterQuery && (
          <button className="tree-filter-clear" onClick={() => setFilterQuery("")} title="Limpiar">×</button>
        )}
      </div>

      {isLoading && (
        <div className="tree-loading" aria-live="polite">
          <span className="tree-spinner">⟳</span> {t.fileTree.loading}
        </div>
      )}

      {creating && (
        <div className="tree-new-input">
          <input
            autoFocus
            placeholder={creating === "file" ? t.fileTree.filenamePlaceholder : t.fileTree.folderPlaceholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate()
              if (e.key === "Escape") setCreating(null)
            }}
            onBlur={submitCreate}
            aria-label={creating === "file" ? t.fileTree.newFileLabel : t.fileTree.newFolderLabel}
          />
        </div>
      )}

      {renamingCtx && (
        <div className="tree-new-input">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = newName.trim()
                if (val && val !== renamingCtx.name) onRenameFile(renamingCtx.path, val)
                setRenamingCtx(null)
              }
              if (e.key === "Escape") setRenamingCtx(null)
            }}
            onBlur={() => {
              const val = newName.trim()
              if (val && val !== renamingCtx.name) onRenameFile(renamingCtx.path, val)
              setRenamingCtx(null)
            }}
            aria-label={t.fileTree.renamingLabel(renamingCtx.name)}
          />
        </div>
      )}

      <div className="tree-list" ref={treeRef}>
        {!isLoading && filteredTree.length === 0 ? (
          <div className="tree-empty">{t.fileTree.noFiles}</div>
        ) : (
          filteredTree.map((node) => (
            <FileNodeRow
              key={node.path}
              node={node}
              depth={0}
              activePath={activePath}
              focusedPath={focusedPath}
              onOpenFile={onOpenFile}
              onDelete={onDeleteFile}
              onRename={onRenameFile}
              onContextMenu={handleContextMenu}
              onFocus={setFocusedPath}
              onMoveFile={onMoveFile}
            />
          ))
        )}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={
            ctx.node.type === "file"
              ? [
                  { label: t.fileTree.open, action: () => onOpenFile(ctx.node) },
                  {
                    label: t.fileTree.rename,
                    action: () => {
                      setNewName(ctx.node.name)
                      setRenamingCtx(ctx.node)
                    },
                  },
                  {
                    label: t.fileTree.delete,
                    danger: true,
                    action: () => handleConfirmDelete(ctx.node),
                  },
                ]
              : [
                  {
                    label: t.fileTree.deleteFolder,
                    danger: true,
                    action: () => handleConfirmDelete(ctx.node),
                  },
                ]
          }
        />
      )}
    </div>
  )
}
