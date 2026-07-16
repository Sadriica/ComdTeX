import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { BeforeMount, OnMount } from "@monaco-editor/react"
import type * as monaco from "monaco-editor"
import type { VimAdapterInstance } from "monaco-vim"
import { save, confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile, exists, mkdir, copyFile } from "@tauri-apps/plugin-fs"
import { Command } from "@tauri-apps/plugin-shell"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { openPath } from "@tauri-apps/plugin-opener"
import { renderMarkdown } from "./renderer"
import { MERMAID_CONFIG } from "./mermaidConfig"
import type { CmdKAnchor } from "./CmdKEdit"
import { setupDisplayMathPreview } from "./useDisplayMathPreview"
import { setupMonaco, setupEditorCommands, setupContentLinter, setupMathHover, setupCommentDecorations, setupKeepMarkDecorations, updateVaultFileNames, updateBibSuggestions, updateBibHoverEntries, updateOpenFilesSnapshot, updateUserSnippets, enableVimMode, applyTypewriterMode, updateMacroCompletions, updateStructuralLabelSuggestions, type CommentDecorationsHandle, type CommentMarker, type KeepMarkDecorationsHandle } from "./monacoSetup"
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
import {
  onDictionaryReady,
  preloadDictionary,
  resolveSpellLang,
  type SpellLang,
} from "./spellcheck"
import { useVault } from "./useVault"
import { useExportActions } from "./useExportActions"
import { useSettings } from "./useSettings"
import type { Settings } from "./useSettings"
import { AiSessionProvider } from "./useAiSession"
import { useFocusTimer } from "./useFocusTimer"
import { useSearchReplaceState } from "./useSearchReplaceState"
import { LanguageContext, LANGS, useT } from "./i18n"
import { getFileNameSet, flatFiles, findByName, findByVaultRelPath, matchesVaultRelPath } from "./wikilinks"
import { pathJoin, displayBasename } from "./pathUtils"
import { writeTextFileAtomic } from "./atomicWrite"
import TitleBar from "./TitleBar"
import MenuBar from "./MenuBar"
import type { MenuDef, MenuEntry } from "./MenuBar"
import Toolbar from "./Toolbar"
import TabBar from "./TabBar"
import FileTree from "./FileTree"
import SearchPanel from "./SearchPanel"
import OutlinePanel from "./OutlinePanel"
import { reorderSection } from "./outlineReorder"
import BacklinksPanel from "./BacklinksPanel"
import GitBar from "./GitBar"
import Resizer from "./Resizer"
import Breadcrumb from "./Breadcrumb"
import TagPanel from "./TagPanel"
import LabelsPanel from "./LabelsPanel"
import KeepPanel from "./KeepPanel"
import DocumentLabPanel from "./DocumentLabPanel"
import FrontmatterPanel from "./FrontmatterPanel"
import SymbolPickerPanel from "./SymbolPickerPanel"
import StatusBar from "./StatusBar"
import CommandPalette from "./CommandPalette"
import type { PaletteCommand } from "./CommandPalette"
import { buildPaletteCommands } from "./commands"
import { buildMenus } from "./menus"
import { insertSnippet } from "./editorInsert"
import ToastContainer from "./Toast"
import { parseMacros, MACROS_FILENAME, MACROS_TEMPLATE, type KatexMacros } from "./macros"
import { parseBibtex, BIBTEX_FILENAME } from "./bibtex"
import type { BibEntry } from "./bibtex"
import { exportToTex } from "./exporter"
import type { LatexDiagnostic } from "./latexErrors"
import LatexErrorModal from "./LatexErrorModal"
import { extractFrontmatter } from "./frontmatter"
import { checkDependencies, type DepStatus } from "./checkDeps"
import DepsWarning, { type DepName } from "./DepsWarning"
import { findCloudFolders, findConflicts, isPathInside, type CloudSyncInfo, type ConflictEntry } from "./cloudSync"
import CloudSyncPanel from "./CloudSyncPanel"
import CloudSyncBanner from "./CloudSyncBanner"
import TableEditor from "./TableEditor"
import { checkForUpdate, downloadAndInstallUpdate } from "./useUpdater"
import type { UpdateInfo } from "./useUpdater"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"
import { commitPreview } from "./previewMorph"
import { handleGlobalShortcut } from "./appShortcuts"
import { useTouchpadGestures } from "./useTouchpadGestures"
import ErrorBoundary from "./ErrorBoundary"
import WelcomeScreen from "./WelcomeScreen"
import { buildSearchRegExp, replaceMatchAt, replaceMatches, type SearchReplaceOptions, type SearchReplaceTarget } from "./searchReplace"
import { toEditorContent, toDiskContent } from "./cmdxFormat"
import { resolveTransclusions } from "./transclusion"
import { scanStructuralLabels } from "./structuralLabels"
import { showToast } from "./toastService"
import ClosedTabsPopup from "./ClosedTabsPopup"
import QuickSwitcher from "./QuickSwitcher"
import BookmarksPopup from "./BookmarksPopup"
import OnboardingTour from "./OnboardingTour"
import { processTemplateVariables } from "./templates"
import { setFlowchartSvg, setExcalidrawSvg, getExcalidrawSvg, setExcalidrawPlaceholderText } from "./environments"
import { STORAGE_KEYS } from "./storageKeys"
import "katex/dist/katex.min.css"
import "./App.css"

const RECENT_KEY = STORAGE_KEYS.RECENT_FILES
const BOOKMARKS_KEY = STORAGE_KEYS.BOOKMARKS
const CURSOR_KEY = STORAGE_KEYS.CURSOR_POSITIONS
const MAX_RECENT = 10
export type SidebarMode = "files" | "search" | "searchReplace" | "outline" | "backlinks" | "tags" | "labels" | "keep" | "quality" | "properties" | "graph" | "todo" | "equations" | "environments" | "stats" | "help" | "symbols" | "pdfPreview" | "comments" | "cloudSync" | "focusTimer" | "ai"

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

