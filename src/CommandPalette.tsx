import { useState, useRef, useEffect, useId, useMemo, type ReactNode } from "react"
import type { BibEntry } from "./bibtex"
import { useT } from "./i18n"
import {
  ArrowLeft,
  ArrowLeftRight,
  AtSign,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Command,
  FilePlus,
  FileText,
  Folder,
  Hash,
  Icon,
  LayoutGrid,
  ListTree,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sigma,
  Sparkles,
  Tag,
  Upload,
} from "./icons"
import { rankItems, positionRanges } from "./fuzzy"
import { flattenCommands, rankCommands } from "./paletteCommandSearch"
import {
  citationEntries,
  createNoteTarget,
  documentOutline,
  buildFileEntries,
  MODE_ORDER,
  parseLineQuery,
  parseNoteQuery,
  parsePaletteInput,
  prefixOfMode,
  rankCitations,
  rankFileEntries,
  rankLabels,
  rankOutline,
  referenceText,
  resolveNote,
  type FileEntry,
} from "./paletteSources"
import {
  loadPalettePrefs,
  recordCommandUse,
  savePalettePrefs,
  togglePinned,
  prunePinned,
  type PalettePrefs,
} from "./palettePrefs"
import { shortcutForCommand, splitKeys } from "./appShortcuts"
import type { StructuralLabel } from "./structuralLabels"
import type { CursorContext, PaletteCategory, PaletteCommand, PaletteMode } from "./paletteTypes"
import { useFocusTrap } from "./useFocusTrap"

export type { PaletteCategory, PaletteCommand, PaletteMode } from "./paletteTypes"

/** Commands whose action reopens the palette in another mode: it must stay open. */
const OPENS_PALETTE = new Set(["ins:citation", "ins:envref"])

/** Rows rendered at most; past this the footer asks the user to keep typing. */
export const PALETTE_MAX_ROWS = 60

type RowKind =
  | "file"
  | "recent"
  | "command"
  | "category"
  | "heading"
  | "env"
  | "label"
  | "cite"
  | "line"
  | "create"
  | "mode"
  | "back"
  | "message"

interface RowMods {
  alt: boolean
  shift: boolean
  ctrl: boolean
}

interface Row {
  /** Stable across renders, so React keeps the DOM node while the list changes. */
  key: string
  kind: RowKind
  label: string
  positions?: number[]
  /** Dim secondary text: folder, file:line, citation key. */
  detail?: string
  /** Key chips, from the shortcut registry. */
  shortcut?: string
  checked?: boolean
  icon?: ReactNode
  /** Header drawn above the first row of a group. */
  group?: string
  hasChildren?: boolean
  /** Command id when the row can be pinned. */
  pinId?: string
  pinned?: boolean
  /** Rows that only explain something are skipped by selection and Enter. */
  inert?: boolean
  run?: (mods: RowMods) => void
}

const FolderIcon = <Icon icon={Folder} size={14} />
const SparkleIcon = <Icon icon={Sparkles} size={14} />

// Default per-category glyph (reused for commands that omit their own icon).
const CATEGORY_ICON: Record<PaletteCategory, ReactNode> = {
  Edición: <Icon icon={Pencil} size={14} />,
  Insertar: <Icon icon={Plus} size={14} />,
  Matemáticas: <Icon icon={Sigma} size={14} />,
  Vista: <Icon icon={LayoutGrid} size={14} />,
  Exportar: <Icon icon={Upload} size={14} />,
  IA: SparkleIcon,
  Vault: FolderIcon,
  Navegación: <Icon icon={ArrowLeftRight} size={14} />,
}

const CATEGORY_ORDER: PaletteCategory[] = [
  "Edición",
  "Insertar",
  "Matemáticas",
  "Vista",
  "Exportar",
  "IA",
  "Vault",
  "Navegación",
]

const MODE_ICON: Record<PaletteMode, ReactNode> = {
  files: <Icon icon={FileText} size={14} />,
  commands: <Icon icon={Command} size={14} />,
  outline: <Icon icon={ListTree} size={14} />,
  labels: <Icon icon={Tag} size={14} />,
  cite: <Icon icon={BookOpen} size={14} />,
  line: <Icon icon={Hash} size={14} />,
  help: <Icon icon={Search} size={14} />,
}

