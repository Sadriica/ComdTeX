import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import type { FileNode } from "./types"
import ContextMenu from "./ContextMenu"
import { displayBasename, keepFileExtension, pathDirname } from "./pathUtils"
import {
  ancestorFolders,
  finalName,
  nameProblemText,
  targetFolder,
  validateName,
  type NameKind,
  type NameProblem,
} from "./fileNaming"
import { useT } from "./i18n"
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  FolderPlus,
  Icon,
  Library,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
  type LucideIcon,
} from "./icons"

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"])

/** Lucide icon for a file, by extension (md, tex, bib, csv, image, pdf, ...). */
function fileIconFor(ext: string | undefined): LucideIcon {
  const e = (ext ?? "").toLowerCase()
  if (e === "md" || e === "markdown" || e === "txt") return FileText
  if (e === "tex" || e === "typ" || e === "sty" || e === "cls") return FileCode
  if (e === "bib") return Library
  if (e === "csv" || e === "tsv") return FileSpreadsheet
  if (e === "pdf") return FileType
  if (IMAGE_EXTS.has(e)) return FileImage
  return File
}

export interface TreeCreateRequest {
  kind: NameKind
  /** Absolute folder; omitted means "follow the target-folder rule". */
  parentDir?: string
  /** Changes on every request so the same request can be repeated. */
  nonce: number
}

export interface TreeRevealRequest {
  path: string
  nonce: number
}

interface FileTreeProps {
  vaultPath: string | null
  tree: FileNode[]
  activePath: string | null
  isLoading?: boolean
  onSelectVault: () => void
  onOpenFile: (node: FileNode) => void
  /** `parentDir` omitted means the vault root. `name` already carries its extension. */
  onCreateFile: (name: string, parentDir?: string) => Promise<unknown> | void
  /** Resolves to the new folder's path (or null when nothing was created). */
  onCreateFolder: (name: string, parentDir?: string) => Promise<string | null | void> | void
  onDeleteFile: (path: string) => void
  /** Resolves to the new path, or null when the rename was refused. */
  onRenameFile: (oldPath: string, newName: string) => Promise<string | null | void> | void
  /** Resolves to the moved item's new path, or null when the move was refused. */
  onMoveFile?: (from: string, toFolder: string) => Promise<string | null | void> | void
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
  /** Start an inline create from outside the tree (palette command, shortcut). */
  createRequest?: TreeCreateRequest | null
  /** Select, expand to and scroll to a path without opening it. */
  revealRequest?: TreeRevealRequest | null
  /** Reports the selected row, so every other create flow can follow the same target rule. */
  onSelectionChange?: (path: string | null, isDir: boolean) => void
}

interface CtxState {
  x: number
  y: number
  node: FileNode
}

interface CreatingState {
  kind: NameKind
  parentDir: string
}

interface TreeContextValue {
  activePath: string | null
  focusedPath: string | null
  collapsed: ReadonlySet<string>
  creating: CreatingState | null
  renamingPath: string | null
  vaultPath: string
  nodesByPath: ReadonlyMap<string, FileNode>
  rootNodes: FileNode[]
  conflictPaths?: Set<string>
  onOpenFile: (n: FileNode) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  onFocus: (path: string) => void
  onToggle: (path: string) => void
  onStartRename: (path: string) => void
  onCancelRename: () => void
  onCommitRename: (node: FileNode, newName: string) => void
  onCancelCreate: () => void
  onCommitCreate: (name: string) => void
  onDropOn: (from: string, toFolder: string) => void
  onConflictClick?: (path: string) => void
}

const TreeContext = createContext<TreeContextValue | null>(null)

function useTree(): TreeContextValue {
  const ctx = useContext(TreeContext)
  if (!ctx) throw new Error("TreeContext missing")
  return ctx
}

/** Names of the entries inside a folder (for the "already exists" check). */
function childNames(ctx: TreeContextValue, dir: string): string[] {
  const kids = dir === ctx.vaultPath ? ctx.rootNodes : ctx.nodesByPath.get(dir)?.children
  return (kids ?? []).map((k) => k.name)
}