function currentTauriWindow() {
  try { return getCurrentWindow() }
  catch { return null }
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

El límite fundamental: lim(x, 0) sin(x)/x = 1.

La suma de Basel: sum(n=1, \\infty) frac(1, sup(n, 2)) = frac(sup(\\pi, 2), 6).

La integral de Gauss: int(-\\infty, \\infty) sup(e, -sup(x, 2)) \\, dx = sqrt(\\pi).

La derivada de una composición: der(f(g(x)), x) = der(f, g) \\cdot der(g, x).

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
const FocusTimerPanel = lazy(() => import("./FocusTimerPanel"))
const CitationManager = lazy(() => import("./CitationManager"))
const ExcalidrawModal = lazy(() => import("./ExcalidrawModal"))
const CommentsPanel = lazy(() => import("./CommentsPanel"))
const AiPanel = lazy(() => import("./AiPanel"))
const CmdKEdit = lazy(() => import("./CmdKEdit"))
const SettingsModal = lazy(() => import("./SettingsModal"))
const HelpModal = lazy(() => import("./HelpModal"))
const TemplateModal = lazy(() => import("./TemplateModal"))
const SearchReplacePanel = lazy(() => import("./SearchReplacePanel"))
const UpdateChecker = lazy(() => import("./UpdateChecker"))
const PdfPreviewPanel = lazy(() => import("./PdfPreviewPanel"))

// Singleton mermaid loader — `import("mermaid")` is a ~600KB chunk; cache the
// resolved module + the (idempotent) `initialize()` call so the per-keystroke
// re-render path doesn't re-do the work.
type MermaidModule = { render: (id: string, src: string) => Promise<{ svg: string }> }
let _mermaidPromise: Promise<MermaidModule> | null = null
function getMermaid(): Promise<MermaidModule> {
  if (_mermaidPromise) return _mermaidPromise
  _mermaidPromise = import("mermaid").then((mod) => {
    const m = (mod as { default: { initialize: (cfg: unknown) => void } & MermaidModule }).default
    m.initialize(MERMAID_CONFIG)
    return m
  })
  return _mermaidPromise
}
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
        {/* AiSessionProvider owns the AI chat state and renders AppContent as a
            stable child, so a streamed token only re-renders the AiPanel (context
            consumer), not this whole AppContent tree. */}
        <AiSessionProvider>
          <AppContent settings={settings} updateSettings={updateSettings} />
        </AiSessionProvider>
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
    autoSaveMs: settings.autoSaveMs,
    onAfterSave: (path, basename) => { afterSaveRef.current?.(path, basename) },
  })
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  // Last content the editor model is known to hold (the user's last keystroke
  // value, or the last value we pushed). Lets the external-sync effect skip the
  // common case — the user's own typing — with an O(1) reference compare instead
  // of the controlled-`value` round-trip (`getValue()` of the whole document on
  // every keystroke), which scaled badly with file size.
  const lastEditorContentRef = useRef<string>("")
  const mainRef = useRef<HTMLDivElement>(null)
  // Linter context refs — updated without re-creating the editor callback
  const lintWikiNamesRef = useRef<Set<string>>(new Set())
  const lintBibKeysRef = useRef<Set<string>>(new Set())
  // Spell-check linter refs — read live by the linter's getContext callback.
  const lintSpellEnabledRef = useRef(false)
  const lintSpellLangRef = useRef<SpellLang>("es")
  const lintSpellMessageRef = useRef<(w: string) => string>((w) => w)
  // Macros ref for math hover — stays current without rebuilding the hover
  const macrosRef = useRef<Record<string, string>>({})
  const linterDisposableRef = useRef<{ dispose(): void; relint?(): void } | null>(null)
  const mathHoverDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mathPreviewDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mathPreviewEnabledRef = useRef(settings.mathPreview ?? true)
  // Ctrl/Cmd+K inline AI edit: a ref-backed opener so the Monaco command (bound
  // once at mount) always calls the latest handler / reads the latest setting.
  const aiEnabledRef = useRef(settings.aiEnabled)
  const openCmdkRef = useRef<() => void>(() => {})
  const vimRef = useRef<VimAdapterInstance | null>(null)
  const vimStatusRef = useRef<HTMLDivElement>(null)
  const pendingJumpRef = useRef<number | null>(null)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Last measured preview DOM-commit cost (ms): sanitize-to-fragment +
  // annotate + morph + following layout. One half of the adaptive debounce.
  const previewCostRef = useRef(0)
  // Last measured MAIN-pane render cost (ms): the renderMarkdown string
  // pipeline, timed separately from the DOM-commit cost above. Passed to
  // `renderPreviewHtml` as an explicit sink so the split reference pane
  // (which calls the same function) never writes into it and poisons the
  // main pane's adaptive delay.
  const renderCostRef = useRef(0)
  // Adaptive preview delay: 4× the last full refresh cost (render + commit),
  // clamped to [150ms, 1500ms] — a refresh may take at most ~1/5 of the
  // main-thread budget while typing. Reads refs only, so it's stable.
  const previewDelayMs = () =>
    Math.min(1500, Math.max(150, Math.round((renderCostRef.current + previewCostRef.current) * 4)))
  const [dragOver, setDragOver] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>(() => loadRecentFiles())
  const [bookmarks, setBookmarks] = useState<Record<number, number>>(() => loadBookmarks())
  const bookmarksRef = useRef(bookmarks)
  useEffect(() => { bookmarksRef.current = bookmarks }, [bookmarks])
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [macros, setMacros] = useState<KatexMacros>({})
  // Tracks whether `loadMacros` has resolved at least once for the current
  // vault. The preview render uses KaTeX with `throwOnError: false` — when an
  // equation references a user macro that isn't loaded yet, KaTeX falls back
  // to a red `\macro` source rendering and the user sees what looks like raw
  // LaTeX at the top of the document until macros finish loading and a
  // re-render fires. Gating the preview on this flag avoids that flash.
  const [macrosReady, setMacrosReady] = useState(false)
  const [bibMap, setBibMap] = useState<Map<string, BibEntry>>(new Map())
  const [deps, setDeps] = useState<DepStatus | null>(null)
  const [depsDismissed, setDepsDismissed] = useState<DepName[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DEPS_DISMISSED)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((x): x is DepName => x === "pandoc" || x === "zip")
    } catch {
      return []
    }
  })
  // ── Cloud sync (BYO cloud, Option A) ──────────────────────────────────────
  // The native cloud client (Dropbox / Drive / OneDrive) handles file sync
  // transparently. We just detect the situation and surface UI hints.
  const [cloudInfo, setCloudInfo] = useState<CloudSyncInfo | null>(null)
  const [cloudSuggestion, setCloudSuggestion] = useState<CloudSyncInfo | null>(null)
  const [cloudBannerDismissed, setCloudBannerDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEYS.CLOUD_BANNER_DISMISSED) === "1" } catch { return false }
  })
  const dismissCloudBanner = useCallback(() => {
    setCloudBannerDismissed(true)
    try { localStorage.setItem(STORAGE_KEYS.CLOUD_BANNER_DISMISSED, "1") } catch {}
  }, [])

  const dismissDep = useCallback((name: DepName) => {
    setDepsDismissed((prev) => {
      if (prev.includes(name)) return prev
      const next = [...prev, name]
      try { localStorage.setItem(STORAGE_KEYS.DEPS_DISMISSED, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])
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
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined)
  // Pomodoro / writing-session state, lifted out of FocusTimerPanel so the timer
  // keeps running (and notifies on phase change) when the panel is closed — e.g.
  // while iterating between the Pomodoro panel and the AI assistant.
  const pomodoroConfig = useMemo(() => ({
    workMin: settings.pomodoroWorkMin,
    breakMin: settings.pomodoroBreakMin,
    longBreakMin: settings.pomodoroLongBreakMin,
    cyclesBeforeLongBreak: settings.pomodoroCyclesBeforeLongBreak,
  }), [settings.pomodoroWorkMin, settings.pomodoroBreakMin, settings.pomodoroLongBreakMin, settings.pomodoroCyclesBeforeLongBreak])
  const focusTimer = useFocusTimer(pomodoroConfig, vault.openFile?.content ?? "")
  // Search & Replace inputs/results, lifted so they survive the panel unmounting.
  const searchReplaceState = useSearchReplaceState()
  // Ctrl/Cmd+K inline AI edit — null when the floating widget is closed.
  const [cmdkAnchor, setCmdkAnchor] = useState<CmdKAnchor | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [citationManagerOpen, setCitationManagerOpen] = useState(false)
  const [tableEditorOpen, setTableEditorOpen] = useState(false)
  // Excalidraw editor: `open` toggles the modal; `sceneB64` is the scene being
  // edited (empty for a new drawing); `targetLine` is the 1-based source line of
  // the block body to replace on save (null = insert a fresh block at cursor).
  const [excalidraw, setExcalidraw] = useState<{ open: boolean; sceneB64: string; targetLine: number | null }>({ open: false, sceneB64: "", targetLine: null })
  const [excalidrawVersion, setExcalidrawVersion] = useState(0)
  const [latexDiagnostics, setLatexDiagnostics] = useState<LatexDiagnostic[] | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const commentDecorationsRef = useRef<CommentDecorationsHandle | null>(null)
  const keepMarkDecorationsRef = useRef<KeepMarkDecorationsHandle | null>(null)
  const [texEngineState, setTexEngineState] = useState<"idle" | "initializing" | "compiling">("idle")
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("files")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Shared panel opener: switching the panel is useless if the sidebar is
  // collapsed (the panel changes but nothing renders), so every panel-open path
  // must also un-collapse. Use this everywhere instead of bare setSidebarMode.
  const openPanel = useCallback((m: SidebarMode) => {
    setSidebarMode(m)
    setSidebarCollapsed(false)
  }, [])
  // Stable callbacks for FileTree so its React.memo holds — otherwise the inline
  // arrows would change identity every render and the (potentially huge) file
  // tree would re-render on every keystroke (the "big vault = slow typing" cause).
  // Depend on the stable method, not the `vault` object (a fresh literal each render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSelectVault = useCallback(() => { void vault.selectVault() }, [vault.selectVault])
  const handleConflictClick = useCallback(() => openPanel("cloudSync"), [openPanel])
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [editorWidth, setEditorWidth] = useState<number | null>(null)
  const typewriterMode = settings.typewriterMode
  const syncScroll = settings.syncScroll
  const wordWrap = settings.wordWrap
  const [splitFile, setSplitFile] = useState<string | null>(null)
  const [recentlyClosed, setRecentlyClosed] = useState<string[]>([])
  const minimapEnabled = settings.minimapEnabled
  const spellcheck = settings.spellcheck
  // Memoized Editor options. A fresh `options={{...}}` literal every render made
  // @monaco-editor/react call `editor.updateOptions()` on EVERY keystroke (the
  // prop identity changed each render). readOnly keys off the boolean, since
  // `vault.openFile` mints a new object identity on each keystroke.
  const editorReadOnly = !vault.openFile
  const editorOptions = useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
    fontSize: settings.fontSize,
    lineHeight: Math.round(settings.fontSize * 1.6),
    wordWrap: wordWrap ? "on" : "off",
    minimap: { enabled: minimapEnabled },
    scrollBeyondLastLine: false,
    renderWhitespace: "none",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    padding: { top: 16, bottom: 16 },
    readOnly: editorReadOnly,
    quickSuggestions: { other: true, comments: false, strings: true },
    suggestOnTriggerCharacters: true,
    snippetSuggestions: "top",
    // Smooth caret animation keeps the GPU compositor busy (~6% CPU on
    // Linux/WebKitGTK); not worth it. "solid" avoids the idle blink repaint.
    cursorSmoothCaretAnimation: "off",
    cursorBlinking: "solid",
  }), [settings.fontSize, wordWrap, minimapEnabled, editorReadOnly])
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
  // vault gets a new identity on every keystroke (its state lives in the returned
  // object). Handlers that only run on explicit user actions read the CURRENT
  // vault through this ref and stay identity-stable, so the menus/palette memos
  // below don't recompute per keystroke.
  const vaultRef = useRef(vault)
  vaultRef.current = vault
  const previewPaneRef = useRef<HTMLDivElement>(null)
  // The .preview-content divs are committed imperatively (block-level morph) so a
  // one-block edit doesn't blow away every diagram SVG; see commitPreview.
  const previewContentRef = useRef<HTMLDivElement>(null)
  const splitContentRef = useRef<HTMLDivElement>(null)
  // Set when the cursor change originates from a preview click. The preview
  // scroll-sync effect reads + clears this so a click in the preview moves the
  // editor without yanking the preview back up to the section's heading.
  const suppressPreviewScrollOnce = useRef(false)
  const splitPreviewRef = useRef<HTMLDivElement>(null)

  // ── Wikilink file names (memoized — stable reference for effects) ─────────
  const wikiNames = useMemo(() => getFileNameSet(vault.tree), [vault.tree])
  const bibKeys = useMemo(() => new Set(bibMap.keys()), [bibMap])
  const vaultFileNodes = useMemo(() => flatFiles(vault.tree), [vault.tree])
  const vaultFileNodeByPath = useMemo(
    () => new Map(vaultFileNodes.map((file) => [file.path, file])),
    [vaultFileNodes],
  )
  const findVaultNodeByPath = useCallback(
    (path: string) => vaultFileNodeByPath.get(path) ?? null,
    [vaultFileNodeByPath],
  )
  const vaultFiles = useMemo(() => {
    const openContent = new Map(vault.openTabs.map((tab) => [tab.path, tab.content]))
    return vaultFileNodes
      .filter((file) => file.ext === "md" || file.ext === "tex")
      .map((file) => ({
        path: file.path,
        name: file.name,
        content: openContent.get(file.path) ?? vaultTextCache.get(file.path) ?? "",
      }))
  }, [vaultFileNodes, vault.openTabs, vaultTextCache])

  // Keep a ref to vaultFiles so the resolver below has STABLE identity.
  // Without this, `vaultFiles` changes on every keystroke (via `vault.openTabs`
  // → `vaultFiles` memo → resolver re-creation → `renderPreviewHtml` callback
  // recreated → `previewHtml` useMemo re-runs the entire markdown + KaTeX +
  // Mermaid pipeline on every character). On a 6KB README that's ~50% sustained
  // CPU on the WebView process.
  const vaultFilesRef = useRef(vaultFiles)
  useEffect(() => { vaultFilesRef.current = vaultFiles }, [vaultFiles])

  const transclusionResolver = useCallback((target: string): string | null => {
    const files = vaultFilesRef.current
    const lower = target.replace(/\.[^.]+$/, "").toLowerCase()
    const found = files.find((file) =>
      file.name.replace(/\.[^.]+$/, "").toLowerCase() === lower ||
      file.name.toLowerCase() === target.toLowerCase() ||
      file.path.toLowerCase().endsWith(`/${target.toLowerCase()}`))
    return found?.content || null
  }, [])

  // Resolver for cross-file environment refs (`@gp/calendario@def:x`).
  //
  // Reads through `vaultFilesRef` for the same reason `transclusionResolver`
  // does: STABLE identity. `vaultFiles` content comes from `vaultTextCache`,
  // whose effect keys on the SET of vault file paths — not on keystrokes — so
  // for any document other than the active tab this returns the identical
  // string reference on every render. That is what lets the label cache in
  // environments.ts short-circuit on a pointer compare instead of re-prescanning.
  // Nothing here touches the filesystem.
  const envRefResolver = useCallback((docPath: string): string | null => {
    const files = vaultFilesRef.current
    const found = files.find((file) => matchesVaultRelPath(file.path, docPath))
    return found?.content ?? null
  }, [])

  // Export/import/compile handlers — extracted to useExportActions.ts.
  const exportActions = useExportActions({
    editorRef,
    vault,
    t,
    deps,
    vaultFiles,
    transclusionResolver,
    useWasmTex: settings.useWasmTex,
    macros,
    wikiNames,
    bibMap,
    pdfPath,
    setLatexDiagnostics,
    setPdfPath,
    setTexEngineState,
  })
  const { rebuildPdfInPlace } = exportActions

  // Stable Markdown→HTML renderer for the AI panel, so memoized assistant
  // messages aren't re-rendered through the KaTeX pipeline on every streamed
  // token (the prop identity stays put until its inputs actually change).
  const aiRenderHtml = useCallback((md: string) => sanitizeRenderedHtml(
    renderMarkdown(md, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver, undefined, { annotate: false })
  ), [macros, vault.vaultPath, wikiNames, bibMap, transclusionResolver])

  // ── Current heading (breadcrumb) ──────────────────────────────────────────
  // Keyed on the DEBOUNCED `previewContent` (not the live editor content) so it
  // doesn't re-split the whole document on every keystroke — only the breadcrumb
  // reads this, a ~150ms staleness is invisible.
  const currentHeading = useMemo(() => {
    const lines = previewContent.split("\n")
    let heading: string | null = null
    for (let i = 0; i < cursorPos.line - 1 && i < lines.length; i++) {
      const m = /^#{1,6}\s+(.+)$/.exec(lines[i])
      if (m) heading = m[1].trim()
    }
    return heading
  }, [previewContent, cursorPos.line])

  useEffect(() => { checkDependencies().then(setDeps) }, [])

  // Detect whether the current vault lives inside a cloud-sync folder, and
  // (if not) whether one is available on this machine to suggest moving in.
  // Single findCloudFolders() call covers both cases.
  useEffect(() => {
    let cancelled = false
    const path = vault.vaultPath
    if (!path) {
      setCloudInfo(null)
      setCloudSuggestion(null)
      return
    }
    findCloudFolders().then((folders) => {
      if (cancelled) return
      const owner = folders.find((f) => isPathInside(path, f.rootPath)) ?? null
      setCloudInfo(owner)
      setCloudSuggestion(owner ? null : (folders[0] ?? null))
    }).catch(() => { if (!cancelled) { setCloudInfo(null); setCloudSuggestion(null) } })
    return () => { cancelled = true }
  }, [vault.vaultPath])

  const cloudConflicts: ConflictEntry[] = useMemo(
    () => (cloudInfo && settings.cloudSyncDetectEnabled ? findConflicts(vault.tree, cloudInfo.provider) : []),
    [cloudInfo, vault.tree, settings.cloudSyncDetectEnabled],
  )

  const cloudConflictPaths = useMemo(() => {
    const set = new Set<string>()
    for (const c of cloudConflicts) {
      set.add(c.conflictPath)
      if (c.basePath) set.add(c.basePath)
    }
    return set
  }, [cloudConflicts])

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

  // Build a vault-wide text cache (used by transclusion + wikilink resolution).
  // Depends only on the SET OF FILES (paths joined) — not on every keystroke.
  // Without this guard, every character in the active tab refires the
  // `Promise.all(readTextFile(...))` walk over the entire vault → tens of MBs
  // re-read per keystroke for users with large vaults. Live tab content is
  // overlaid via vault.openTabs, but we read it through a ref so the effect
  // doesn't itself depend on per-keystroke content changes.
  const openTabsRef = useRef(vault.openTabs)
  useEffect(() => { openTabsRef.current = vault.openTabs }, [vault.openTabs])
  const vaultFilePathsKey = useMemo(
    () => vaultFileNodes.filter((f) => f.ext === "md" || f.ext === "tex").map((f) => f.path).sort().join("\x00"),
    [vaultFileNodes],
  )
  useEffect(() => {
    let cancelled = false
    const paths = vaultFilePathsKey ? vaultFilePathsKey.split("\x00") : []
    Promise.all(paths.map(async (path) => {
      const openTab = openTabsRef.current.find((tab) => tab.path === path)
      if (openTab) return [path, openTab.content] as const
      try {
        return [path, toEditorContent(path, await readTextFile(path))] as const
      } catch {
        return [path, ""] as const
      }
    })).then((entries) => {
      if (!cancelled) setVaultTextCache(new Map(entries))
    }).catch(() => {
      if (!cancelled) setVaultTextCache(new Map())
    })
    return () => { cancelled = true }
  }, [vaultFilePathsKey])

  useEffect(() => { macrosRef.current = macros }, [macros])
  useEffect(() => { mathPreviewEnabledRef.current = settings.mathPreview ?? true }, [settings.mathPreview])
  useEffect(() => { aiEnabledRef.current = settings.aiEnabled }, [settings.aiEnabled])

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
    // The reset MUST run before any early-return: if the effect bails out
    // because the preview is hidden / the doc is empty / the heading list is
    // empty, the flag set by a prior preview-click would otherwise persist
    // and silently swallow the next legitimate sync.
    const wasSuppressed = suppressPreviewScrollOnce.current
    suppressPreviewScrollOnce.current = false
    if (!settings.previewVisible) return
    // Use the DEBOUNCED preview content: this matches the headings actually
    // rendered in the preview pane (`headingEls` below) AND avoids splitting the
    // whole document on every keystroke.
    const content = previewContent
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

      // Scroll only if syncScroll is enabled — and not when the cursor move
      // came from a preview click (otherwise the preview yanks back up to the
      // heading the user is already looking at). The flag was already cleared
      // at the top of the effect; we use the captured `wasSuppressed` value.
      if (syncScroll && !wasSuppressed) {
        target?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }
  }, [cursorPos.line, syncScroll, settings.previewVisible, previewContent])

  useEffect(() => {
    lintBibKeysRef.current = bibKeys
  }, [bibKeys])

  // ── Dictionary spell-check wiring ─────────────────────────────────────────
  // Re-lint when a dictionary finishes loading async (markers were [] until
  // then). Subscribed once for the editor's lifetime.
  useEffect(() => {
    return onDictionaryReady(() => linterDisposableRef.current?.relint?.())
  }, [])

  // Active spell-check language: frontmatter `lang:` of the open file wins,
  // else the app UI language. Only es/en are supported.
  // Keyed on the DEBOUNCED preview content so frontmatter isn't re-parsed on
  // every keystroke (the `lang:` field only ever lives in the frontmatter block).
  const activeSpellLang = useMemo<SpellLang>(() => {
    const fm = previewContent ? extractFrontmatter(previewContent)?.data.lang : undefined
    return resolveSpellLang(typeof fm === "string" ? fm : undefined, settings.language)
  }, [previewContent, settings.language])

  // Keep the linter's spell refs current and force a re-lint when the
  // spell-check setting toggles, the language changes, or the message
  // formatter (i18n) changes. When the setting is OFF nothing loads — the
  // linter simply skips the rule, so squiggles vanish on the next pass.
  useEffect(() => {
    lintSpellEnabledRef.current = settings.spellcheck
    lintSpellLangRef.current = activeSpellLang
    lintSpellMessageRef.current = t.app.spellError
    if (settings.spellcheck) preloadDictionary(activeSpellLang)
    linterDisposableRef.current?.relint?.()
  }, [settings.spellcheck, activeSpellLang, t.app.spellError])

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
  // Debounced ~1000ms: `vault.openTabs` gets a new array identity on every
  // keystroke (useVault's updateContent maps the tabs array), so this used to
  // re-lint every open tab's full content on the main thread per keystroke.
  // A per-path cache also skips re-linting tabs whose content hasn't changed
  // since the last pass; the cache is invalidated wholesale when the lint
  // context (wikiNames/bibKeys) changes, since a stale-content skip would
  // otherwise reuse a summary computed against the old context.
  const lintCacheRef = useRef<Map<string, { content: string; summary: LintSummary }>>(new Map())
  const lintContextRef = useRef<{ wikiNames: typeof wikiNames; bibKeys: typeof bibKeys } | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      const prevContext = lintContextRef.current
      if (!prevContext || prevContext.wikiNames !== wikiNames || prevContext.bibKeys !== bibKeys) {
        lintCacheRef.current.clear()
        lintContextRef.current = { wikiNames, bibKeys }
      }
      const context = { vaultFileNames: wikiNames, bibKeys }
      const cache = lintCacheRef.current
      const counts: Record<string, LintSummary> = {}
      const seenPaths = new Set<string>()
      for (const tab of vault.openTabs) {
        seenPaths.add(tab.path)
        const cached = cache.get(tab.path)
        if (cached && cached.content === tab.content) {
          counts[tab.path] = cached.summary
          continue
        }
        const summary = lintFileSummary(tab.content, tab.name, context)
        cache.set(tab.path, { content: tab.content, summary })
        counts[tab.path] = summary
      }
      // Drop cache entries for tabs that have since been closed.
      for (const path of cache.keys()) {
        if (!seenPaths.has(path)) cache.delete(path)
      }
      setTabLintCounts(counts)
    }, 1000)
    return () => clearTimeout(timer)
  }, [vault.openTabs, wikiNames, bibKeys])

  // ── Close warning ─────────────────────────────────────────────────────────
  // (openTabsRef declared earlier; reused here to read latest tabs from
  // the close-request callback without subscribing to every keystroke)

  // Shared close logic for BOTH the custom TitleBar X and the WM-close
  // (onCloseRequested) path. First flushes every in-flight 800ms autosave
  // debounce so the user's last edits hit disk, THEN runs the dirty-tab
  // confirmation (a tab can still be dirty if its save failed). Returns true
  // when the app should proceed to close, false to abort.
  const confirmClose = useCallback(async (): Promise<boolean> => {
    // Flush pending autosaves before deciding — this both persists in-flight
    // edits and clears the dirty flag on tabs that save successfully.
    try { await vault.flushPending() } catch { /* best-effort */ }
    const dirtyTabs = openTabsRef.current.filter((t) => t.isDirty)
    if (dirtyTabs.length === 0) return true
    const names = dirtyTabs.map((t) => t.name).join(", ")
    try {
      return await tauriConfirm(
        t.app.unsavedChanges(names),
        { title: "ComdTeX", kind: "warning" }
      )
    } catch {
      // Dialog unavailable — allow the close (matches prior behavior).
      return true
    }
  }, [t, vault])

  // X-button handler: confirm, then close the window explicitly.
  const handleCloseRequest = useCallback(async () => {
    const win = currentTauriWindow()
    if (!win) return
    if (await confirmClose()) await win.close()
  }, [confirmClose])

  // WM-close path (window manager X / Cmd+Q): Tauri fires onCloseRequested and
  // closes by default. preventDefault() while we flush + confirm, then close
  // explicitly only if confirmed. Registered once; reuses confirmClose so both
  // close paths share one implementation.
  const confirmCloseRef = useRef(confirmClose)
  confirmCloseRef.current = confirmClose
  useEffect(() => {
    const win = currentTauriWindow()
    if (!win) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    let closing = false
    win.onCloseRequested(async (event) => {
      if (closing) return
      // Block the default close while we flush + confirm asynchronously.
      event.preventDefault()
      const proceed = await confirmCloseRef.current()
      if (proceed) { closing = true; await win.close() }
    }).then((fn) => {
      if (cancelled) { fn(); return }
      unlisten = fn
    })
    return () => { cancelled = true; unlisten?.() }
  }, [])

  // ── Auto-refresh vault on window focus ────────────────────────────────────
  useEffect(() => {
    const win = currentTauriWindow()
    if (!win) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    win.onFocusChanged(({ payload: focused }) => {
      // Only refresh the file tree on refocus — NOT loadVault(). loadVault runs
      // restoreTabs(), which rebuilds every tab from disk/draft and would
      // clobber unsaved in-memory edits (drafts flush at 300ms, autosave at
      // 800ms, so recent keystrokes aren't persisted yet). On Wayland/Sway
      // focus events fire constantly, so this was silently discarding edits.
      if (focused && vault.vaultPath) vault.refreshTree(vault.vaultPath)
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
    const win = currentTauriWindow()
    if (!win) return
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
        localStorage.setItem(STORAGE_KEYS.WINDOW_STATE, JSON.stringify(state))
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
        const raw = localStorage.getItem(STORAGE_KEYS.WINDOW_STATE)
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
      // Ctrl/Cmd+Shift+F — open vault search. The Monaco command only fires when
      // the editor is focused, but the palette/menu present this as a global
      // shortcut, so handle it here (regardless of focus) too. Both paths call
      // openPanel("search").
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "f") {
        e.preventDefault()
        openPanel("search")
        return
      }
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
          toggleBookmark: (slot: number) => {
            if (!editorRef.current || !vault.activeTabPath) return
            const line = editorRef.current.getPosition()?.lineNumber ?? 1
            setBookmarks((prev) => {
              const next = { ...prev }
              // Ctrl+Shift+N is a stable toggle on slot N: clear it if it
              // already points at this line, otherwise (re)assign it here.
              if (next[slot] === line) {
                delete next[slot]
              } else {
                next[slot] = line
              }
              saveBookmarks(next)
              return next
            })
            showToast(t.app.bookmarkToggled, "info")
          },
          goToBookmark: (slot: number) => {
            const line = bookmarksRef.current[slot]
            if (!line || !editorRef.current) return
            editorRef.current.revealLineInCenter(line)
            editorRef.current.setPosition({ lineNumber: line, column: 1 })
            editorRef.current.focus()
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
              // Faithful save (masked, extension-aware) — not a lossy export.
              await writeTextFileAtomic(path, toDiskContent(path, editor.getValue()))
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
          openAiPanel: () => openPanel("ai"),
          insertToc: () => {
            const editor = editorRef.current
            if (!editor) return
            const pos = editor.getPosition()
            editor.executeEdits("insert-toc", [{
              range: {
                startLineNumber: pos?.lineNumber ?? 1,
                startColumn: pos?.column ?? 1,
                endLineNumber: pos?.lineNumber ?? 1,
                endColumn: pos?.column ?? 1,
              },
              text: "[[toc]]\n",
            }])
            editor.focus()
          },
          toggleOutline: () => {
            setSidebarMode((m) => {
              const next = m === "outline" ? "files" : "outline"
              if (next === "outline") setSidebarCollapsed(false)
              return next
            })
          },
        },
      )
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [focusMode, settings.previewVisible, settings.fontSize, settings.previewFontSize, t, updateSettings, vault, nextTab, prevTab, openPanel])

  // ── Linter + math hover + pending-timer cleanup on unmount ────────────────
  useEffect(() => () => {
    linterDisposableRef.current?.dispose()
    mathHoverDisposableRef.current?.dispose()
    mathPreviewDisposableRef.current?.dispose()
    commentDecorationsRef.current?.dispose()
    keepMarkDecorationsRef.current?.dispose()
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
    finally { if (!signal?.cancelled) setMacrosReady(true) }
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
    if (!vault.vaultPath) { setMacros({}); setBibMap(new Map()); setMacrosReady(true); return }
    setMacrosReady(false)
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

  // Bump on each successful mermaid render so the next memoized previewHtml
  // re-runs and picks up the cached SVGs (embedded inline by environments.ts).
  const [mermaidVersion, setMermaidVersion] = useState(0)

  // `costSink`, when passed, receives the elapsed ms of THIS call's
  // renderMarkdown + sanitize pipeline — written in a `finally` so it's
  // recorded even when rendering throws (renderErrorHtml is then what the
  // user sees, and its own refresh should still get a fresh, non-stale
  // delay). Only the main preview pane passes a sink (`renderCostRef`); the
  // split reference pane calls this same function but passes nothing, so it
  // can never poison the main pane's adaptive debounce.
  const renderPreviewHtml = useCallback((content: string, costSink?: { current: number }) => {
    // Defer rendering until the macros file has been loaded once for this
    // vault. Without this gate the first paint of a freshly-opened file uses
    // `macros = {}`, so any equation that relies on a user-defined macro
    // renders as red `\macro` source text (KaTeX's `throwOnError: false`
    // fallback). The async `loadMacros` then completes and triggers a second
    // render that fixes things — exactly the "top renders raw, scroll/edit
    // makes it correct" symptom users were reporting.
    if (!macrosReady) return ""
    const t0 = performance.now()
    try {
      // RAW pipeline output — NOT sanitized and NOT line-annotated here. The
      // commit effects hand this string to commitPreview() (previewMorph.ts),
      // which sanitizes to a DocumentFragment, annotates it in place, and
      // morphs — so the (KaTeX-heavy, potentially multi-MB) document HTML is
      // parsed ONCE per refresh instead of three times with two re-serializes.
      // This string must never reach the DOM by any other path.
      return renderMarkdown(content, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver, envRefResolver, { annotate: false })
    } catch (e) {
      return renderErrorHtml(e)
    } finally {
      if (costSink) costSink.current = performance.now() - t0
    }
    // mermaidVersion: included so re-renders that follow a mermaid SVG cache
    // population read the freshly-stored SVGs and embed them inline.
  }, [macros, macrosReady, vault.vaultPath, wikiNames, bibMap, transclusionResolver, envRefResolver, mermaidVersion, excalidrawVersion])

  const deferredPreviewContent = useDeferredValue(previewContent)

  // Skip the full renderMarkdown() entirely when the preview pane is hidden.
  // Previously this ran on every (debounced) keystroke regardless of visibility,
  // so drafting with the preview collapsed still paid the whole render cost.
  const previewHtml = useMemo(
    () => (settings.previewVisible ? renderPreviewHtml(deferredPreviewContent, renderCostRef) : ""),
    [settings.previewVisible, renderPreviewHtml, deferredPreviewContent]
  )

  // Commit previewHtml via `commitPreview` (sanitize → annotate → block-level
  // morph, single parse) instead of `dangerouslySetInnerHTML`. Only the
  // top-level blocks that actually changed are replaced; unchanged blocks
  // (and their already-rendered diagram SVGs) keep their live DOM nodes, so a
  // one-character edit no longer re-parses + re-lays-out the whole document.
  // Deps include `deferredPreviewContent` (previewHtml's own source text) so
  // an edit that shifts source lines WITHOUT changing the rendered HTML byte
  // for byte (e.g. a blank line inserted) still re-annotates `data-source-line`
  // instead of leaving click-to-jump/scroll-sync pointing at stale lines.
  useLayoutEffect(() => {
    const el = previewContentRef.current
    if (!el) return
    // Measure the WHOLE commit (sanitize parse + annotate + morph + the layout
    // that follows, via rAF) — it feeds the ADAPTIVE preview debounce below so
    // heavy docs re-render less often while light docs stay snappy.
    const t0 = performance.now()
    commitPreview(el, previewHtml, deferredPreviewContent)
    const id = requestAnimationFrame(() => {
      previewCostRef.current = performance.now() - t0
    })
    return () => cancelAnimationFrame(id)
  }, [previewHtml, deferredPreviewContent])

  const splitTab = useMemo(
    () => vault.openTabs.find((t) => t.path === splitFile) ?? null,
    [vault.openTabs, splitFile]
  )

  const deferredSplitContent = useDeferredValue(splitTab?.content ?? "")

  const splitPreviewHtml = useMemo(
    () => splitTab ? renderPreviewHtml(deferredSplitContent) : "",
    [renderPreviewHtml, splitTab, deferredSplitContent]
  )

  // Same single-parse commit (sanitize → annotate → morph) for the split
  // reference pane. Deps include `deferredSplitContent` for the same
  // stale-annotation reason as the main pane's commit effect above.
  useLayoutEffect(() => {
    const el = splitContentRef.current
    if (!el) return
    commitPreview(el, splitPreviewHtml, deferredSplitContent)
  }, [splitPreviewHtml, deferredSplitContent])

  // While the preview pane is hidden, `previewHtml` short-circuits to "" (see
  // the memo above) — a refresh is just a cheap string state update, not a
  // real render/commit. Freezing the cost refs at their last (possibly heavy)
  // measured value would pin the adaptive preview delay near its ceiling for
  // consumers that keep reading `previewContent` while hidden (OutlinePanel,
  // breadcrumb heading, spellcheck lang, StatusBar counts) — a 10x staleness
  // regression vs. the intended 150ms floor. Reset to 0 on hide; the refs
  // re-learn real costs once the preview is shown again.
  useEffect(() => {
    if (!settings.previewVisible) {
      renderCostRef.current = 0
      previewCostRef.current = 0
    }
  }, [settings.previewVisible])

  const previewNeedsMermaid = useMemo(
    () => previewHtml.includes("language-mermaid"),
    [previewHtml]
  )

  const splitNeedsMermaid = useMemo(
    () => splitPreviewHtml.includes("language-mermaid"),
    [splitPreviewHtml]
  )

  // ── Mermaid diagram rendering ─────────────────────────────────────────────
  // Singleton init: importing mermaid is a ~600KB chunk and `initialize` is
  // not free. Cache both the module and the init promise so subsequent
  // re-renders (one per debounced keystroke!) don't redo this work.
  // (`mermaidVersion` is declared earlier so `renderPreviewHtml` can read it.)
  useEffect(() => {
    let cancelled = false

    if (!previewNeedsMermaid && !splitNeedsMermaid) return

    const renderInContainer = async (container: HTMLDivElement | null, suffix: string) => {
      if (!container) return
      const blocks = [...container.querySelectorAll<HTMLElement>("pre code.language-mermaid")]
      if (blocks.length === 0) return

      const mermaid = await getMermaid()
      if (cancelled) return

      let storedAny = false
      await Promise.all(blocks.map(async (el, index) => {
        const pre = el.parentElement
        if (!pre) return

        const sourceAttr = pre.getAttribute("data-mermaid-source-b64") ?? ""
        // Use the EXACT mermaid source from the b64 attribute, NOT el.textContent.
        // After the escHtml → markdown-it → sanitize → DOM round-trip, textContent
        // can differ from the original source, so the cache key written below would
        // never match the one environments.ts reads with (`mermaidChart`) → the
        // mermaid effect re-renders forever, pegging CPU until the WebView OOMs.
        // The b64 attr is `btoa(mermaidChart)` verbatim, so this round-trips exactly.
        const diagram = sourceAttr
          ? decodeURIComponent(escape(atob(sourceAttr)))
          : (el.textContent ?? "")
        const div = document.createElement("div")
        div.className = "mermaid-diagram"
        if (sourceAttr) div.setAttribute("data-mermaid-source-b64", sourceAttr)
        pre.replaceWith(div)

        try {
          const { svg } = await mermaid.render(
            `mermaid-${suffix}-${index}-${Math.random().toString(36).slice(2)}`,
            diagram,
          )
          if (cancelled) return
          const safe = sanitizeRenderedHtml(svg)
          div.innerHTML = safe
          // Populate the cache so future re-renders embed the SVG inline — but
          // ONLY for ComdTeX-generated blocks that carry the b64 source attr
          // (whose key matches what environments.ts reads). For a raw ```mermaid
          // fence there's no such attr, so caching under el.textContent would
          // never be hit and would just re-render every pass — skip it.
          if (sourceAttr) {
            setFlowchartSvg(diagram, safe)
            storedAny = true
          }
        } catch (err) {
          console.warn("Mermaid render failed", err)
          const fallback = document.createElement("pre")
          fallback.textContent = diagram
          const button = document.createElement("button")
          button.className = "mermaid-rerender-btn"
          button.textContent = "↻ Re-render"
          button.onclick = () => setMermaidVersion((v) => v + 1)
          div.replaceChildren(button, fallback)
        }
      }))

      // If we stored at least one fresh SVG, bump the version so the next
      // render of `previewHtml` (already debounced) reads the cache and
      // embeds the SVG directly into the markup — eliminating the flash of
      // source code that used to appear on every keystroke.
      if (storedAny) setMermaidVersion((v) => v + 1)
    }

    Promise.all([
      previewNeedsMermaid ? renderInContainer(previewPaneRef.current, "preview") : Promise.resolve(),
      splitNeedsMermaid ? renderInContainer(splitPreviewRef.current, "split") : Promise.resolve(),
    ]).catch((err) => console.error("Mermaid rendering failed", err))

    return () => { cancelled = true }
  }, [previewHtml, splitPreviewHtml, previewNeedsMermaid, splitNeedsMermaid])
  // mermaidVersion participates only as a trigger for renderPreviewHtml deps
  // (read below), not as a dep of this effect — it would cause a re-render loop.
  void mermaidVersion

  // ── Excalidraw static SVG rendering ───────────────────────────────────────
  // `:::excalidraw` blocks render to a placeholder in environments.ts (sync).
  // Here we lazy-import Excalidraw's `exportToSvg` (its own heavy chunk, only
  // fetched when a drawing is actually present in the preview), render each
  // scene to a static SVG, cache it, and bump a version so the next preview
  // render embeds the SVG inline. Mirrors the mermaid effect above.
  useEffect(() => {
    let cancelled = false
    const placeholders = previewPaneRef.current
      ? [...previewPaneRef.current.querySelectorAll<HTMLElement>(".excalidraw-block .excalidraw-placeholder")]
      : []
    // Only blocks with a non-empty scene that isn't already cached need rendering.
    const pending = placeholders
      .map((el) => el.closest<HTMLElement>(".excalidraw-block"))
      .filter((block): block is HTMLElement => {
        const b64 = block?.getAttribute("data-excalidraw-scene") ?? ""
        return !!block && !!b64 && !getExcalidrawSvg(b64)
      })
    if (pending.length === 0) return

    ;(async () => {
      const { exportToSvg } = await import("@excalidraw/excalidraw")
      if (cancelled) return
      let storedAny = false
      for (const block of pending) {
        const b64 = block.getAttribute("data-excalidraw-scene") ?? ""
        try {
          const json = decodeURIComponent(escape(atob(b64)))
          const parsed = JSON.parse(json)
          const elements = Array.isArray(parsed.elements) ? parsed.elements : []
          if (elements.length === 0) continue
          const svgEl = await exportToSvg({
            elements,
            appState: { ...(parsed.appState ?? {}), exportBackground: true },
            files: parsed.files ?? null,
          })
          if (cancelled) return
          setExcalidrawSvg(b64, sanitizeRenderedHtml(svgEl.outerHTML))
          storedAny = true
        } catch (err) {
          console.warn("Excalidraw render failed", err)
        }
      }
      if (storedAny && !cancelled) setExcalidrawVersion((v) => v + 1)
    })().catch((err) => console.warn("Excalidraw export failed", err))

    return () => { cancelled = true }
  }, [previewHtml, excalidrawVersion])

  // Keep the renderer's placeholder text in sync with the active language.
  useEffect(() => {
    setExcalidrawPlaceholderText(t.excalidraw.placeholder)
  }, [t.excalidraw.placeholder])

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
    // Cancel a pending preview debounce from the PREVIOUS file too. Otherwise,
    // typing in file A and switching to file B within the debounce window lets
    // A's queued setPreviewContent fire after this effect set B's content — the
    // preview would render A while the editor shows B until the next keystroke.
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current)
      previewDebounceRef.current = undefined
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
      spellcheck: lintSpellEnabledRef.current,
      spellLang: lintSpellLangRef.current,
      spellMessage: lintSpellMessageRef.current,
    }))

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const f = vault.openFile
      // PDF tabs are read-only — Ctrl+S would otherwise call saveFile with the
      // empty placeholder content and destroy the underlying PDF.
      if (f && f.mode !== "pdf") vault.saveFile(f.path, editor.getValue())
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
          // Faithful save (masked, extension-aware) — not a lossy export.
          await writeTextFileAtomic(path, toDiskContent(path, editor.getValue()))
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
      () => openPanel("search")
    )
    // Ctrl/Cmd+B / Ctrl/Cmd+I — bold / italic. The command palette advertises
    // these shortcuts but Monaco has no default binding for them; wire them to
    // the same selection-aware insert the palette uses so they wrap the current
    // selection (matching the palette's snippets exactly).
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB,
      () => insertSnippet(editorRef.current, "**${1:texto}**"),
    )
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI,
      () => insertSnippet(editorRef.current, "_${1:texto}_"),
    )
    // Ctrl/Cmd+K inline AI edit (flagship). Monaco normally reserves Ctrl+K as a
    // CHORD prefix (e.g. Ctrl+K Ctrl+C); registering a plain Ctrl+K command here
    // overrides the chord with a single-stroke binding, which is what we want.
    // Routed through a ref so this once-bound command always calls the latest
    // handler (and re-reads settings.aiEnabled) without re-binding on every render.
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
      () => openCmdkRef.current(),
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
    mathHoverDisposableRef.current = setupMathHover(editor, () => macrosRef.current, () => mathPreviewEnabledRef.current)

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
      openPanel("comments")
    })

    // Keep-mark decorations — the ONLY place a `^^…^^` mark is visible.
    keepMarkDecorationsRef.current?.dispose()
    keepMarkDecorationsRef.current = setupKeepMarkDecorations(editor, monaco, () => {
      openPanel("keep")
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
  }, [vault, settings.vimMode, settings.typewriterMode, t, openPanel])

  const handleChange = useCallback((value: string | undefined) => {
    const content = value ?? ""
    // Record what the user just typed so the external-content-sync effect can
    // tell "the editor already has this" (O(1) reference check) from a genuine
    // external change (conflict reload / replace / programmatic edit).
    lastEditorContentRef.current = content
    // Ignore onChange fires on mount / programmatic value change
    if (content !== (vault.openFile?.content ?? "")) {
      vault.updateContent(content)
    }
    // Debounce preview 150ms to avoid re-rendering on every keystroke
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => setPreviewContent(content), previewDelayMs())
  }, [vault])

  // Push EXTERNAL content changes into the Monaco model. The editor is now
  // uncontrolled (`defaultValue` + `key` per tab), so the user's own keystrokes
  // never round-trip through React's `value` (which made the library serialize
  // the whole document via `getValue()` on every keystroke). This effect only
  // does work when `openFile.content` differs from what the editor already has —
  // i.e. a conflict reload, vault-wide replace, todo/wikilink/backlink edit, or
  // a tab switch — all rare relative to typing.
  useEffect(() => {
    const ed = editorRef.current
    const file = vault.openFile
    if (!ed || !file || file.mode === "pdf") return
    if (file.content === lastEditorContentRef.current) return // O(1): the user's own typing
    lastEditorContentRef.current = file.content
    try {
      if (ed.getValue() === file.content) return // already in sync (e.g. just switched tabs)
      const pos = ed.getPosition()
      ed.setValue(file.content)
      if (pos) ed.setPosition(pos)
    } catch { /* editor disposed mid-swap — the key remount re-seeds it */ }
    // Intentionally key on the content/mode PRIMITIVES, not the `vault.openFile`
    // object (whose identity changes every keystroke — depending on it would run
    // this effect per keystroke, defeating the purpose).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.openFile?.content, vault.openFile?.mode])

  // ── Ctrl/Cmd+K inline AI edit: open the floating prompt at the selection. ──
  const openCmdk = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    // Gated when AI is off: a short hint, nothing else.
    if (!aiEnabledRef.current) { showToast(t.ai.cmdk.disabledHint, "info"); return }
    const model = editor.getModel()
    if (!model) return
    const sel = editor.getSelection()
    const hasSelection = !!(sel && !sel.isEmpty())
    let range: monaco.IRange
    let selectionText = ""
    if (hasSelection && sel) {
      range = sel
      selectionText = model.getValueInRange(sel)
    } else {
      // Insert mode: a zero-width range at the cursor.
      const pos = editor.getPosition() ?? { lineNumber: 1, column: 1 }
      range = { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }
    }
    setCmdkAnchor({ range, hasSelection, selectionText })
  }, [t])
  useEffect(() => { openCmdkRef.current = openCmdk }, [openCmdk])

  // ── FrontmatterPanel: write changed content back to the editor ────────────
  const handleFrontmatterChange = useCallback((newContent: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.setValue(newContent)
    vault.updateContent(newContent)
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => setPreviewContent(newContent), previewDelayMs())
  }, [vault])

  // ── OutlinePanel: drag-to-reorder document sections ──────────────────────
  // Move the dragged heading's whole section to before the target heading,
  // applied as a single full-document replace via executeEdits so it is a
  // single undoable change. Renumbering (equations/figures) happens at render.
  const handleOutlineReorder = useCallback((fromLine: number, toLine: number) => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const current = model.getValue()
    const next = reorderSection(current, fromLine, toLine)
    if (next === current) return
    const fullRange = model.getFullModelRange()
    editor.pushUndoStop()
    editor.executeEdits("outline-reorder", [{ range: fullRange, text: next }])
    editor.pushUndoStop()
    vault.updateContent(next)
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => setPreviewContent(next), previewDelayMs())
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
    // Depend on the stable methods (not the `vault` object, which is a fresh
    // literal every render) so this prop stays stable across keystrokes and
    // FileTree's React.memo actually holds. activeTabPath only changes on tab
    // switch (not while typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.openFileNode, vault.activeTabPath, trackRecent])

  const goBack = useCallback(() => {
    if (navHistory.length === 0) return
    const prev = navHistory[navHistory.length - 1]
    const node = findVaultNodeByPath(prev)
    if (!node) return
    setNavHistory((h) => h.slice(0, -1))
    if (vaultRef.current.activeTabPath) setNavFuture((f) => [vaultRef.current.activeTabPath!, ...f.slice(0, 49)])
    vaultRef.current.openFileNode(node)
  }, [navHistory, findVaultNodeByPath])

  const goForward = useCallback(() => {
    if (navFuture.length === 0) return
    const next = navFuture[0]
    const node = findVaultNodeByPath(next)
    if (!node) return
    setNavFuture((f) => f.slice(1))
    if (vaultRef.current.activeTabPath) setNavHistory((h) => [...h.slice(-49), vaultRef.current.activeTabPath!])
    vaultRef.current.openFileNode(node)
  }, [navFuture, findVaultNodeByPath])

  // ── Per-line comment handlers ─────────────────────────────────────────────
  const handleAddCommentAtCursor = useCallback(async () => {
    const vaultPath = vaultRef.current.vaultPath
    if (!vaultPath) { showToast(t.comments.noVault, "error"); return }
    const editor = editorRef.current
    const file = vaultRef.current.openFile
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
      filePath: commentToRelative(file.path, vaultPath),
      line,
      lineSnippet: makeLineSnippet(lineText),
      body: trimmed,
      author: "user",
      createdAt: new Date().toISOString(),
      resolved: false,
    }
    setComments((prev) => [...prev, comment])
    try {
      await addCommentToVault(vaultPath, comment)
      showToast(t.comments.addedToast, "success")
      openPanel("comments")
    } catch (e) {
      // Roll back on failure to keep state in sync with disk.
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      showToast(e instanceof Error ? e.message : String(e), "error")
    }
  }, [t, openPanel])

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
    const vaultPath = vaultRef.current.vaultPath
    if (!vaultPath) return
    const editor = editorRef.current
    const file = vaultRef.current.openFile
    if (!editor || !file) return
    const pos = editor.getPosition()
    if (!pos) return
    const filePath = file.path
    const match = comments.find((c) =>
      commentToAbsolute(c.filePath, vaultPath) === filePath && c.line === pos.lineNumber,
    )
    if (!match) { showToast(t.comments.noCommentAtCursor, "info"); return }
    void handleToggleCommentResolved(match.id)
  }, [comments, handleToggleCommentResolved, t])

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
    const node = findVaultNodeByPath(absolutePath)
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
  }, [vault, findVaultNodeByPath])

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

  const searchVault = useCallback(() => openPanel("search"), [openPanel])

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
      const targetNode = vaultFileNodes.find((f) => f.name === targetName || f.name === targetName + ".md")
      if (targetNode) { handleOpenFileNode(targetNode); return }
    }

    const citeMatch = /@([a-zA-Z0-9_-]+)/.exec(line)
    if (citeMatch) { setCitationManagerOpen(true); return }

    // Try structural label
    const labelMatch = /@([a-zA-Z0-9_-]+):/.exec(line)
    if (labelMatch) { openPanel("labels"); return }
  }, [handleOpenFileNode, vaultFileNodes, openPanel])

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
    const node = findVaultNodeByPath(path)
    if (node) { handleOpenFileNode(node); return }
    // File not in current tree — show a helpful message
    showToast(t.app.fileNotInVault(displayBasename(path)), "error")
  }, [findVaultNodeByPath, handleOpenFileNode, t])

  const clearRecent = useCallback(() => {
    setRecentFiles([])
    localStorage.removeItem(RECENT_KEY)
  }, [])

  // ── Wikilink click in preview ─────────────────────────────────────────────
  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    const editor = editorRef.current

    // ── In-page cross-reference: scroll the preview to the target ──────────
    // Must come first: a cross-reference link (@tbl:/@fig:/@sec:/@thm:, TOC
    // entries) sits inside a paragraph carrying `data-source-line`, so without
    // this branch the fallback at the bottom hijacks the click and jumps the
    // editor to the line the *reference* is written on instead of the target.
    const anchor = el.closest('a[href^="#"]') as HTMLAnchorElement | null
    if (anchor) {
      e.preventDefault()
      const id = decodeURIComponent(anchor.getAttribute("href")?.slice(1) ?? "")
      // Attribute selector, not `#id`: ids like `env-thm:main` contain a colon,
      // which is a pseudo-class separator in a CSS id selector.
      const target = id ? previewPaneRef.current?.querySelector(`[id="${id.replace(/["\\]/g, "\\$&")}"]`) : null
      target?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }

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
        suppressPreviewScrollOnce.current = true
        editor.revealLineInCenter(targetLine + 1, 0) // smooth
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

    // ── Excalidraw: open the drawing editor for this block ─────────────────
    const exEdit = el.closest(".excalidraw-edit") as HTMLElement | null
    if (exEdit) {
      e.preventDefault()
      e.stopPropagation()
      const sceneB64 = exEdit.dataset.scene ?? ""
      const line = parseInt(exEdit.dataset.line ?? "", 10)
      setExcalidraw({ open: true, sceneB64, targetLine: Number.isFinite(line) && line > 0 ? line : null })
      return
    }

    // ── Cross-file environment ref navigation ──────────────────────────────
    // `@gp/calendario@def:x` → open the target file and jump to the env.
    // Must run BEFORE the `data-source-line` fallback below, which would
    // otherwise just move the cursor within the CURRENT file.
    const envCross = el.closest(".env-ref-cross") as HTMLElement | null
    if (envCross) {
      e.preventDefault()
      const docPath = envCross.dataset.target
      if (!docPath) return
      const node = findByVaultRelPath(vault.tree, docPath)
      if (!node) return
      const envLabel = envCross.dataset.envLabel
      if (envLabel) {
        const content = vaultFiles.find((file) => file.path === node.path)?.content ?? ""
        const line = content.split("\n").findIndex((candidate) => candidate.includes(`{#${envLabel}}`))
        if (line >= 0) pendingJumpRef.current = line + 1
      }
      handleOpenFileNode(node)
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
          // Mark the cursor change as preview-originated so the scroll-sync
          // effect doesn't yank the preview back up to the section heading.
          suppressPreviewScrollOnce.current = true
          // ScrollType.Smooth = 0 (vs default Immediate = 1).
          editor.revealLineInCenter(lineNum, 0)
          editor.setPosition({ lineNumber: lineNum, column: 1 })
          editor.focus()
        }
      }
    }
  }, [vault, vaultFiles, handleOpenFileNode, t.app.copiedLatex])

  // ── Wikilink hover preview ────────────────────────────────────────────────
  // Show a floating preview card with the first ~10 non-empty lines of the
  // target note when the user hovers (~300ms) over a rendered [[wikilink]].
  // The handler reads everything through refs so the effect's dep list stays
  // small — without this guard the listeners detach + reattach on every
  // keystroke (vaultFiles → macros → bibMap → transclusionResolver all churn
  // when the active tab content changes).
  const wikiHoverDataRef = useRef({
    tree: vault.tree,
    vaultFiles,
    vaultPath: vault.vaultPath,
    macros,
    wikiNames,
    bibMap,
    transclusionResolver,
    hoverLoading: t.preview.hoverLoading,
    hoverNotFound: t.preview.hoverNotFound,
  })
  useEffect(() => {
    wikiHoverDataRef.current = {
      tree: vault.tree,
      vaultFiles,
      vaultPath: vault.vaultPath,
      macros,
      wikiNames,
      bibMap,
      transclusionResolver,
      hoverLoading: t.preview.hoverLoading,
      hoverNotFound: t.preview.hoverNotFound,
    }
  })

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
      const data = wikiHoverDataRef.current
      const isBroken = link.classList.contains("wikilink-broken")
      card = document.createElement("div")
      card.className = "wikilink-hover-card"
      const W = 400, H = 300
      const left = Math.min(x + 12, window.innerWidth - W - 8)
      const top = Math.min(y + 16, window.innerHeight - H - 8)
      card.style.left = `${Math.max(8, left)}px`
      card.style.top = `${Math.max(8, top)}px`

      let html = ""
      if (isBroken) {
        html = `<div class="wikilink-hover-empty">${escapeHoverText(data.hoverNotFound)}</div>`
      } else {
        const node = findByName(data.tree, target)
        const fileEntry = node ? data.vaultFiles.find((f) => f.path === node.path) : undefined
        const content = fileEntry?.content
        if (content == null || content === "") {
          html = `<div class="wikilink-hover-empty">${escapeHoverText(data.hoverLoading)}</div>`
        } else {
          const parsed = extractFrontmatter(content)
          const body = parsed?.content ?? content
          const lines = body.split("\n").filter((l) => l.trim() !== "").slice(0, 10).join("\n")
          try {
            const rendered = renderMarkdown(lines, data.macros, data.vaultPath ?? undefined, data.wikiNames, data.bibMap, data.transclusionResolver, undefined, { annotate: false })
            html = sanitizeRenderedHtml(rendered)
          } catch {
            html = `<div class="wikilink-hover-empty">${escapeHoverText(data.hoverNotFound)}</div>`
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
  }, [])

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
    const f = vaultRef.current.openFile; const editor = editorRef.current
    // PDF tabs render via PdfPreviewPanel, not the Monaco editor — calling
    // editor.getValue() on a PDF tab returns the text-tab placeholder content
    // ("") and writing that back overwrites the user's PDF. Block save.
    if (f && f.mode !== "pdf" && editor) vaultRef.current.saveFile(f.path, editor.getValue())
  }, [])

  const handleSaveAs = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    const path = await save({
      title: t.menus.saveAs,
      filters: [{ name: "Documentos", extensions: ["md", "tex"] }],
      defaultPath: vaultRef.current.openFile?.name,
    })
    if (!path) return
    // Save As must persist the document faithfully (round-trippable), so write
    // the masked CMDX via toDiskContent — extension-aware (.md / .tex) — never a
    // lossy Obsidian transform. (Obsidian/GFM export is handled by Export Markdown.)
    await writeTextFileAtomic(path, toDiskContent(path, editor.getValue()))
    await vaultRef.current.loadVault()
  }, [t])

  // Debounced: when autoRebuildPdf is on, the PDF panel is active, and there
  // is an existing pdfPath, recompile ~3s after content changes.
  useEffect(() => {
    if (!settings.autoRebuildPdf) return
    if (sidebarMode !== "pdfPreview") return
    if (!pdfPath) return
    const timer = setTimeout(() => { rebuildPdfInPlace() }, 3000)
    return () => clearTimeout(timer)
  }, [settings.autoRebuildPdf, sidebarMode, pdfPath, vault.openFile?.content, rebuildPdfInPlace])

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
    const file = vaultRef.current.openFile
    if (!file) return
    try {
      const html = renderMarkdown(file.content, macros, vaultRef.current.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver, undefined, { annotate: false })
      await navigator.clipboard.writeText(sanitizeRenderedHtml(html))
      showToast(t.app.copiedHtml, "success")
    } catch { showToast(t.app.copyError ?? "Error al copiar", "error") }
  }, [macros, wikiNames, bibMap, transclusionResolver, t])

  const handleCopyLatex = useCallback(async () => {
    const file = vaultRef.current.openFile
    if (!file) return
    try {
      let macrosText = ""
      const vaultPath = vaultRef.current.vaultPath
      if (vaultPath) {
        try {
          const mp = await pathJoin(vaultPath, MACROS_FILENAME)
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
  }, [transclusionResolver, t])

  const handleSaveBib = useCallback(async (bibtexString: string) => {
    if (!vault.vaultPath) return
    const bibPath = await pathJoin(vault.vaultPath, BIBTEX_FILENAME)
    await writeTextFile(bibPath, bibtexString)
    await vault.loadVault()
    showToast(t.app.bibSaved, "success")
  }, [vault, t])

  // Persist references.bib without closing the manager and refresh the
  // in-memory bib map (used by "Add by DOI" for immediate availability).
  const handlePersistBib = useCallback(async (bibtexString: string) => {
    if (!vault.vaultPath) return
    const bibPath = await pathJoin(vault.vaultPath, BIBTEX_FILENAME)
    await writeTextFile(bibPath, bibtexString)
    setBibMap(parseBibtex(bibtexString))
  }, [vault.vaultPath])

  const handleFind = useCallback(() => editorRef.current?.trigger("menu", "actions.find", null), [])

  // ── Search & Replace: replace in a single file ───────────────────────────
  const handleReplaceInFile = useCallback(async (
    filePath: string,
    search: string,
    replace: string,
    opts: SearchReplaceOptions,
    target?: SearchReplaceTarget,
  ): Promise<number> => {
    try {
      // Prefer the open tab's in-memory content over disk: if the file has
      // unsaved edits, reading disk would run the replace against stale bytes
      // and then overwrite the user's edits. Route the write through
      // writeFileSafe so the pending autosave is cancelled (otherwise it could
      // fire after our write and clobber the replacement with the pre-edit
      // buffer) and the tab/draft/mtime stay consistent.
      const openTab = vault.openTabs.find((tb) => tb.path === filePath)
      const text = openTab ? openTab.content : toEditorContent(filePath, await readTextFile(filePath))
      const re = buildSearchRegExp(search, opts)
      if (!re) return 0
      const { count, content: newContent } = target
        ? replaceMatchAt(text, re, replace, target)
        : replaceMatches(text, re, replace)
      if (count === 0) return 0
      await vault.writeFileSafe(filePath, newContent)
      return count
    } catch (e) {
      showToast(t.app.replaceError((e as Error).message), "error")
      return 0
    }
  }, [vault, t])

  const handleBreadcrumbNavigate = useCallback((path: string) => {
    const node = findVaultNodeByPath(path)
    if (node) {
      handleOpenFileNode(node)
      return
    }
    setSidebarMode("files")
  }, [findVaultNodeByPath, handleOpenFileNode])

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

  // ── Excalidraw drawing: open empty (insert) / save back into source ───────
  const handleInsertExcalidraw = useCallback(() => {
    setExcalidraw({ open: true, sceneB64: "", targetLine: null })
  }, [])

  const handleSaveExcalidraw = useCallback((sceneB64: string) => {
    const editor = editorRef.current
    setExcalidraw((prev) => {
      if (!editor) return { open: false, sceneB64: "", targetLine: null }
      const model = editor.getModel()
      if (!model) return { open: false, sceneB64: "", targetLine: null }

      if (prev.targetLine != null) {
        // Replace the body line of the existing `:::excalidraw` block. The block
        // is `:::excalidraw[title]\n<base64>\n:::`, so the source line at
        // `targetLine` is the OPENING fence; its body is the next line.
        const bodyLine = prev.targetLine + 1
        const lineCount = model.getLineCount()
        if (bodyLine <= lineCount) {
          const range = {
            startLineNumber: bodyLine,
            startColumn: 1,
            endLineNumber: bodyLine,
            endColumn: model.getLineMaxColumn(bodyLine),
          }
          editor.executeEdits("excalidraw-save", [{ range, text: sceneB64 }])
        }
      } else {
        // Insert a fresh block at the cursor.
        const pos = editor.getPosition()
        const line = pos?.lineNumber ?? 1
        const col = pos?.column ?? 1
        const text = `\n:::excalidraw\n${sceneB64}\n:::\n`
        editor.executeEdits("excalidraw-insert", [{
          range: { startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col },
          text,
        }])
      }
      editor.focus()
      return { open: false, sceneB64: "", targetLine: null }
    })
  }, [])

  // ── Insert TOC ────────────────────────────────────────────────────────────
  // Inserts the live `[[toc]]` marker, which the renderer expands into an
  // always-current table of contents (auto-generated on every render) rather
  // than a one-off static snapshot that goes stale as headings change.
  // Selection-aware snippet insert used by palette "Insertar" commands. Shares
  // the exact wrap-when-selection logic the Toolbar uses.
  const palInsert = useCallback((snippet: string) => {
    insertSnippet(editorRef.current, snippet)
  }, [])

  const handleInsertToc = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const pos = editor.getPosition()
    editor.executeEdits("insert-toc", [{
      range: {
        startLineNumber: pos?.lineNumber ?? 1,
        startColumn: pos?.column ?? 1,
        endLineNumber: pos?.lineNumber ?? 1,
        endColumn: pos?.column ?? 1,
      },
      text: "[[toc]]\n",
    }])
    editor.focus()
  }, [])

  const handleOpenMacros = useCallback(async () => {
    const vaultPath = vaultRef.current.vaultPath
    if (!vaultPath) return
    const mp = await pathJoin(vaultPath, MACROS_FILENAME)
    if (!(await exists(mp))) await writeTextFile(mp, MACROS_TEMPLATE)
    await vaultRef.current.loadVault()
    await vaultRef.current.openFilePath(mp)
  }, [])

  const handleCreateFromTemplate = useCallback(async (name: string, content: string) => {
    await vault.createFile(name, content)
  }, [vault])

  // ── Rename with wikilink refactor ─────────────────────────────────────────
  // ── Todo panel handlers ────────────────────────────────────────────────────
  const handleTodoNavigate = useCallback((path: string, line: number) => {
    const node = findVaultNodeByPath(path)
    if (node) {
      pendingJumpRef.current = line
      handleOpenFileNode(node)
      setSidebarMode("files")
    }
  }, [findVaultNodeByPath, handleOpenFileNode])

  const handleTodoToggle = useCallback((path: string, newContent: string) => {
    // writeFileSafe masks special blocks (toDiskContent), cancels the pending
    // per-path autosave so it can't clobber this write, patches the open tab,
    // and refreshes mtime. Surface failures instead of swallowing them.
    vault.writeFileSafe(path, newContent).catch((e) => {
      showToast(t.vault.errorSaving(e instanceof Error ? e.message : String(e)), "error")
    })
  }, [vault, t])

  const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
    const oldBasename = displayBasename(oldPath).replace(/\.[^.]+$/, "")
    const newBasename = newName.replace(/\.[^.]+$/, "")

    // Only offer refactor for .md files where the base name actually changes
    if (oldBasename !== newBasename && oldPath.endsWith(".md")) {
      const re = new RegExp(`\\[\\[${oldBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}((?:#[^\\]|]+)?)((?:\\|[^\\]]+)?)\\]\\]`, "g")
      const markdownFiles = vaultFileNodes
        .filter((file) => file.path !== oldPath && file.ext === "md")
      const filesWithLinks: { path: string; content: string }[] = []

      for (const file of markdownFiles) {
        const openTab = openTabsRef.current.find((tab) => tab.path === file.path)
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
              const matches = file.content.match(re)
              re.lastIndex = 0
              const updated = file.content.replace(re, `[[${newBasename}$1$2]]`)
              // writeFileSafe masks special blocks, cancels the pending autosave
              // (lost-update guard), patches the open tab + refreshes mtime.
              await vault.writeFileSafe(file.path, updated)
              refactorCount += matches ? matches.length : 0
            }
            if (refactorCount > 0) showToast(t.vault.renameRefactorDone(refactorCount), "success")
          }
        } catch { /* dialog cancelled */ }
      }
    }

    await vault.renameFile(oldPath, newName)
    // Stable deps (open tabs read via ref) so FileTree's React.memo holds while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, vaultFileNodes, vault.renameFile, vault.writeFileSafe])

  const handleOpenBib = useCallback(async () => {
    const vaultPath = vaultRef.current.vaultPath
    if (!vaultPath) return
    const bp = await pathJoin(vaultPath, BIBTEX_FILENAME)
    if (!(await exists(bp))) await writeTextFile(bp, BIB_TEMPLATE)
    await vaultRef.current.loadVault()
    await vaultRef.current.openFilePath(bp)
  }, [])

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
      const seen = localStorage.getItem(STORAGE_KEYS.ONBOARDING_SEEN) === "true"
      if (!seen) {
        // small delay so the layout settles before the modal appears
        const timer = setTimeout(() => setOnboardingOpen(true), 600)
        return () => clearTimeout(timer)
      }
    } catch { /* localStorage unavailable */ }
  }, [vault.vaultPath])

  const handleOnboardingClose = useCallback(() => {
    setOnboardingOpen(false)
    try { localStorage.setItem(STORAGE_KEYS.ONBOARDING_SEEN, "true") } catch { /* ignore */ }
  }, [])

  // ── Daily notes ─────────────────────────────────────────────────────────
  const handleOpenDailyNote = useCallback(async () => {
    const vaultPath = vaultRef.current.vaultPath
    if (!vaultPath) {
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
        const dir = await pathJoin(vaultPath, folder)
        if (!(await exists(dir))) await mkdir(dir, { recursive: true })
        filePath = await pathJoin(dir, filename)
      } else {
        filePath = await pathJoin(vaultPath, filename)
      }

      const fileExists = await exists(filePath)
      if (!fileExists) {
        const tplRaw = settings.dailyNotesTemplate || "# {{date:YYYY-MM-DD}}\n\n"
        const content = processTemplateVariables(tplRaw, filename)
        await writeTextFile(filePath, content)
        await vaultRef.current.loadVault()
        showToast(t.app.dailyNoteCreated(filename), "success")
      } else {
        showToast(t.app.dailyNoteOpened(filename), "info")
      }
      await vaultRef.current.openFilePath(filePath)
    } catch (err) {
      showToast(t.app.dailyNoteError(err instanceof Error ? err.message : String(err)), "error")
    }
  }, [t, settings.dailyNotesFolder, settings.dailyNotesTemplate])

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
    try {
      await downloadAndInstallUpdate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(t.app.updateInstallFailed(msg), "error")
    } finally {
      setInstalling(false)
    }
  }

  // ── Command palette entries ───────────────────────────────────────────────
  // Memoized because AppContent re-renders per keystroke (~30/s during held-key
  // deletion); all ctx fields are stable callbacks/setters or rarely-changing
  // values, so recomputing the ~130-entry command list on every keystroke would
  // be wasted work.
  const paletteCommands: PaletteCommand[] = useMemo(() => buildPaletteCommands({
    t, deps, exportActions, handleSave, handleSaveAs, handleFind, openPanel, palInsert,
    setTableEditorOpen, handleInsertToc, handleInsertExcalidraw, setCitationManagerOpen,
    setFocusMode, typewriterMode, syncScroll, wordWrap, minimapEnabled, spellcheck,
    updateSettings, handleCopyHtml, handleCopyLatex, handleVaultBackup, openCmdkRef,
    selectVault: vault.selectVault, setTemplateOpen, handleOpenDailyNote, handleOpenMacros,
    handleOpenBib, setSettingsOpen, checkForUpdate, setUpdateInfo, handleAddCommentAtCursor,
    handleToggleCommentAtCursor, setOnboardingOpen, setHelpOpen, goBack, goForward,
  }), [
    t, deps, exportActions, handleSave, handleSaveAs, handleFind, openPanel, palInsert,
    handleInsertToc, handleInsertExcalidraw, typewriterMode, syncScroll, wordWrap,
    minimapEnabled, spellcheck, updateSettings, handleCopyHtml, handleCopyLatex,
    handleVaultBackup, vault.selectVault, handleOpenDailyNote, handleOpenMacros,
    handleOpenBib, handleAddCommentAtCursor, handleToggleCommentAtCursor, goBack, goForward,
  ])

  // ── Menu ──────────────────────────────────────────────────────────────────
  const hasFile = !!vault.openFile
  const hasVault = !!vault.vaultPath

  const recentEntries: MenuEntry[] = useMemo(() => recentFiles.length > 0
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
    : [], [recentFiles, t, handleOpenRecent, clearRecent])

  const menus: MenuDef[] = useMemo(() => buildMenus({
    t, hasFile, hasVault, deps, exportActions, selectVault: vault.selectVault, setTemplateOpen,
    handleSave, handleSaveAs, handleFind, openPanel, setPaletteOpen, setFocusMode,
    handleOpenMacros, handleOpenBib, setSettingsOpen, setHelpOpen, recentEntries,
  }), [
    t, hasFile, hasVault, deps, exportActions, vault.selectVault, handleSave, handleSaveAs,
    handleFind, openPanel, handleOpenMacros, handleOpenBib, recentEntries,
  ])

  const currentContent = vault.openFile?.content ?? WELCOME
  const editorFlex = editorWidth || undefined
  const showWelcome = !vault.vaultPath

  // Stable element so MenuBar's memo isn't defeated by a fresh child
  // element identity on every keystroke re-render.
  const gitBarEl = useMemo(() => <GitBar vaultPath={vault.vaultPath} />, [vault.vaultPath])

  const themeAttr =
    settings.theme === "vs" ? "light" : settings.theme === "hc-black" ? "hc" : "dark"

  if (showWelcome) {
    return (
      <div className={`app${focusMode ? " focus-mode" : ""}`} data-theme={themeAttr}>
        <TitleBar filename={undefined} isDirty={false} onClose={handleCloseRequest} onSettingsClick={() => setSettingsOpen(true)} />
        <WelcomeScreen
          onOpenVault={() => { void vault.selectVault() }}
          onCreateVault={() => { void vault.createVault() }}
          recentVaults={vault.recentVaults}
          onOpenRecent={(path) => { void vault.selectVault(path) }}
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
            key={settingsSection ?? "default"}
            open={settingsOpen}
            settings={settings}
            initialSection={settingsSection}
            cloudProvider={cloudInfo?.provider ?? null}
            onClose={() => { setSettingsOpen(false); setSettingsSection(undefined) }}
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
        {gitBarEl}
      </MenuBar>
      {deps && (!deps.pandoc || !deps.zip) && (
        <DepsWarning
          deps={deps}
          useWasmTex={settings.useWasmTex}
          dismissed={depsDismissed}
          onDismiss={dismissDep}
        />
      )}
      {settings.cloudSyncBannerEnabled && cloudSuggestion && !cloudBannerDismissed && vault.vaultPath && (
        <CloudSyncBanner provider={cloudSuggestion} onDismiss={dismissCloudBanner} />
      )}
      <div className="topbar">
        <Toolbar
          editorRef={editorRef}
          sidebarMode={sidebarMode}
          setSidebarMode={openPanel}
        />
      </div>

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
          <div className="sidebar-content">
            {sidebarMode === "files" && (
              <FileTree
                vaultPath={vault.vaultPath}
                tree={vault.tree}
                activePath={vault.openFile?.path ?? null}
                isLoading={vault.isLoading}
                onSelectVault={handleSelectVault}
                onOpenFile={handleOpenFileNode}
                onCreateFile={vault.createFile}
                onCreateFolder={vault.createFolder}
                onDeleteFile={vault.deleteFile}
                onRenameFile={handleRenameFile}
                onMoveFile={vault.moveFile}
                conflictPaths={cloudConflictPaths}
                onConflictClick={handleConflictClick}
              />
            )}
            {sidebarMode === "search" && (
              <SearchPanel
                onSearch={vault.search}
                onOpenResult={(path, line) => {
                  const node = findVaultNodeByPath(path)
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
                    const node = findVaultNodeByPath(path)
                    if (!node) return
                    if (line !== undefined) pendingJumpRef.current = line
                    handleOpenFileNode(node)
                    setSidebarMode("files")
                  }}
                  onReplaceInFile={handleReplaceInFile}
                  state={searchReplaceState}
                />
              </Suspense>
            )}
            {sidebarMode === "outline" && (
              <OutlinePanel content={previewContent} editorRef={editorRef} activeLine={cursorPos.line} onReorder={handleOutlineReorder} />
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
                  const node = findVaultNodeByPath(path)
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
                  const node = findVaultNodeByPath(path)
                  if (node) {
                    if (line !== undefined) pendingJumpRef.current = line
                    handleOpenFileNode(node)
                    setSidebarMode("files")
                  }
                }}
              />
            )}
            {sidebarMode === "keep" && (
              <KeepPanel
                files={vaultFiles}
                onOpenFile={(path, line) => {
                  const node = findVaultNodeByPath(path)
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
                  const node = findVaultNodeByPath(path)
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
                    const node = findVaultNodeByPath(path)
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
                    const node = findVaultNodeByPath(path)
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
                    const node = findVaultNodeByPath(path)
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
                    const content = openTab ? openTab.content : toEditorContent(path, await readTextFile(path))
                    const lines = content.split("\n")
                    const idx = line - 1
                    if (idx < 0 || idx >= lines.length) return
                    const pattern = `[[${link}]]`
                    if (!lines[idx].includes(pattern)) return
                    lines[idx] = lines[idx].split(pattern).join("")
                    const updated = lines.join("\n")
                    // writeFileSafe masks special blocks (toDiskContent), cancels
                    // the pending autosave so it can't clobber this write, patches
                    // the open tab, and refreshes mtime.
                    try {
                      await vault.writeFileSafe(path, updated)
                    } catch (e) {
                      showToast(t.vault.errorSaving(e instanceof Error ? e.message : String(e)), "error")
                    }
                  }}
                />
              </Suspense>
            )}
            {sidebarMode === "focusTimer" && (
              <Suspense fallback={null}>
                <FocusTimerPanel
                  content={vault.openFile?.content ?? ""}
                  config={pomodoroConfig}
                  focusTimer={focusTimer}
                  wordGoal={settings.wordGoal}
                  onConfigChange={(patch) => updateSettings({
                    ...(patch.workMin !== undefined && { pomodoroWorkMin: patch.workMin }),
                    ...(patch.breakMin !== undefined && { pomodoroBreakMin: patch.breakMin }),
                    ...(patch.longBreakMin !== undefined && { pomodoroLongBreakMin: patch.longBreakMin }),
                    ...(patch.cyclesBeforeLongBreak !== undefined && { pomodoroCyclesBeforeLongBreak: patch.cyclesBeforeLongBreak }),
                  })}
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
            {sidebarMode === "cloudSync" && (
              <CloudSyncPanel
                conflicts={cloudConflicts}
                onOpenFile={(path) => {
                  const node = findVaultNodeByPath(path)
                  if (node) handleOpenFileNode(node)
                }}
                onResolved={() => { if (vault.vaultPath) vault.refreshTree(vault.vaultPath) }}
              />
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
            {sidebarMode === "ai" && (
              <Suspense fallback={null}>
                <AiPanel
                  settings={settings}
                  editor={editorRef.current}
                  fileContent={vault.openFile?.content ?? null}
                  fileName={vault.openFile?.name ?? null}
                  renderHtml={aiRenderHtml}
                  onOpenSettings={() => { setSettingsSection("ai"); setSettingsOpen(true) }}
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
          {vault.openFile?.mode === "pdf" ? (
            <Suspense fallback={<div style={{ flex: 1, minHeight: 0 }} />}>
              <PdfPreviewPanel pdfPath={vault.openFile.path} />
            </Suspense>
          ) : (
            <Suspense fallback={<div style={{ flex: 1, minHeight: 0 }} />}>
              <MonacoEditor
                key={vault.activeTabPath ?? "welcome"}
                defaultLanguage={vault.openFile?.mode === "tex" ? "latex" : "markdown"}
                defaultValue={currentContent}
                onChange={handleChange}
                beforeMount={handleBeforeMount}
                onMount={handleEditorMount}
                theme={settings.theme}
                options={editorOptions}
              />
            </Suspense>
          )}
          {/* Ctrl/Cmd+K inline AI edit — floating prompt anchored at the selection. */}
          {cmdkAnchor && editorRef.current && (
            <Suspense fallback={null}>
              <CmdKEdit
                settings={settings}
                editor={editorRef.current}
                anchor={cmdkAnchor}
                onClose={() => setCmdkAnchor(null)}
              />
            </Suspense>
          )}
          {/* Vim mode status bar */}
          <div
            ref={vimStatusRef}
            className={`vim-statusbar${settings.vimMode ? "" : " hidden"}`}
          />
        </div>

        {settings.previewVisible && vault.openFile?.mode !== "pdf" && <Resizer onDrag={handleEditorResize} />}

        {/* ── Preview (suppressed for PDF tabs — the PDF viewer takes the full pane) ── */}
        {settings.previewVisible && vault.openFile?.mode !== "pdf" && (
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
              ref={previewContentRef}
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
                  ref={splitContentRef}
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
        content={previewContent}
        isDirty={vault.openFile?.isDirty ?? false}
        macroCount={Object.keys(macros).length}
        selectedWords={selectedWords}
        wordGoal={settings.wordGoal > 0 ? settings.wordGoal : undefined}
        texEngine={settings.useWasmTex ? "wasm" : "local"}
        texEngineState={texEngineState}
        cloudSync={settings.cloudSyncDetectEnabled ? cloudInfo : null}
        cloudConflictCount={cloudConflicts.length}
        onCloudSyncClick={() => openPanel("cloudSync")}
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
        files={vaultFileNodes.map((f) => ({ path: f.path, name: f.name }))}
        recentFiles={recentFiles.map((p) => ({ path: p, name: displayBasename(p) }))}
        onSelect={(path) => {
          const node = findVaultNodeByPath(path)
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
          key={settingsSection ?? "default"}
          open={settingsOpen}
          settings={settings}
          initialSection={settingsSection}
          cloudProvider={cloudInfo?.provider ?? null}
          onClose={() => { setSettingsOpen(false); setSettingsSection(undefined) }}
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
          onPersist={handlePersistBib}
          onClose={() => setCitationManagerOpen(false)}
        />
      </Suspense>
      <TableEditor
        open={tableEditorOpen}
        onClose={() => setTableEditorOpen(false)}
        onInsert={handleInsertTable}
      />

      {excalidraw.open && (
        <Suspense fallback={null}>
          <ExcalidrawModal
            open={excalidraw.open}
            sceneB64={excalidraw.sceneB64}
            theme={settings.theme === "vs" ? "light" : "dark"}
            onSave={handleSaveExcalidraw}
            onClose={() => setExcalidraw({ open: false, sceneB64: "", targetLine: null })}
          />
        </Suspense>
      )}

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
