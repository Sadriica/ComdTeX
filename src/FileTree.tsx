import { memo, useRef, useMemo, useState } from "react"
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import type { FileNode } from "./types"
import ContextMenu from "./ContextMenu"
import { displayBasename, pathDirname } from "./pathUtils"
import { useT } from "./i18n"

interface FileTreeProps {
  vaultPath: string | null
  tree: FileNode[]
  activePath: string | null
  isLoading?: boolean
  onSelectVault: () => void
  onOpenFile: (node: FileNode) => void
  /** `parentDir` omitted means the vault root. */
  onCreateFile: (name: string, parentDir?: string) => void
  onCreateFolder: (name: string, parentDir?: string) => void
  onDeleteFile: (path: string) => void
  onRenameFile: (oldPath: string, newName: string) => void
  onMoveFile?: (from: string, toFolder: string) => void
  /** Opens the template picker with `parentDir` preselected as the destination. */
  onNewFromTemplate?: (parentDir: string) => void
  /** Opens the per-folder rules editor for `dirPath`. */
  onEditFolderRules?: (dirPath: string) => void
  /** Turns an existing file into a reusable custom template. */
  onSaveAsTemplate?: (node: FileNode) => void
  /** Absolute paths that should display the cloud-sync conflict marker. */
  conflictPaths?: Set<string>
  /** Click handler for the conflict marker: typically opens the conflicts panel. */
  onConflictClick?: (path: string) => void
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
  conflictPaths,
  onConflictClick,
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
  conflictPaths?: Set<string>
  onConflictClick?: (path: string) => void
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
          // Selecting the folder (not just expanding it) is what makes "new
          // file" land inside it rather than at the vault root.
          onClick={() => { onFocus(node.path); setOpen((o) => !o) }}
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
            conflictPaths={conflictPaths}
            onConflictClick={onConflictClick}
          />
        ))}
      </div>
    )
  }

  const icon = node.ext === "tex" ? "τ" : node.ext === "bib" ? "β" : node.ext === "pdf" ? "P" : "M"
  const hasConflict = conflictPaths?.has(node.path) ?? false

  return (
    <div
      role="treeitem"
      aria-selected={isActive}
      className={`tree-row tree-file ${isActive ? "tree-active" : ""} ${isFocused ? "tree-focused" : ""}${hasConflict ? " tree-conflict" : ""}`}
      style={{ paddingLeft: 8 + indent }}
      tabIndex={isFocused ? 0 : -1}
      onClick={() => { if (renaming) return; onFocus(node.path); onOpenFile(node) }}
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
      {hasConflict && (
        <span
          className="tree-conflict-badge"
          title={t.cloudSync.conflictBadge}
          aria-label={t.cloudSync.conflictBadge}
          onClick={(e) => { e.stopPropagation(); onConflictClick?.(node.path) }}
        >⚠</span>
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

function FileTree({
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
  conflictPaths,
  onConflictClick,
  onNewFromTemplate,
  onEditFolderRules,
  onSaveAsTemplate,
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
  /** Destination for the next create, when it came from a folder's context menu. */
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  /** Index of every node by path, so the header buttons can find the selection. */
  const nodesByPath = useMemo(() => {
    const map = new Map<string, FileNode>()
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        map.set(n.path, n)
        if (n.children) walk(n.children)
      }
    }
    walk(tree)
    return map
  }, [tree])

  /**
   * Where a create started from the header toolbar should go: the selected
   * folder, or the folder containing the selected file. Undefined (vault root)
   * when nothing is selected; creating at the root stays the default, it is
   * just no longer the ONLY option.
   */
  const selectedDir = useMemo((): string | undefined => {
    const node = focusedPath ? nodesByPath.get(focusedPath) : undefined
    if (!node) return undefined
    return node.type === "dir" ? node.path : pathDirname(node.path)
  }, [focusedPath, nodesByPath])

  const startCreate = (kind: "file" | "folder", parentDir?: string) => {
    setNewName("")
    setCreatingIn(parentDir ?? null)
    setCreating(kind)
  }

  const submitCreate = () => {
    const name = newName.trim()
    const parentDir = creatingIn ?? selectedDir
    setCreating(null)
    setCreatingIn(null)
    setNewName("")
    if (!name) return
    if (creating === "file") onCreateFile(name, parentDir)
    else onCreateFolder(name, parentDir)
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
    } else if (e.key === "F2" && focused) {
      // Folders rename too: `renameFile` is a plain FS rename either way.
      e.preventDefault()
      setNewName(focused.name)
      setRenamingCtx(focused)
    } else if (e.key === "Delete" && focused) {
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
          <button title={t.fileTree.newFile} aria-label={t.fileTree.newFileLabel} onClick={() => startCreate("file")}>+</button>
          <button title={t.fileTree.newFolder} aria-label={t.fileTree.newFolderLabel} onClick={() => startCreate("folder")}>⊞</button>
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
          <button className="tree-filter-clear" onClick={() => setFilterQuery("")} title={t.fileTree.clearFilter} aria-label={t.fileTree.clearFilter}>×</button>
        )}
      </div>

      {isLoading && (
        <div className="tree-loading" aria-live="polite">
          <span className="tree-spinner">⟳</span> {t.fileTree.loading}
        </div>
      )}

      {creating && (
        <div className="tree-new-input">
          {/* Say where it will land (silently creating at the root when the
              user had a folder selected was the original complaint. */}
          <span className="tree-new-target">
            {t.fileTree.creatingIn(
              (creatingIn ?? selectedDir)
                ? displayBasename(creatingIn ?? selectedDir!)
                : vaultName,
            )}
          </span>
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
              conflictPaths={conflictPaths}
              onConflictClick={onConflictClick}
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
                  ...(onSaveAsTemplate
                    ? [{ label: t.fileTree.saveAsTemplate, action: () => onSaveAsTemplate(ctx.node) }]
                    : []),
                  {
                    label: t.fileTree.delete,
                    danger: true,
                    action: () => handleConfirmDelete(ctx.node),
                  },
                ]
              : [
                  { label: t.fileTree.newFileHere, action: () => startCreate("file", ctx.node.path) },
                  { label: t.fileTree.newFolderHere, action: () => startCreate("folder", ctx.node.path) },
                  ...(onNewFromTemplate
                    ? [{ label: t.fileTree.newFromTemplateHere, action: () => onNewFromTemplate(ctx.node.path) }]
                    : []),
                  {
                    label: t.fileTree.rename,
                    action: () => {
                      setNewName(ctx.node.name)
                      setRenamingCtx(ctx.node)
                    },
                  },
                  ...(onEditFolderRules
                    ? [{ label: t.fileTree.folderRules, action: () => onEditFolderRules(ctx.node.path) }]
                    : []),
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

// Memoized: AppContent re-renders on every keystroke, but the file tree only
// depends on the vault (stable across keystrokes). Without this, a large vault's
// tree re-rendered on each character typed: the dominant "big vault = slow
// typing" cost. All callback/array props from App are stable (useCallback/useMemo).
export default memo(FileTree)
