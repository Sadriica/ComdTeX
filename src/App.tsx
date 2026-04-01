import { useCallback, useEffect, useRef, useState } from "react"
import Editor, { BeforeMount, OnMount } from "@monaco-editor/react"
import type * as monaco from "monaco-editor"
import type { VimAdapterInstance } from "monaco-vim"
import { save, confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile, exists, mkdir, copyFile, remove } from "@tauri-apps/plugin-fs"
import { Command } from "@tauri-apps/plugin-shell"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { openPath } from "@tauri-apps/plugin-opener"
import { renderMarkdown } from "./renderer"
import { setupMonaco, setupEditorCommands, updateVaultFileNames, enableVimMode } from "./monacoSetup"
import { useVault } from "./useVault"
import { useSettings } from "./useSettings"
import type { Settings } from "./useSettings"
import { LanguageContext, LANGS, useT } from "./i18n"
import { getFileNameSet, flatFiles, findByName } from "./wikilinks"
import { pathJoin, displayBasename } from "./pathUtils"
import TitleBar from "./TitleBar"
import MenuBar from "./MenuBar"
import type { MenuDef, MenuEntry } from "./MenuBar"
import Toolbar from "./Toolbar"
import TabBar from "./TabBar"
import FileTree from "./FileTree"
import SearchPanel from "./SearchPanel"
import OutlinePanel from "./OutlinePanel"
import BacklinksPanel from "./BacklinksPanel"
import HelpPanel from "./HelpPanel"
import GitBar from "./GitBar"
import Resizer from "./Resizer"
import StatusBar from "./StatusBar"
import CommandPalette from "./CommandPalette"
import type { PaletteCommand } from "./CommandPalette"
import SettingsModal from "./SettingsModal"
import HelpModal from "./HelpModal"
import TemplateModal from "./TemplateModal"
import ToastContainer from "./Toast"
import { parseMacros, MACROS_FILENAME, MACROS_TEMPLATE, type KatexMacros } from "./macros"
import { parseBibtex, BIBTEX_FILENAME } from "./bibtex"
import type { BibEntry } from "./bibtex"
import { exportToTex } from "./exporter"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"
import { showToast } from "./toast"
import "katex/dist/katex.min.css"
import "./App.css"

const RECENT_KEY = "comdtex_recent"
const MAX_RECENT = 10

function loadRecentFiles(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") }
  catch { return [] }
}

function saveRecentFiles(paths: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(paths))
}

const BIB_TEMPLATE = `% references.bib — BibTeX references for ComdTeX
% Cite with [@key] in your markdown, e.g. [@knuth84]

@book{knuth84,
  author    = {Knuth, Donald E.},
  title     = {The TeXbook},
  year      = {1984},
  publisher = {Addison-Wesley},
}
`

