import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import type { BeforeMount, OnMount } from "@monaco-editor/react"
import type * as monaco from "monaco-editor"
import type { VimAdapterInstance } from "monaco-vim"
import { save, confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile, exists, mkdir, copyFile, remove } from "@tauri-apps/plugin-fs"
import { Command } from "@tauri-apps/plugin-shell"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { openPath } from "@tauri-apps/plugin-opener"
import { renderMarkdown } from "./renderer"
import { setupDisplayMathPreview } from "./useDisplayMathPreview"
import { setupMonaco, setupEditorCommands, setupContentLinter, setupMathHover, setupCommentDecorations, updateVaultFileNames, updateBibSuggestions, updateBibHoverEntries, updateOpenFilesSnapshot, updateUserSnippets, enableVimMode, applyTypewriterMode, updateMacroCompletions, updateStructuralLabelSuggestions, type CommentDecorationsHandle, type CommentMarker } from "./monacoSetup"
import {
  loadComments,
  addComment as addCommentToVault,
  updateComment as updateCommentInVault,
  deleteComment as deleteCommentInVault,
  generateCommentId,
  isCommentInSync,
  makeLineSnippet,
  toAbsolutePath as commentToAbsolute,
  toRelativePath as commentToRelative,
  type Comment,
} from "./comments"
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
import GitBar from "./GitBar"
import Resizer from "./Resizer"
import Breadcrumb from "./Breadcrumb"
import TagPanel from "./TagPanel"
import LabelsPanel from "./LabelsPanel"
import DocumentLabPanel from "./DocumentLabPanel"
import FrontmatterPanel from "./FrontmatterPanel"
import SymbolPickerPanel from "./SymbolPickerPanel"
import StatusBar from "./StatusBar"
import CommandPalette from "./CommandPalette"
import type { PaletteCommand } from "./CommandPalette"
import ToastContainer from "./Toast"
import { parseMacros, MACROS_FILENAME, MACROS_TEMPLATE, type KatexMacros } from "./macros"
import { parseBibtex, BIBTEX_FILENAME } from "./bibtex"
import type { BibEntry } from "./bibtex"
import { exportToTex, exportReveal } from "./exporter"
import { exportPdf as exportPdfAction, exportAnkiCardsToFile, compileLatexPdf as compileLatexPdfAction } from "./exportActions"
import type { LatexDiagnostic } from "./latexErrors"
import LatexErrorModal from "./LatexErrorModal"
import { exportToObsidianMarkdown } from "./obsidianExport"
import { extractFrontmatter } from "./frontmatter"
import { checkDependencies, type DepStatus } from "./checkDeps"
import DepsWarning from "./DepsWarning"
import TableEditor from "./TableEditor"
import { checkForUpdate, downloadAndInstallUpdate } from "./useUpdater"
import type { UpdateInfo } from "./useUpdater"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"
import { handleGlobalShortcut } from "./appShortcuts"
import { useTouchpadGestures } from "./useTouchpadGestures"
import ErrorBoundary from "./ErrorBoundary"
import WelcomeScreen from "./WelcomeScreen"
import { buildSearchRegExp, replaceMatchAt, replaceMatches, type SearchReplaceOptions, type SearchReplaceTarget } from "./searchReplace"
import { toEditorContent, toDiskContent } from "./cmdxFormat"
import { buildTocMarkdown } from "./toc"
import { resolveTransclusions } from "./transclusion"
import { scanStructuralLabels } from "./structuralLabels"
import { composeProjectMarkdown } from "./projectExport"
import { showToast } from "./toastService"
import ClosedTabsPopup from "./ClosedTabsPopup"
import QuickSwitcher from "./QuickSwitcher"
import BookmarksPopup from "./BookmarksPopup"
import OnboardingTour from "./OnboardingTour"
import { processTemplateVariables } from "./templates"
import "katex/dist/katex.min.css"
import "./App.css"

const RECENT_KEY = "comdtex_recent"
const BOOKMARKS_KEY = "comdtex_bookmarks"
const CURSOR_KEY = "comdtex_cursor_positions"
const MAX_RECENT = 10
type SidebarMode = "files" | "search" | "searchReplace" | "outline" | "backlinks" | "tags" | "labels" | "quality" | "properties" | "graph" | "todo" | "equations" | "environments" | "stats" | "help" | "symbols" | "pdfPreview" | "comments"

function loadRecentFiles(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") }
  catch { return [] }
}

function saveRecentFiles(paths: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(paths))
}

function loadBookmarks(): Record<number, number> {
  try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "{}") }
  catch { return {} }
}

function saveBookmarks(bookmarks: Record<number, number>) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
}

