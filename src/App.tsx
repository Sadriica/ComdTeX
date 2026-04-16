import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Editor, { BeforeMount, OnMount } from "@monaco-editor/react"
import type * as monaco from "monaco-editor"
import type { VimAdapterInstance } from "monaco-vim"
import { save, confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile, exists, mkdir, copyFile, remove } from "@tauri-apps/plugin-fs"
import { Command } from "@tauri-apps/plugin-shell"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { openPath } from "@tauri-apps/plugin-opener"
import { renderMarkdown } from "./renderer"
import { setupMonaco, setupEditorCommands, setupContentLinter, setupMathHover, updateVaultFileNames, updateBibSuggestions, updateBibHoverEntries, updateOpenFilesSnapshot, updateUserSnippets, enableVimMode, applyTypewriterMode, updateMacroCompletions } from "./monacoSetup"
import { lintFileSummary, type LintSummary } from "./contentLinter"
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
import Breadcrumb from "./Breadcrumb"
import TagPanel from "./TagPanel"
import FrontmatterPanel from "./FrontmatterPanel"
import GraphPanel from "./GraphPanel"
import TodoPanel from "./TodoPanel"
import EquationsPanel from "./EquationsPanel"
import EnvironmentsPanel from "./EnvironmentsPanel"
import VaultStatsPanel from "./VaultStatsPanel"
import CitationManager from "./CitationManager"
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
import { exportToTex, exportReveal } from "./exporter"
import { checkDependencies, type DepStatus } from "./checkDeps"
import DepsWarning from "./DepsWarning"
import SearchReplacePanel from "./SearchReplacePanel"
import TableEditor from "./TableEditor"
import UpdateChecker from "./UpdateChecker"
import { checkForUpdate, downloadAndInstallUpdate } from "./useUpdater"
import type { UpdateInfo } from "./useUpdater"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"
import ErrorBoundary from "./ErrorBoundary"
import WelcomeScreen from "./WelcomeScreen"
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
      <ErrorBoundary>
        <AppContent settings={settings} updateSettings={updateSettings} />
      </ErrorBoundary>
    </LanguageContext.Provider>
  )
}