const WELCOME = `# Bienvenido a ComdTeX

Editor de **Markdown + LaTeX** para matemáticas y ciencias.
Abre tu vault con **Abrir carpeta** en la barra lateral, o desde \`Archivo → Abrir vault\`.

---

## Entornos matemáticos

Sintaxis: \`:::tipo[Título opcional]\` — contenido en Markdown + math — \`:::\`

Los tipos **numerados** son: \`theorem\`, \`lemma\`, \`corollary\`, \`proposition\`, \`definition\`, \`example\`, \`exercise\`.
Los tipos **sin número** son: \`proof\`, \`remark\`, \`note\`.

:::definition[Función continua]
Una función $f: A \\to \\mathbb{R}$ es **continua** en $x_0 \\in A$ si
para todo $\\varepsilon > 0$ existe $\\delta > 0$ tal que
$$|x - x_0| < \\delta \\implies |f(x) - f(x_0)| < \\varepsilon$$ {#eq:cont}
:::

:::theorem[Teorema del valor intermedio]
Si $f$ es continua en $[a, b]$ y $f(a) \\cdot f(b) < 0$,
entonces existe $c \\in (a, b)$ con $f(c) = 0$.
:::

:::proof
Por la completitud de $\\mathbb{R}$ y la definición @eq:cont. $\\square$
:::

:::lemma
Toda función continua en un compacto es uniformemente continua.
:::

:::corollary
Un polinomio continuo en $[a,b]$ alcanza su máximo y su mínimo.
:::

:::proposition
Si $f$ y $g$ son continuas en $x_0$, entonces $f + g$ y $f \\cdot g$ también lo son.
:::

:::example[Función par]
$f(x) = x^2$ es continua en $\\mathbb{R}$ y satisface $f(-x) = f(x)$.
:::

:::exercise
Demuestra que $f(x) = |x|$ es continua pero no diferenciable en $x = 0$.
:::

:::remark
Los entornos admiten **negritas**, *cursivas*, math inline $e^{i\\pi}+1=0$ y ecuaciones en bloque.
:::

:::note
Los entornos se pueden **anidar**: un theorem puede contener un example en su interior.
:::

---

## Ecuaciones numeradas y referencias cruzadas

Toda ecuación \`$$...$$\` se numera automáticamente. Añade \`{#eq:etiqueta}\` para referenciarla:

$$\\int_a^b f'(x)\\,dx = f(b) - f(a)$$ {#eq:tfc}

$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$$ {#eq:basel}

El Teorema Fundamental del Cálculo (@eq:tfc) y la identidad de Basel (@eq:basel) son resultados clásicos.

---

## Shorthands matemáticos — escribe y pulsa Tab

Los shorthands funcionan **dentro y fuera** de \`$...$\`. Fuera se envuelven automáticamente.

La fracción frac(1, n+1) tiende a $0$ cuando $n \\to \\infty$.

La norma de un vector: norm(vec(v)) = sqrt(sup(v,T) \\cdot v)

La derivada parcial del calor: pder(u, t) = pder(sup(u, 2), x)

Shorthands anidados: $frac(sqrt(abs(x)), 1 + norm(vec(x)))$

Todos los shorthands: \`frac\`, \`sqrt\`, \`root\`, \`sum\`, \`int\`, \`lim\`,
\`der\`, \`pder\`, \`abs\`, \`norm\`, \`ceil\`, \`floor\`, \`vec\`, \`hat\`, \`bar\`,
\`tilde\`, \`dot\`, \`ddot\`, \`bf\`, \`cal\`, \`bb\`, \`sup\`, \`sub\`, \`inv\`, \`trans\`,
\`mat\`, \`matf\`, \`table\`

---

## Matrices

La identidad 2×2: mat(1, 0, 0, 1)

Matriz 2×3 con entradas: matf(2, 3, a, b, c, d, e, f)

---

## Tablas

El shorthand \`table\` genera una tabla Markdown lista para rellenar:

table(Variable, Tipo, Descripción)

---

## Wikilinks y backlinks

Escribe \`[[nombre-de-nota]]\` para enlazar. Haz clic en el preview para navegar.
La pestaña **←** en la barra lateral muestra los backlinks del archivo activo.

---

## Macros personalizados

En \`macros.md\` (raíz del vault):

    \\newcommand{\\R}{\\mathbb{R}}
    \\newcommand{\\norm}[1]{\\left\\|#1\\right\\|}

Los macros se aplican automáticamente en todos los archivos del vault.

---

## Bibliografía BibTeX

En \`references.bib\` (raíz del vault) añade entradas BibTeX. Cita con \`[@clave]\` en el texto.
La bibliografía completa se genera al final del preview.
`

const SIDEBAR_MIN = 150
const SIDEBAR_MAX = 450
const EDITOR_MIN = 280

export default function App() {
  const { settings, update: updateSettings } = useSettings()
  return (
    <LanguageContext.Provider value={LANGS[settings.language]}>
      <AppContent settings={settings} updateSettings={updateSettings} />
    </LanguageContext.Provider>
  )
}