interface NameEditRowProps {
  depth: number
  icon: (typed: string) => React.ReactNode
  initial: string
  placeholder?: string
  ariaLabel: string
  /** Select only the part before the last dot (rename of a file). */
  selectStem?: boolean
  /** Turns what was typed into the final name and its problem, if any. */
  resolve: (typed: string) => { name: string; problem: NameProblem | null }
  /** Show "type a name" while empty (rename); a fresh create row stays quiet. */
  showEmpty?: boolean
  onSubmit: (finalName: string) => void
  onCancel: () => void
}

/**
 * The one inline input of the tree, used for creating and renaming. It sits
 * in the row where the item will live, validates as you type, and settles on
 * Enter (commit), Escape (cancel) or blur (commit when valid and changed,
 * otherwise cancel: the way VS Code does it).
 */
function NameEditRow({
  depth,
  icon,
  initial,
  placeholder,
  ariaLabel,
  selectStem,
  resolve,
  showEmpty,
  onSubmit,
  onCancel,
}: NameEditRowProps) {
  const t = useT()
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const settled = useRef(false)
  const errorId = `${ariaLabel.replace(/\W+/g, "-")}-error`

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf(".")
    if (selectStem && dot > 0) el.setSelectionRange(0, dot)
    else el.select()
    rowRef.current?.scrollIntoView?.({ block: "nearest" })
    // Mount only: the initial value never changes for a given row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unchanged = value === initial
  const { name, problem } = resolve(value)
  const shownProblem = unchanged || (value === "" && !showEmpty) ? null : problem
  const canSubmit = !unchanged && !problem

  const settle = (commit: boolean) => {
    if (settled.current) return
    settled.current = true
    if (commit && canSubmit) onSubmit(name)
    else onCancel()
  }

  return (
    <div className="tree-edit" ref={rowRef}>
      <div className="tree-row tree-editing" style={{ "--depth": depth } as React.CSSProperties}>
        {icon(name)}
        <input
          ref={inputRef}
          className="tree-rename-input"
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={shownProblem ? true : undefined}
          aria-describedby={shownProblem ? errorId : undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Nothing typed here may reach the tree's own shortcuts (Delete, F2, arrows).
            e.stopPropagation()
            if (e.key === "Enter") {
              e.preventDefault()
              if (canSubmit) settle(true)
              else if (unchanged && initial !== "") settle(false)
            } else if (e.key === "Escape") {
              e.preventDefault()
              settle(false)
            }
          }}
          onBlur={() => {
            // Switching to another window is not leaving the field.
            if (typeof document !== "undefined" && !document.hasFocus()) return
            settle(true)
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      </div>
      {shownProblem && (
        <div
          id={errorId}
          className="tree-name-error"
          role="alert"
          style={{ "--depth": depth } as React.CSSProperties}
        >
          {nameProblemText(t.naming.problems, shownProblem, name)}
        </div>
      )}
    </div>
  )
}

function FileIconSlot({ ext }: { ext: string | undefined }) {
  return (
    <span className="tree-icon tree-icon-file" aria-hidden="true">
      <Icon icon={fileIconFor(ext)} size={14} />
    </span>
  )
}

function FolderIconSlot({ open }: { open: boolean }) {
  return (
    <span className="tree-icon" aria-hidden="true">
      <Icon icon={open ? ChevronDown : ChevronRight} size={14} />
      <Icon icon={open ? FolderOpen : Folder} size={14} />
    </span>
  )
}

function extOf(name: string): string | undefined {
  return /\.([^./\\]+)$/.exec(name)?.[1]
}

/** The inline "new file / new folder" row, in the folder it will be created in. */
function CreateRow({ depth, creating }: { depth: number; creating: CreatingState }) {
  const t = useT()
  const ctx = useTree()
  const siblings = useMemo(() => childNames(ctx, creating.parentDir), [ctx, creating.parentDir])
  const isFile = creating.kind === "file"
  return (
    <NameEditRow
      depth={depth}
      initial=""
      placeholder={isFile ? t.fileTree.filenamePlaceholder : t.fileTree.folderPlaceholder}
      ariaLabel={isFile ? t.fileTree.newFileLabel : t.fileTree.newFolderLabel}
      icon={(typed) =>
        isFile ? (
          <FileIconSlot ext={extOf(finalName(typed, "file")) ?? "md"} />
        ) : (
          <FolderIconSlot open={false} />
        )
      }
      resolve={(typed) => ({
        name: finalName(typed, creating.kind),
        problem: validateName(typed, creating.kind, siblings),
      })}
      onSubmit={(name) => ctx.onCommitCreate(name)}
      onCancel={ctx.onCancelCreate}
    />
  )
}

/** The children of one folder (or the vault root), with the create row at its sort position. */
function TreeLevel({
  nodes,
  depth,
  parentPath,
}: {
  nodes: FileNode[] | undefined
  depth: number
  parentPath: string
}) {
  const ctx = useTree()
  const list = nodes ?? []
  const here = ctx.creating?.parentDir === parentPath ? ctx.creating : null
  // Folders first, then files (the tree's own order): a new folder row leads
  // the folders, a new file row leads the files. Re-sorting while typing would
  // make the row jump under the caret.
  const dirs = list.filter((n) => n.type === "dir")
  const files = list.filter((n) => n.type !== "dir")
  const row = (n: FileNode) => <FileNodeRow key={n.path} node={n} depth={depth} />
  return (
    <>
      {here?.kind === "folder" && <CreateRow key="create-folder" depth={depth} creating={here} />}
      {dirs.map(row)}
      {here?.kind === "file" && <CreateRow key="create-file" depth={depth} creating={here} />}
      {files.map(row)}
    </>
  )
}

function FileNodeRow({ node, depth }: { node: FileNode; depth: number }) {
  const t = useT()
  const ctx = useTree()
  const [isDragOver, setIsDragOver] = useState(false)
  const isActive = node.path === ctx.activePath
  const isFocused = node.path === ctx.focusedPath
  const renaming = ctx.renamingPath === node.path
  const open = !ctx.collapsed.has(node.path)

  const dragProps = {
    draggable: !renaming,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", node.path)
      e.dataTransfer.effectAllowed = "move"
    },
  }

  const renameRow = (icon: React.ReactNode) => {
    const siblings = childNames(ctx, pathDirname(node.path) || ctx.vaultPath)
    return (
      <NameEditRow
        depth={depth}
        initial={node.name}
        ariaLabel={t.fileTree.renamingLabel(node.name)}
        selectStem={node.type === "file"}
        showEmpty
        icon={() => icon}
        resolve={(typed) => {
          // A blank name must stay blank, not gain an extension.
          const name =
            node.type === "file" && typed.trim() !== ""
              ? keepFileExtension(typed, node.name)
              : typed
          return { name, problem: validateName(name, "folder", siblings, node.name) }
        }}
        onSubmit={(name) => ctx.onCommitRename(node, name)}
        onCancel={ctx.onCancelRename}
      />
    )
  }

  if (node.type === "dir") {
    return (
      <div role="treeitem" aria-expanded={open}>
        {renaming ? (
          renameRow(<FolderIconSlot open={open} />)
        ) : (
          <div
            className={`tree-row tree-dir${isFocused ? " tree-focused" : ""}${isDragOver ? " tree-drop-target" : ""}`}
            style={{ "--depth": depth } as React.CSSProperties}
            data-path={node.path}
            tabIndex={-1}
            // Selecting the folder (not just expanding it) is what makes "new
            // file" land inside it rather than at the vault root.
            onClick={() => {
              ctx.onFocus(node.path)
              ctx.onToggle(node.path)
            }}
            onFocus={() => ctx.onFocus(node.path)}
            onContextMenu={(e) => ctx.onContextMenu(e, node)}
            aria-label={t.fileTree.folderLabel(node.name)}
            {...dragProps}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = "move"
              setIsDragOver(true)
            }}
            onDragLeave={(e) => {
              // Crossing into the row's own icon or name is not leaving the row.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false)
            }}
            onDragEnd={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDragOver(false)
              const fromPath = e.dataTransfer.getData("text/plain")
              if (fromPath && fromPath !== node.path) ctx.onDropOn(fromPath, node.path)
            }}
          >
            <FolderIconSlot open={open} />
            <span className="tree-name" title={node.name}>
              {node.name}
            </span>
          </div>
        )}
        {open && <TreeLevel nodes={node.children} depth={depth + 1} parentPath={node.path} />}
      </div>
    )
  }

  const hasConflict = ctx.conflictPaths?.has(node.path) ?? false

  if (renaming) {
    return (
      <div role="treeitem" aria-selected={isActive}>
        {renameRow(<FileIconSlot ext={node.ext} />)}
      </div>
    )
  }

  return (
    <div
      role="treeitem"
      aria-selected={isActive}
      className={`tree-row tree-file ${isActive ? "tree-active" : ""} ${isFocused ? "tree-focused" : ""}${hasConflict ? " tree-conflict" : ""}`}
      style={{ "--depth": depth } as React.CSSProperties}
      data-path={node.path}
      tabIndex={isFocused ? 0 : -1}
      onClick={() => {
        ctx.onFocus(node.path)
        ctx.onOpenFile(node)
      }}
      onDoubleClick={() => ctx.onStartRename(node.path)}
      onFocus={() => ctx.onFocus(node.path)}
      onContextMenu={(e) => ctx.onContextMenu(e, node)}
      aria-label={node.name}
      {...dragProps}
    >
      <FileIconSlot ext={node.ext} />
      <span className="tree-name" title={node.name}>
        {node.name}
      </span>
      {hasConflict && (
        <span
          className="tree-conflict-badge"
          title={t.cloudSync.conflictBadge}
          aria-label={t.cloudSync.conflictBadge}
          onClick={(e) => {
            e.stopPropagation()
            ctx.onConflictClick?.(node.path)
          }}
        >
          <Icon icon={TriangleAlert} size={14} />
        </span>
      )}
    </div>
  )
}