function AppContent({ settings, updateSettings }: { settings: Settings; updateSettings: (p: Partial<Settings>) => void }) {
  const t = useT()
  const vault = useVault()
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  // Linter context refs — updated without re-creating the editor callback
  const lintWikiNamesRef = useRef<Set<string>>(new Set())
  const lintBibKeysRef = useRef<Set<string>>(new Set())
  // Macros ref for math hover — stays current without rebuilding the hover
  const macrosRef = useRef<Record<string, string>>({})
  const linterDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mathHoverDisposableRef = useRef<{ dispose(): void } | null>(null)
  const vimRef = useRef<VimAdapterInstance | null>(null)
  const vimStatusRef = useRef<HTMLDivElement>(null)
  const pendingJumpRef = useRef<number | null>(null)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [dragOver, setDragOver] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>(() => loadRecentFiles())
  const [deps, setDeps] = useState<DepStatus | null>(null)
  const [depsWarningDismissed, setDepsWarningDismissed] = useState(false)

  const [sidebarMode, setSidebarMode] = useState<"files" | "search" | "searchReplace" | "outline" | "backlinks" | "help" | "tags" | "properties" | "graph" | "todo" | "equations" | "environments" | "stats">("files")
  const [citationManagerOpen, setCitationManagerOpen] = useState(false)
  const [tableEditorOpen, setTableEditorOpen] = useState(false)
  const [customCss, setCustomCss] = useState("")
  const cursorSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const CURSOR_KEY = "comdtex_cursors"
  const [previewContent, setPreviewContent] = useState(WELCOME)
  const [macros, setMacros] = useState<KatexMacros>({})
  const [bibMap, setBibMap] = useState<Map<string, BibEntry>>(new Map())
  const [focusMode, setFocusMode] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [selectedWords, setSelectedWords] = useState(0)
  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [editorWidth, setEditorWidth] = useState(0)
  const [tabLintCounts, setTabLintCounts] = useState<Record<string, LintSummary>>({})
  const [splitFile, setSplitFile] = useState<string | null>(null)
  const [typewriterMode, setTypewriterMode] = useState(false)
  const [syncScroll, setSyncScroll] = useState(false)
  const [wordWrap, setWordWrap] = useState(true)
  const [minimapEnabled, setMinimapEnabled] = useState(false)
  const [spellcheck, setSpellcheck] = useState(false)
  const [navHistory, setNavHistory] = useState<string[]>([])
  const [navFuture, setNavFuture] = useState<string[]>([])
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updaterDismissed, setUpdaterDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)
  const previewPaneRef = useRef<HTMLDivElement>(null)

  // ── Wikilink file names (memoized — stable reference for effects) ─────────
  const wikiNames = useMemo(() => getFileNameSet(vault.tree), [vault.tree])
  const bibKeys = useMemo(() => new Set(bibMap.keys()), [bibMap])

  // ── Current heading (breadcrumb) ──────────────────────────────────────────
  const currentHeading = useMemo(() => {
    const content = vault.openFile?.content ?? ""
    const lines = content.split("\n")
    let heading: string | null = null
    for (let i = 0; i < cursorPos.line - 1 && i < lines.length; i++) {
      const m = /^#{1,6}\s+(.+)$/.exec(lines[i])
      if (m) heading = m[1].trim()
    }
    return heading
  }, [vault.openFile?.content, cursorPos.line])

  useEffect(() => { checkDependencies().then(setDeps) }, [])

  useEffect(() => {
    updateVaultFileNames([...wikiNames])
    lintWikiNamesRef.current = wikiNames
  }, [wikiNames])

  useEffect(() => {
    updateOpenFilesSnapshot(vault.openTabs.map((t) => ({ name: t.name, content: t.content })))
  }, [vault.openTabs])

  useEffect(() => { macrosRef.current = macros }, [macros])

  // ── Custom preview CSS ────────────────────────────────────────────────────
  useEffect(() => {
    if (!vault.vaultPath) return
    pathJoin(vault.vaultPath, "custom.css").then(async (cssPath) => {
      if (await exists(cssPath)) {
        const css = await readTextFile(cssPath)
        setCustomCss(css)
      } else {
        setCustomCss("")
      }
    }).catch(() => {})
  }, [vault.vaultPath, vault.tree])

  // ── User snippets from snippets.md ───────────────────────────────────────
  useEffect(() => {
    if (!vault.vaultPath) return
    pathJoin(vault.vaultPath, "snippets.md").then(async (path) => {
      if (!(await exists(path))) return
      const raw = await readTextFile(path)
      // Format: lines starting with "> prefix | description | snippet body"
      const snippets = raw.split("\n").flatMap((line) => {
        const m = /^>\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/.exec(line.trim())
        if (!m) return []
        return [{ label: m[1], detail: m[2], snippet: m[3].replace(/\\n/g, "\n") }]
      })
      updateUserSnippets(snippets)
    }).catch(() => {})
  }, [vault.vaultPath, vault.tree])

  // ── Typewriter mode: keep cursor line centered ────────────────────────────
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.updateOptions({ cursorSurroundingLines: typewriterMode ? 999 : 3 })
  }, [typewriterMode])

  // ── settings.typewriterMode → applyTypewriterMode ─────────────────────────
  useEffect(() => {
    if (editorRef.current) applyTypewriterMode(editorRef.current, settings.typewriterMode)
  }, [settings.typewriterMode, editorRef.current]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Word wrap / minimap / spellcheck toggles ─────────────────────────────
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: wordWrap ? "on" : "off", minimap: { enabled: minimapEnabled } })
  }, [wordWrap, minimapEnabled])

  useEffect(() => {
    const el = document.querySelector(".monaco-editor textarea") as HTMLTextAreaElement | null
    if (el) el.spellcheck = spellcheck
  }, [spellcheck])

  // ── Preview scroll sync ───────────────────────────────────────────────────
  useEffect(() => {
    if (!syncScroll || !settings.previewVisible) return
    const content = vault.openFile?.content
    if (!content) return

    // Collect heading line numbers from document
    const headingLines: number[] = []
    content.split("\n").forEach((ln, i) => {
      if (/^#{1,6}\s/.test(ln)) headingLines.push(i + 1)
    })

    // Find the active heading index (last heading at or before cursor)
    const activeIdx = headingLines.reduce((found, lineNum, i) =>
      lineNum <= cursorPos.line ? i : found, -1)

    if (activeIdx < 0) return

    const previewEl = previewPaneRef.current
    if (!previewEl) return
    const headingEls = previewEl.querySelectorAll("h1,h2,h3,h4,h5,h6")
    const target = headingEls[activeIdx] as HTMLElement | undefined
    target?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [cursorPos.line, syncScroll, settings.previewVisible, vault.openFile?.content])

  useEffect(() => {
    lintBibKeysRef.current = bibKeys
  }, [bibKeys])

  // ── Mermaid diagram rendering ─────────────────────────────────────────────
  useEffect(() => {
    import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" })
      const els = document.querySelectorAll<HTMLElement>("pre code.language-mermaid")
      if (els.length === 0) return
      els.forEach((el) => {
        const pre = el.parentElement!
        const diagram = el.textContent ?? ""
        const div = document.createElement("div")
        div.className = "mermaid-diagram"
        pre.replaceWith(div)
        mermaid.render(`mermaid-${Math.random().toString(36).slice(2)}`, diagram)
          .then(({ svg }) => { div.innerHTML = svg })
          .catch(() => { div.innerHTML = `<pre>${diagram}</pre>` })
      })
    }).catch(() => {})
  }, [previewContent])

  // ── Sync BibTeX suggestions for citation autocomplete + hover ─────────────
  useEffect(() => {
    const entries = [...bibMap.entries()].map(([key, entry]) => ({
      key,
      author: entry.fields.author,
      title:  entry.fields.title,
      year:   entry.fields.year,
    }))
    updateBibSuggestions(entries)
    updateBibHoverEntries([...bibMap.entries()].map(([key, entry]) => ({
      key, type: entry.type, fields: entry.fields,
    })))
  }, [bibMap])

  // ── Background lint of all open tabs ─────────────────────────────────────
  useEffect(() => {
    const context = { vaultFileNames: wikiNames, bibKeys }
    const counts: Record<string, LintSummary> = {}
    for (const tab of vault.openTabs) {
      counts[tab.path] = lintFileSummary(tab.content, tab.name, context)
    }
    setTabLintCounts(counts)
  }, [vault.openTabs, wikiNames, bibKeys])

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
  }, [t])

  // ── Auto-refresh vault on window focus ────────────────────────────────────
  useEffect(() => {
    const win = getCurrentWindow()
    let unlisten: (() => void) | undefined
    win.onFocusChanged(({ payload: focused }) => {
      if (focused && vault.vaultPath) vault.loadVault()
    }).then((fn) => { unlisten = fn })
    return () => unlisten?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.vaultPath])

  // ── Focus mode + Ctrl+P + Ctrl+Shift+P + ? ───────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") { e.preventDefault(); setFocusMode((f) => { const next = !f; showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info"); return next }) }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode, settings.previewVisible, settings.fontSize, settings.previewFontSize])

  // ── Linter + math hover cleanup on unmount ────────────────────────────────
  useEffect(() => () => {
    linterDisposableRef.current?.dispose()
    mathHoverDisposableRef.current?.dispose()
  }, [])

  // ── Macros + BibTeX ───────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { vault.loadVault() }, [])

  const loadMacros = useCallback(async (vaultPath: string, signal?: { cancelled: boolean }) => {
    try {
      const mp = await pathJoin(vaultPath, MACROS_FILENAME)
      if (signal?.cancelled) return
      if (await exists(mp)) {
        const text = await readTextFile(mp)
        if (!signal?.cancelled) {
          setMacros(parseMacros(text))
          // Extract macro names for Monaco completions
          const macroNames = text.match(/\\newcommand\{(\\[a-zA-Z]+)\}/g)
            ?.map((m) => m.replace(/\\newcommand\{/, "").replace(/\}/, "")) ?? []
          updateMacroCompletions(macroNames)
        }
      } else {
        if (!signal?.cancelled) { setMacros({}); updateMacroCompletions([]) }
      }
    } catch { if (!signal?.cancelled) { setMacros({}); updateMacroCompletions([]) } }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.vaultPath])

  useEffect(() => {
    if (vault.openFile?.name === MACROS_FILENAME && !vault.openFile.isDirty && vault.vaultPath)
      loadMacros(vault.vaultPath)
    if (vault.openFile?.name === BIBTEX_FILENAME && !vault.openFile.isDirty && vault.vaultPath)
      loadBib(vault.vaultPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.openFile?.isDirty])

  // ── Sync preview ─────────────────────────────────────────────────────────
  useEffect(() => {
    setPreviewContent(vault.openFile ? vault.openFile.content : WELCOME)
    // Jump to pending search line OR restore saved cursor position
    setTimeout(() => {
      const editor = editorRef.current
      if (!editor) return
      if (pendingJumpRef.current !== null) {
        const line = pendingJumpRef.current
        pendingJumpRef.current = null
        editor.revealLineInCenter(line)
        editor.setPosition({ lineNumber: line, column: 1 })
        editor.focus()
      } else if (vault.openFile?.path) {
        try {
          const saved = JSON.parse(localStorage.getItem(CURSOR_KEY) ?? "{}")
          const pos = saved[vault.openFile.path]
          if (pos) {
            editor.setPosition({ lineNumber: pos.line, column: pos.col })
            editor.revealLineInCenter(pos.line)
          }
        } catch {}
      }
    }, 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    linterDisposableRef.current?.dispose()
    linterDisposableRef.current = setupContentLinter(editor, monaco, () => ({
      vaultFileNames: lintWikiNamesRef.current,
      bibKeys: lintBibKeysRef.current,
    }))

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
      // Debounce-save cursor position for session restore
      if (cursorSaveRef.current) clearTimeout(cursorSaveRef.current)
      cursorSaveRef.current = setTimeout(() => {
        const path = vault.openFile?.path
        if (!path) return
        try {
          const saved = JSON.parse(localStorage.getItem(CURSOR_KEY) ?? "{}")
          saved[path] = { line: e.position.lineNumber, col: e.position.column }
          localStorage.setItem(CURSOR_KEY, JSON.stringify(saved))
        } catch {}
      }, 500)
    })
    // Expose a ref to current scroll state for syncScroll
    ;(editor as unknown as { _comdtexSyncRef?: boolean })._comdtexSyncRef = true
    editor.onDidChangeCursorSelection(() => {
      const model = editor.getModel()
      const sel = editor.getSelection()
      if (model && sel && !sel.isEmpty()) {
        const text = model.getValueInRange(sel)
        const wc = text.trim() ? text.trim().split(/\s+/).length : 0
        setSelectedWords(wc)
      } else {
        setSelectedWords(0)
      }
    })

    // Math hover preview
    mathHoverDisposableRef.current?.dispose()
    mathHoverDisposableRef.current = setupMathHover(editor, () => macrosRef.current)

    editor.focus()

    // Apply vim mode if already enabled in settings
    if (settings.vimMode && vimStatusRef.current) {
      enableVimMode(editor, vimStatusRef.current).then((vm) => {
        vimRef.current = vm
      }).catch(console.error)
    }

    // Apply typewriter mode from settings
    applyTypewriterMode(editor, settings.typewriterMode)
  }, [vault, settings.vimMode, settings.typewriterMode])

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

  // ── FrontmatterPanel: write changed content back to the editor ────────────
  const handleFrontmatterChange = useCallback((newContent: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.setValue(newContent)
    vault.updateContent(newContent)
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => setPreviewContent(newContent), 150)
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
    if (node.type === "file" && vault.activeTabPath && vault.activeTabPath !== node.path) {
      setNavHistory((h) => [...h.slice(-49), vault.activeTabPath!])
      setNavFuture([])
    }
    vault.openFileNode(node)
    if (node.type === "file") trackRecent(node.path)
  }, [vault, trackRecent])

  const goBack = useCallback(() => {
    if (navHistory.length === 0) return
    const prev = navHistory[navHistory.length - 1]
    const node = flatFiles(vault.tree).find((f) => f.path === prev)
    if (!node) return
    setNavHistory((h) => h.slice(0, -1))
    if (vault.activeTabPath) setNavFuture((f) => [vault.activeTabPath!, ...f.slice(0, 49)])
    vault.openFileNode(node)
  }, [navHistory, vault])

  const goForward = useCallback(() => {
    if (navFuture.length === 0) return
    const next = navFuture[0]
    const node = flatFiles(vault.tree).find((f) => f.path === next)
    if (!node) return
    setNavFuture((f) => f.slice(1))
    if (vault.activeTabPath) setNavHistory((h) => [...h.slice(-49), vault.activeTabPath!])
    vault.openFileNode(node)
  }, [navFuture, vault])

  // ── Navigation keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowLeft")  { e.preventDefault(); goBack() }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [goBack, goForward])

  const handleOpenRecent = useCallback((path: string) => {
    const node = flatFiles(vault.tree).find((f) => f.path === path)
    if (node) { handleOpenFileNode(node); return }
    // File not in current tree — show a helpful message
    showToast(t.app.fileNotInVault(displayBasename(path)), "error")
  }, [vault.tree, handleOpenFileNode, t])

  const clearRecent = useCallback(() => {
    setRecentFiles([])
    localStorage.removeItem(RECENT_KEY)
  }, [])

  // ── Wikilink click in preview ─────────────────────────────────────────────
  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement

    // ── Clickable checkboxes ───────────────────────────────────────────────
    if (el.classList.contains("preview-checkbox")) {
      const input = el as HTMLInputElement
      const lineIdx = parseInt(input.dataset.line ?? "-1")
      if (lineIdx >= 0 && vault.openFile) {
        const lines = vault.openFile.content.split("\n")
        if (lines[lineIdx] !== undefined) {
          const line = lines[lineIdx]
          const isChecked = input.checked
          const newLine = isChecked
            ? line.replace(/^(\s*)-\s\[ \]/, "$1- [x]")
            : line.replace(/^(\s*)-\s\[x\]/i, "$1- [ ]")
          lines[lineIdx] = newLine
          const newContent = lines.join("\n")
          vault.updateContent(newContent)
          if (editorRef.current) editorRef.current.setValue(newContent)
        }
      }
      return
    }

    // ── Wikilink navigation ────────────────────────────────────────────────
    const link = el.closest(".wikilink") as HTMLElement | null
    if (!link) return
    e.preventDefault()
    const wikiTarget = link.dataset.target
    if (!wikiTarget) return
    const node = findByName(vault.tree, wikiTarget)
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
  }, [vault, t])

  const handleExportMd = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    const path = await save({
      title: t.app.dialogExportMd,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: vault.openFile?.name.replace(/\.[^.]+$/, ".md") ?? "export.md",
    })
    if (!path) return
    await writeTextFile(path, editor.getValue())
  }, [vault, t])

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
  }, [vault, t])

  const handleExportPdf = useCallback(async () => {
    const editor = editorRef.current
    const currentFile = vault.openFile
    if (!editor || !currentFile) { window.print(); return }

    // Check pandoc availability via cached dep status
    if (deps && !deps.pandoc) {
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
  }, [vault, t, deps])
  const handleExportDocx = useCallback(async () => {
    const file = vault.openFile
    if (!file) return
    if (deps && !deps.pandoc) {
      showToast("Pandoc no está instalado. Visita pandoc.org para instalarlo.", "error", 6000)
      return
    }
    const outPath = await save({ filters: [{ name: "Word Document", extensions: ["docx"] }] })
    if (!outPath) return
    const tmpPath = outPath.replace(/\.docx$/i, "_tmp.md")
    try {
      await writeTextFile(tmpPath, file.content)
      const cmd = Command.create("pandoc", [tmpPath, "-o", outPath, "--standalone"])
      const result = await cmd.execute()
      if (result.code !== 0) throw new Error(result.stderr)
      await remove(tmpPath)
      showToast(t.app.exportDocxSuccess, "success")
    } catch (e) {
      try { await remove(tmpPath) } catch {}
      showToast(t.app.exportDocxError, "error")
      console.error(e)
    }
  }, [vault.openFile, t, deps])

  const handleExportBeamer = useCallback(async () => {
    const file = vault.openFile
    if (!file) return
    if (deps && !deps.pandoc) {
      showToast("Pandoc no está instalado. Visita pandoc.org para instalarlo.", "error", 6000)
      return
    }
    const outPath = await save({ filters: [{ name: "PDF Slides (Beamer)", extensions: ["pdf"] }] })
    if (!outPath) return
    const tmpPath = outPath.replace(/\.pdf$/i, "_tmp.md")
    try {
      await writeTextFile(tmpPath, file.content)
      const cmd = Command.create("pandoc", [tmpPath, "-o", outPath, "-t", "beamer", "--standalone"])
      const result = await cmd.execute()
      if (result.code !== 0) throw new Error(result.stderr)
      await remove(tmpPath)
      showToast(t.app.exportBeamerSuccess, "success")
      await openPath(outPath)
    } catch (e) {
      try { await remove(tmpPath) } catch {}
      showToast(t.app.exportBeamerError, "error")
      console.error(e)
    }
  }, [vault.openFile, t, deps])

  const handleVaultBackup = useCallback(async () => {
    if (!vault.vaultPath) return
    if (deps && !deps.zip) {
      showToast("zip no está instalado. En Linux: sudo apt install zip / En Mac: brew install zip", "error", 6000)
      return
    }
    const outPath = await save({ filters: [{ name: "ZIP Archive", extensions: ["zip"] }] })
    if (!outPath) return
    try {
      const vaultName = vault.vaultPath.split("/").pop() ?? "vault"
      const cmd = Command.create("zip", ["-r", outPath, vaultName], { cwd: vault.vaultPath + "/.." })
      const result = await cmd.execute()
      if (result.code !== 0) throw new Error(result.stderr)
      showToast(t.app.backupSuccess, "success")
      await openPath(outPath)
    } catch (e) {
      showToast(t.app.backupError, "error")
      console.error(e)
    }
  }, [vault.vaultPath, t, deps])

  const handleCopyHtml = useCallback(async () => {
    const file = vault.openFile
    if (!file) return
    try {
      const html = renderMarkdown(file.content, macros, vault.vaultPath ?? undefined, wikiNames, bibMap)
      await navigator.clipboard.writeText(sanitizeRenderedHtml(html))
      showToast(t.app.copiedHtml, "success")
    } catch { showToast(t.app.copyError ?? "Error al copiar", "error") }
  }, [vault.openFile, macros, wikiNames, bibMap, vault.vaultPath, t])

  const handleCopyLatex = useCallback(async () => {
    const file = vault.openFile
    if (!file) return
    try {
      const tex = exportToTex(file.content, file.name)
      await navigator.clipboard.writeText(tex)
      showToast(t.app.copiedLatex, "success")
    } catch { showToast(t.app.copyError ?? "Error al copiar", "error") }
  }, [vault.openFile, t])

  const handleSaveBib = useCallback(async (bibtexString: string) => {
    if (!vault.vaultPath) return
    const bibPath = await pathJoin(vault.vaultPath, BIBTEX_FILENAME)
    await writeTextFile(bibPath, bibtexString)
    await vault.loadVault()
    showToast(t.app.bibSaved, "success")
  }, [vault, t])

  const handleFind = useCallback(() => editorRef.current?.trigger("menu", "actions.find", null), [])

  // ── Reveal.js export ──────────────────────────────────────────────────────
  const handleExportReveal = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || !vault.openFile) return
    const content = editor.getValue()
    const title = vault.openFile.name.replace(/\.[^.]+$/, "")
    const html = exportReveal(content, title)
    try {
      const path = await save({
        title: t.palette.exportReveal,
        filters: [{ name: "HTML", extensions: ["html"] }],
        defaultPath: vault.openFile.name.replace(/\.[^.]+$/, ".html"),
      })
      if (!path) return
      await writeTextFile(path, html)
      showToast(t.app.revealExportSuccess, "success")
      await openPath(path)
    } catch {
      showToast(t.app.revealExportError, "error")
    }
  }, [vault.openFile, t])

  // ── Search & Replace: replace in a single file ───────────────────────────
  const handleReplaceInFile = useCallback(async (
    filePath: string,
    search: string,
    replace: string,
    flags: string,
  ): Promise<number> => {
    try {
      const text = await readTextFile(filePath)
      const re = new RegExp(search, flags)
      const matches = text.match(new RegExp(search, flags.includes("g") ? flags : flags + "g"))
      const count = matches?.length ?? 0
      if (count === 0) return 0
      const newContent = text.replace(re, replace)
      await writeTextFile(filePath, newContent)
      vault.patchTabContent(filePath, newContent)
      return count
    } catch (e) {
      showToast(`Replace error: ${(e as Error).message}`, "error")
      return 0
    }
  }, [vault])

  // ── Table editor: insert markdown at cursor ───────────────────────────────
  const handleInsertTable = useCallback((markdown: string) => {
    const editor = editorRef.current
    if (!editor) return
    const pos = editor.getPosition()
    editor.executeEdits("insert-table", [{
      range: {
        startLineNumber: pos?.lineNumber ?? 1,
        startColumn: pos?.column ?? 1,
        endLineNumber: pos?.lineNumber ?? 1,
        endColumn: pos?.column ?? 1,
      },
      text: markdown + "\n",
    }])
    editor.focus()
    setTableEditorOpen(false)
  }, [])

  // ── HTML export ───────────────────────────────────────────────────────────
  const handleExportHtml = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || !vault.openFile) return
    const content = editor.getValue()
    let html: string
    try {
      html = sanitizeRenderedHtml(
        renderMarkdown(content, macros, vault.vaultPath ?? undefined, wikiNames, bibMap)
      )
    } catch { return }

    const previewCss = `
      body{max-width:860px;margin:2rem auto;padding:0 1.5rem;font-family:Georgia,serif;line-height:1.7;color:#1a1a1a}
      h1,h2,h3,h4,h5,h6{font-family:system-ui,sans-serif;margin:1.5em 0 .5em;line-height:1.2}
      pre,code{font-family:monospace;background:#f4f4f4;border-radius:4px}
      pre{padding:1em;overflow:auto}code{padding:2px 5px}
      blockquote{border-left:4px solid #ccc;margin:0;padding-left:1em;color:#555}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:.5em}
      .eq-block{position:relative;text-align:center;margin:1em 0}
      .eq-number{position:absolute;right:0;top:50%;transform:translateY(-50%);color:#888}
      .fig-block{text-align:center;margin:1.5em 0}figcaption{font-size:.9em;color:#555}
      .callout{border-left:4px solid #888;padding:.75em 1em;margin:1em 0;background:#f9f9f9}
    `

    const standalone = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${vault.openFile.name.replace(/\.[^.]+$/, "")}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>${previewCss}</style>