function AppContent({ settings, updateSettings }: { settings: Settings; updateSettings: (p: Partial<Settings>) => void }) {
  const t = useT()
  const vault = useVault()
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const vimRef = useRef<VimAdapterInstance | null>(null)
  const vimStatusRef = useRef<HTMLDivElement>(null)
  const pendingJumpRef = useRef<number | null>(null)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [dragOver, setDragOver] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>(() => loadRecentFiles())

  const [sidebarMode, setSidebarMode] = useState<"files" | "search" | "outline" | "backlinks" | "help">("files")
  const [previewContent, setPreviewContent] = useState(WELCOME)
  const [macros, setMacros] = useState<KatexMacros>({})
  const [bibMap, setBibMap] = useState<Map<string, BibEntry>>(new Map())
  const [focusMode, setFocusMode] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [editorWidth, setEditorWidth] = useState(0)

  // ── Wikilink file names (kept in sync with tree) ─────────────────────────
  const wikiNames = getFileNameSet(vault.tree)
  useEffect(() => {
    updateVaultFileNames([...wikiNames])
  }, [vault.tree])

  // ── Close warning ─────────────────────────────────────────────────────────
  const openTabsRef = useRef(vault.openTabs)
  openTabsRef.current = vault.openTabs

  // Without onCloseRequested, Tauri closes by default on WM signal
  // The X button handles the unsaved-changes warning
  const handleCloseRequest = useCallback(async () => {
    const win = getCurrentWindow()
    const dirtyTabs = openTabsRef.current.filter((t) => t.isDirty)
    if (dirtyTabs.length === 0) { await win.close(); return }
    const names = dirtyTabs.map((t) => t.name).join(", ")
    try {
      const ok = await tauriConfirm(
        t.app.unsavedChanges(names),
        { title: "ComdTeX", kind: "warning" }
      )
      if (ok) await win.close()
    } catch {
      await win.close()
    }
  }, [])

  // ── Auto-refresh vault on window focus ────────────────────────────────────
  useEffect(() => {
    const win = getCurrentWindow()
    let unlisten: (() => void) | undefined
    win.onFocusChanged(({ payload: focused }) => {
      if (focused && vault.vaultPath) vault.loadVault()
    }).then((fn) => { unlisten = fn })
    return () => unlisten?.()
  }, [vault.vaultPath])

  // ── Focus mode + Ctrl+P + Ctrl+Shift+P + ? ───────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") { e.preventDefault(); setFocusMode((f) => !f) }
      if (e.key === "Escape" && focusMode) setFocusMode(false)
      if ((e.ctrlKey || e.metaKey) && e.key === "p" && !e.shiftKey) { e.preventDefault(); setPaletteOpen(true) }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault()
        updateSettings({ previewVisible: !settings.previewVisible })
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault()
        updateSettings({
          fontSize: Math.min(24, settings.fontSize + 1),
          previewFontSize: Math.min(24, settings.previewFontSize + 1),
        })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault()
        updateSettings({
          fontSize: Math.max(11, settings.fontSize - 1),
          previewFontSize: Math.max(11, settings.previewFontSize - 1),
        })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault()
        updateSettings({ fontSize: 15, previewFontSize: 15 })
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setHelpOpen(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [focusMode, settings.previewVisible, settings.fontSize, settings.previewFontSize])

  // ── Macros + BibTeX ───────────────────────────────────────────────────────
  useEffect(() => { vault.loadVault() }, [])

  const loadMacros = useCallback(async (vaultPath: string, signal?: { cancelled: boolean }) => {
    try {
      const mp = await pathJoin(vaultPath, MACROS_FILENAME)
      if (signal?.cancelled) return
      if (await exists(mp)) {
        const text = await readTextFile(mp)
        if (!signal?.cancelled) setMacros(parseMacros(text))
      } else {
        if (!signal?.cancelled) setMacros({})
      }
    } catch { if (!signal?.cancelled) setMacros({}) }
  }, [])

  const loadBib = useCallback(async (vaultPath: string, signal?: { cancelled: boolean }) => {
    try {
      const bp = await pathJoin(vaultPath, BIBTEX_FILENAME)
      if (signal?.cancelled) return
      if (await exists(bp)) {
        const text = await readTextFile(bp)
        if (!signal?.cancelled) setBibMap(parseBibtex(text))
      } else {
        if (!signal?.cancelled) setBibMap(new Map())
      }
    } catch { if (!signal?.cancelled) setBibMap(new Map()) }
  }, [])

  useEffect(() => {
    if (!vault.vaultPath) { setMacros({}); setBibMap(new Map()); return }
    const signal = { cancelled: false }
    loadMacros(vault.vaultPath, signal)
    loadBib(vault.vaultPath, signal)
    return () => { signal.cancelled = true }
  }, [vault.vaultPath])

  useEffect(() => {
    if (vault.openFile?.name === MACROS_FILENAME && !vault.openFile.isDirty && vault.vaultPath)
      loadMacros(vault.vaultPath)
    if (vault.openFile?.name === BIBTEX_FILENAME && !vault.openFile.isDirty && vault.vaultPath)
      loadBib(vault.vaultPath)
  }, [vault.openFile?.isDirty])

  // ── Sync preview ─────────────────────────────────────────────────────────
  useEffect(() => {
    setPreviewContent(vault.openFile ? vault.openFile.content : WELCOME)
    // Jump to pending search line after tab finishes loading
    if (pendingJumpRef.current !== null) {
      const line = pendingJumpRef.current
      pendingJumpRef.current = null
      setTimeout(() => {
        const editor = editorRef.current
        if (!editor) return
        editor.revealLineInCenter(line)
        editor.setPosition({ lineNumber: line, column: 1 })
        editor.focus()
      }, 100)
    }
  }, [vault.openFile?.path])

  // ── Vim mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !vimStatusRef.current) return

    if (settings.vimMode) {
      enableVimMode(editor, vimStatusRef.current).then((vm) => {
        vimRef.current = vm
      }).catch(console.error)
    } else {
      vimRef.current?.dispose()
      vimRef.current = null
    }
  }, [settings.vimMode])

  // ── Editor setup ─────────────────────────────────────────────────────────
  const handleBeforeMount: BeforeMount = useCallback((m) => setupMonaco(m), [])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    setupEditorCommands(editor, monaco)

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const f = vault.openFile
      if (f) vault.saveFile(f.path, editor.getValue())
    })
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => setSidebarMode("search")
    )
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column })
    })
    editor.focus()

    // Apply vim mode if already enabled in settings
    if (settings.vimMode && vimStatusRef.current) {
      enableVimMode(editor, vimStatusRef.current).then((vm) => {
        vimRef.current = vm
      }).catch(console.error)
    }
  }, [vault, settings.vimMode])

  const handleChange = useCallback((value: string | undefined) => {
    const content = value ?? ""
    // Ignore onChange fires on mount / programmatic value change
    if (content !== (vault.openFile?.content ?? "")) {
      vault.updateContent(content)
    }
    // Debounce preview 150ms to avoid re-rendering on every keystroke
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => setPreviewContent(content), 150)
  }, [vault])

  // ── Recent files ─────────────────────────────────────────────────────────
  const trackRecent = useCallback((path: string) => {
    setRecentFiles((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, MAX_RECENT)
      saveRecentFiles(next)
      return next
    })
  }, [])

  const handleOpenFileNode = useCallback((node: Parameters<typeof vault.openFileNode>[0]) => {
    vault.openFileNode(node)
    if (node.type === "file") trackRecent(node.path)
  }, [vault, trackRecent])

  const handleOpenRecent = useCallback((path: string) => {
    const node = flatFiles(vault.tree).find((f) => f.path === path)
    if (node) { handleOpenFileNode(node); return }
    // File not in current tree — show a helpful message
    showToast(t.app.fileNotInVault(displayBasename(path)), "error")
  }, [vault.tree, handleOpenFileNode])

  const clearRecent = useCallback(() => {
    setRecentFiles([])
    localStorage.removeItem(RECENT_KEY)
  }, [])

  // ── Wikilink click in preview ─────────────────────────────────────────────
  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest(".wikilink") as HTMLElement | null
    if (!link) return
    e.preventDefault()
    const target = link.dataset.target
    if (!target) return
    const node = findByName(vault.tree, target)
    if (node) handleOpenFileNode(node)
  }, [vault, handleOpenFileNode])

  // ── File actions ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const f = vault.openFile; const editor = editorRef.current
    if (f && editor) vault.saveFile(f.path, editor.getValue())
  }, [vault])

  const handleSaveAs = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    const path = await save({
      title: t.menus.saveAs,
      filters: [{ name: "Documentos", extensions: ["md", "tex"] }],
      defaultPath: vault.openFile?.name,
    })
    if (!path) return
    await writeTextFile(path, editor.getValue())
    await vault.loadVault()
  }, [vault])

  const handleExportMd = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    const path = await save({
      title: t.app.dialogExportMd,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: vault.openFile?.name.replace(/\.[^.]+$/, ".md") ?? "export.md",
    })
    if (!path) return
    await writeTextFile(path, editor.getValue())
  }, [vault])

  const handleExportTex = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    let macrosText = ""
    if (vault.vaultPath) {
      try {
        const mp = await pathJoin(vault.vaultPath, MACROS_FILENAME)
        if (await exists(mp)) macrosText = await readTextFile(mp)
      } catch { /* ok */ }
    }
    const titleGuess = vault.openFile?.name.replace(/\.[^.]+$/, "") ?? ""
    const tex = exportToTex(editor.getValue(), macrosText, titleGuess)
    const path = await save({
      title: t.app.dialogExportTex,
      filters: [{ name: "LaTeX", extensions: ["tex"] }],
      defaultPath: vault.openFile?.name.replace(/\.[^.]+$/, ".tex") ?? "export.tex",
    })
    if (!path) return
    await writeTextFile(path, tex)
  }, [vault])

  const handleExportPdf = useCallback(async () => {
    const editor = editorRef.current
    const currentFile = vault.openFile
    if (!editor || !currentFile) { window.print(); return }

    // Try pandoc first; fall back to browser print
    try {
      const versionCheck = await Command.create("pandoc", ["--version"]).execute()
      if (versionCheck.code !== 0) throw new Error("no encontrado")
    } catch {
      showToast(t.app.pandocMissing, "info", 6000)
      window.print()
      return
    }

    const outPath = await save({
      title: t.app.dialogExportPdf,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: currentFile.name.replace(/\.[^.]+$/, ".pdf"),
    })
    if (!outPath) return

    try {
      showToast(t.app.generatingPdf, "info")
      const tempInputPath = `${currentFile.path}.comdtex-export.tmp.md`
      await writeTextFile(tempInputPath, editor.getValue())
      const cmd = Command.create("pandoc", [
        tempInputPath,
        "--pdf-engine=xelatex",
        "--standalone",
        "-V", "geometry:margin=2.5cm",
        "-V", "fontsize=11pt",
        "--mathjax",
        "-o", outPath,
      ])
      const result = await cmd.execute()
      await remove(tempInputPath).catch(() => {})
      if (result.code !== 0) throw new Error(result.stderr || "pandoc failed")
      showToast(t.app.pdfDone, "success")
      await openPath(outPath)
    } catch (err) {
      await remove(`${currentFile.path}.comdtex-export.tmp.md`).catch(() => {})
      showToast(t.app.pandocError((err as Error).message), "error")
    }
  }, [vault])
  const handleFind = useCallback(() => editorRef.current?.trigger("menu", "actions.find", null), [])

  const handleOpenMacros = useCallback(async () => {
    if (!vault.vaultPath) return
    const mp = await pathJoin(vault.vaultPath, MACROS_FILENAME)
    if (!(await exists(mp))) { await writeTextFile(mp, MACROS_TEMPLATE); await vault.loadVault() }
    setTimeout(() => {
      const node = flatFiles(vault.tree).find((f) => f.name === MACROS_FILENAME)
      if (node) vault.openFileNode(node)
    }, 100)
  }, [vault])

  const handleCreateFromTemplate = useCallback(async (name: string, content: string) => {
    await vault.createFile(name, content)
  }, [vault])

  const handleOpenBib = useCallback(async () => {
    if (!vault.vaultPath) return
    const bp = await pathJoin(vault.vaultPath, BIBTEX_FILENAME)
    if (!(await exists(bp))) { await writeTextFile(bp, BIB_TEMPLATE); await vault.loadVault() }
    setTimeout(() => {
      const node = flatFiles(vault.tree).find((f) => f.name === BIBTEX_FILENAME)
      if (node) vault.openFileNode(node)
    }, 100)
  }, [vault])

  // ── Helpers ───────────────────────────────────────────────────────────────
  /** Elimina componentes de path para evitar traversal (../../../ etc.) */
  const sanitizeFileName = (name: string) =>
    name.replace(/[/\\]/g, "_").replace(/\.\./g, "__").replace(/[<>:"|?*]/g, "_") || "file"

  // ── Drag-and-drop images ──────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    const hasFiles = Array.from(e.dataTransfer.items).some((i) => i.kind === "file")
    if (!hasFiles || !vault.vaultPath) return
    e.preventDefault()
    setDragOver(true)
  }, [vault.vaultPath])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!vault.vaultPath) return

    const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"])
    const files = Array.from(e.dataTransfer.files)

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      if (!IMAGE_EXTS.has(ext)) continue

      // @ts-expect-error — Tauri/Chromium expose real path on File
      const sourcePath: string | undefined = file.path
      if (!sourcePath) {
        showToast(t.app.noFilePath, "error")
        continue
      }

      try {
        const safeFileName = sanitizeFileName(file.name)
        const assetsDir = await pathJoin(vault.vaultPath, "assets")
        await mkdir(assetsDir, { recursive: true })
        const destPath = await pathJoin(assetsDir, safeFileName)
        await copyFile(sourcePath, destPath)
        await vault.loadVault()

        const editor = editorRef.current
        if (editor) {
          const pos = editor.getPosition()
          const insertion = `![${safeFileName.replace(/\.[^.]+$/, "")}](assets/${safeFileName})`
          editor.executeEdits("drag-drop", [{
            range: {
              startLineNumber: pos?.lineNumber ?? 1,
              startColumn: pos?.column ?? 1,
              endLineNumber: pos?.lineNumber ?? 1,
              endColumn: pos?.column ?? 1,
            },
            text: insertion,
          }])
        }
        showToast(t.app.imageAdded(safeFileName), "success")
      } catch (err) {
        showToast(t.app.errCopyImage(err instanceof Error ? err.message : String(err)), "error")
      }
    }
  }, [vault])

  // ── Image paste from clipboard (Ctrl+V) ──────────────────────────────────
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!vault.vaultPath) return
      const files = Array.from(e.clipboardData?.files ?? [])
      const images = files.filter((f) => f.type.startsWith("image/"))
      if (images.length === 0) return
      e.preventDefault()

      const IMAGE_EXTS: Record<string, string> = {
        "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
        "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp",
      }

      for (const file of images) {
        const ext = IMAGE_EXTS[file.type] ?? "png"
        const rawName = file.name || `pasted-${Date.now()}.${ext}`
        const fileName = sanitizeFileName(rawName)
        // @ts-expect-error — Tauri expone file.path
        const sourcePath: string | undefined = file.path
        if (!sourcePath) {
          showToast(t.app.noClipboardPath, "error")
          continue
        }
        try {
          const assetsDir = await pathJoin(vault.vaultPath, "assets")
          await mkdir(assetsDir, { recursive: true })
          const destPath = await pathJoin(assetsDir, fileName)
          await copyFile(sourcePath, destPath)
          await vault.loadVault()
          const editor = editorRef.current
          if (editor) {
            const pos = editor.getPosition()
            const insertion = `![${fileName.replace(/\.[^.]+$/, "")}](assets/${fileName})`
            editor.executeEdits("paste", [{
              range: { startLineNumber: pos?.lineNumber ?? 1, startColumn: pos?.column ?? 1, endLineNumber: pos?.lineNumber ?? 1, endColumn: pos?.column ?? 1 },
              text: insertion,
            }])
          }
          showToast(t.app.imagePasted(fileName), "success")
        } catch (err) {
          showToast(t.app.errPasteImage(err instanceof Error ? err.message : String(err)), "error")
        }
      }
    }
    window.addEventListener("paste", handlePaste)
    return () => window.removeEventListener("paste", handlePaste)
  }, [vault])

  // ── Resizers ──────────────────────────────────────────────────────────────
  const handleSidebarResize = useCallback((dx: number) => {
    setSidebarWidth((w) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w + dx)))
  }, [])

  const handleEditorResize = useCallback((dx: number) => {
    const main = mainRef.current; if (!main) return
    const available = main.clientWidth - sidebarWidth
    setEditorWidth((w) => Math.max(EDITOR_MIN, Math.min(available * 0.75, (w || available / 2) + dx)))
  }, [sidebarWidth])

  // ── Command palette entries ───────────────────────────────────────────────
  const paletteCommands: PaletteCommand[] = [
    { id: "save",       label: t.palette.save,            description: "Ctrl+S",       action: handleSave },
    { id: "saveAs",     label: t.palette.saveAs,                                        action: handleSaveAs },
    { id: "exportTex",  label: t.palette.exportTex,                                    action: handleExportTex },
    { id: "exportPdf",  label: t.palette.exportPdf,                                    action: handleExportPdf },
    { id: "find",       label: t.palette.findInFile,      description: "Ctrl+F",       action: handleFind },
    { id: "findVault",  label: t.palette.searchVault,     description: "Ctrl+Shift+F", action: () => setSidebarMode("search") },
    { id: "focus",      label: t.palette.focusMode,       description: "F11",          action: () => setFocusMode((f) => !f) },
    { id: "template",   label: t.palette.newFromTemplate,                               action: () => setTemplateOpen(true) },
    { id: "macros",     label: t.palette.editMacros,                                   action: handleOpenMacros },
    { id: "bib",        label: t.palette.editBib,                                      action: handleOpenBib },
    { id: "settings",   label: t.palette.settings,                                     action: () => setSettingsOpen(true) },
    { id: "help",       label: t.palette.shortcuts,       description: "?",            action: () => setHelpOpen(true) },
    { id: "vault",      label: t.palette.openVault,                                    action: vault.selectVault },
    { id: "outline",    label: t.palette.viewOutline,                                  action: () => setSidebarMode("outline") },
    { id: "backlinks",  label: t.palette.viewBacklinks,                                action: () => setSidebarMode("backlinks") },
  ]

  // ── Menu ──────────────────────────────────────────────────────────────────
  const hasFile = !!vault.openFile
  const hasVault = !!vault.vaultPath

  const recentEntries: MenuEntry[] = recentFiles.length > 0
    ? [
        { separator: true } as MenuEntry,
        { label: t.menus.recent, disabled: true, action: () => {} } as MenuEntry,
        ...recentFiles.map((p) => ({
          label: displayBasename(p),
          action: () => handleOpenRecent(p),
        } as MenuEntry)),
        { separator: true } as MenuEntry,
        { label: t.menus.clearRecent, action: clearRecent } as MenuEntry,
      ]
    : []

  const menus: MenuDef[] = [
    {
      label: t.menus.file,
      entries: [
        { label: t.menus.openVault,        action: vault.selectVault },
        { separator: true },
        { label: t.menus.newFromTemplate,  disabled: !hasVault, action: () => setTemplateOpen(true) },
        { separator: true },
        { label: t.menus.save,             shortcut: "Ctrl+S",       disabled: !hasFile, action: handleSave },
        { label: t.menus.saveAs,           shortcut: "Ctrl+Shift+S", disabled: !hasFile, action: handleSaveAs },
        { separator: true },
        { label: t.menus.exportMd,         disabled: !hasFile, action: handleExportMd },
        { label: t.menus.exportTex,        disabled: !hasFile, action: handleExportTex },
        { label: t.menus.exportPdf,        disabled: !hasFile, action: handleExportPdf },
        ...recentEntries,
      ],
    },
    {
      label: t.menus.edit,
      entries: [
        { label: t.menus.findInFile,      shortcut: "Ctrl+F",       disabled: !hasFile, action: handleFind },
        { label: t.menus.searchVault,     shortcut: "Ctrl+Shift+F",                     action: () => setSidebarMode("search") },
        { separator: true },
        { label: t.menus.commandPalette,  shortcut: "Ctrl+P",                           action: () => setPaletteOpen(true) },
      ],
    },
    {
      label: t.menus.view,
      entries: [
        { label: t.menus.focusMode,       shortcut: "F11", action: () => setFocusMode((f) => !f) },
        { separator: true },
        { label: t.menus.files,    action: () => setSidebarMode("files") },
        { label: t.menus.search,   action: () => setSidebarMode("search") },
        { label: t.menus.outline,  action: () => setSidebarMode("outline") },
        { label: "Backlinks",      action: () => setSidebarMode("backlinks") },
      ],
    },
    {
      label: t.menus.vault,
      entries: [
        { label: t.menus.editMacros,  disabled: !hasVault, action: handleOpenMacros },
        { label: t.menus.editBib,     disabled: !hasVault, action: handleOpenBib },
        { separator: true },
        { label: t.menus.settings,                          action: () => setSettingsOpen(true) },
        { label: t.menus.shortcuts,   shortcut: "?",        action: () => setHelpOpen(true) },
      ],
    },
  ]

  const currentContent = vault.openFile?.content ?? WELCOME
  const editorFlex = editorWidth || undefined
  const showOnboarding = !vault.vaultPath && vault.openTabs.length === 0

  return (
    <div className={`app${focusMode ? " focus-mode" : ""}`}>
      {showOnboarding && (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <div className="onboarding-logo">ComdTeX</div>
            <p className="onboarding-sub">{t.app.subtitle}</p>
            <button className="onboarding-btn" onClick={vault.selectVault}>
              {t.app.openFolder}
            </button>
            <ul className="onboarding-features">
              <li>{t.app.f1}</li>
              <li>{t.app.f2}</li>
              <li>{t.app.f3}</li>
              <li>{t.app.f4}</li>
              <li>{t.app.f5}</li>
            </ul>
          </div>
        </div>
      )}
      <TitleBar filename={vault.openFile?.name} isDirty={vault.openFile?.isDirty} onClose={handleCloseRequest} />
      <MenuBar menus={menus}>
        <GitBar vaultPath={vault.vaultPath} />
      </MenuBar>
      <Toolbar
        editorRef={editorRef}
        previewVisible={settings.previewVisible}
        onTogglePreview={() => updateSettings({ previewVisible: !settings.previewVisible })}
      />

      <div className="main" ref={mainRef}>
        {/* ── Sidebar ── */}
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-tabs" role="tablist" aria-label="Panel lateral">
            {(["files", "search", "outline", "backlinks", "help"] as const).map((mode) => {
              const labels = { files: t.sidebar.files, search: t.sidebar.search, outline: t.sidebar.outline, backlinks: t.sidebar.backlinks, help: t.sidebar.help }
              const icons  = { files: "☰", search: "⌕", outline: "≡", backlinks: "←", help: "?" }
              return (
                <button
                  key={mode}
                  role="tab"
                  aria-selected={sidebarMode === mode}
                  aria-label={labels[mode]}
                  className={`sidebar-tab ${sidebarMode === mode ? "active" : ""}`}
                  onClick={() => setSidebarMode(mode)}
                  title={labels[mode]}
                >
                  {icons[mode]}
                </button>
              )
            })}
          </div>
          <div className="sidebar-content">
            {sidebarMode === "files" && (
              <FileTree
                vaultPath={vault.vaultPath}
                tree={vault.tree}
                activePath={vault.openFile?.path ?? null}
                isLoading={vault.isLoading}
                onSelectVault={vault.selectVault}
                onOpenFile={handleOpenFileNode}
                onCreateFile={vault.createFile}
                onCreateFolder={vault.createFolder}
                onDeleteFile={vault.deleteFile}
                onRenameFile={vault.renameFile}
              />
            )}
            {sidebarMode === "search" && (
              <SearchPanel
                onSearch={vault.search}
                onOpenResult={(path, line) => {
                  const node = flatFiles(vault.tree).find((f) => f.path === path)
                  if (!node) return
                  if (line !== undefined) pendingJumpRef.current = line
                  handleOpenFileNode(node)
                  setSidebarMode("files")
                }}
              />
            )}
            {sidebarMode === "outline" && (
              <OutlinePanel content={previewContent} editorRef={editorRef} />
            )}
            {sidebarMode === "backlinks" && (
              <BacklinksPanel
                currentFile={vault.openFile}
                tree={vault.tree}
                onOpenFile={handleOpenFileNode}
              />
            )}
            {sidebarMode === "help" && <HelpPanel />}
          </div>
        </div>

        <Resizer onDrag={handleSidebarResize} />

        {/* ── Editor ── */}
        <div
          className={`pane editor-pane${dragOver ? " drag-over" : ""}`}
          id="editor-pane"
          style={editorFlex ? { width: editorFlex, flex: "none" } : { flex: 1 }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dragOver && (
            <div className="drag-overlay">
              <span>{t.app.dropImage}</span>
            </div>
          )}
          <TabBar
            tabs={vault.openTabs}
            activeTabPath={vault.activeTabPath}
            onSwitch={vault.switchTab}
            onClose={vault.closeTab}
          />
          <Editor
            key={vault.activeTabPath ?? "welcome"}
            defaultLanguage={vault.openFile?.mode === "tex" ? "latex" : "markdown"}
            value={currentContent}
            onChange={handleChange}
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            theme={settings.theme}
            options={{
              fontSize: settings.fontSize,
              lineHeight: Math.round(settings.fontSize * 1.6),
              wordWrap: "on",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              renderWhitespace: "none",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              padding: { top: 16, bottom: 16 },
              readOnly: !vault.openFile,
              quickSuggestions: { other: true, comments: false, strings: true },
              suggestOnTriggerCharacters: true,
              snippetSuggestions: "top",
              cursorSmoothCaretAnimation: "on",
            }}
          />
          {/* Vim mode status bar */}
          <div
            ref={vimStatusRef}
            className={`vim-statusbar${settings.vimMode ? "" : " hidden"}`}
          />
        </div>

        {settings.previewVisible && <Resizer onDrag={handleEditorResize} />}

        {/* ── Preview ── */}
        {settings.previewVisible && (
          <div className="pane preview-pane" id="preview-pane">
            <div
              className="preview-content"
              style={{ fontSize: settings.previewFontSize }}
              onClick={handlePreviewClick}
              dangerouslySetInnerHTML={{
                __html: (() => {
                  try {
                    return sanitizeRenderedHtml(
                      renderMarkdown(previewContent, macros, vault.vaultPath ?? undefined, wikiNames, bibMap)
                    )
                  } catch (e) {
                    const msg = (e instanceof Error ? e.message : String(e))
                      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                    return `<pre style="color:red;padding:1rem">Error al renderizar: ${msg}</pre>`
                  }
                })()
              }}
            />
          </div>
        )}
      </div>

      <StatusBar
        mode={vault.openFile?.mode ?? null}
        line={cursorPos.line}
        col={cursorPos.col}
        content={currentContent}
        isDirty={vault.openFile?.isDirty ?? false}
        macroCount={Object.keys(macros).length}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        files={vault.tree}
        commands={paletteCommands}
        onOpenFile={vault.openFileNode}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={updateSettings}
      />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <ToastContainer />

      <TemplateModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onCreate={handleCreateFromTemplate}
      />
    </div>
  )
}