function escapeHoverText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function renderErrorHtml(error: unknown): string {
  const msg = (error instanceof Error ? error.message : String(error))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return `<pre style="color:red;padding:1rem">Error al renderizar: ${msg}</pre>`
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
const HelpPanel = lazy(() => import("./HelpPanel"))
const GraphPanel = lazy(() => import("./GraphPanel"))
const TodoPanel = lazy(() => import("./TodoPanel"))
const EquationsPanel = lazy(() => import("./EquationsPanel"))
const EnvironmentsPanel = lazy(() => import("./EnvironmentsPanel"))
const VaultStatsPanel = lazy(() => import("./VaultStatsPanel"))
const CitationManager = lazy(() => import("./CitationManager"))
const CommentsPanel = lazy(() => import("./CommentsPanel"))
const SettingsModal = lazy(() => import("./SettingsModal"))
const HelpModal = lazy(() => import("./HelpModal"))
const TemplateModal = lazy(() => import("./TemplateModal"))
const SearchReplacePanel = lazy(() => import("./SearchReplacePanel"))
const UpdateChecker = lazy(() => import("./UpdateChecker"))
const PdfPreviewPanel = lazy(() => import("./PdfPreviewPanel"))
const MonacoEditor = lazy(async () => {
  await import("./monacoRuntime")
  const mod = await import("@monaco-editor/react")
  return { default: mod.default }
})

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
  // Ref-bridge: useVault fires `onAfterSave` whenever a file lands on disk
  // (manual save or autosave). The actual reload logic lives further down in
  // this component (it needs vault.vaultPath + loadMacros), so we forward the
  // event through a ref that gets assigned once both sides are ready.
  const afterSaveRef = useRef<((path: string, basename: string) => void) | undefined>(undefined)
  const vault = useVault({
    onAfterSave: (path, basename) => { afterSaveRef.current?.(path, basename) },
  })
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  // Linter context refs — updated without re-creating the editor callback
  const lintWikiNamesRef = useRef<Set<string>>(new Set())
  const lintBibKeysRef = useRef<Set<string>>(new Set())
  // Macros ref for math hover — stays current without rebuilding the hover
  const macrosRef = useRef<Record<string, string>>({})
  const linterDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mathHoverDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mathPreviewDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mathPreviewEnabledRef = useRef(settings.mathPreview ?? true)
  const vimRef = useRef<VimAdapterInstance | null>(null)
  const vimStatusRef = useRef<HTMLDivElement>(null)
  const pendingJumpRef = useRef<number | null>(null)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [dragOver, setDragOver] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>(() => loadRecentFiles())
  const [bookmarks, setBookmarks] = useState<Record<number, number>>(() => loadBookmarks())
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [macros, setMacros] = useState<KatexMacros>({})
  const [bibMap, setBibMap] = useState<Map<string, BibEntry>>(new Map())
  const [deps, setDeps] = useState<DepStatus | null>(null)
  const [depsWarningDismissed, setDepsWarningDismissed] = useState(false)
  const [customCss, setCustomCss] = useState("")
  const [vaultTextCache, setVaultTextCache] = useState<Map<string, string>>(new Map())
  const [previewContent, setPreviewContent] = useState("")
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [selectedWords, setSelectedWords] = useState(0)
  const [tabLintCounts, setTabLintCounts] = useState<Record<string, LintSummary>>({})
  const [focusMode, setFocusMode] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [closedTabsOpen, setClosedTabsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [citationManagerOpen, setCitationManagerOpen] = useState(false)
  const [tableEditorOpen, setTableEditorOpen] = useState(false)
  const [latexDiagnostics, setLatexDiagnostics] = useState<LatexDiagnostic[] | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const commentDecorationsRef = useRef<CommentDecorationsHandle | null>(null)
  const [texEngineState, setTexEngineState] = useState<"idle" | "initializing" | "compiling">("idle")
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("files")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [editorWidth, setEditorWidth] = useState<number | null>(null)
  const typewriterMode = settings.typewriterMode
  const syncScroll = settings.syncScroll
  const wordWrap = settings.wordWrap
  const [splitFile, setSplitFile] = useState<string | null>(null)
  const [recentlyClosed, setRecentlyClosed] = useState<string[]>([])
  const minimapEnabled = settings.minimapEnabled
  const spellcheck = settings.spellcheck
  const [navHistory, setNavHistory] = useState<string[]>([])
  const [navFuture, setNavFuture] = useState<string[]>([])
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updaterDismissed, setUpdaterDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)
  const cursorSaveRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Mirrors vault.openFile?.path so closures inside debounced timers can read the
  // current path at execution time (avoids stale-closure data bugs on tab switch).
  const activeFilePathRef = useRef<string | null>(null)
  activeFilePathRef.current = vault.openFile?.path ?? null
  const previewPaneRef = useRef<HTMLDivElement>(null)
  const splitPreviewRef = useRef<HTMLDivElement>(null)

  // ── Wikilink file names (memoized — stable reference for effects) ─────────
  const wikiNames = useMemo(() => getFileNameSet(vault.tree), [vault.tree])
  const bibKeys = useMemo(() => new Set(bibMap.keys()), [bibMap])
  const vaultFiles = useMemo(() => {
    const openContent = new Map(vault.openTabs.map((tab) => [tab.path, tab.content]))
    return flatFiles(vault.tree)
      .filter((file) => file.ext === "md" || file.ext === "tex")
      .map((file) => ({
        path: file.path,
        name: file.name,
        content: openContent.get(file.path) ?? vaultTextCache.get(file.path) ?? "",
      }))
  }, [vault.tree, vault.openTabs, vaultTextCache])

  const transclusionResolver = useCallback((target: string): string | null => {
    const lower = target.replace(/\.[^.]+$/, "").toLowerCase()
    const found = vaultFiles.find((file) =>
      file.name.replace(/\.[^.]+$/, "").toLowerCase() === lower ||
      file.name.toLowerCase() === target.toLowerCase() ||
      file.path.toLowerCase().endsWith(`/${target.toLowerCase()}`))
    return found?.content || null
  }, [vaultFiles])

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

  useEffect(() => {
    updateStructuralLabelSuggestions(scanStructuralLabels(vaultFiles).labels.map((label) => ({
      id: label.id,
      kind: label.kind,
      detail: `${label.fileName}:${label.line}`,
    })))
  }, [vaultFiles])

  useEffect(() => {
    let cancelled = false
    const files = flatFiles(vault.tree).filter((file) => file.ext === "md" || file.ext === "tex")
    Promise.all(files.map(async (file) => {
      const openTab = vault.openTabs.find((tab) => tab.path === file.path)
      if (openTab) return [file.path, openTab.content] as const
      try {
        return [file.path, toEditorContent(file.path, await readTextFile(file.path))] as const
      } catch {
        return [file.path, ""] as const
      }
    })).then((entries) => {
      if (!cancelled) setVaultTextCache(new Map(entries))
    }).catch(() => {
      if (!cancelled) setVaultTextCache(new Map())
    })
    return () => { cancelled = true }
  }, [vault.tree, vault.openTabs])

  useEffect(() => { macrosRef.current = macros }, [macros])
  useEffect(() => { mathPreviewEnabledRef.current = settings.mathPreview ?? true }, [settings.mathPreview])

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
    if (editorRef.current) applyTypewriterMode(editorRef.current, settings.typewriterMode)
  }, [settings.typewriterMode])

  // ── Word wrap / minimap / spellcheck toggles ─────────────────────────────
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: wordWrap ? "on" : "off", minimap: { enabled: minimapEnabled } })
  }, [wordWrap, minimapEnabled])

  useEffect(() => {
    const el = document.querySelector(".monaco-editor textarea") as HTMLTextAreaElement | null
    if (el) el.spellcheck = spellcheck
  }, [spellcheck])

  // ── Preview scroll sync + active heading highlight ───────────────────────────
  useEffect(() => {
    if (!settings.previewVisible) return
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

    const previewEl = previewPaneRef.current
    if (!previewEl) return
    const headingEls = previewEl.querySelectorAll("h1,h2,h3,h4,h5,h6")

    // Remove all active-heading classes
    headingEls.forEach((el) => el.classList.remove("active-heading"))

    if (activeIdx >= 0) {
      const target = headingEls[activeIdx] as HTMLElement | undefined

      // Add active class
      target?.classList.add("active-heading")

      // Scroll only if syncScroll is enabled
      if (syncScroll) {
        target?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }
  }, [cursorPos.line, syncScroll, settings.previewVisible, vault.openFile?.content])

  useEffect(() => {
    lintBibKeysRef.current = bibKeys
  }, [bibKeys])

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
    let cancelled = false
    win.onFocusChanged(({ payload: focused }) => {
      if (focused && vault.vaultPath) vault.loadVault()
    }).then((fn) => {
      // If the effect was cleaned up before the listener finished registering,
      // immediately tear down the listener instead of leaking it.
      if (cancelled) { fn(); return }
      unlisten = fn
    })
    return () => { cancelled = true; unlisten?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.vaultPath])

  // ── Window state persistence (size + position) ───────────────────────────
  useEffect(() => {
    const win = getCurrentWindow()
    let cancelled = false
    const unlisteners: Array<() => void> = []
    let saveTimer: ReturnType<typeof setTimeout> | undefined

    const saveState = async () => {
      try {
        const size = await win.innerSize()
        const pos = await win.outerPosition()
        const isMaximized = await win.isMaximized()
        if (cancelled) return
        const state = {
          width: size.width,
          height: size.height,
          x: pos.x,
          y: pos.y,
          maximized: isMaximized,
        }
        localStorage.setItem("comdtex_window_state", JSON.stringify(state))
      } catch {
        /* ignore */
      }
    }

    const scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(saveState, 400)
    }

    const restore = async () => {
      try {
        const raw = localStorage.getItem("comdtex_window_state")
        if (!raw) return
        const state = JSON.parse(raw) as {
          width?: number; height?: number; x?: number; y?: number; maximized?: boolean
        }
        const { PhysicalSize, PhysicalPosition } = await import("@tauri-apps/api/dpi")
        if (cancelled) return
        if (typeof state.width === "number" && typeof state.height === "number"
            && state.width > 200 && state.height > 200) {
          await win.setSize(new PhysicalSize(state.width, state.height))
        }
        if (typeof state.x === "number" && typeof state.y === "number") {
          await win.setPosition(new PhysicalPosition(state.x, state.y))
        }
        if (state.maximized) await win.maximize()
      } catch {
        /* ignore */
      }
    }

    void restore()

    win.onResized(scheduleSave).then((fn) => { if (cancelled) fn(); else unlisteners.push(fn) })
    win.onMoved(scheduleSave).then((fn) => { if (cancelled) fn(); else unlisteners.push(fn) })

    return () => {
      cancelled = true
      if (saveTimer) clearTimeout(saveTimer)
      unlisteners.forEach((u) => u())
      // Save final state on unmount
      void saveState()
    }
  }, [])

  const nextTab = useCallback(() => {
    const tabs = vault.openTabs
    const idx = tabs.findIndex((t) => t.path === vault.activeTabPath)
    if (tabs.length <= 1) return
    const next = idx === tabs.length - 1 ? 0 : idx + 1
    vault.switchTab(tabs[next].path)
  }, [vault])

  const prevTab = useCallback(() => {
    const tabs = vault.openTabs
    const idx = tabs.findIndex((t) => t.path === vault.activeTabPath)
    if (tabs.length <= 1) return
    const next = idx <= 0 ? tabs.length - 1 : idx - 1
    vault.switchTab(tabs[next].path)
  }, [vault])

  // ── Focus mode + Ctrl+P + Ctrl+Shift+P + ? ───────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      handleGlobalShortcut(
        e,
        {
          focusMode,
          isTextInputTarget: e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement,
        },
        {
          toggleFocusMode: () => setFocusMode((f) => { const next = !f; showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info"); return next }),
          exitFocusMode: () => setFocusMode(false),
          openCommandPalette: () => setPaletteOpen(true),
          openQuickSwitcher: () => setQuickSwitcherOpen(true),
          toggleBookmark: () => {
            if (!editorRef.current || !vault.activeTabPath) return
            const line = editorRef.current.getPosition()?.lineNumber ?? 1
            setBookmarks((prev) => {
              const next = { ...prev }
              const existing = Object.entries(next).find(([, l]) => l === line)
              if (existing) {
                delete next[parseInt(existing[0])]
              } else {
                const slot = Object.keys(next).length < 9 ? Object.keys(next).length + 1 : 1
                next[slot] = line
              }
              saveBookmarks(next)
              return next
            })
            showToast(t.app.bookmarkToggled, "info")
          },
          showBookmarks: () => setBookmarksOpen(true),
          togglePreview: () => updateSettings({ previewVisible: !settings.previewVisible }),
          zoomIn: () => updateSettings({
            fontSize: Math.min(24, settings.fontSize + 1),
            previewFontSize: Math.min(24, settings.previewFontSize + 1),
          }),
          zoomOut: () => updateSettings({
            fontSize: Math.max(11, settings.fontSize - 1),
            previewFontSize: Math.max(11, settings.previewFontSize - 1),
          }),
          resetZoom: () => updateSettings({ fontSize: 15, previewFontSize: 15 }),
          openHelp: () => setHelpOpen(true),
          saveAs: () => {
            const editor = editorRef.current
            if (!editor) return
            void (async () => {
              const path = await save({
                title: t.menus.saveAs,
                filters: [{ name: "Documentos", extensions: ["md", "tex"] }],
                defaultPath: vault.openFile?.name,
              })
              if (!path) return
              await writeTextFile(path, editor.getValue())
              await vault.loadVault()
            })()
          },
          openVault: () => { void vault.selectVault() },
          nextTab,
          prevTab,
          closeTab: () => { if (vault.activeTabPath) vault.closeTab(vault.activeTabPath) },
          reopenTab: () => {
            const closed = vault.getClosedTabs()
            if (closed.length > 0) {
              setRecentlyClosed(closed)
              setClosedTabsOpen(true)
            }
          },
        },
      )
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [focusMode, settings.previewVisible, settings.fontSize, settings.previewFontSize, t, updateSettings, vault, nextTab, prevTab])

  // ── Linter + math hover + pending-timer cleanup on unmount ────────────────
  useEffect(() => () => {
    linterDisposableRef.current?.dispose()
    mathHoverDisposableRef.current?.dispose()
    commentDecorationsRef.current?.dispose()
    if (cursorSaveRef.current) clearTimeout(cursorSaveRef.current)
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
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

  // ── Per-line comments: load on vault change ──────────────────────────────
  useEffect(() => {
    if (!vault.vaultPath) { setComments([]); return }
    let cancelled = false
    loadComments(vault.vaultPath)
      .then((loaded) => { if (!cancelled) setComments(loaded) })
      .catch(() => { if (!cancelled) setComments([]) })
    return () => { cancelled = true }
  }, [vault.vaultPath])

  // ── Per-line comments: refresh gutter glyphs whenever comments / file change
  useEffect(() => {
    const handle = commentDecorationsRef.current
    if (!handle) return
    const activePath = vault.openFile?.path ?? null
    if (!activePath || !vault.vaultPath) { handle.update([]); return }
    const activeContent = vault.openFile?.content ?? ""
    const markers: CommentMarker[] = comments
      .filter((c) => commentToAbsolute(c.filePath, vault.vaultPath!) === activePath)
      .map((c) => ({
        id: c.id,
        line: c.line,
        body: c.body,
        resolved: c.resolved,
        lineSnippet: c.lineSnippet,
        drifted: !isCommentInSync(c, activeContent),
      }))
    handle.update(markers)
  }, [comments, vault.vaultPath, vault.openFile?.path, vault.openFile?.content])

  // ── Hot-reload macros.md / references.bib whenever they hit disk ──────────
  // Fires from any code path: autosave of an unfocused tab, manual Ctrl+S,
  // close-tab flush, or an external editor (via the focus-refresh listener).
  // Without this, the preview + Monaco completions would keep using the
  // pre-edit macros until the app was restarted.
  useEffect(() => {
    afterSaveRef.current = (_path, basename) => {
      if (!vault.vaultPath) return
      if (basename === MACROS_FILENAME) loadMacros(vault.vaultPath)
      else if (basename === BIBTEX_FILENAME) loadBib(vault.vaultPath)
    }
    return () => { afterSaveRef.current = undefined }
  }, [vault.vaultPath, loadMacros, loadBib])

  const renderPreviewHtml = useCallback((content: string) => {
    try {
      return sanitizeRenderedHtml(
        renderMarkdown(content, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver)
      )
    } catch (e) {
      return renderErrorHtml(e)
    }
  }, [macros, vault.vaultPath, wikiNames, bibMap, transclusionResolver])

  const deferredPreviewContent = useDeferredValue(previewContent)

  const previewHtml = useMemo(
    () => renderPreviewHtml(deferredPreviewContent),
    [renderPreviewHtml, deferredPreviewContent]
  )

  const splitTab = useMemo(
    () => vault.openTabs.find((t) => t.path === splitFile) ?? null,
    [vault.openTabs, splitFile]
  )

  const deferredSplitContent = useDeferredValue(splitTab?.content ?? "")

  const splitPreviewHtml = useMemo(
    () => splitTab ? renderPreviewHtml(deferredSplitContent) : "",
    [renderPreviewHtml, splitTab, deferredSplitContent]
  )

  const previewNeedsMermaid = useMemo(
    () => previewHtml.includes("language-mermaid"),
    [previewHtml]
  )

  const splitNeedsMermaid = useMemo(
    () => splitPreviewHtml.includes("language-mermaid"),
    [splitPreviewHtml]
  )

  // ── Mermaid diagram rendering ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    if (!previewNeedsMermaid && !splitNeedsMermaid) return

    const renderInContainer = async (container: HTMLDivElement | null, suffix: string) => {
      if (!container) return
      const blocks = [...container.querySelectorAll<HTMLElement>("pre code.language-mermaid")]
      if (blocks.length === 0) return

      const { default: mermaid } = await import("mermaid")
      if (cancelled) return

      mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" })

      await Promise.all(blocks.map(async (el, index) => {
        const pre = el.parentElement
        if (!pre) return

        const diagram = el.textContent ?? ""
        const div = document.createElement("div")
        div.className = "mermaid-diagram"
        pre.replaceWith(div)

        try {
          const { svg } = await mermaid.render(
            `mermaid-${suffix}-${index}-${Math.random().toString(36).slice(2)}`,
            diagram,
          )
          if (cancelled) return
          div.innerHTML = sanitizeRenderedHtml(svg)
        } catch (err) {
          console.warn("Mermaid render failed", err)
          const fallback = document.createElement("pre")
          fallback.textContent = diagram
          div.replaceChildren(fallback)
        }
      }))
    }

    Promise.all([
      previewNeedsMermaid ? renderInContainer(previewPaneRef.current, "preview") : Promise.resolve(),
      splitNeedsMermaid ? renderInContainer(splitPreviewRef.current, "split") : Promise.resolve(),
    ]).catch((err) => console.error("Mermaid rendering failed", err))

    return () => { cancelled = true }
  }, [previewHtml, splitPreviewHtml, previewNeedsMermaid, splitNeedsMermaid])

  // ── Sync preview ─────────────────────────────────────────────────────────
  useEffect(() => {
    setPreviewContent(vault.openFile ? vault.openFile.content : WELCOME)
    // Cancel pending cursor save: it belongs to the previous file and would
    // either fire after we replace the editor model (no-op) or write the wrong
    // path. The new file restores its own cursor below.
    if (cursorSaveRef.current) {
      clearTimeout(cursorSaveRef.current)
      cursorSaveRef.current = undefined
    }
    // Jump to pending search line OR restore saved cursor position
    const timeoutId = setTimeout(() => {
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
    return () => clearTimeout(timeoutId)
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
    // Note: Monaco has built-in spell-check via browser (no config needed)
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
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS,
      () => {
        void (async () => {
          const path = await save({
            title: t.menus.saveAs,
            filters: [{ name: "Documentos", extensions: ["md", "tex"] }],
            defaultPath: vault.openFile?.name,
          })
          if (!path) return
          await writeTextFile(path, editor.getValue())
          await vault.loadVault()
        })()
      }
    )
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO,
      () => { void vault.selectVault() }
    )
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => setSidebarMode("search")
    )
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column })
      // Debounce-save cursor position for session restore.
      // Capture path at SCHEDULE time so a late tab switch can be detected at fire time.
      if (cursorSaveRef.current) clearTimeout(cursorSaveRef.current)
      const scheduledPath = activeFilePathRef.current
      cursorSaveRef.current = setTimeout(() => {
        // Read the current path at execution time — if the user switched tabs
        // during the debounce window, abort to avoid writing the cursor of file
        // A under the key of file B.
        const currentPath = activeFilePathRef.current
        if (!currentPath || currentPath !== scheduledPath) return
        try {
          const saved = JSON.parse(localStorage.getItem(CURSOR_KEY) ?? "{}")
          saved[currentPath] = { line: e.position.lineNumber, col: e.position.column }
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

    mathPreviewDisposableRef.current?.dispose()
    mathPreviewDisposableRef.current = setupDisplayMathPreview(
      editor,
      () => macrosRef.current,
      () => mathPreviewEnabledRef.current,
    )

    // Per-line comment gutter glyphs
    commentDecorationsRef.current?.dispose()
    commentDecorationsRef.current = setupCommentDecorations(editor, monaco, () => {
      // Click on a glyph: surface the comments panel.
      setSidebarMode("comments")
    })

    // ── Editor → Preview double-click sync ───────────────────────────────────
    editor.onMouseDown((e) => {
      if (e.event.detail !== 2) return // only double-click
      const lineNum = e.target.position?.lineNumber
      if (!lineNum) return

      const preview = document.querySelector(".preview-content")
      if (!preview) return

      const annotated = Array.from(preview.querySelectorAll("[data-source-line]")) as HTMLElement[]
      if (annotated.length === 0) return

      let best: HTMLElement | null = null
      let bestLine = 0
      for (const el of annotated) {
        const l = parseInt(el.dataset.sourceLine ?? "0")
        if (l <= lineNum && l >= bestLine) {
          bestLine = l
          best = el
        }
      }

      if (best) {
        best.scrollIntoView({ behavior: "smooth", block: "center" })
        best.classList.add("sync-highlight")
        setTimeout(() => best?.classList.remove("sync-highlight"), 800)
      }
    })

    editor.focus()

    // Apply vim mode if already enabled in settings
    if (settings.vimMode && vimStatusRef.current) {
      enableVimMode(editor, vimStatusRef.current).then((vm) => {
        vimRef.current = vm
      }).catch(console.error)
    }

    // Apply typewriter mode from settings
    applyTypewriterMode(editor, settings.typewriterMode)
  }, [vault, settings.vimMode, settings.typewriterMode, t])

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

  // ── Per-line comment handlers ─────────────────────────────────────────────
  const handleAddCommentAtCursor = useCallback(async () => {
    if (!vault.vaultPath) { showToast(t.comments.noVault, "error"); return }
    const editor = editorRef.current
    const file = vault.openFile
    if (!editor || !file) { showToast(t.comments.noFile, "error"); return }
    const pos = editor.getPosition()
    if (!pos) return
    const line = pos.lineNumber
    const lineText = file.content.split("\n")[line - 1] ?? ""
    // Use a native prompt — keeps the implementation tiny and matches other
    // quick text-input flows (e.g. file rename) elsewhere in the app.
    const body = window.prompt(t.comments.promptForBody, "")
    if (body === null) return
    const trimmed = body.trim()
    if (!trimmed) return
    const comment: Comment = {
      id: generateCommentId(),
      filePath: commentToRelative(file.path, vault.vaultPath),
      line,
      lineSnippet: makeLineSnippet(lineText),
      body: trimmed,
      author: "user",
      createdAt: new Date().toISOString(),
      resolved: false,
    }
    setComments((prev) => [...prev, comment])
    try {
      await addCommentToVault(vault.vaultPath, comment)
      showToast(t.comments.addedToast, "success")
      setSidebarMode("comments")
    } catch (e) {
      // Roll back on failure to keep state in sync with disk.
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      showToast(e instanceof Error ? e.message : String(e), "error")
    }
  }, [vault.vaultPath, vault.openFile, t])

  const handleDeleteComment = useCallback(async (id: string) => {
    if (!vault.vaultPath) return
    const removed = comments.find((c) => c.id === id)
    setComments((prev) => prev.filter((c) => c.id !== id))
    try {
      await deleteCommentInVault(vault.vaultPath, id)
      showToast(t.comments.deletedToast, "info")
    } catch (e) {
      // Roll back if write failed.
      if (removed) setComments((prev) => [...prev, removed])
      showToast(e instanceof Error ? e.message : String(e), "error")
    }
  }, [vault.vaultPath, comments, t])

  const handleToggleCommentResolved = useCallback(async (id: string) => {
    if (!vault.vaultPath) return
    const target = comments.find((c) => c.id === id)
    if (!target) return
    const next = !target.resolved
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved: next } : c)))
    try {
      await updateCommentInVault(vault.vaultPath, id, { resolved: next })
    } catch (e) {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved: !next } : c)))
      showToast(e instanceof Error ? e.message : String(e), "error")
    }
  }, [vault.vaultPath, comments])

  const handleEditCommentBody = useCallback(async (id: string, body: string) => {
    if (!vault.vaultPath) return
    const original = comments.find((c) => c.id === id)
    if (!original) return
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body } : c)))
    try {
      await updateCommentInVault(vault.vaultPath, id, { body })
    } catch (e) {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body: original.body } : c)))
      showToast(e instanceof Error ? e.message : String(e), "error")
    }
  }, [vault.vaultPath, comments])

  const handleToggleCommentAtCursor = useCallback(() => {
    if (!vault.vaultPath) return
    const editor = editorRef.current
    const file = vault.openFile
    if (!editor || !file) return
    const pos = editor.getPosition()
    if (!pos) return
    const filePath = file.path
    const match = comments.find((c) =>
      commentToAbsolute(c.filePath, vault.vaultPath!) === filePath && c.line === pos.lineNumber,
    )
    if (!match) { showToast(t.comments.noCommentAtCursor, "info"); return }
    void handleToggleCommentResolved(match.id)
  }, [vault.vaultPath, vault.openFile, comments, handleToggleCommentResolved, t])

  const handleJumpToComment = useCallback((absolutePath: string, line: number) => {
    const editor = editorRef.current
    const targetTab = vault.openTabs.find((tab) => tab.path === absolutePath)
    if (targetTab) {
      vault.switchTab(absolutePath)
      // Wait a tick for the tab switch to mount the new model.
      setTimeout(() => {
        editor?.revealLineInCenter(line)
        editor?.setPosition({ lineNumber: line, column: 1 })
        editor?.focus()
      }, 50)
      return
    }
    // File not open — open via the vault.
    const node = flatFiles(vault.tree).find((f) => f.path === absolutePath)
    if (node) {
      pendingJumpRef.current = line
      vault.openFileNode(node)
    } else {
      // Out-of-vault — just show the line in the current editor when paths match.
      if (vault.openFile?.path === absolutePath) {
        editor?.revealLineInCenter(line)
        editor?.setPosition({ lineNumber: line, column: 1 })
        editor?.focus()
      }
    }
  }, [vault])

  // ── Navigation keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowLeft")  { e.preventDefault(); goBack() }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward() }
      // Ctrl/Cmd + Shift + M → add a comment on the current line.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault()
        void handleAddCommentAtCursor()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [goBack, goForward, handleAddCommentAtCursor])

  const searchVault = useCallback(() => setSidebarMode("search"), [])

  // ── PDF preview: click-to-source (heading-based shim) ─────────────────────
  // Real synctex needs xelatex's .synctex.gz output and a parser; the
  // simplified version below finds the heading text nearest to the click and
  // jumps the editor to that line. Good enough for the 80% case (clicking
  // section headings in the rendered PDF).
  const handlePdfClickSource = useCallback((page: number, _x: number, _y: number, nearestText: string) => {
    void page; void _x; void _y
    const editor = editorRef.current
    if (!editor || !nearestText) return
    const model = editor.getModel()
    if (!model) return
    // Walk the document for a heading that matches the nearest text snippet.
    const needle = nearestText.toLowerCase().trim()
    if (needle.length < 2) return
    const lineCount = model.getLineCount()
    let bestLine = -1
    for (let i = 1; i <= lineCount; i++) {
      const line = model.getLineContent(i)
      const m = /^#{1,6}\s+(.+)$/.exec(line)
      if (!m) continue
      const heading = m[1].trim().toLowerCase()
      if (heading === needle || heading.startsWith(needle) || needle.startsWith(heading)) {
        bestLine = i
        break
      }
    }
    if (bestLine === -1) {
      // Fallback: any line containing the snippet.
      for (let i = 1; i <= lineCount; i++) {
        if (model.getLineContent(i).toLowerCase().includes(needle)) {
          bestLine = i
          break
        }
      }
    }
    if (bestLine > 0) {
      editor.revealLineInCenter(bestLine)
      editor.setPosition({ lineNumber: bestLine, column: 1 })
      editor.focus()
      showToast(t.pdfPreview.jumpedToHeading(nearestText), "success", 2000)
    } else {
      showToast(t.pdfPreview.headingNotFound(nearestText), "info", 2000)
    }
  }, [t])

  const goToDefinition = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const position = editor.getPosition()
    if (!position) return
    const model = editor.getModel()
    if (!model) return
    const word = model.getWordAtPosition(position)
    if (!word) return

    // Try wikilink or citation first
    const line = model.getLineContent(position.lineNumber)
    const wikiMatch = /\[\[([^\]]+)\]\]/.exec(line)
    if (wikiMatch) {
      const targetName = wikiMatch[1].trim()
      const targetNode = flatFiles(vault.tree).find((f) => f.name === targetName || f.name === targetName + ".md")
      if (targetNode) { handleOpenFileNode(targetNode); return }
    }

    const citeMatch = /@([a-zA-Z0-9_-]+)/.exec(line)
    if (citeMatch) { setCitationManagerOpen(true); return }

    // Try structural label
    const labelMatch = /@([a-zA-Z0-9_-]+):/.exec(line)
    if (labelMatch) { setSidebarMode("labels"); return }
  }, [vault, handleOpenFileNode])

  useTouchpadGestures({
    openCommandPalette: () => setPaletteOpen(true),
    nextTab,
    prevTab,
    searchVault,
    goToDefinition,
    zoomIn: () => updateSettings({ fontSize: Math.min(24, settings.fontSize + 1), previewFontSize: Math.min(24, settings.previewFontSize + 1) }),
    zoomOut: () => updateSettings({ fontSize: Math.max(11, settings.fontSize - 1), previewFontSize: Math.max(11, settings.previewFontSize - 1) }),
    resetZoom: () => updateSettings({ fontSize: 15, previewFontSize: 15 }),
  }, settings.touchpadGestures && !!vault.vaultPath)

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
    const editor = editorRef.current

    // Copy LaTeX from KaTeX
    const katexWrapper = el.closest(".katex-wrapper") as HTMLElement | null
    if (katexWrapper) {
      const expr = katexWrapper.dataset.expr
      if (expr) {
        navigator.clipboard.writeText(decodeURIComponent(expr)).then(() => {
          katexWrapper.classList.add("copied")
          showToast(t.app.copiedLatex, "success")
          setTimeout(() => katexWrapper.classList.remove("copied"), 1500)
        })
      }
      return
    }

    const heading = el.closest("h1, h2, h3, h4") as HTMLElement | null
    if (heading && editor && vault.openFile) {
      const headingText = (heading.textContent || "")
        .replace(/^\d+(?:\.\d+)*\s+/, "")
        .trim()
        .toLowerCase()
      const lines = vault.openFile.content.split("\n")
      const targetLine = lines.findIndex((line) => {
        const match = /^#{1,4}\s+(.+)$/.exec(line.trim())
        return match?.[1].trim().toLowerCase() === headingText
      })
      if (targetLine >= 0) {
        editor.revealLineInCenter(targetLine + 1)
        editor.setPosition({ lineNumber: targetLine + 1, column: 1 })
        editor.focus()
        return
      }
    }

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
    if (link) {
      e.preventDefault()
      const wikiTarget = link.dataset.target
      if (!wikiTarget) return
      const node = findByName(vault.tree, wikiTarget)
      if (node) {
        const heading = link.dataset.heading
        if (heading) {
          const content = vaultFiles.find((file) => file.path === node.path)?.content ?? ""
          const line = content.split("\n").findIndex((candidate) => {
            const match = /^#{1,6}\s+(.+)$/.exec(candidate)
            return match?.[1].replace(/\s*\{#[\w:.-]+\}\s*$/, "").trim().toLowerCase() === heading.toLowerCase()
          })
          if (line >= 0) pendingJumpRef.current = line + 1
        }
        handleOpenFileNode(node)
      }
      return
    }

    // ── Transclusion: click header / block to jump to source file ──────────
    const transclusion = el.closest(".transclusion") as HTMLElement | null
    if (transclusion && el.closest(".transclusion-header")) {
      const source = transclusion.dataset.source
      if (source) {
        const node = findByName(vault.tree, source)
        if (node) handleOpenFileNode(node)
      }
      return
    }

    // ── Fallback: jump editor to the source line of any annotated block ────
    // Single click anywhere inside an element (or descendant) carrying
    // `data-source-line` reveals that line in the editor and focuses it.
    if (editor) {
      const sourceEl = (e.target as Element).closest("[data-source-line]") as HTMLElement | null
      if (sourceEl) {
        const lineNum = parseInt(sourceEl.dataset.sourceLine ?? "", 10)
        if (Number.isFinite(lineNum) && lineNum > 0) {
          editor.revealLineInCenter(lineNum)
          editor.setPosition({ lineNumber: lineNum, column: 1 })
          editor.focus()
        }
      }
    }
  }, [vault, vaultFiles, handleOpenFileNode, t.app.copiedLatex])

  // ── Wikilink hover preview ────────────────────────────────────────────────
  // Show a floating preview card with the first ~10 non-empty lines of the
  // target note when the user hovers (~300ms) over a rendered [[wikilink]].
  useEffect(() => {
    const pane = previewPaneRef.current
    if (!pane) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let card: HTMLDivElement | null = null
    let currentLink: HTMLElement | null = null

    const removeCard = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (card && card.parentNode) card.parentNode.removeChild(card)
      card = null
      currentLink = null
    }

    const showCard = (link: HTMLElement, x: number, y: number) => {
      const target = link.dataset.target
      if (!target) return
      const isBroken = link.classList.contains("wikilink-broken")
      card = document.createElement("div")
      card.className = "wikilink-hover-card"
      // Position near cursor; clamp to viewport.
      const W = 400, H = 300
      const left = Math.min(x + 12, window.innerWidth - W - 8)
      const top = Math.min(y + 16, window.innerHeight - H - 8)
      card.style.left = `${Math.max(8, left)}px`
      card.style.top = `${Math.max(8, top)}px`

      let html = ""
      if (isBroken) {
        html = `<div class="wikilink-hover-empty">${escapeHoverText(t.preview.hoverNotFound)}</div>`
      } else {
        const node = findByName(vault.tree, target)
        const fileEntry = node ? vaultFiles.find((f) => f.path === node.path) : undefined
        const content = fileEntry?.content
        if (content == null || content === "") {
          html = `<div class="wikilink-hover-empty">${escapeHoverText(t.preview.hoverLoading)}</div>`
        } else {
          const parsed = extractFrontmatter(content)
          const body = parsed?.content ?? content
          const lines = body.split("\n").filter((l) => l.trim() !== "").slice(0, 10).join("\n")
          try {
            const rendered = renderMarkdown(lines, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver)
            html = sanitizeRenderedHtml(rendered)
          } catch {
            html = `<div class="wikilink-hover-empty">${escapeHoverText(t.preview.hoverNotFound)}</div>`
          }
        }
      }
      card.innerHTML = html
      document.body.appendChild(card)
    }

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const link = target?.closest(".wikilink") as HTMLElement | null
      if (!link) return
      if (link === currentLink) return
      removeCard()
      currentLink = link
      const x = e.clientX, y = e.clientY
      timer = setTimeout(() => { timer = null; showCard(link, x, y) }, 300)
    }

    const onOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const link = target?.closest(".wikilink") as HTMLElement | null
      if (!link) return
      const related = e.relatedTarget as HTMLElement | null
      if (related && link.contains(related)) return
      removeCard()
    }

    pane.addEventListener("mouseover", onOver)
    pane.addEventListener("mouseout", onOut)
    return () => {
      pane.removeEventListener("mouseover", onOver)
      pane.removeEventListener("mouseout", onOut)
      removeCard()
    }
  }, [vault.tree, vaultFiles, vault.vaultPath, macros, wikiNames, bibMap, transclusionResolver, t.preview.hoverLoading, t.preview.hoverNotFound])

  // ── Preview → Editor double-click sync ───────────────────────────────────
  const handlePreviewDblClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    let el: HTMLElement | null = e.target as HTMLElement
    while (el && el !== e.currentTarget) {
      const line = el.dataset.sourceLine
      if (line) {
        const lineNum = parseInt(line)
        if (!isNaN(lineNum) && editorRef.current) {
          editorRef.current.revealLineInCenter(lineNum)
          editorRef.current.setPosition({ lineNumber: lineNum, column: 1 })
          editorRef.current.focus()
        }
        return
      }
      el = el.parentElement
    }
  }, [editorRef])

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
    await writeTextFile(path, exportToObsidianMarkdown(editor.getValue()))
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
    const content = resolveTransclusions(editor.getValue(), transclusionResolver)
    const parsed = extractFrontmatter(content)
    const fm = parsed?.data
    const author = fm?.author as string | undefined
    const tex = exportToTex(
      content,
      macrosText,
      (fm?.title as string) || titleGuess,
      author,
      { headerLeft: fm?.headerLeft as string, headerCenter: fm?.headerCenter as string, headerRight: fm?.headerRight as string, footerLeft: fm?.footerLeft as string, footerCenter: fm?.footerCenter as string, footerRight: fm?.footerRight as string }
    )
    const path = await save({
      title: t.app.dialogExportTex,
      filters: [{ name: "LaTeX", extensions: ["tex"] }],
      defaultPath: vault.openFile?.name.replace(/\.[^.]+$/, ".tex") ?? "export.tex",
    })
    if (!path) return
    await writeTextFile(path, tex)
  }, [vault, t, transclusionResolver])

  const handleExportProjectTex = useCallback(async () => {
    let macrosText = ""
    if (vault.vaultPath) {
      try {
        const mp = await pathJoin(vault.vaultPath, MACROS_FILENAME)
        if (await exists(mp)) macrosText = await readTextFile(mp)
      } catch { /* ok */ }
    }
    const content = composeProjectMarkdown(vaultFiles, vault.activeTabPath)
    if (!content) {
      showToast(t.app.noMainDocument, "error")
      return
    }
    const parsed = extractFrontmatter(content)
    const fm = parsed?.data
    const title = (fm?.title as string) || vault.openFile?.name.replace(/\.[^.]+$/, "") || "project"
    const tex = exportToTex(content, macrosText, title, fm?.author as string | undefined)
    const path = await save({
      title: t.palette.exportProjectTex,
      filters: [{ name: "LaTeX", extensions: ["tex"] }],
      defaultPath: `${title.replace(/[^\w.-]+/g, "-").toLowerCase()}.tex`,
    })
    if (!path) return
    await writeTextFile(path, tex)
  }, [vault.vaultPath, vault.activeTabPath, vault.openFile, vaultFiles, t])

  const handleCompileLatexPdf = useCallback(async (opts?: { forceWasm?: boolean }) => {
    await compileLatexPdfAction({
      activeFile: vault.openFile,
      vaultPath: vault.vaultPath,
      activePath: vault.activeTabPath,
      vaultFiles,
      deps,
      dialogs: {
        saveAs: "Save as",
        exportMd: t.app.dialogExportMd,
        exportTex: t.app.dialogExportTex,
        exportPdf: t.app.dialogExportPdf,
        exportReveal: "Export Reveal.js",
      },
      messages: {
        pandocMissing: t.app.pandocMissing,
        generatingPdf: t.app.generatingPdf,
        pdfDone: t.app.pdfDone,
        pandocError: t.app.pandocError,
        exportDocxSuccess: t.app.exportDocxSuccess,
        exportDocxError: t.app.exportDocxError,
        exportBeamerSuccess: t.app.exportBeamerSuccess,
        exportBeamerError: t.app.exportBeamerError,
        backupSuccess: t.app.backupSuccess,
        backupError: t.app.backupError,
        copiedLatex: t.app.copiedLatex,
        copyError: t.app.copyError,
        revealExportSuccess: t.app.revealExportSuccess,
        revealExportError: t.app.revealExportError,
        noMainDocument: t.app.noMainDocument,
        pdfCompiledLocal: t.app.pdfCompiledLocal,
        compilationFailed: t.app.compilationFailed,
        zipMissing: t.app.zipMissing,
        wasmTexInitializing: t.settings.wasmTexInitializing,
        wasmTexCompiling: t.settings.wasmTexCompiling,
        wasmTexFallback: t.settings.wasmTexFallback,
        wasmTexUnavailable: t.settings.wasmTexUnavailable,
      },
      readEditorContent: () => editorRef.current?.getValue() ?? null,
      reloadVault: async () => { await vault.loadVault?.() },
      resolveTransclusion: transclusionResolver,
      toast: showToast,
      writeClipboard: (text) => navigator.clipboard.writeText(text),
      onLatexError: (diags) => setLatexDiagnostics(diags),
      useWasmTex: opts?.forceWasm ?? settings.useWasmTex,
      onPdfSaved: setPdfPath,
      onWasmStatus: (state) => setTexEngineState(state),
    })
  }, [vault, t, deps, vaultFiles, transclusionResolver, settings.useWasmTex])

  // ── Auto-rebuild PDF on save (when PDF preview is open + setting on) ─────
  // We recompile to the existing pdfPath, no dialog. Skips silently on error.
  const rebuildPdfInPlace = useCallback(async () => {
    const editor = editorRef.current
    const currentFile = vault.openFile
    if (!editor || !currentFile || !pdfPath) return
    let macrosText = ""
    if (vault.vaultPath) {
      try {
        const mp = await pathJoin(vault.vaultPath, MACROS_FILENAME)
        if (await exists(mp)) macrosText = await readTextFile(mp)
      } catch { /* ok */ }
    }
    const content = resolveTransclusions(editor.getValue(), transclusionResolver)
    const parsed = extractFrontmatter(content)
    const fm = parsed?.data
    const title = (fm?.title as string) || currentFile.name.replace(/\.[^.]+$/, "")
    const tex = exportToTex(content, macrosText, title, fm?.author as string | undefined)
    const dir = currentFile.path.split("/").slice(0, -1).join("/") || "."
    const base = currentFile.name.replace(/\.[^.]+$/, "")
    const tmpTex = `${dir}/${base}.comdtex-rebuild.tex`
    const tmpPdf = `${dir}/${base}.comdtex-rebuild.pdf`
    try {
      await writeTextFile(tmpTex, tex)
      const attempts: Array<[string, string[]]> = [
        ["tectonic", [tmpTex, "--outdir", dir]],
        ["xelatex", ["-interaction=nonstopmode", "-halt-on-error", `-jobname=${base}.comdtex-rebuild`, tmpTex]],
        ["pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `-jobname=${base}.comdtex-rebuild`, tmpTex]],
      ]
      for (const [cmdName, args] of attempts) {
        try {
          const result = await Command.create(cmdName, args, { cwd: dir }).execute()
          if (result.code === 0 && await exists(tmpPdf)) {
            await copyFile(tmpPdf, pdfPath)
            // Force PdfPreviewPanel to reload by re-setting the same path with a
            // cache-busting suffix is awkward (Tauri convertFileSrc); instead we
            // toggle the path through null then back so the effect re-runs.
            const restore = pdfPath
            setPdfPath(null)
            setTimeout(() => setPdfPath(restore), 0)
            return
          }
        } catch { /* try next engine */ }
      }
    } finally {
      await remove(tmpTex).catch(() => {})
      await remove(tmpPdf).catch(() => {})
      await remove(`${dir}/${base}.comdtex-rebuild.aux`).catch(() => {})
      await remove(`${dir}/${base}.comdtex-rebuild.log`).catch(() => {})
    }
  }, [vault.openFile, vault.vaultPath, pdfPath, transclusionResolver])

  // Debounced: when autoRebuildPdf is on, the PDF panel is active, and there
  // is an existing pdfPath, recompile ~3s after content changes.
  useEffect(() => {
    if (!settings.autoRebuildPdf) return
    if (sidebarMode !== "pdfPreview") return
    if (!pdfPath) return
    const timer = setTimeout(() => { rebuildPdfInPlace() }, 3000)
    return () => clearTimeout(timer)
  }, [settings.autoRebuildPdf, sidebarMode, pdfPath, vault.openFile?.content, rebuildPdfInPlace])

  const handleExportPdf = useCallback(async () => {
    await exportPdfAction({
      activeFile: vault.openFile,
      vaultPath: vault.vaultPath,
      activePath: vault.activeTabPath,
      vaultFiles,
      deps,
      dialogs: { saveAs: "Save as", exportMd: t.app.dialogExportMd, exportTex: t.app.dialogExportTex, exportPdf: t.app.dialogExportPdf, exportReveal: "Export Reveal.js" },
      messages: { pandocMissing: t.app.pandocMissing, generatingPdf: t.app.generatingPdf, pdfDone: t.app.pdfDone, pandocError: t.app.pandocError, exportDocxSuccess: t.app.exportDocxSuccess, exportDocxError: t.app.exportDocxError, exportBeamerSuccess: t.app.exportBeamerSuccess, exportBeamerError: t.app.exportBeamerError, backupSuccess: t.app.backupSuccess, backupError: t.app.backupError, copiedLatex: t.app.copiedLatex, copyError: t.app.copyError, revealExportSuccess: t.app.revealExportSuccess, revealExportError: t.app.revealExportError, noMainDocument: t.app.noMainDocument, pdfCompiledLocal: t.app.pdfCompiledLocal, compilationFailed: t.app.compilationFailed, zipMissing: t.app.zipMissing },
      readEditorContent: () => editorRef.current?.getValue() ?? null,
      reloadVault: async () => { await vault.loadVault?.() },
      resolveTransclusion: transclusionResolver,
      toast: showToast,
      writeClipboard: (text) => navigator.clipboard.writeText(text),
      onLatexError: (diags) => setLatexDiagnostics(diags),
      onPdfSaved: (path) => setPdfPath(path),
    })
  }, [vault, t, deps, vaultFiles, transclusionResolver])

  const handleExportAnki = useCallback(async () => {
    await exportAnkiCardsToFile(
      { activeFile: vault.openFile, readEditorContent: () => editorRef.current?.getValue() ?? null, toast: showToast },
      { ankiNoCards: t.ankiExport.ankiNoCards, ankiExported: t.ankiExport.ankiExported },
    )
  }, [vault.openFile, t])

  const handleExportDocx = useCallback(async () => {
    const file = vault.openFile
    if (!file) return
    if (deps && !deps.pandoc) {
      showToast(t.app.pandocMissingDocx, "error", 6000)
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
      showToast(t.app.pandocMissingBeamer, "error", 6000)
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
      showToast(t.app.zipMissing, "error", 6000)
      return
    }
    // ISO-style timestamp with safe characters: YYYY-MM-DD-HHmm
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
    const defaultName = `vault-backup-${stamp}.zip`
    const outPath = await save({
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      defaultPath: defaultName,
    })
    if (!outPath) return
    try {
      const vaultName = vault.vaultPath.split(/[/\\]/).filter(Boolean).pop() ?? "vault"
      // Exclude noise: VCS, dependencies, agent state, drafts, LaTeX intermediates.
      const excludes = [
        `${vaultName}/.git/*`,
        `${vaultName}/node_modules/*`,
        `${vaultName}/.claude/*`,
        `${vaultName}/.comdtex-drafts/*`,
        `${vaultName}/*.log`,
        `${vaultName}/*.aux`,
        `${vaultName}/*.bbl`,
        `${vaultName}/*.blg`,
        // Also catch the same patterns at any nested depth
        `${vaultName}/**/.git/*`,
        `${vaultName}/**/node_modules/*`,
        `${vaultName}/**/*.log`,
        `${vaultName}/**/*.aux`,
        `${vaultName}/**/*.bbl`,
        `${vaultName}/**/*.blg`,
      ]
      const args = ["-r", outPath, vaultName, "-x", ...excludes]
      const cmd = Command.create("zip", args, { cwd: vault.vaultPath + "/.." })
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
      const html = renderMarkdown(file.content, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver)
      await navigator.clipboard.writeText(sanitizeRenderedHtml(html))
      showToast(t.app.copiedHtml, "success")
    } catch { showToast(t.app.copyError ?? "Error al copiar", "error") }
  }, [vault.openFile, macros, wikiNames, bibMap, vault.vaultPath, transclusionResolver, t])

  const handleCopyLatex = useCallback(async () => {
    const file = vault.openFile
    if (!file) return
    try {
      let macrosText = ""
      if (vault.vaultPath) {
        try {
          const mp = await pathJoin(vault.vaultPath, MACROS_FILENAME)
          if (await exists(mp)) macrosText = await readTextFile(mp)
        } catch { /* ok */ }
      }
      const title = file.name.replace(/\.[^.]+$/, "")
      const parsed = extractFrontmatter(file.content)
      const fm = parsed?.data
      const author = fm?.author as string | undefined
      const tex = exportToTex(
        resolveTransclusions(file.content, transclusionResolver),
        macrosText,
        (fm?.title as string) || title,
        author,
        { headerLeft: fm?.headerLeft as string, headerCenter: fm?.headerCenter as string, headerRight: fm?.headerRight as string, footerLeft: fm?.footerLeft as string, footerCenter: fm?.footerCenter as string, footerRight: fm?.footerRight as string }
      )
      await navigator.clipboard.writeText(tex)
      showToast(t.app.copiedLatex, "success")
    } catch { showToast(t.app.copyError ?? "Error al copiar", "error") }
  }, [vault.openFile, vault.vaultPath, transclusionResolver, t])

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
    opts: SearchReplaceOptions,
    target?: SearchReplaceTarget,
  ): Promise<number> => {
    try {
      const diskText = await readTextFile(filePath)
      const text = toEditorContent(filePath, diskText)
      const re = buildSearchRegExp(search, opts)
      if (!re) return 0
      const { count, content: newContent } = target
        ? replaceMatchAt(text, re, replace, target)
        : replaceMatches(text, re, replace)
      if (count === 0) return 0
      await writeTextFile(filePath, toDiskContent(filePath, newContent))
      vault.patchTabContent(filePath, newContent)
      return count
    } catch (e) {
      showToast(t.app.replaceError((e as Error).message), "error")
      return 0
    }
  }, [vault, t])

  const handleBreadcrumbNavigate = useCallback((path: string) => {
    const node = flatFiles(vault.tree).find((f) => f.path === path)
    if (node) {
      handleOpenFileNode(node)
      return
    }
    setSidebarMode("files")
  }, [vault.tree, handleOpenFileNode])

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
        renderMarkdown(content, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver)
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
      title: t.palette.exportHtml,
      filters: [{ name: "HTML", extensions: ["html"] }],
      defaultPath: vault.openFile.name.replace(/\.[^.]+$/, ".html"),
    })
    if (!path) return
    await writeTextFile(path, standalone)
    showToast(t.app.htmlExported, "success")
    await openPath(path)
  }, [vault, macros, wikiNames, bibMap, transclusionResolver, t])

  // ── Insert TOC ────────────────────────────────────────────────────────────
  const handleInsertToc = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const content = editor.getValue()
    const toc = buildTocMarkdown(content, 3)
    if (!toc) return
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
    if (!(await exists(mp))) await writeTextFile(mp, MACROS_TEMPLATE)
    await vault.loadVault()
    await vault.openFilePath(mp)
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
      const re = new RegExp(`\\[\\[${oldBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}((?:#[^\\]|]+)?)((?:\\|[^\\]]+)?)\\]\\]`, "g")
      const markdownFiles = flatFiles(vault.tree)
        .filter((file) => file.path !== oldPath && file.ext === "md")
      const filesWithLinks: { path: string; content: string }[] = []

      for (const file of markdownFiles) {
        const openTab = vault.openTabs.find((tab) => tab.path === file.path)
        const rawDisk = await readTextFile(file.path).catch(() => "")
        const source = openTab?.content ?? toEditorContent(file.path, rawDisk)
        re.lastIndex = 0
        if (source && re.test(source)) filesWithLinks.push({ path: file.path, content: source })
      }

      if (filesWithLinks.length > 0) {
        let refactorCount = 0
        try {
          const ok = await tauriConfirm(
            t.vault.renameRefactorConfirm(oldBasename, newBasename, filesWithLinks.length),
            { title: "ComdTeX" }
          )
          if (ok) {
            for (const file of filesWithLinks) {
              re.lastIndex = 0
              const updated = file.content.replace(re, `[[${newBasename}$1$2]]`)
              const matches = file.content.match(re)
              await writeTextFile(file.path, updated)
              vault.patchTabContent(file.path, updated)
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
    if (!(await exists(bp))) await writeTextFile(bp, BIB_TEMPLATE)
    await vault.loadVault()
    await vault.openFilePath(bp)
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

  // ── First-launch onboarding tour ────────────────────────────────────────
  useEffect(() => {
    if (!vault.vaultPath) return
    try {
      const seen = localStorage.getItem("comdtex_onboarding_seen") === "true"
      if (!seen) {
        // small delay so the layout settles before the modal appears
        const timer = setTimeout(() => setOnboardingOpen(true), 600)
        return () => clearTimeout(timer)
      }
    } catch { /* localStorage unavailable */ }
  }, [vault.vaultPath])

  const handleOnboardingClose = useCallback(() => {
    setOnboardingOpen(false)
    try { localStorage.setItem("comdtex_onboarding_seen", "true") } catch { /* ignore */ }
  }, [])

  // ── Daily notes ─────────────────────────────────────────────────────────
  const handleOpenDailyNote = useCallback(async () => {
    if (!vault.vaultPath) {
      showToast(t.app.dailyNoteNoVault, "error")
      return
    }
    try {
      const date = new Date()
      const pad = (n: number) => String(n).padStart(2, "0")
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      const folder = (settings.dailyNotesFolder || "").trim()
      const filename = `${dateStr}.md`

      let filePath: string
      if (folder) {
        const dir = await pathJoin(vault.vaultPath, folder)
        if (!(await exists(dir))) await mkdir(dir, { recursive: true })
        filePath = await pathJoin(dir, filename)
      } else {
        filePath = await pathJoin(vault.vaultPath, filename)
      }

      const fileExists = await exists(filePath)
      if (!fileExists) {
        const tplRaw = settings.dailyNotesTemplate || "# {{date:YYYY-MM-DD}}\n\n"
        const content = processTemplateVariables(tplRaw, filename)
        await writeTextFile(filePath, content)
        await vault.loadVault()
        showToast(t.app.dailyNoteCreated(filename), "success")
      } else {
        showToast(t.app.dailyNoteOpened(filename), "info")
      }
      await vault.openFilePath(filePath)
    } catch (err) {
      showToast(t.app.dailyNoteError(err instanceof Error ? err.message : String(err)), "error")
    }
  }, [vault, t, settings.dailyNotesFolder, settings.dailyNotesTemplate])

  // Daily notes shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        if (!settings.dailyNotesEnabled) return
        e.preventDefault()
        void handleOpenDailyNote()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [settings.dailyNotesEnabled, handleOpenDailyNote])

  const handleInstallUpdate = async () => {
    setInstalling(true)
    await downloadAndInstallUpdate()
  }

  // ── Command palette entries ───────────────────────────────────────────────
  const paletteCommands: PaletteCommand[] = [
    { id: "save",       label: t.palette.save,            description: "Ctrl+S",       action: handleSave },
    { id: "saveAs",     label: t.palette.saveAs,                                        action: handleSaveAs },
    { id: "exportTex",  label: t.palette.exportTex,                                    action: handleExportTex },
    { id: "exportProjectTex", label: t.palette.exportProjectTex,                        action: handleExportProjectTex },
    { id: "compileLatexPdf", label: t.palette.compileLatexPdf,                         action: () => handleCompileLatexPdf({ forceWasm: false }) },
    { id: "compileWasmPdf",  label: t.palette.compileWasmPdf,                          action: () => handleCompileLatexPdf({ forceWasm: true }) },
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
    { id: "labels",     label: t.palette.viewLabels,                                   action: () => setSidebarMode("labels") },
    { id: "quality",    label: t.palette.viewQuality,                                  action: () => setSidebarMode("quality") },
    { id: "properties", label: t.palette.viewProperties,                               action: () => setSidebarMode("properties") },
    { id: "graph",      label: t.palette.viewGraph,                                    action: () => setSidebarMode("graph") },
    { id: "toc",        label: t.palette.insertToc,                                     action: handleInsertToc },
    { id: "exportHtml", label: t.palette.exportHtml,                                    action: handleExportHtml },
    { id: "todo",       label: t.palette.viewTodo,                                      action: () => setSidebarMode("todo") },
    { id: "equations",  label: t.palette.viewEquations,                                 action: () => setSidebarMode("equations") },
    { id: "stats",      label: t.palette.viewStats,                                     action: () => setSidebarMode("stats") },
    { id: "typewriter", label: t.palette.typewriterMode,  description: typewriterMode ? "✓" : "", action: () => updateSettings({ typewriterMode: !typewriterMode }) },
    { id: "syncScroll", label: t.palette.syncScroll,      description: syncScroll ? "✓" : "",     action: () => updateSettings({ syncScroll: !syncScroll }) },
    { id: "wordWrap",    label: t.palette.wordWrap,        description: wordWrap ? "✓" : "",       action: () => updateSettings({ wordWrap: !wordWrap }) },
    { id: "minimap",     label: t.palette.minimap,         description: minimapEnabled ? "✓" : "", action: () => updateSettings({ minimapEnabled: !minimapEnabled }) },
    { id: "spellcheck",  label: t.palette.spellcheck,      description: spellcheck ? "✓" : "",     action: () => updateSettings({ spellcheck: !spellcheck }) },
    { id: "exportAnki",  label: t.palette.exportAnkiCards,                                         action: handleExportAnki },
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
    { id: "symbols",         label: t.palette.symbolPicker,                             action: () => setSidebarMode("symbols") },
    { id: "dailyNote",       label: t.palette.openDailyNote,   description: "Ctrl+Shift+D", action: handleOpenDailyNote },
    { id: "onboarding",      label: t.palette.showOnboarding,                            action: () => setOnboardingOpen(true) },
    { id: "viewPdf",         label: t.palette.viewPdf,                                  action: () => setSidebarMode("pdfPreview") },
    { id: "addComment",      label: t.palette.addComment,      description: "Ctrl+Shift+M", action: () => { void handleAddCommentAtCursor() } },
    { id: "viewComments",    label: t.palette.viewComments,                              action: () => setSidebarMode("comments") },
    { id: "toggleCommentResolved", label: t.palette.toggleCommentResolved,               action: handleToggleCommentAtCursor },
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
        { label: t.palette.exportProjectTex, disabled: !hasVault, action: handleExportProjectTex },
        { label: t.palette.compileLatexPdf, disabled: !hasFile, action: () => handleCompileLatexPdf() },
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

  const themeAttr =
    settings.theme === "vs" ? "light" : settings.theme === "hc-black" ? "hc" : "dark"

  if (showWelcome) {
    return (
      <div className={`app${focusMode ? " focus-mode" : ""}`} data-theme={themeAttr}>
        <TitleBar filename={undefined} isDirty={false} onClose={handleCloseRequest} onSettingsClick={() => setSettingsOpen(true)} />
        <WelcomeScreen
          onOpenVault={vault.selectVault}
          onCreateVault={vault.createVault}
          recentVaults={vault.recentVaults}
          onOpenRecent={(path) => vault.selectVault(path)}
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
        <Suspense fallback={null}>
          <SettingsModal
            open={settingsOpen}
            settings={settings}
            onClose={() => setSettingsOpen(false)}
            onChange={updateSettings}
          />
          <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
        </Suspense>
      </div>
    )
  }

  return (
    <div className={`app${focusMode ? " focus-mode" : ""}`} data-theme={themeAttr}>
      <TitleBar filename={vault.openFile?.name} isDirty={vault.openFile?.isDirty} onClose={handleCloseRequest} onSettingsClick={() => setSettingsOpen(true)} />
      <MenuBar menus={menus}>
        <GitBar vaultPath={vault.vaultPath} />
      </MenuBar>
      {deps && !depsWarningDismissed && (!deps.pandoc || !deps.zip) && (
        <DepsWarning
          deps={deps}
          useWasmTex={settings.useWasmTex}
          onDismiss={() => setDepsWarningDismissed(true)}
        />
      )}
      <Toolbar
        editorRef={editorRef}
        previewVisible={settings.previewVisible}
        onTogglePreview={() => updateSettings({ previewVisible: !settings.previewVisible })}
      />

      <div className="main" ref={mainRef}>
        {/* ── Sidebar ── */}
        <div className="sidebar" style={{ width: sidebarCollapsed ? 0 : sidebarWidth, overflow: sidebarCollapsed ? "hidden" : "auto" }}>
          <div className="sidebar-header">
            <button
              className="sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? t.sidebar.expand : t.sidebar.collapse}
            >
              {sidebarCollapsed ? "»" : "«"}
            </button>
          </div>
          {!sidebarCollapsed && (
            <>
          <div className="sidebar-tabs" role="tablist" aria-label="Panel lateral">
            {(["files", "search", "searchReplace", "outline", "backlinks", "tags", "labels", "quality", "properties", "graph", "todo", "equations", "environments", "stats", "comments", "help", "symbols", "pdfPreview"] as const).map((mode) => {
              const labels: Record<string, string> = {
                files: t.sidebar.files, search: t.sidebar.search, outline: t.sidebar.outline,
                backlinks: t.sidebar.backlinks, help: t.sidebar.help,
                tags: t.sidebar.tags, labels: t.sidebar.labels, properties: t.sidebar.properties, graph: t.sidebar.graph,
                todo: t.sidebar.todo, equations: t.sidebar.equations, stats: t.sidebar.stats,
                environments: t.sidebar.environments,
                searchReplace: t.sidebar.searchReplace,
                quality: t.sidebar.quality,
                symbols: t.sidebar.symbols,
                pdfPreview: t.sidebar.pdfPreview,
                comments: t.sidebar.comments,
              }
              const icons: Record<string, string> = {
                files: "☰", search: "⌕", outline: "≡", backlinks: "←",
                tags: "#", labels: "⌁", properties: "≋", graph: "⬡", help: "?",
                todo: "☑", equations: "∑", environments: "∀", stats: "◈",
                searchReplace: "⇄",
                quality: "✓",
                symbols: "∑",
                pdfPreview: "📑",
                comments: "💬",
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
              <Suspense fallback={null}>
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
              </Suspense>
            )}
            {sidebarMode === "outline" && (
              <OutlinePanel content={previewContent} editorRef={editorRef} activeLine={cursorPos.line} />
            )}
            {sidebarMode === "backlinks" && (
              <BacklinksPanel
                currentFile={vault.openFile}
                tree={vault.tree}
                onOpenFile={(node, line) => {
                  if (line !== undefined) pendingJumpRef.current = line
                  handleOpenFileNode(node)
                  setSidebarMode("files")
                }}
              />
            )}
            {sidebarMode === "tags" && (
              <TagPanel
                files={vaultFiles}
                onOpenFile={(path, line) => {
                  const node = flatFiles(vault.tree).find((f) => f.path === path)
                  if (node) {
                    if (line !== undefined) pendingJumpRef.current = line
                    handleOpenFileNode(node)
                    setSidebarMode("files")
                  }
                }}
              />
            )}
            {sidebarMode === "labels" && (
              <LabelsPanel
                files={vaultFiles}
                onOpenFile={(path, line) => {
                  const node = flatFiles(vault.tree).find((f) => f.path === path)
                  if (node) {
                    if (line !== undefined) pendingJumpRef.current = line
                    handleOpenFileNode(node)
                    setSidebarMode("files")
                  }
                }}
              />
            )}
            {sidebarMode === "quality" && (
              <DocumentLabPanel
                files={vaultFiles}
                activePath={vault.activeTabPath}
                activeContent={vault.openFile?.content ?? ""}
                onOpenFile={(path, line) => {
                  const node = flatFiles(vault.tree).find((f) => f.path === path)
                  if (node) {
                    if (line !== undefined) pendingJumpRef.current = line
                    handleOpenFileNode(node)
                    setSidebarMode("files")
                  }
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
              <Suspense fallback={null}>
                <GraphPanel
                  tree={vault.tree}
                  openTabs={vault.openTabs}
                  activePath={vault.activeTabPath}
                  onOpenFile={(path) => {
                    const node = flatFiles(vault.tree).find((f) => f.path === path)
                    if (node) handleOpenFileNode(node)
                  }}
                />
              </Suspense>
            )}
            {sidebarMode === "todo" && (
              <Suspense fallback={null}>
                <TodoPanel
                  openTabs={vault.openTabs}
                  onNavigate={handleTodoNavigate}
                  onToggle={handleTodoToggle}
                />
              </Suspense>
            )}
            {sidebarMode === "equations" && (
              <Suspense fallback={null}>
                <EquationsPanel content={vault.openFile?.content ?? ""} editorRef={editorRef} />
              </Suspense>
            )}
            {sidebarMode === "environments" && (
              <Suspense fallback={null}>
                <EnvironmentsPanel
                  openTabs={vault.openTabs}
                  editorRef={editorRef}
                  activeTabPath={vault.activeTabPath}
                  onOpenFile={(path) => {
                    const node = flatFiles(vault.tree).find((f) => f.path === path)
                    if (node) handleOpenFileNode(node)
                  }}
                />
              </Suspense>
            )}
            {sidebarMode === "stats" && (
              <Suspense fallback={null}>
                <VaultStatsPanel
                  tree={vault.tree}
                  openTabs={vault.openTabs}
                  wikiNames={wikiNames}
                  onOpenFile={(path, line) => {
                    const node = flatFiles(vault.tree).find((f) => f.path === path)
                    if (!node) return
                    if (line !== undefined) pendingJumpRef.current = line
                    handleOpenFileNode(node)
                    setSidebarMode("files")
                  }}
                  onCreateNote={async (name) => {
                    await vault.createFile(`${name}.md`, `# ${name}\n`)
                  }}
                  onRemoveLink={async (path, line, link) => {
                    const openTab = vault.openTabs.find((tab) => tab.path === path)
                    const content = openTab ? openTab.content : await readTextFile(path)
                    const lines = content.split("\n")
                    const idx = line - 1
                    if (idx < 0 || idx >= lines.length) return
                    const pattern = `[[${link}]]`
                    if (!lines[idx].includes(pattern)) return
                    lines[idx] = lines[idx].split(pattern).join("")
                    const updated = lines.join("\n")
                    await writeTextFile(path, updated)
                    if (openTab) vault.patchTabContent(path, updated)
                  }}
                />
              </Suspense>
            )}
            {sidebarMode === "help" && (
              <Suspense fallback={null}>
                <HelpPanel />
              </Suspense>
            )}
            {sidebarMode === "symbols" && (
              <SymbolPickerPanel onInsert={(latex) => {
                const editor = editorRef.current
                if (!editor) return
                editor.focus()
                editor.trigger("keyboard", "type", { text: latex })
              }} />
            )}
            {sidebarMode === "pdfPreview" && (
              <Suspense fallback={null}>
                <PdfPreviewPanel
                  pdfPath={pdfPath}
                  onClickSource={handlePdfClickSource}
                  invert={settings.theme === "vs-dark" || settings.theme === "hc-black"}
                />
              </Suspense>
            )}
            {sidebarMode === "comments" && (
              <Suspense fallback={null}>
                <CommentsPanel
                  comments={comments}
                  vaultPath={vault.vaultPath}
                  activeFilePath={vault.openFile?.path ?? null}
                  onJumpTo={handleJumpToComment}
                  onAdd={() => { void handleAddCommentAtCursor() }}
                  onToggleResolved={(id) => { void handleToggleCommentResolved(id) }}
                  onDelete={(id) => { void handleDeleteComment(id) }}
                  onEditBody={(id, body) => { void handleEditCommentBody(id, body) }}
                />
              </Suspense>
            )}
          </div>
          </>
          )}
        </div>

        {!sidebarCollapsed && <Resizer onDrag={handleSidebarResize} />}

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
            onNavigate={handleBreadcrumbNavigate}
          />
          <Suspense fallback={<div style={{ flex: 1, minHeight: 0 }} />}>
            <MonacoEditor
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
          </Suspense>
          {/* Vim mode status bar */}
          <div
            ref={vimStatusRef}
            className={`vim-statusbar${settings.vimMode ? "" : " hidden"}`}
          />
        </div>

        {settings.previewVisible && <Resizer onDrag={handleEditorResize} />}

        {/* ── Preview ── */}
        {settings.previewVisible && (
          <div
            className={`pane preview-pane${settings.previewTheme === "light" ? " preview-light" : settings.previewTheme === "dark" ? " preview-dark" : ""}`}
            id="preview-pane"
            ref={previewPaneRef}
          >
            {customCss && <style>{customCss}</style>}
            <div
              className="preview-content"
              style={{ fontSize: settings.previewFontSize }}
              onClick={handlePreviewClick}
              onDoubleClick={handlePreviewDblClick}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}

        {/* ── Split view — reference panel ── */}
        {splitTab && (() => {
          return (
            <>
              <Resizer onDrag={() => {}} />
              <div className="pane preview-pane split-pane" ref={splitPreviewRef}>
                <div className="split-pane-header">
                  <span className="split-pane-title">{splitTab?.name ?? ""}</span>
                  <button className="split-pane-close" onClick={() => setSplitFile(null)} title={t.app.closeSplitPane} aria-label={t.app.closeSplitPane}>×</button>
                </div>
                <div
                  className="preview-content"
                  style={{ fontSize: settings.previewFontSize }}
                  dangerouslySetInnerHTML={{ __html: splitPreviewHtml }}
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
        texEngine={settings.useWasmTex ? "wasm" : "local"}
        texEngineState={texEngineState}
        onGoToLine={(line) => {
          const editor = editorRef.current
          editor?.setPosition({ lineNumber: line, column: 1 })
          editor?.revealLineInCenter(line)
          editor?.focus()
        }}
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

      <ClosedTabsPopup
        open={closedTabsOpen}
        paths={recentlyClosed}
        onSelect={(path) => vault.reopenTab(path)}
        onClose={() => setClosedTabsOpen(false)}
      />

      <QuickSwitcher
        open={quickSwitcherOpen}
        files={flatFiles(vault.tree).map((f) => ({ path: f.path, name: f.name }))}
        recentFiles={recentFiles.map((p) => ({ path: p, name: displayBasename(p) }))}
        onSelect={(path) => {
          const node = flatFiles(vault.tree).find((f) => f.path === path)
          if (node) handleOpenFileNode(node)
        }}
        onClose={() => setQuickSwitcherOpen(false)}
      />

      <BookmarksPopup
        open={bookmarksOpen}
        bookmarks={Object.entries(bookmarks).map(([slot, line]) => ({ slot: parseInt(slot), line }))}
        onGoTo={(line) => {
          const editor = editorRef.current
          editor?.setPosition({ lineNumber: line, column: 1 })
          editor?.revealLineInCenter(line)
          editor?.focus()
        }}
        onRemove={(slot) => setBookmarks((prev) => { const next = { ...prev }; delete next[slot]; saveBookmarks(next); return next })}
        onClose={() => setBookmarksOpen(false)}
      />

      <OnboardingTour open={onboardingOpen} onClose={handleOnboardingClose} />

      <Suspense fallback={null}>
        <SettingsModal
          open={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onChange={updateSettings}
        />
        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </Suspense>

      <ToastContainer />

      <Suspense fallback={null}>
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
      </Suspense>
      <TableEditor
        open={tableEditorOpen}
        onClose={() => setTableEditorOpen(false)}
        onInsert={handleInsertTable}
      />

      {latexDiagnostics && (
        <LatexErrorModal
          diagnostics={latexDiagnostics}
          onClose={() => setLatexDiagnostics(null)}
        />
      )}

      {updateInfo?.available && !updaterDismissed && (
        <Suspense fallback={null}>
          <UpdateChecker
            updateInfo={updateInfo}
            onInstall={handleInstallUpdate}
            onDismiss={() => setUpdaterDismissed(true)}
            installing={installing}
          />
        </Suspense>
      )}
    </div>
  )
}