</head>
<body>
${html}
</body>
</html>`

    const path = await save({
      title: "Exportar como HTML",
      filters: [{ name: "HTML", extensions: ["html"] }],
      defaultPath: vault.openFile.name.replace(/\.[^.]+$/, ".html"),
    })
    if (!path) return
    await writeTextFile(path, standalone)
    showToast("HTML exportado", "success")
    await openPath(path)
  }, [vault, macros, wikiNames, bibMap])

  // ── Insert TOC ────────────────────────────────────────────────────────────
  const handleInsertToc = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const content = editor.getValue()
    const lines = content.split("\n")
    const headings: { level: number; text: string; slug: string }[] = []
    for (const line of lines) {
      const m = /^(#{1,6})\s+(.+)$/.exec(line)
      if (m) {
        const text = m[2].trim()
        const slug = text.toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
        headings.push({ level: m[1].length, text, slug })
      }
    }
    if (headings.length === 0) return
    const minLevel = Math.min(...headings.map((h) => h.level))
    const toc = headings.map((h) => {
      const indent = "  ".repeat(h.level - minLevel)
      return `${indent}- [${h.text}](#${h.slug})`
    }).join("\n")
    const pos = editor.getPosition()
    editor.executeEdits("insert-toc", [{
      range: {
        startLineNumber: pos?.lineNumber ?? 1,
        startColumn: pos?.column ?? 1,
        endLineNumber: pos?.lineNumber ?? 1,
        endColumn: pos?.column ?? 1,
      },
      text: toc + "\n",
    }])
    editor.focus()
  }, [])

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

  // ── Rename with wikilink refactor ─────────────────────────────────────────
  // ── Todo panel handlers ────────────────────────────────────────────────────
  const handleTodoNavigate = useCallback((path: string, line: number) => {
    const node = flatFiles(vault.tree).find((f) => f.path === path)
    if (node) {
      pendingJumpRef.current = line
      handleOpenFileNode(node)
      setSidebarMode("files")
    }
  }, [vault.tree, handleOpenFileNode])

  const handleTodoToggle = useCallback((path: string, newContent: string) => {
    vault.patchTabContent(path, newContent)
    // Write to disk asynchronously
    writeTextFile(path, newContent).catch(() => {})
  }, [vault])

  const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
    const oldBasename = displayBasename(oldPath).replace(/\.[^.]+$/, "")
    const newBasename = newName.replace(/\.[^.]+$/, "")

    // Only offer refactor for .md files where the base name actually changes
    if (oldBasename !== newBasename && oldPath.endsWith(".md")) {
      // Count how many open tabs (other than the renamed file) reference the old name
      const re = new RegExp(`\\[\\[${oldBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}((?:#[^\\]|]+)?)((?:\\|[^\\]]+)?)\\]\\]`, "g")
      const tabsWithLinks = vault.openTabs.filter(
        (tab) => tab.path !== oldPath && re.test(tab.content)
      )

      if (tabsWithLinks.length > 0) {
        let refactorCount = 0
        try {
          const ok = await tauriConfirm(
            t.vault.renameRefactorConfirm(oldBasename, newBasename, tabsWithLinks.length),
            { title: "ComdTeX" }
          )
          if (ok) {
            for (const tab of tabsWithLinks) {
              re.lastIndex = 0
              const updated = tab.content.replace(re, `[[${newBasename}$1$2]]`)
              await writeTextFile(tab.path, updated)
              vault.patchTabContent(tab.path, updated)
              const matches = tab.content.match(re)
              refactorCount += matches ? matches.length : 0
            }
            if (refactorCount > 0) showToast(t.vault.renameRefactorDone(refactorCount), "success")
          }
        } catch { /* dialog cancelled */ }
      }
    }

    await vault.renameFile(oldPath, newName)
  }, [vault, t])

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
  }, [vault, t])

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
  }, [vault, t])

  // ── Resizers ──────────────────────────────────────────────────────────────
  const handleSidebarResize = useCallback((dx: number) => {
    setSidebarWidth((w) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w + dx)))
  }, [])

  const handleEditorResize = useCallback((dx: number) => {
    const main = mainRef.current; if (!main) return
    const available = main.clientWidth - sidebarWidth
    setEditorWidth((w) => Math.max(EDITOR_MIN, Math.min(available * 0.75, (w || available / 2) + dx)))
  }, [sidebarWidth])

  // ── Auto-update check ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdate().then(info => { if (info.available) setUpdateInfo(info) })
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const handleInstallUpdate = async () => {
    setInstalling(true)
    await downloadAndInstallUpdate()
  }

  // ── Command palette entries ───────────────────────────────────────────────
  const paletteCommands: PaletteCommand[] = [
    { id: "save",       label: t.palette.save,            description: "Ctrl+S",       action: handleSave },
    { id: "saveAs",     label: t.palette.saveAs,                                        action: handleSaveAs },
    { id: "exportTex",  label: t.palette.exportTex,                                    action: handleExportTex },
    { id: "exportPdf",  label: t.palette.exportPdf,                                    action: handleExportPdf },
    { id: "find",       label: t.palette.findInFile,      description: "Ctrl+F",       action: handleFind },
    { id: "findVault",  label: t.palette.searchVault,     description: "Ctrl+Shift+F", action: () => setSidebarMode("search") },
    { id: "focus",      label: t.palette.focusMode,       description: "F11",          action: () => setFocusMode((f) => { const next = !f; showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info"); return next }) },
    { id: "template",   label: t.palette.newFromTemplate,                               action: () => setTemplateOpen(true) },
    { id: "macros",     label: t.palette.editMacros,                                   action: handleOpenMacros },
    { id: "bib",        label: t.palette.editBib,                                      action: handleOpenBib },
    { id: "settings",   label: t.palette.settings,                                     action: () => setSettingsOpen(true) },
    { id: "help",       label: t.palette.shortcuts,       description: "?",            action: () => setHelpOpen(true) },
    { id: "vault",      label: t.palette.openVault,                                    action: vault.selectVault },
    { id: "outline",    label: t.palette.viewOutline,                                  action: () => setSidebarMode("outline") },
    { id: "backlinks",  label: t.palette.viewBacklinks,                                action: () => setSidebarMode("backlinks") },
    { id: "tags",       label: t.palette.viewTags,                                     action: () => setSidebarMode("tags") },
    { id: "properties", label: t.palette.viewProperties,                               action: () => setSidebarMode("properties") },
    { id: "graph",      label: t.palette.viewGraph,                                    action: () => setSidebarMode("graph") },
    { id: "toc",        label: t.palette.insertToc,                                     action: handleInsertToc },
    { id: "exportHtml", label: t.palette.exportHtml,                                    action: handleExportHtml },
    { id: "todo",       label: t.palette.viewTodo,                                      action: () => setSidebarMode("todo") },
    { id: "equations",  label: t.palette.viewEquations,                                 action: () => setSidebarMode("equations") },
    { id: "stats",      label: t.palette.viewStats,                                     action: () => setSidebarMode("stats") },
    { id: "typewriter", label: t.palette.typewriterMode,  description: typewriterMode ? "✓" : "", action: () => setTypewriterMode((m) => !m) },
    { id: "syncScroll", label: t.palette.syncScroll,      description: syncScroll ? "✓" : "",     action: () => setSyncScroll((s) => !s) },
    { id: "wordWrap",    label: t.palette.wordWrap,        description: wordWrap ? "✓" : "",       action: () => setWordWrap(w => !w) },
    { id: "minimap",     label: t.palette.minimap,         description: minimapEnabled ? "✓" : "", action: () => setMinimapEnabled(m => !m) },
    { id: "spellcheck",  label: t.palette.spellcheck,      description: spellcheck ? "✓" : "",     action: () => setSpellcheck(s => !s) },
    { id: "exportDocx",  label: t.palette.exportDocx,                                              action: handleExportDocx },
    { id: "exportBeamer",label: t.palette.exportBeamer,                                            action: handleExportBeamer },
    { id: "goBack",          label: t.palette.goBack,          description: "Alt+←",  action: goBack },
    { id: "goForward",       label: t.palette.goForward,       description: "Alt+→",  action: goForward },
    { id: "environments",    label: t.palette.viewEnvironments,                        action: () => setSidebarMode("environments") },
    { id: "citationManager", label: t.palette.citationManager,                         action: () => setCitationManagerOpen(true) },
    { id: "vaultBackup",     label: t.palette.vaultBackup,                             action: handleVaultBackup },
    { id: "copyHtml",        label: t.palette.copyHtml,                                action: handleCopyHtml },
    { id: "copyLatex",       label: t.palette.copyLatex,                               action: handleCopyLatex },
    { id: "searchReplace",   label: t.palette.searchReplace,                           action: () => setSidebarMode("searchReplace") },
    { id: "tableEditor",     label: t.palette.tableEditor,                             action: () => setTableEditorOpen(true) },
    { id: "exportReveal",    label: t.palette.exportReveal,                            action: handleExportReveal },
    { id: "checkUpdates",    label: t.palette.checkUpdates,                             action: () => checkForUpdate().then(info => { setUpdateInfo(info); if (!info.available) showToast(t.app.upToDate) }) },
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
        { label: t.menus.exportDocx,       disabled: !hasFile, action: handleExportDocx },
        { label: t.menus.exportBeamer,     disabled: !hasFile, action: handleExportBeamer },
        { label: t.menus.exportReveal,     disabled: !hasFile, action: handleExportReveal },
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
        { label: t.menus.focusMode,       shortcut: "F11", action: () => setFocusMode((f) => { const next = !f; showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info"); return next }) },
        { separator: true },
        { label: t.menus.files,    action: () => setSidebarMode("files") },
        { label: t.menus.search,   action: () => setSidebarMode("search") },
        { label: t.menus.outline,  action: () => setSidebarMode("outline") },
        { label: t.sidebar.backlinks, action: () => setSidebarMode("backlinks") },
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
  const showWelcome = !vault.vaultPath

  if (showWelcome) {
    return (
      <div className={`app${focusMode ? " focus-mode" : ""}`}>
        <TitleBar filename={undefined} isDirty={false} onClose={handleCloseRequest} />
        <WelcomeScreen
          onOpenVault={vault.selectVault}
          onCreateVault={vault.createVault}
          recentVaults={vault.recentVaults}
          onOpenRecent={(path) => vault.selectVault(path)}
          lang={settings.language}
        />
        <ToastContainer />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          files={vault.tree}
          commands={paletteCommands}
          onOpenFile={handleOpenFileNode}
          recentFiles={recentFiles.map((p) => ({ path: p, name: displayBasename(p) }))}
          onOpenRecent={handleOpenRecent}
        />
        <SettingsModal
          open={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onChange={updateSettings}
        />
        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    )
  }

  return (
    <div className={`app${focusMode ? " focus-mode" : ""}`}>
      <TitleBar filename={vault.openFile?.name} isDirty={vault.openFile?.isDirty} onClose={handleCloseRequest} />
      <MenuBar menus={menus}>
        <GitBar vaultPath={vault.vaultPath} />
      </MenuBar>
      {deps && !depsWarningDismissed && (!deps.pandoc || !deps.zip) && (
        <DepsWarning deps={deps} onDismiss={() => setDepsWarningDismissed(true)} />
      )}
      <Toolbar
        editorRef={editorRef}
        previewVisible={settings.previewVisible}
        onTogglePreview={() => updateSettings({ previewVisible: !settings.previewVisible })}
      />

      <div className="main" ref={mainRef}>
        {/* ── Sidebar ── */}
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-tabs" role="tablist" aria-label="Panel lateral">
            {(["files", "search", "searchReplace", "outline", "backlinks", "tags", "properties", "graph", "todo", "equations", "environments", "stats", "help"] as const).map((mode) => {
              const labels: Record<string, string> = {
                files: t.sidebar.files, search: t.sidebar.search, outline: t.sidebar.outline,
                backlinks: t.sidebar.backlinks, help: t.sidebar.help,
                tags: t.sidebar.tags, properties: t.sidebar.properties, graph: t.sidebar.graph,
                todo: t.sidebar.todo, equations: t.sidebar.equations, stats: t.sidebar.stats,
                environments: t.sidebar.environments,
                searchReplace: t.sidebar.searchReplace,
              }
              const icons: Record<string, string> = {
                files: "☰", search: "⌕", outline: "≡", backlinks: "←",
                tags: "#", properties: "≋", graph: "⬡", help: "?",
                todo: "☑", equations: "∑", environments: "∀", stats: "◈",
                searchReplace: "⇄",
              }
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
                onRenameFile={handleRenameFile}
                onMoveFile={vault.moveFile}
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
                onReplaceAll={async (query, replacement, opts) => {
                  const count = await vault.replaceInVault(query, replacement, opts)
                  if (count > 0) showToast(t.search.replaced(count), "success")
                  return count
                }}
              />
            )}
            {sidebarMode === "searchReplace" && vault.vaultPath && (
              <SearchReplacePanel
                vaultPath={vault.vaultPath}
                onOpenFile={(path, line) => {
                  const node = flatFiles(vault.tree).find((f) => f.path === path)
                  if (!node) return
                  if (line !== undefined) pendingJumpRef.current = line
                  handleOpenFileNode(node)
                  setSidebarMode("files")
                }}
                onReplaceInFile={handleReplaceInFile}
              />
            )}
            {sidebarMode === "outline" && (
              <OutlinePanel content={previewContent} editorRef={editorRef} activeLine={cursorPos.line} />
            )}
            {sidebarMode === "backlinks" && (
              <BacklinksPanel
                currentFile={vault.openFile}
                tree={vault.tree}
                onOpenFile={handleOpenFileNode}
              />
            )}
            {sidebarMode === "tags" && (
              <TagPanel
                openTabs={vault.openTabs}
                onOpenFile={(path) => {
                  const node = flatFiles(vault.tree).find((f) => f.path === path)
                  if (node) { handleOpenFileNode(node); setSidebarMode("files") }
                }}
              />
            )}
            {sidebarMode === "properties" && (
              <FrontmatterPanel
                content={vault.openFile?.content ?? ""}
                onChange={handleFrontmatterChange}
              />
            )}
            {sidebarMode === "graph" && (
              <GraphPanel
                tree={vault.tree}
                openTabs={vault.openTabs}
                activePath={vault.activeTabPath}
                onOpenFile={(path) => {
                  const node = flatFiles(vault.tree).find((f) => f.path === path)
                  if (node) handleOpenFileNode(node)
                }}
              />
            )}
            {sidebarMode === "todo" && (
              <TodoPanel
                openTabs={vault.openTabs}
                onNavigate={handleTodoNavigate}
                onToggle={handleTodoToggle}
              />
            )}
            {sidebarMode === "equations" && (
              <EquationsPanel content={vault.openFile?.content ?? ""} editorRef={editorRef} />
            )}
            {sidebarMode === "environments" && (
              <EnvironmentsPanel
                openTabs={vault.openTabs}
                editorRef={editorRef}
                activeTabPath={vault.activeTabPath}
                onOpenFile={(path) => {
                  const node = flatFiles(vault.tree).find((f) => f.path === path)
                  if (node) handleOpenFileNode(node)
                }}
              />
            )}
            {sidebarMode === "stats" && (
              <VaultStatsPanel tree={vault.tree} openTabs={vault.openTabs} wikiNames={wikiNames} />
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
            lintCounts={tabLintCounts}
            pinnedPaths={vault.pinnedPaths}
            onTogglePin={vault.togglePin}
            onReorder={vault.reorderTabs}
          />
          <Breadcrumb
            vaultPath={vault.vaultPath}
            filePath={vault.openFile?.path ?? null}
            currentHeading={currentHeading ?? undefined}
            canGoBack={navHistory.length > 0}
            canGoForward={navFuture.length > 0}
            onGoBack={goBack}
            onGoForward={goForward}
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
              wordWrap: wordWrap ? "on" : "off",
              minimap: { enabled: minimapEnabled },
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
          <div className="pane preview-pane" id="preview-pane" ref={previewPaneRef}>
            {customCss && <style>{customCss}</style>}
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

        {/* ── Split view — reference panel ── */}
        {splitFile && (() => {
          const splitTab = vault.openTabs.find((t) => t.path === splitFile)
          const splitContent = splitTab?.content ?? ""
          return (
            <>
              <Resizer onDrag={() => {}} />
              <div className="pane preview-pane split-pane">
                <div className="split-pane-header">
                  <span className="split-pane-title">{splitTab?.name ?? ""}</span>
                  <button className="split-pane-close" onClick={() => setSplitFile(null)} title="Cerrar panel">×</button>
                </div>
                <div
                  className="preview-content"
                  style={{ fontSize: settings.previewFontSize }}
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      try {
                        return sanitizeRenderedHtml(
                          renderMarkdown(splitContent, macros, vault.vaultPath ?? undefined, wikiNames, bibMap)
                        )
                      } catch { return "" }
                    })()
                  }}
                />
              </div>
            </>
          )
        })()}
      </div>

      <StatusBar
        mode={vault.openFile?.mode ?? null}
        line={cursorPos.line}
        col={cursorPos.col}
        content={currentContent}
        isDirty={vault.openFile?.isDirty ?? false}
        macroCount={Object.keys(macros).length}
        selectedWords={selectedWords}
        wordGoal={settings.wordGoal > 0 ? settings.wordGoal : undefined}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        files={vault.tree}
        commands={paletteCommands}
        onOpenFile={handleOpenFileNode}
        recentFiles={recentFiles.map((p) => ({ path: p, name: displayBasename(p) }))}
        onOpenRecent={handleOpenRecent}
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

      <CitationManager
        open={citationManagerOpen}
        bibMap={bibMap}
        onSave={handleSaveBib}
        onClose={() => setCitationManagerOpen(false)}
      />
      <TableEditor
        open={tableEditorOpen}
        onClose={() => setTableEditorOpen(false)}
        onInsert={handleInsertTable}
      />

      {updateInfo?.available && !updaterDismissed && (
        <UpdateChecker
          updateInfo={updateInfo}
          onInstall={handleInstallUpdate}
          onDismiss={() => setUpdaterDismissed(true)}
          installing={installing}
        />
      )}
    </div>
  )
}