// ── Highlighting ───────────────────────────────────────────────────────────

function Highlighted({ text, positions }: { text: string; positions?: number[] }) {
  if (!positions || positions.length === 0) return <>{text}</>
  const parts: ReactNode[] = []
  let cursor = 0
  for (const [start, end] of positionRanges(positions)) {
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(
      <mark key={start} className="palette-hit">
        {text.slice(start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

function KeyChips({ keys }: { keys: string }) {
  return (
    <span className="palette-keys">
      {splitKeys(keys).map((k, i) => (
        <kbd key={i} className="kbd">
          {k}
        </kbd>
      ))}
    </span>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean
  /** Mode the palette opens in (Ctrl+P files, Ctrl+Shift+P commands). */
  initialMode: PaletteMode
  /** `insert`: Enter on a label inserts a reference instead of jumping. */
  intent?: "insert"
  onClose: () => void
  /** Every file in the vault (flattened tree). */
  files: { path: string; name: string }[]
  vaultRoot: string | null
  commands: PaletteCommand[]
  recentFiles?: { path: string; name: string }[]
  activeFilePath: string | null
  /** Open a file, optionally at a 1-based line. */
  onOpenPath: (path: string, line?: number) => void
  /** Text of the current document, read once when the palette opens. */
  getDocumentText?: () => string | null
  /**
   * Text of another note when it is at hand: the live editor buffer of an open
   * tab, else the vault cache. Null when the note is not cached.
   */
  getFileText?: (path: string) => string | null
  /** Reads a note that `getFileText` did not have (async; the palette shows a loading row). */
  loadFileText?: (path: string) => Promise<string>
  getCursorContext?: () => CursorContext | null
  labels: StructuralLabel[]
  bib: ReadonlyMap<string, BibEntry>
  lineCount?: () => number
  onGoToLine?: (line: number, column?: number) => void
  onInsertCitation?: (key: string) => void
  onInsertReference?: (text: string) => void
  /** Create `<folderRel>/<fileName>` in the vault and open it. */
  onCreateNote?: (fileName: string, folderRel: string) => void
}

export default function CommandPalette({
  open,
  initialMode,
  intent,
  onClose,
  files,
  vaultRoot,
  commands,
  recentFiles,
  activeFilePath,
  onOpenPath,
  getDocumentText,
  getFileText,
  loadFileText,
  getCursorContext,
  labels,
  bib,
  lineCount,
  onGoToLine,
  onInsertCitation,
  onInsertReference,
  onCreateNote,
}: CommandPaletteProps) {
  const t = useT()
  const [mode, setMode] = useState<PaletteMode>(initialMode)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  // Drill-in stack: each entry is a parent command whose `children` we're showing.
  const [stack, setStack] = useState<PaletteCommand[]>([])
  // App.tsx keys this component per opening, so these initializers run fresh
  // each time the palette is shown (cursor context and document are read once).
  const [prefs, setPrefs] = useState<PalettePrefs>(() => loadPalettePrefs())
  const [ctx] = useState<CursorContext | null>(() => (open ? (getCursorContext?.() ?? null) : null))
  const [docText] = useState<string | null>(() => (open ? (getDocumentText?.() ?? null) : null))
  // The rows below are memoized; their click handlers must still call the LATEST
  // callbacks (vault state moves under them), so they go through this ref.
  const cb = useRef({
    onClose,
    onOpenPath,
    onGoToLine,
    onInsertCitation,
    onInsertReference,
    onCreateNote,
  })
  useEffect(() => {
    cb.current = {
      onClose,
      onOpenPath,
      onGoToLine,
      onInsertCitation,
      onInsertReference,
      onCreateNote,
    }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  // Escape is handled by the input (it steps back out of a sub-level first); the
  // trap keeps Tab inside and gives focus back on close.
  useFocusTrap(dialogRef, open)

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [open])

  const fileEntries = useMemo(() => buildFileEntries(files, vaultRoot), [files, vaultRoot])
  // `note#heading` for a note nothing had cached: read it once, show "Loading".
  const [loadedNotes, setLoadedNotes] = useState<Record<string, string>>({})
  const requestedNotes = useRef(new Set<string>())
  useEffect(() => {
    if (!open || mode !== "files" || !loadFileText) return
    const nq = parseNoteQuery(query)
    const note = nq ? resolveNote(fileEntries, nq.note) : null
    if (!note || getFileText?.(note.path) != null || requestedNotes.current.has(note.path)) return
    requestedNotes.current.add(note.path)
    loadFileText(note.path)
      .then((text) => setLoadedNotes((m) => ({ ...m, [note.path]: text })))
      .catch(() => setLoadedNotes((m) => ({ ...m, [note.path]: "" })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, query, fileEntries, loadFileText])
  const { leaves, all: commandById } = useMemo(() => flattenCommands(commands), [commands])
  // Once per opening: note pins whose command has gone and forget the ones that
  // stay gone (see prunePinned). Runs against the commands this opening has.
  const prunedRef = useRef(false)
  useEffect(() => {
    if (!open || prunedRef.current) return
    // One-time sync of the stored pins with the commands that exist; the ref
    // guard keeps StrictMode from counting an opening twice.
    prunedRef.current = true
    setPrefs((current) => {
      const next = prunePinned(current, (id) => commandById.has(id))
      if (next !== current) savePalettePrefs(next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const outline = useMemo(
    () => (mode === "outline" && docText ? documentOutline(docText) : []),
    [mode, docText],
  )
  const citations = useMemo(() => (mode === "cite" ? citationEntries(bib) : []), [mode, bib])

  const inSubLevel = stack.length > 0
  const parent = inSubLevel ? stack[stack.length - 1] : null

  const persist = (next: PalettePrefs) => {
    setPrefs(next)
    savePalettePrefs(next)
  }

  const back = () => {
    setStack((s) => s.slice(0, -1))
    setQuery("")
    setSelected(0)
  }
  const drillInto = (cmd: PaletteCommand) => {
    setStack((s) => [...s, cmd])
    setQuery("")
    setSelected(0)
  }
  const switchMode = (next: PaletteMode) => {
    setMode(next)
    setQuery("")
    setSelected(0)
    setStack([])
  }

  const finish = (fn: () => void) => {
    fn()
    cb.current.onClose()
  }

  const runCommand = (cmd: PaletteCommand) => {
    if (cmd.children?.length) {
      drillInto(cmd)
      return
    }
    persist(recordCommandUse(prefs, cmd.id))
    cmd.action?.(ctx)
    // Commands that open the palette again (insert citation) own the next state.
    if (!OPENS_PALETTE.has(cmd.id)) cb.current.onClose()
  }

  // ── Rows for the current mode ─────────────────────────────────────────────
  const { rows, total } = useMemo(() => {
    const out: Row[] = []
    if (!open) return { rows: out, total: 0 }
    const commandRow = (
      cmd: PaletteCommand,
      extra: Partial<Row> & { group?: string } = {},
    ): Row => {
      const category = cmd.category
      return {
        key: `cmd:${cmd.id}`,
        kind: "command",
        label: cmd.label,
        icon: cmd.icon ?? (category ? CATEGORY_ICON[category] : MODE_ICON.commands),
        shortcut: shortcutForCommand(cmd.id),
        checked: cmd.checked,
        hasChildren: !!cmd.children?.length,
        pinId: cmd.id,
        pinned: prefs.pinned.includes(cmd.id),
        run: () => runCommand(cmd),
        ...extra,
      }
    }

    if (mode === "commands") {
      if (inSubLevel && parent?.children) {
        out.push({
          key: "back",
          kind: "back",
          label: t.palette.back,
          icon: <Icon icon={ArrowLeft} size={14} />,
          run: back,
        })
        const kids = parent.children.filter((c) => !c.when || (ctx && c.when(ctx)))
        const ranked = query.trim()
          ? rankItems(kids, query, (c) => [
              { text: c.label, weight: 1 },
              ...(c.keywords ?? []).map((k) => ({ text: k, weight: 0.6 })),
              { text: c.description, weight: 0.35 },
            ])
          : kids.map((item) => ({ item, positions: [] as number[] }))
        for (const r of ranked) out.push(commandRow(r.item, { positions: r.positions }))
      } else if (!query.trim()) {
        const topLevel = commands.filter((c) => !c.when || (ctx && c.when(ctx)))
        const here = topLevel.filter((c) => !!ctx && !!(c.here ?? c.when)?.(ctx))
        for (const [i, c] of here.entries()) {
          out.push(commandRow(c, { group: i === 0 ? t.palette.here.group : undefined }))
        }
        const seen = new Set(here.map((c) => c.id))
        const pinned = prefs.pinned
          .map((id) => commandById.get(id))
          .filter((c): c is PaletteCommand => !!c && !seen.has(c.id))
        for (const [i, c] of pinned.entries()) {
          seen.add(c.id)
          out.push(commandRow(c, { group: i === 0 ? t.palette.groups.pinned : undefined }))
        }
        const recent = prefs.recent
          .map((r) => commandById.get(r.id))
          .filter((c): c is PaletteCommand => !!c && !seen.has(c.id))
        for (const [i, c] of recent.entries()) {
          out.push(
            commandRow(c, {
              group: i === 0 ? t.palette.groups.recent : undefined,
              icon: <Icon icon={Clock} size={14} />,
            }),
          )
        }
        for (const [i, category] of CATEGORY_ORDER.entries()) {
          const kids = topLevel.filter((c) => (c.category ?? "Edición") === category)
          if (kids.length === 0) continue
          const synthetic: PaletteCommand = {
            id: `category:${category}`,
            label: t.palette.categories[category],
            category,
            children: kids,
          }
          out.push({
            key: synthetic.id,
            kind: "category",
            label: synthetic.label,
            detail: String(kids.length),
            icon: CATEGORY_ICON[category],
            hasChildren: true,
            group: i === 0 || out.length === 0 ? t.palette.groups.categories : undefined,
            run: () => drillInto(synthetic),
          })
        }
      } else {
        const ranked = rankCommands(leaves, query, (c) => t.palette.categories[c], prefs, ctx)
        for (const r of ranked) {
          out.push(
            commandRow(r.flat.cmd, {
              positions: r.positions,
              detail:
                r.flat.cmd.description ??
                (r.flat.parents.length ? r.flat.parents.join(" › ") : undefined),
            }),
          )
        }
      }
    } else if (mode === "files") {
      const noteQuery = parseNoteQuery(query)
      if (noteQuery) {
        const note = resolveNote(fileEntries, noteQuery.note)
        const text = note ? (getFileText?.(note.path) ?? loadedNotes[note.path] ?? null) : null
        const loadingNote = !!note && text === null && !!loadFileText && !(note.path in loadedNotes)
        if (!note) {
          out.push({
            key: "msg:note",
            kind: "message",
            label: t.palette.noteNotFound(noteQuery.note),
            inert: true,
          })
        } else if (loadingNote) {
          out.push({
            key: "msg:loading",
            kind: "message",
            label: t.palette.loadingNote,
            inert: true,
          })
        } else {
          const headings = (text ? documentOutline(text) : []).filter((e) => e.kind === "heading")
          const ranked = rankOutline(headings, noteQuery.heading)
          if (ranked.length === 0) {
            out.push({
              key: "msg:headings",
              kind: "message",
              label: t.palette.noHeadings(note.name),
              inert: true,
            })
          }
          for (const r of ranked) {
            out.push({
              key: `nh:${note.path}:${r.entry.line}`,
              kind: "heading",
              label: r.entry.text,
              positions: r.positions,
              detail: `${note.name}:${r.entry.line}`,
              icon: <Icon icon={Hash} size={14} />,
              run: () => finish(() => cb.current.onOpenPath(note.path, r.entry.line)),
            })
          }
        }
      } else {
        const recentPaths = (recentFiles ?? []).map((r) => r.path)
        const ranked = rankFileEntries(fileEntries, query, recentPaths)
        const fileRow = (r: (typeof ranked)[number], i: number): Row => ({
          key: `file:${r.entry.path}`,
          kind: r.recent && !query.trim() ? "recent" : "file",
          label: r.entry.name,
          positions: r.positions,
          detail: r.entry.folder || undefined,
          icon: r.recent && !query.trim() ? <Icon icon={Clock} size={14} /> : undefined,
          group: !query.trim()
            ? i === 0 && r.recent
              ? t.palette.groups.recentFiles
              : !r.recent && (i === 0 || ranked[i - 1].recent)
                ? t.palette.groups.files
                : undefined
            : undefined,
          run: () => finish(() => cb.current.onOpenPath(r.entry.path)),
        })
        ranked.forEach((r, i) => out.push(fileRow(r, i)))
        const activeFolder = activeFileFolder(fileEntries, activeFilePath)
        const target = query.trim() ? createNoteTarget(query, activeFolder) : null
        const exact = target
          ? fileEntries.some((e) => e.rel.toLowerCase() === target.rel.toLowerCase())
          : true
        if (target && !exact && !onCreateNote && !vaultRoot) {
          out.push({
            key: "msg:create",
            kind: "message",
            label: t.palette.createNeedsVault,
            inert: true,
          })
        }
        if (target && !exact && onCreateNote) {
          out.push({
            key: "create",
            kind: "create",
            label: t.palette.createNote(target.fileName),
            detail: t.palette.createNoteIn(target.folderRel),
            icon: <Icon icon={FilePlus} size={14} />,
            run: () => finish(() => cb.current.onCreateNote?.(target.fileName, target.folderRel)),
          })
        }
      }
    } else if (mode === "outline") {
      if (!docText) {
        out.push({ key: "msg", kind: "message", label: t.palette.noDocument, inert: true })
      } else {
        for (const r of rankOutline(outline, query)) {
          const e = r.entry
          out.push({
            key: `ol:${e.kind}:${e.line}:${e.text}`,
            kind: e.kind,
            label: e.kind === "heading" ? "#".repeat(e.level ?? 1) + " " + e.text : e.text,
            positions:
              e.kind === "heading" && r.positions.length
                ? r.positions.map((p) => p + (e.level ?? 1) + 1)
                : r.positions,
            detail: [
              e.kind === "env" ? e.type : undefined,
              e.kind === "label" ? undefined : e.label,
              `L${e.line}`,
            ]
              .filter(Boolean)
              .join(" · "),
            icon:
              e.kind === "heading" ? (
                <Icon icon={Hash} size={14} />
              ) : e.kind === "env" ? (
                <Icon icon={Sigma} size={14} />
              ) : (
                <Icon icon={Tag} size={14} />
              ),
            run: () => finish(() => cb.current.onGoToLine?.(e.line)),
          })
        }
      }
    } else if (mode === "labels") {
      if (labels.length === 0) {
        out.push({ key: "msg", kind: "message", label: t.palette.noLabels, inert: true })
      }
      for (const r of rankLabels(labels, query, activeFilePath)) {
        const l = r.label
        const insert = () =>
          finish(() => cb.current.onInsertReference?.(referenceText(l, activeFilePath, vaultRoot)))
        const jump = () =>
          finish(() =>
            l.filePath === activeFilePath
              ? cb.current.onGoToLine?.(l.line)
              : cb.current.onOpenPath(l.filePath, l.line),
          )
        out.push({
          key: `lb:${l.filePath}:${l.id}:${l.line}`,
          kind: "label",
          label: l.id,
          positions: r.positions,
          detail: l.filePath === activeFilePath ? t.palette.inThisFile : `${l.fileName}:${l.line}`,
          icon: <Icon icon={AtSign} size={14} />,
          run: (mods) => {
            const wantsInsert = intent === "insert" ? !mods.alt : mods.alt
            if (wantsInsert) insert()
            else jump()
          },
        })
      }
    } else if (mode === "cite") {
      if (bib.size === 0) {
        out.push({ key: "msg", kind: "message", label: t.palette.noCitations, inert: true })
      }
      for (const r of rankCitations(citations, query)) {
        const c = r.entry
        out.push({
          key: `bib:${c.key}`,
          kind: "cite",
          label: c.label,
          positions: r.positions,
          detail: c.title ? `${c.title} · ${c.key}` : c.key,
          icon: <Icon icon={BookOpen} size={14} />,
          run: () => finish(() => cb.current.onInsertCitation?.(c.key)),
        })
      }
    } else if (mode === "line") {
      const count = lineCount?.() ?? 1
      const parsed = parseLineQuery(query, count)
      out.push(
        parsed
          ? {
              key: "line",
              kind: "line",
              label: t.palette.goToLine(parsed.line, parsed.column),
              icon: <Icon icon={Hash} size={14} />,
              run: () => finish(() => cb.current.onGoToLine?.(parsed.line, parsed.column)),
            }
          : { key: "msg", kind: "message", label: t.palette.lineHint(count), inert: true },
      )
    } else {
      for (const m of MODE_ORDER) {
        if (m === "help") continue
        out.push({
          key: `mode:${m}`,
          kind: "mode",
          label: t.palette.modes[m].name,
          detail: t.palette.modes[m].hint,
          icon: MODE_ICON[m],
          shortcut: m === "files" ? "Ctrl+P" : m === "commands" ? "Ctrl+Shift+P" : undefined,
          run: () => switchMode(m),
        })
      }
    }
    return { rows: out.slice(0, PALETTE_MAX_ROWS), total: out.length }
    // runCommand/back/drillInto/finish only close over state listed here or stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    mode,
    query,
    stack,
    prefs,
    ctx,
    docText,
    outline,
    citations,
    commands,
    leaves,
    commandById,
    fileEntries,
    loadedNotes,
    recentFiles,
    activeFilePath,
    labels,
    bib,
    intent,
    t,
  ])

  // First selectable row; inert rows (explanations) are skipped by the keyboard.
  const selectable = rows.map((r) => !r.inert)
  const firstSelectable = Math.max(0, selectable.indexOf(true))
  const clampedSelected = rows.length === 0 ? 0 : Math.min(selected, rows.length - 1)
  const active = rows[clampedSelected]?.inert ? firstSelectable : clampedSelected
  const optionId = (i: number) => `${listId}-o${i}`

  // Keep the selected row visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[id="${optionId(active)}"]`)
    el?.scrollIntoView?.({ block: "nearest" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rows, open])

  if (!open) return null

  const move = (delta: number) => {
    if (rows.length === 0) return
    let next = active
    for (let step = 0; step < rows.length; step++) {
      next = Math.min(Math.max(next + delta, 0), rows.length - 1)
      if (!rows[next].inert) break
      if (next === 0 || next === rows.length - 1) break
    }
    setSelected(next)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    // An IME composition owns Enter and the arrows until it commits.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === "Escape") {
      e.preventDefault()
      // The window listener must not also act on this Escape (focus mode, etc.).
      e.stopPropagation()
      if (inSubLevel) back()
      else onClose()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      move(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      move(-1)
    } else if (e.key === "PageDown") {
      e.preventDefault()
      move(8)
    } else if (e.key === "PageUp") {
      e.preventDefault()
      move(-8)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const mods: RowMods = { alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
      if (mode === "files" && e.shiftKey && query.trim() && !parseNoteQuery(query)) {
        const create = rows.find((r) => r.kind === "create")
        if (create?.run) {
          create.run(mods)
          return
        }
      }
      const row = rows[active]
      if (row && !row.inert) row.run?.(mods)
    } else if (e.key === "Backspace" && query === "" && !inSubLevel && mode !== "files") {
      e.preventDefault()
      switchMode("files")
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyP") {
      // Pin / unpin the selected command (Alt+P: the key itself is the mnemonic).
      const row = rows[active]
      if (row?.pinId) {
        e.preventDefault()
        persist(togglePinned(prefs, row.pinId))
      }
    }
  }

  const modeName = t.palette.modes[mode].name
  const placeholder = inSubLevel && parent ? parent.label : t.palette.modes[mode].placeholder
  const countText =
    mode === "help" ? "" : t.palette.resultCount(rows.filter((r) => !r.inert).length)

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div
        className="palette"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        data-palette=""
        aria-label={`${t.palette.placeholder}: ${modeName}`}
        data-mode={mode}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {inSubLevel && parent && (
          <div className="palette-breadcrumb">
            <button
              type="button"
              className="palette-crumb-back"
              onMouseDown={(e) => {
                e.preventDefault()
                back()
              }}
            >
              <Icon icon={ArrowLeft} size={14} /> {t.palette.back}
            </button>
            <span className="palette-crumb-sep">/</span>
            <span className="palette-crumb-here">{parent.label}</span>
          </div>
        )}
        <div className="palette-inputrow">
          {!inSubLevel && (
            <span className="palette-chip" data-testid="palette-mode">
              {prefixOfMode(mode) && (
                <span className="palette-chip-prefix">{prefixOfMode(mode)}</span>
              )}
              {modeName}
            </span>
          )}
          <input
            ref={inputRef}
            className="palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows.length > 0 ? optionId(active) : undefined}
            aria-label={placeholder}
            placeholder={placeholder}
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              const next = parsePaletteInput(mode, e.target.value)
              if (next.mode !== mode) {
                setMode(next.mode)
                setStack([])
              }
              setQuery(next.query)
              setSelected(0)
            }}
            onKeyDown={handleKey}
          />
        </div>
        <div className="palette-sr" role="status" aria-live="polite">
          {countText}
        </div>
        <div
          className="palette-list"
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={t.palette.listLabel}
        >
          {rows.length === 0 && <div className="palette-empty">{t.palette.noResults}</div>}
          {rows.map((row, i) => (
            <div key={row.key} className="palette-row" role="presentation">
              {row.group && (
                <div className="palette-cat" role="presentation">
                  {row.group}
                </div>
              )}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                aria-disabled={row.inert || undefined}
                className={`palette-item${i === active ? " palette-item-selected" : ""}${row.inert ? " palette-item-inert" : ""}`}
                onMouseMove={() => {
                  if (!row.inert && i !== selected) setSelected(i)
                }}
                onClick={() => {
                  if (!row.inert) row.run?.({ alt: false, shift: false, ctrl: false })
                }}
              >
                <span className={`palette-kind palette-kind-${row.kind}`}>
                  {row.icon ?? (
                    <Icon
                      icon={
                        row.kind === "file" ? FileText : row.kind === "back" ? ArrowLeft : Command
                      }
                      size={14}
                    />
                  )}
                </span>
                <span className="palette-label">
                  <Highlighted text={row.label} positions={row.positions} />
                </span>
                {row.detail && <span className="palette-desc">{row.detail}</span>}
                {row.checked && (
                  <span className="palette-check" aria-label={t.palette.checked}>
                    <Icon icon={Check} size={14} />
                  </span>
                )}
                {row.hasChildren && (
                  <span className="palette-chevron" aria-hidden="true">
                    <Icon icon={ChevronRight} size={14} />
                  </span>
                )}
                {row.shortcut && !row.hasChildren && <KeyChips keys={row.shortcut} />}
                {mode === "help" &&
                  row.kind === "mode" &&
                  prefixOfMode(row.key.slice(5) as PaletteMode) && (
                    <kbd className="kbd">{prefixOfMode(row.key.slice(5) as PaletteMode)}</kbd>
                  )}
                {row.pinId && (
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`palette-pin${row.pinned ? " palette-pin-on" : ""}`}
                    title={row.pinned ? t.palette.unpin : t.palette.pin}
                    aria-label={row.pinned ? t.palette.unpin : t.palette.pin}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation()
                      persist(togglePinned(prefs, row.pinId as string))
                    }}
                  >
                    <Icon icon={row.pinned ? PinOff : Pin} size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="palette-footer">
          {total > rows.length && (
            <span className="palette-footer-note">
              {t.palette.showingFirst(rows.length, total)}
            </span>
          )}
          <span>
            <kbd className="kbd">↑↓</kbd> {t.palette.footer.navigate}
          </span>
          <span>
            <kbd className="kbd">Enter</kbd>{" "}
            {mode === "commands"
              ? t.palette.footer.run
              : mode === "cite" || (mode === "labels" && intent === "insert")
                ? t.palette.footer.insert
                : mode === "files"
                  ? t.palette.footer.open
                  : t.palette.footer.jump}
          </span>
          {mode === "commands" && (
            <span>
              <kbd className="kbd">Alt+P</kbd> {t.palette.footer.pin}
            </span>
          )}
          {mode === "labels" && (
            <span>
              <kbd className="kbd">Alt+Enter</kbd>{" "}
              {intent === "insert" ? t.palette.footer.jump : t.palette.footer.insertAlt}
            </span>
          )}
          {mode === "files" && query.trim() !== "" && !!onCreateNote && (
            <span>
              <kbd className="kbd">Shift+Enter</kbd> {t.palette.footer.create}
            </span>
          )}
          <span>
            <kbd className="kbd">?</kbd> {t.palette.footer.modes}
          </span>
          <span>
            <kbd className="kbd">Esc</kbd> {t.palette.footer.close}
          </span>
        </div>
      </div>
    </div>
  )
}

function activeFileFolder(entries: FileEntry[], activePath: string | null): string {
  if (!activePath) return ""
  return entries.find((e) => e.path === activePath)?.folder ?? ""
}