function sortTree(nodes: FileNode[], asc: boolean): FileNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1
      return asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    })
    .map((n) =>
      n.type === "dir" && n.children ? { ...n, children: sortTree(n.children, asc) } : n,
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
  createRequest,
  revealRequest,
  onSelectionChange,
}: FileTreeProps) {
  const t = useT()
  const [sortAsc, setSortAsc] = useState(true)
  const [filterQuery, setFilterQuery] = useState("")

  const sortedTree = useMemo(() => sortTree(tree, sortAsc), [tree, sortAsc])
  const filteredTree = useMemo(() => filterTree(sortedTree, filterQuery), [sortedTree, filterQuery])

  const [creating, setCreating] = useState<CreatingState | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  /** Folders the user collapsed; everything starts expanded. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [rootDragOver, setRootDragOver] = useState(false)
  /** Bumped to ask the effect below to scroll the selected row into view. */
  const [scrollTick, setScrollTick] = useState(0)
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

  const expandTo = useCallback(
    (path: string, includeSelf = false) => {
      if (!vaultPath) return
      const folders = ancestorFolders(vaultPath, path)
      if (includeSelf) folders.push(path)
      setCollapsed((prev) => {
        if (!folders.some((f) => prev.has(f))) return prev
        const next = new Set(prev)
        for (const f of folders) next.delete(f)
        return next
      })
    },
    [vaultPath],
  )

  const select = useCallback(
    (path: string) => {
      setFocusedPath(path)
      expandTo(path)
      setScrollTick((n) => n + 1)
    },
    [expandTo],
  )

  // The note open in the editor is the selection: following it keeps "new
  // file" aimed at the folder the user is working in, and reveals it in the
  // tree after a quick open or a jump from another panel.
  const [seenActive, setSeenActive] = useState<string | null>(null)
  if (seenActive !== activePath) {
    setSeenActive(activePath)
    if (activePath) select(activePath)
  }

  const [seenReveal, setSeenReveal] = useState<number | null>(null)
  if (revealRequest && seenReveal !== revealRequest.nonce) {
    setSeenReveal(revealRequest.nonce)
    select(revealRequest.path)
  }

  useEffect(() => {
    if (scrollTick === 0) return
    const root = treeRef.current
    if (!root || !focusedPath) return
    const row = Array.from(root.querySelectorAll<HTMLElement>("[data-path]")).find(
      (el) => el.dataset.path === focusedPath,
    )
    row?.scrollIntoView?.({ block: "nearest" })
    // Only a request to scroll (scrollTick) should move the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTick])

  const selectedNode = focusedPath ? nodesByPath.get(focusedPath) : undefined
  useEffect(() => {
    onSelectionChange?.(selectedNode?.path ?? null, selectedNode?.type === "dir")
  }, [selectedNode?.path, selectedNode?.type, onSelectionChange])

  /** Where a create goes: the shared target-folder rule (fileNaming.targetFolder). */
  const resolveTarget = (): string =>
    targetFolder({
      vaultRoot: vaultPath ?? "",
      selectedPath: selectedNode?.path,
      selectedIsDir: selectedNode?.type === "dir",
      activePath,
    })

  const startCreate = (kind: NameKind, parentDir?: string) => {
    if (!vaultPath) return
    const dir = parentDir ?? resolveTarget()
    // A filter hides rows: the new one must not land in a filtered-out folder.
    setFilterQuery("")
    expandTo(dir, true)
    setRenamingPath(null)
    setCreating({ kind, parentDir: dir })
  }

  const [seenCreate, setSeenCreate] = useState<number | null>(null)
  if (createRequest && seenCreate !== createRequest.nonce) {
    setSeenCreate(createRequest.nonce)
    startCreate(createRequest.kind, createRequest.parentDir)
  }

  const commitCreate = (name: string) => {
    const state = creating
    setCreating(null)
    if (!state) return
    const parentDir = state.parentDir === vaultPath ? undefined : state.parentDir
    if (state.kind === "file") {
      // The new note opens and becomes the active one, which selects it here.
      void onCreateFile(name, parentDir)
    } else {
      void Promise.resolve(onCreateFolder(name, parentDir)).then((created) => {
        if (typeof created === "string") select(created)
      })
    }
  }

  const commitRename = (node: FileNode, newName: string) => {
    setRenamingPath(null)
    if (newName === node.name) return
    void Promise.resolve(onRenameFile(node.path, newName)).then((newPath) => {
      if (typeof newPath === "string") select(newPath)
    })
  }

  const handleDropOn = (from: string, toFolder: string) => {
    void Promise.resolve(onMoveFile?.(from, toFolder)).then((moved) => {
      // The moved item stays selected, and its new folder opens so it is visible.
      if (typeof moved === "string") {
        expandTo(toFolder, true)
        select(moved)
      }
    })
  }

  const toggle = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, node })
  }

  const handleConfirmDelete = async (node: FileNode) => {
    try {
      const ok = await tauriConfirm(t.fileTree.confirmDelete(node.name), {
        title: t.fileTree.confirmDeleteTitle,
        kind: "warning",
      })
      if (ok) onDeleteFile(node.path)
    } catch {
      // If the dialog fails, do not delete
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Visible rows only: a collapsed folder's children are skipped.
    const allNodes: FileNode[] = []
    const collectAll = (nodes: FileNode[]) => {
      for (const n of nodes) {
        allNodes.push(n)
        if (n.type === "dir" && n.children && !collapsed.has(n.path)) collectAll(n.children)
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
      setCreating(null)
      setRenamingPath(focused.path)
    } else if (e.key === "Delete" && focused) {
      e.preventDefault()
      handleConfirmDelete(focused)
    }
  }

  const treeCtx = useMemo<TreeContextValue | null>(
    () =>
      vaultPath
        ? {
            activePath,
            focusedPath,
            collapsed,
            creating,
            renamingPath,
            vaultPath,
            nodesByPath,
            rootNodes: filteredTree,
            conflictPaths,
            onOpenFile,
            onContextMenu: handleContextMenu,
            onFocus: setFocusedPath,
            onToggle: toggle,
            onStartRename: (p) => {
              setCreating(null)
              setRenamingPath(p)
            },
            onCancelRename: () => setRenamingPath(null),
            onCommitRename: commitRename,
            onCancelCreate: () => setCreating(null),
            onCommitCreate: commitCreate,
            onDropOn: handleDropOn,
            onConflictClick,
          }
        : null,
    // The handlers close over props and state that change together with the
    // values listed; a fresh context per render is what the rows expect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      vaultPath,
      activePath,
      focusedPath,
      collapsed,
      creating,
      renamingPath,
      nodesByPath,
      filteredTree,
      conflictPaths,
      onOpenFile,
      onConflictClick,
      toggle,
      onCreateFile,
      onCreateFolder,
      onRenameFile,
      onMoveFile,
    ],
  )

  if (!vaultPath || !treeCtx) {
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
  const rootCreate = creating?.parentDir === vaultPath
  const showEmpty = !isLoading && filteredTree.length === 0 && !rootCreate

  const newItems = (dir: string) => [
    { label: t.fileTree.newFileHere, action: () => startCreate("file", dir) },
    { label: t.fileTree.newFolderHere, action: () => startCreate("folder", dir) },
  ]

  return (
    <TreeContext.Provider value={treeCtx}>
      <div
        className="file-tree"
        role="tree"
        aria-label={t.fileTree.vaultFiles}
        onKeyDown={handleKeyDown}
      >
        <div className="tree-header">
          <span className="tree-vault-name" title={vaultPath}>
            {vaultName}
          </span>
          <div className="tree-actions">
            <button
              title={t.fileTree.newFile}
              aria-label={t.fileTree.newFileLabel}
              onClick={() => startCreate("file")}
            >
              <Icon icon={Plus} size={14} />
            </button>
            <button
              title={t.fileTree.newFolder}
              aria-label={t.fileTree.newFolderLabel}
              onClick={() => startCreate("folder")}
            >
              <Icon icon={FolderPlus} size={14} />
            </button>
            <button
              title={sortAsc ? t.fileTree.sortZA : t.fileTree.sortAZ}
              aria-label={sortAsc ? t.fileTree.sortZA : t.fileTree.sortAZ}
              onClick={() => setSortAsc((a) => !a)}
            >
              <Icon icon={sortAsc ? ArrowDownAZ : ArrowUpAZ} size={14} />
            </button>
            <button
              title={t.fileTree.changeVault}
              aria-label={t.fileTree.changeVault}
              onClick={onSelectVault}
            >
              <Icon icon={FolderOpen} size={14} />
            </button>
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
            <button
              className="tree-filter-clear"
              onClick={() => setFilterQuery("")}
              title={t.fileTree.clearFilter}
              aria-label={t.fileTree.clearFilter}
            >
              <Icon icon={X} size={14} />
            </button>
          )}
        </div>

        {isLoading && (
          <div className="tree-loading" aria-live="polite">
            <span className="tree-spinner">
              <Icon icon={RefreshCw} size={14} />
            </span>{" "}
            {t.fileTree.loading}
          </div>
        )}

        <div
          className={`tree-list${rootDragOver ? " tree-drop-root" : ""}`}
          ref={treeRef}
          onDragOver={(e) => {
            if (!onMoveFile) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            setRootDragOver(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setRootDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setRootDragOver(false)
            const fromPath = e.dataTransfer.getData("text/plain")
            if (fromPath) handleDropOn(fromPath, vaultPath)
          }}
        >
          {showEmpty ? (
            <div className="tree-empty">{t.fileTree.noFiles}</div>
          ) : (
            <TreeLevel nodes={filteredTree} depth={0} parentPath={vaultPath} />
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
                    // The file's own folder: the same place a toolbar "+" would pick.
                    ...newItems(pathDirname(ctx.node.path) || vaultPath),
                    {
                      label: t.fileTree.rename,
                      action: () => {
                        setCreating(null)
                        setRenamingPath(ctx.node.path)
                      },
                    },
                    ...(onSaveAsTemplate
                      ? [
                          {
                            label: t.fileTree.saveAsTemplate,
                            action: () => onSaveAsTemplate(ctx.node),
                          },
                        ]
                      : []),
                    {
                      label: t.fileTree.delete,
                      danger: true,
                      action: () => handleConfirmDelete(ctx.node),
                    },
                  ]
                : [
                    ...newItems(ctx.node.path),
                    ...(onNewFromTemplate
                      ? [
                          {
                            label: t.fileTree.newFromTemplateHere,
                            action: () => onNewFromTemplate(ctx.node.path),
                          },
                        ]
                      : []),
                    {
                      label: t.fileTree.rename,
                      action: () => {
                        setCreating(null)
                        setRenamingPath(ctx.node.path)
                      },
                    },
                    ...(onEditFolderRules
                      ? [
                          {
                            label: t.fileTree.folderRules,
                            action: () => onEditFolderRules(ctx.node.path),
                          },
                        ]
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
    </TreeContext.Provider>
  )
}

// Memoized: AppContent re-renders on every keystroke, but the file tree only
// depends on the vault (stable across keystrokes). Without this, a large vault's
// tree re-rendered on each character typed: the dominant "big vault = slow
// typing" cost. All callback/array props from App are stable (useCallback/useMemo).
export default memo(FileTree)
