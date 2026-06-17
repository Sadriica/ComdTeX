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
import type { CmdKAnchor } from "./CmdKEdit"
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
import {
  onDictionaryReady,
  preloadDictionary,
  resolveSpellLang,
  type SpellLang,
} from "./spellcheck"
import { useVault } from "./useVault"
import { useSettings } from "./useSettings"
import type { Settings } from "./useSettings"
import { LanguageContext, LANGS, useT } from "./i18n"
import { getFileNameSet, flatFiles, findByName } from "./wikilinks"
import { pathJoin, pathDirname, displayBasename } from "./pathUtils"
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
import DocumentLabPanel from "./DocumentLabPanel"
import FrontmatterPanel from "./FrontmatterPanel"
import SymbolPickerPanel from "./SymbolPickerPanel"
import StatusBar from "./StatusBar"
import CommandPalette from "./CommandPalette"
import type { PaletteCommand } from "./CommandPalette"
import { insertSnippet } from "./editorInsert"
import ToastContainer from "./Toast"
import { parseMacros, MACROS_FILENAME, MACROS_TEMPLATE, type KatexMacros } from "./macros"
import { parseBibtex, BIBTEX_FILENAME } from "./bibtex"
import type { BibEntry } from "./bibtex"
import { exportToTex, exportReveal } from "./exporter"
import { exportPdf as exportPdfAction, exportAnkiCardsToFile, compileLatexPdf as compileLatexPdfAction, importDocument as importDocumentAction, exportTypst as exportTypstAction, exportTypstPdf as exportTypstPdfAction } from "./exportActions"
import { toPandocMarkdownInput } from "./exportConversion"
import type { LatexDiagnostic } from "./latexErrors"
import LatexErrorModal from "./LatexErrorModal"
import { exportToObsidianMarkdown } from "./obsidianExport"
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
import { handleGlobalShortcut } from "./appShortcuts"
import { useTouchpadGestures } from "./useTouchpadGestures"
import ErrorBoundary from "./ErrorBoundary"
import WelcomeScreen from "./WelcomeScreen"
import { buildSearchRegExp, replaceMatchAt, replaceMatches, type SearchReplaceOptions, type SearchReplaceTarget } from "./searchReplace"
import { toEditorContent, toDiskContent } from "./cmdxFormat"
import { resolveTransclusions } from "./transclusion"
import { scanStructuralLabels } from "./structuralLabels"
import { composeProjectMarkdown } from "./projectExport"
import { showToast } from "./toastService"
import ClosedTabsPopup from "./ClosedTabsPopup"
import QuickSwitcher from "./QuickSwitcher"
import BookmarksPopup from "./BookmarksPopup"
import OnboardingTour from "./OnboardingTour"
import { processTemplateVariables } from "./templates"
import { setFlowchartSvg, setExcalidrawSvg, getExcalidrawSvg, setExcalidrawPlaceholderText } from "./environments"
import "katex/dist/katex.min.css"
import "./App.css"

const RECENT_KEY = "comdtex_recent"
const BOOKMARKS_KEY = "comdtex_bookmarks"
const CURSOR_KEY = "comdtex_cursor_positions"
const MAX_RECENT = 10
type SidebarMode = "files" | "search" | "searchReplace" | "outline" | "backlinks" | "tags" | "labels" | "quality" | "properties" | "graph" | "todo" | "equations" | "environments" | "stats" | "help" | "symbols" | "pdfPreview" | "comments" | "cloudSync" | "focusTimer" | "ai"

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
    m.initialize({
      startOnLoad: false,
      theme: "dark",
      // `loose` is required for the `↺` and similar special chars in our
      // pseudocode-derived flowcharts. We escape body text already and the
      // sanitizer strips dangerous tags from the SVG before injection.
      securityLevel: "loose",
      themeVariables: {
        background: "transparent",
        mainBkg: "transparent",
        primaryColor: "transparent",
        secondaryColor: "transparent",
        tertiaryColor: "transparent",
      },
    })
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
    autoSaveMs: settings.autoSaveMs,
    onAfterSave: (path, basename) => { afterSaveRef.current?.(path, basename) },
  })
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
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
      const raw = localStorage.getItem("comdtex_deps_dismissed")
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
    try { return localStorage.getItem("comdtex_cloud_banner_dismissed") === "1" } catch { return false }
  })
  const dismissCloudBanner = useCallback(() => {
    setCloudBannerDismissed(true)
    try { localStorage.setItem("comdtex_cloud_banner_dismissed", "1") } catch {}
  }, [])

  const dismissDep = useCallback((name: DepName) => {
    setDepsDismissed((prev) => {
      if (prev.includes(name)) return prev
      const next = [...prev, name]
      try { localStorage.setItem("comdtex_deps_dismissed", JSON.stringify(next)) } catch {}
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

      // Scroll only if syncScroll is enabled — and not when the cursor move
      // came from a preview click (otherwise the preview yanks back up to the
      // heading the user is already looking at). The flag was already cleared
      // at the top of the effect; we use the captured `wasSuppressed` value.
      if (syncScroll && !wasSuppressed) {
        target?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }
  }, [cursorPos.line, syncScroll, settings.previewVisible, vault.openFile?.content])

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
  const activeSpellLang = useMemo<SpellLang>(() => {
    const fm = vault.openFile?.content
      ? extractFrontmatter(vault.openFile.content)?.data.lang
      : undefined
    return resolveSpellLang(typeof fm === "string" ? fm : undefined, settings.language)
  }, [vault.openFile?.content, settings.language])

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
  useEffect(() => {
    const context = { vaultFileNames: wikiNames, bibKeys }
    const counts: Record<string, LintSummary> = {}
    for (const tab of vault.openTabs) {
      counts[tab.path] = lintFileSummary(tab.content, tab.name, context)
    }
    setTabLintCounts(counts)
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
              await writeTextFile(path, toDiskContent(path, editor.getValue()))
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

  const renderPreviewHtml = useCallback((content: string) => {
    // Defer rendering until the macros file has been loaded once for this
    // vault. Without this gate the first paint of a freshly-opened file uses
    // `macros = {}`, so any equation that relies on a user-defined macro
    // renders as red `\macro` source text (KaTeX's `throwOnError: false`
    // fallback). The async `loadMacros` then completes and triggers a second
    // render that fixes things — exactly the "top renders raw, scroll/edit
    // makes it correct" symptom users were reporting.
    if (!macrosReady) return ""
    try {
      return sanitizeRenderedHtml(
        renderMarkdown(content, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver)
      )
    } catch (e) {
      return renderErrorHtml(e)
    }
    // mermaidVersion: included so re-renders that follow a mermaid SVG cache
    // population read the freshly-stored SVGs and embed them inline.
  }, [macros, macrosReady, vault.vaultPath, wikiNames, bibMap, transclusionResolver, mermaidVersion, excalidrawVersion])

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

        const diagram = el.textContent ?? ""
        const sourceAttr = pre.getAttribute("data-mermaid-source-b64") ?? ""
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
          // Populate the cache so future re-renders embed the SVG inline.
          setFlowchartSvg(diagram, safe)
          storedAny = true
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
          await writeTextFile(path, toDiskContent(path, editor.getValue()))
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
    // Ignore onChange fires on mount / programmatic value change
    if (content !== (vault.openFile?.content ?? "")) {
      vault.updateContent(content)
    }
    // Debounce preview 150ms to avoid re-rendering on every keystroke
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => setPreviewContent(content), 150)
  }, [vault])

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
    previewDebounceRef.current = setTimeout(() => setPreviewContent(newContent), 150)
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
    previewDebounceRef.current = setTimeout(() => setPreviewContent(next), 150)
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
    const node = findVaultNodeByPath(prev)
    if (!node) return
    setNavHistory((h) => h.slice(0, -1))
    if (vault.activeTabPath) setNavFuture((f) => [vault.activeTabPath!, ...f.slice(0, 49)])
    vault.openFileNode(node)
  }, [navHistory, vault, findVaultNodeByPath])

  const goForward = useCallback(() => {
    if (navFuture.length === 0) return
    const next = navFuture[0]
    const node = findVaultNodeByPath(next)
    if (!node) return
    setNavFuture((f) => f.slice(1))
    if (vault.activeTabPath) setNavHistory((h) => [...h.slice(-49), vault.activeTabPath!])
    vault.openFileNode(node)
  }, [navFuture, vault, findVaultNodeByPath])

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
      openPanel("comments")
    } catch (e) {
      // Roll back on failure to keep state in sync with disk.
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      showToast(e instanceof Error ? e.message : String(e), "error")
    }
  }, [vault.vaultPath, vault.openFile, t, openPanel])

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
            const rendered = renderMarkdown(lines, data.macros, data.vaultPath ?? undefined, data.wikiNames, data.bibMap, data.transclusionResolver)
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
    const f = vault.openFile; const editor = editorRef.current
    // PDF tabs render via PdfPreviewPanel, not the Monaco editor — calling
    // editor.getValue() on a PDF tab returns the text-tab placeholder content
    // ("") and writing that back overwrites the user's PDF. Block save.
    if (f && f.mode !== "pdf" && editor) vault.saveFile(f.path, editor.getValue())
  }, [vault])

  const handleSaveAs = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    const path = await save({
      title: t.menus.saveAs,
      filters: [{ name: "Documentos", extensions: ["md", "tex"] }],
      defaultPath: vault.openFile?.name,
    })
    if (!path) return
    // Save As must persist the document faithfully (round-trippable), so write
    // the masked CMDX via toDiskContent — extension-aware (.md / .tex) — never a
    // lossy Obsidian transform. (Obsidian/GFM export is handled by Export Markdown.)
    await writeTextFile(path, toDiskContent(path, editor.getValue()))
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
    // Export Markdown produces clean Obsidian/GFM Markdown (lossy by design).
    await writeTextFile(path, exportToObsidianMarkdown(editor.getValue()))
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
    const dir = pathDirname(currentFile.path) || "."
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
      messages: { pandocMissing: t.app.pandocMissing, generatingPdf: t.app.generatingPdf, pdfDone: t.app.pdfDone, pandocError: t.app.pandocError, backupSuccess: t.app.backupSuccess, backupError: t.app.backupError, copiedLatex: t.app.copiedLatex, copyError: t.app.copyError, revealExportSuccess: t.app.revealExportSuccess, revealExportError: t.app.revealExportError, noMainDocument: t.app.noMainDocument, pdfCompiledLocal: t.app.pdfCompiledLocal, compilationFailed: t.app.compilationFailed, zipMissing: t.app.zipMissing },
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

  const handleImportDocument = useCallback(async () => {
    await importDocumentAction({
      vaultPath: vault.vaultPath,
      deps,
      dialogTitle: t.app.importDocTitle,
      messages: {
        pandocMissing: t.app.pandocMissingImport,
        importing: t.app.importing,
        importSuccess: t.app.importSuccess,
        importError: t.app.importError,
      },
      toast: showToast,
      reloadVault: vault.loadVault,
      openFilePath: vault.openFilePath,
    })
  }, [vault.vaultPath, vault.loadVault, vault.openFilePath, t, deps])

  const typstMessages = useMemo(() => ({
    pandocMissing: t.app.pandocMissingTypst,
    generating: t.app.typstGenerating,
    typstSuccess: t.app.typstSuccess,
    typstError: t.app.typstError,
    typstPdfSuccess: t.app.typstPdfSuccess,
    typstPdfError: t.app.typstPdfError,
  }), [t])

  const handleExportTypst = useCallback(async () => {
    await exportTypstAction({
      activeFile: vault.openFile,
      deps,
      dialogTitle: t.app.typstExportTitle,
      messages: typstMessages,
      readEditorContent: () => editorRef.current?.getValue() ?? null,
      toast: showToast,
    })
  }, [vault.openFile, deps, t, typstMessages])

  const handleExportTypstPdf = useCallback(async () => {
    await exportTypstPdfAction({
      activeFile: vault.openFile,
      deps,
      dialogTitle: t.app.typstExportTitle,
      messages: typstMessages,
      readEditorContent: () => editorRef.current?.getValue() ?? null,
      toast: showToast,
    })
  }, [vault.openFile, deps, t, typstMessages])

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
      await writeTextFile(tmpPath, toPandocMarkdownInput(editorRef.current?.getValue() ?? file.content))
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
      await writeTextFile(tmpPath, toPandocMarkdownInput(editorRef.current?.getValue() ?? file.content))
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

  // Persist references.bib without closing the manager and refresh the
  // in-memory bib map (used by "Add by DOI" for immediate availability).
  const handlePersistBib = useCallback(async (bibtexString: string) => {
    if (!vault.vaultPath) return
    const bibPath = await pathJoin(vault.vaultPath, BIBTEX_FILENAME)
    await writeTextFile(bibPath, bibtexString)
    setBibMap(parseBibtex(bibtexString))
  }, [vault.vaultPath])

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
  // Inserts the live `[[toc]]` marker, which the renderer expands into an
  // always-current table of contents (auto-generated on every render) rather
  // than a one-off static snapshot that goes stale as headings change.
  // Selection-aware snippet insert used by palette "Insertar" commands. Shares
  // the exact wrap-when-selection logic the Toolbar uses.
  const palInsert = useCallback((snippet: string) => {
    insertSnippet(editorRef.current, snippet)
  }, [])

  const handleExportObsidian = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    const path = await save({
      title: t.palette.exportObsidian,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: vault.openFile?.name.replace(/\.[^.]+$/, ".md") ?? "export.md",
    })
    if (!path) return
    await writeTextFile(path, exportToObsidianMarkdown(editor.getValue()))
    showToast(t.app.revealExportSuccess, "success")
  }, [vault, t])

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
  }, [vault, t, vaultFileNodes])

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
  const paletteCommands: PaletteCommand[] = [
    // ── Edición ──────────────────────────────────────────────────────────────
    { id: "save",       label: t.palette.save,       shortcut: "Ctrl+S", category: "Edición", action: handleSave },
    { id: "saveAs",     label: t.palette.saveAs,     shortcut: "Ctrl+Shift+S", category: "Edición", action: handleSaveAs },
    { id: "find",       label: t.palette.findInFile, shortcut: "Ctrl+F", category: "Edición", action: handleFind },
    { id: "searchReplace", label: t.palette.searchReplace, category: "Edición", action: () => openPanel("searchReplace") },
    { id: "fmt:bold",      label: t.toolbar.bold,          shortcut: "Ctrl+B", category: "Edición", action: () => palInsert("**${1:texto}**") },
    { id: "fmt:italic",    label: t.toolbar.italic,        shortcut: "Ctrl+I", category: "Edición", action: () => palInsert("_${1:texto}_") },
    { id: "fmt:underline", label: t.toolbar.underline,     category: "Edición", action: () => palInsert("<u>${1:texto}</u>") },
    { id: "fmt:strike",    label: t.toolbar.strikethrough, category: "Edición", action: () => palInsert("~~${1:texto}~~") },
    { id: "fmt:code",      label: t.toolbar.inlineCode,    category: "Edición", action: () => palInsert("`${1:código}`") },
    { id: "fmt:link",      label: t.toolbar.link,          category: "Edición", action: () => palInsert("[${1:texto}](${2:url})") },
    { id: "fmt:highlight", label: t.toolbar.highlight, category: "Edición", children: [
      { id: "hl:yellow", label: t.toolbar.hlDefault, category: "Edición", icon: "🟨", action: () => palInsert("==${1:texto}==") },
      { id: "hl:green",  label: t.toolbar.hlGreen,   category: "Edición", icon: "🟩", action: () => palInsert('<mark class="hl-green">${1:texto}</mark>') },
      { id: "hl:blue",   label: t.toolbar.hlBlue,    category: "Edición", icon: "🟦", action: () => palInsert('<mark class="hl-blue">${1:texto}</mark>') },
      { id: "hl:purple", label: t.toolbar.hlPurple,  category: "Edición", icon: "🟪", action: () => palInsert('<mark class="hl-purple">${1:texto}</mark>') },
      { id: "hl:orange", label: t.toolbar.hlOrange,  category: "Edición", icon: "🟧", action: () => palInsert('<mark class="hl-orange">${1:texto}</mark>') },
      { id: "hl:red",    label: t.toolbar.hlRed,     category: "Edición", icon: "🟥", action: () => palInsert('<mark class="hl-red">${1:texto}</mark>') },
      { id: "hl:pink",   label: t.toolbar.hlPink,    category: "Edición", icon: "🌸", action: () => palInsert('<mark class="hl-pink">${1:texto}</mark>') },
    ] },
    { id: "fmt:headings", label: t.toolbar.headings, category: "Edición", children: [
      { id: "h1", label: t.toolbar.lbl_heading1, category: "Edición", action: () => palInsert("# ${1:Título}") },
      { id: "h2", label: t.toolbar.lbl_heading2, category: "Edición", action: () => palInsert("## ${1:Título}") },
      { id: "h3", label: t.toolbar.lbl_heading3, category: "Edición", action: () => palInsert("### ${1:Título}") },
    ] },
    { id: "fmt:lists", label: t.toolbar.list, category: "Edición", children: [
      { id: "list:ul",   label: t.toolbar.lbl_list,        category: "Edición", action: () => palInsert("- ${1:ítem}\n- ${2:ítem}\n- ${3:ítem}") },
      { id: "list:ol",   label: t.toolbar.lbl_orderedList, category: "Edición", action: () => palInsert("1. ${1:ítem}\n2. ${2:ítem}\n3. ${3:ítem}") },
      { id: "list:task", label: t.toolbar.lbl_taskList,    category: "Edición", action: () => palInsert("- [ ] ${1:tarea}\n- [ ] ${2:tarea}") },
    ] },

    // ── Insertar ─────────────────────────────────────────────────────────────
    { id: "ins:table",  label: t.palette.tableEditor,  category: "Insertar", action: () => setTableEditorOpen(true) },
    { id: "toc",        label: t.palette.insertToc,    shortcut: "Ctrl+Shift+O", category: "Insertar", action: handleInsertToc },
    { id: "ins:code",   label: t.palette.insertCodeBlock,  category: "Insertar", action: () => palInsert("```${1:lang}\n${2:código}\n```") },
    { id: "ins:quote",  label: t.toolbar.quote,        category: "Insertar", action: () => palInsert("> ${1:cita}") },
    { id: "ins:sep",    label: t.toolbar.separator,    category: "Insertar", action: () => palInsert("\n---\n") },
    { id: "ins:mathInline", label: t.toolbar.mathInline, category: "Insertar", action: () => palInsert("$${1}$") },
    { id: "ins:mathBlock",  label: t.toolbar.mathBlock,  category: "Insertar", action: () => palInsert("$$\n${1}\n$$") },
    { id: "insertExcalidraw", label: t.palette.insertExcalidraw, category: "Insertar", action: handleInsertExcalidraw },

    // ── Matemáticas ──────────────────────────────────────────────────────────
    { id: "math:symbols", label: t.toolbar.symbols, category: "Matemáticas", children: [
      { id: "sym:alpha",  label: "α  \\alpha",   category: "Matemáticas", action: () => palInsert("$\\alpha$") },
      { id: "sym:beta",   label: "β  \\beta",    category: "Matemáticas", action: () => palInsert("$\\beta$") },
      { id: "sym:gamma",  label: "γ  \\gamma",   category: "Matemáticas", action: () => palInsert("$\\gamma$") },
      { id: "sym:delta",  label: "δ  \\delta",   category: "Matemáticas", action: () => palInsert("$\\delta$") },
      { id: "sym:lambda", label: "λ  \\lambda",  category: "Matemáticas", action: () => palInsert("$\\lambda$") },
      { id: "sym:pi",     label: "π  \\pi",      category: "Matemáticas", action: () => palInsert("$\\pi$") },
      { id: "sym:sigma",  label: "σ  \\sigma",   category: "Matemáticas", action: () => palInsert("$\\sigma$") },
      { id: "sym:omega",  label: "ω  \\omega",   category: "Matemáticas", action: () => palInsert("$\\omega$") },
      { id: "sym:infty",  label: "∞  \\infty",   category: "Matemáticas", action: () => palInsert("$\\infty$") },
      { id: "sym:partial",label: "∂  \\partial", category: "Matemáticas", action: () => palInsert("$\\partial$") },
      { id: "sym:nabla",  label: "∇  \\nabla",   category: "Matemáticas", action: () => palInsert("$\\nabla$") },
      { id: "sym:times",  label: "×  \\times",   category: "Matemáticas", action: () => palInsert("$\\times$") },
      { id: "sym:leq",    label: "≤  \\leq",     category: "Matemáticas", action: () => palInsert("$\\leq$") },
      { id: "sym:geq",    label: "≥  \\geq",     category: "Matemáticas", action: () => palInsert("$\\geq$") },
      { id: "sym:neq",    label: "≠  \\neq",     category: "Matemáticas", action: () => palInsert("$\\neq$") },
      { id: "sym:approx", label: "≈  \\approx",  category: "Matemáticas", action: () => palInsert("$\\approx$") },
      { id: "sym:in",     label: "∈  \\in",      category: "Matemáticas", action: () => palInsert("$\\in$") },
      { id: "sym:subset", label: "⊂  \\subset",  category: "Matemáticas", action: () => palInsert("$\\subset$") },
      { id: "sym:forall", label: "∀  \\forall",  category: "Matemáticas", action: () => palInsert("$\\forall$") },
      { id: "sym:exists", label: "∃  \\exists",  category: "Matemáticas", action: () => palInsert("$\\exists$") },
      { id: "sym:rarr",   label: "→  \\rightarrow", category: "Matemáticas", action: () => palInsert("$\\rightarrow$") },
      { id: "sym:Rarr",   label: "⇒  \\Rightarrow", category: "Matemáticas", action: () => palInsert("$\\Rightarrow$") },
    ] },
    { id: "math:ops", label: t.toolbar.mathOps, category: "Matemáticas", children: [
      { id: "op:frac", label: t.toolbar.lbl_fraction, category: "Matemáticas", action: () => palInsert("frac(${1:a}, ${2:b})") },
      { id: "op:sqrt", label: t.toolbar.lbl_sqrt,     category: "Matemáticas", action: () => palInsert("sqrt(${1:x})") },
      { id: "op:root", label: t.toolbar.lbl_nthRoot,  category: "Matemáticas", action: () => palInsert("root(${1:n}, ${2:x})") },
      { id: "op:sum",  label: t.toolbar.lbl_sum,      category: "Matemáticas", action: () => palInsert("sum(${1:i=0}, ${2:n})") },
      { id: "op:int",  label: t.toolbar.lbl_integral, category: "Matemáticas", action: () => palInsert("int(${1:a}, ${2:b})") },
      { id: "op:lim",  label: t.toolbar.lbl_limit,    category: "Matemáticas", action: () => palInsert("lim(${1:x}, ${2:0})") },
      { id: "op:der",  label: t.toolbar.lbl_derivative, category: "Matemáticas", action: () => palInsert("der(${1:f}, ${2:x})") },
      { id: "op:pder", label: t.toolbar.lbl_partialDer, category: "Matemáticas", action: () => palInsert("pder(${1:f}, ${2:x})") },
    ] },
    { id: "math:envs", label: t.toolbar.environments, category: "Matemáticas", children: [
      { id: "env:thm",   label: t.toolbar.lbl_theorem,     category: "Matemáticas", action: () => palInsert(":::theorem[${1:título}]\n${2:enunciado}\n:::") },
      { id: "env:lem",   label: t.toolbar.lbl_lemma,       category: "Matemáticas", action: () => palInsert(":::lemma[${1:título}]\n${2:enunciado}\n:::") },
      { id: "env:cor",   label: t.toolbar.lbl_corollary,   category: "Matemáticas", action: () => palInsert(":::corollary\n${1:enunciado}\n:::") },
      { id: "env:prop",  label: t.toolbar.lbl_proposition, category: "Matemáticas", action: () => palInsert(":::proposition\n${1:enunciado}\n:::") },
      { id: "env:defn",  label: t.toolbar.lbl_definition,  category: "Matemáticas", action: () => palInsert(":::definition\n${1:definición}\n:::") },
      { id: "env:ex",    label: t.toolbar.lbl_example,     category: "Matemáticas", action: () => palInsert(":::example\n${1:ejemplo}\n:::") },
      { id: "env:proof", label: t.toolbar.lbl_proof,       category: "Matemáticas", action: () => palInsert(":::proof\n${1:demostración}\n:::") },
    ] },
    { id: "symbols", label: t.palette.symbolPicker, category: "Matemáticas", action: () => openPanel("symbols") },

    // ── Vista (paneles) ──────────────────────────────────────────────────────
    { id: "panel:files",   label: t.palette.openPanel(t.sidebar.files),   category: "Vista", action: () => openPanel("files") },
    { id: "outline",       label: t.palette.openPanel(t.sidebar.outline), category: "Vista", action: () => openPanel("outline") },
    { id: "equations",     label: t.palette.openPanel(t.sidebar.equations), category: "Vista", action: () => openPanel("equations") },
    { id: "environments",  label: t.palette.openPanel(t.sidebar.environments), category: "Vista", action: () => openPanel("environments") },
    { id: "citationManager", label: t.palette.openPanel(t.palette.citationManager), category: "Vista", action: () => setCitationManagerOpen(true) },
    { id: "graph",         label: t.palette.openPanel(t.sidebar.graph),   category: "Vista", action: () => openPanel("graph") },
    { id: "tags",          label: t.palette.openPanel(t.sidebar.tags),    category: "Vista", action: () => openPanel("tags") },
    { id: "labels",        label: t.palette.openPanel(t.sidebar.labels),  category: "Vista", action: () => openPanel("labels") },
    { id: "properties",    label: t.palette.openPanel(t.sidebar.properties), category: "Vista", action: () => openPanel("properties") },
    { id: "viewComments",  label: t.palette.openPanel(t.sidebar.comments), category: "Vista", action: () => openPanel("comments") },
    { id: "todo",          label: t.palette.openPanel(t.sidebar.todo),    category: "Vista", action: () => openPanel("todo") },
    { id: "stats",         label: t.palette.openPanel(t.sidebar.stats),   category: "Vista", action: () => openPanel("stats") },
    { id: "quality",       label: t.palette.openPanel(t.sidebar.quality), category: "Vista", action: () => openPanel("quality") },
    { id: "backlinks",     label: t.palette.openPanel(t.sidebar.backlinks), category: "Vista", action: () => openPanel("backlinks") },
    { id: "findVault",     label: t.palette.openPanel(t.sidebar.search),  shortcut: "Ctrl+Shift+F", category: "Vista", action: () => openPanel("search") },
    { id: "searchReplacePanel", label: t.palette.openPanel(t.sidebar.searchReplace), category: "Vista", action: () => openPanel("searchReplace") },
    { id: "viewPdf",       label: t.palette.openPanel(t.sidebar.pdfPreview), category: "Vista", action: () => openPanel("pdfPreview") },
    { id: "focusTimer",    label: t.palette.openPanel(t.sidebar.focusTimer), category: "Vista", action: () => openPanel("focusTimer") },
    { id: "panel:cloud",   label: t.palette.openPanel(t.sidebar.cloudSync), category: "Vista", action: () => openPanel("cloudSync") },
    { id: "panel:help",    label: t.palette.openPanel(t.sidebar.help),    category: "Vista", action: () => openPanel("help") },
    { id: "focus",         label: t.palette.focusMode,       shortcut: "F11",  category: "Vista", action: () => setFocusMode((f) => { const next = !f; showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info"); return next }) },
    { id: "typewriter", label: t.palette.typewriterMode,  shortcut: typewriterMode ? "✓" : "", category: "Vista", action: () => updateSettings({ typewriterMode: !typewriterMode }) },
    { id: "syncScroll", label: t.palette.syncScroll,      shortcut: syncScroll ? "✓" : "",     category: "Vista", action: () => updateSettings({ syncScroll: !syncScroll }) },
    { id: "wordWrap",    label: t.palette.wordWrap,        shortcut: wordWrap ? "✓" : "",       category: "Vista", action: () => updateSettings({ wordWrap: !wordWrap }) },
    { id: "minimap",     label: t.palette.minimap,         shortcut: minimapEnabled ? "✓" : "", category: "Vista", action: () => updateSettings({ minimapEnabled: !minimapEnabled }) },
    { id: "spellcheck",  label: t.palette.spellcheck,      shortcut: spellcheck ? "✓" : "",     category: "Vista", action: () => updateSettings({ spellcheck: !spellcheck }) },

    // ── Exportar ─────────────────────────────────────────────────────────────
    { id: "exportTex",  label: t.palette.exportTex,        category: "Exportar", action: handleExportTex },
    { id: "exportProjectTex", label: t.palette.exportProjectTex, category: "Exportar", action: handleExportProjectTex },
    { id: "compileLatexPdf", label: t.palette.compileLatexPdf, category: "Exportar", action: () => handleCompileLatexPdf({ forceWasm: false }) },
    { id: "compileWasmPdf",  label: t.palette.compileWasmPdf,  category: "Exportar", action: () => handleCompileLatexPdf({ forceWasm: true }) },
    { id: "exportPdf",  label: t.palette.exportPdf,         category: "Exportar", action: handleExportPdf },
    { id: "exportHtml", label: t.palette.exportHtml,        category: "Exportar", action: handleExportHtml },
    { id: "exportDocx", label: t.palette.exportDocx,        category: "Exportar", action: handleExportDocx },
    { id: "exportTypst", label: t.palette.exportTypst,      category: "Exportar", action: handleExportTypst },
    ...(deps?.typst ? [{ id: "exportTypstPdf", label: t.palette.exportTypstPdf, category: "Exportar" as const, action: handleExportTypstPdf }] : []),
    { id: "exportBeamer", label: t.palette.exportBeamer,    category: "Exportar", action: handleExportBeamer },
    { id: "exportReveal", label: t.palette.exportReveal,    category: "Exportar", action: handleExportReveal },
    { id: "exportObsidian", label: t.palette.exportObsidian, category: "Exportar", action: handleExportObsidian },
    { id: "exportAnki", label: t.palette.exportAnkiCards,   category: "Exportar", action: handleExportAnki },
    { id: "importDoc",  label: t.palette.importDoc,         category: "Exportar", action: handleImportDocument },
    { id: "copyHtml",   label: t.palette.copyHtml,          category: "Exportar", action: handleCopyHtml },
    { id: "copyLatex",  label: t.palette.copyLatex,         category: "Exportar", action: handleCopyLatex },
    { id: "vaultBackup", label: t.palette.vaultBackup,      category: "Exportar", action: handleVaultBackup },

    // ── IA ──────────────────────────────────────────────────────────────────
    { id: "ai:open",   label: t.palette.openAi, shortcut: "Ctrl+Shift+A", category: "IA", action: () => openPanel("ai") },
    { id: "ai:cmdk",   label: t.palette.aiInlineEdit, shortcut: "Ctrl+K", category: "IA", action: () => openCmdkRef.current?.() },

    // ── Vault ────────────────────────────────────────────────────────────────
    { id: "vault",     label: t.palette.openVault,       category: "Vault", action: vault.selectVault },
    { id: "template",  label: t.palette.newFromTemplate, category: "Vault", action: () => setTemplateOpen(true) },
    { id: "dailyNote", label: t.palette.openDailyNote,   shortcut: "Ctrl+Shift+D", category: "Vault", action: handleOpenDailyNote },
    { id: "macros",    label: t.palette.editMacros,      category: "Vault", action: handleOpenMacros },
    { id: "bib",       label: t.palette.editBib,         category: "Vault", action: handleOpenBib },
    { id: "settings",  label: t.palette.settings,        category: "Vault", action: () => setSettingsOpen(true) },
    { id: "checkUpdates", label: t.palette.checkUpdates, category: "Vault", action: () => checkForUpdate().then(info => { setUpdateInfo(info); if (!info.available) showToast(t.app.upToDate) }) },
    { id: "addComment", label: t.palette.addComment,     shortcut: "Ctrl+Shift+M", category: "Vault", action: () => { void handleAddCommentAtCursor() } },
    { id: "toggleCommentResolved", label: t.palette.toggleCommentResolved, category: "Vault", action: handleToggleCommentAtCursor },
    { id: "onboarding", label: t.palette.showOnboarding, category: "Vault", action: () => setOnboardingOpen(true) },
    { id: "help",      label: t.palette.shortcuts,       shortcut: "?", category: "Vault", action: () => setHelpOpen(true) },

    // ── Navegación ───────────────────────────────────────────────────────────
    { id: "goBack",    label: t.palette.goBack,    shortcut: "Alt+←", category: "Navegación", action: goBack },
    { id: "goForward", label: t.palette.goForward, shortcut: "Alt+→", category: "Navegación", action: goForward },
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
        { label: t.menus.exportTypst,      disabled: !hasFile, action: handleExportTypst },
        // The Typst→PDF entry is offered only when the optional `typst` binary is present.
        ...(deps?.typst ? [{ label: t.menus.exportTypstPdf, disabled: !hasFile, action: handleExportTypstPdf } as MenuEntry] : []),
        { separator: true },
        { label: t.menus.importDoc,        disabled: !hasVault, action: handleImportDocument },
        ...recentEntries,
      ],
    },
    {
      label: t.menus.edit,
      entries: [
        { label: t.menus.findInFile,      shortcut: "Ctrl+F",       disabled: !hasFile, action: handleFind },
        { label: t.menus.searchVault,     shortcut: "Ctrl+Shift+F",                     action: () => openPanel("search") },
        { separator: true },
        { label: t.menus.commandPalette,  shortcut: "Ctrl+P",                           action: () => setPaletteOpen(true) },
      ],
    },
    {
      label: t.menus.view,
      entries: [
        { label: t.menus.focusMode,       shortcut: "F11", action: () => setFocusMode((f) => { const next = !f; showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info"); return next }) },
        { separator: true },
        { label: t.menus.files,    action: () => openPanel("files") },
        { label: t.menus.search,   action: () => openPanel("search") },
        { label: t.menus.outline,  action: () => openPanel("outline") },
        { label: t.sidebar.backlinks, action: () => openPanel("backlinks") },
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
        <GitBar vaultPath={vault.vaultPath} />
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
                onSelectVault={() => { void vault.selectVault() }}
                onOpenFile={handleOpenFileNode}
                onCreateFile={vault.createFile}
                onCreateFolder={vault.createFolder}
                onDeleteFile={vault.deleteFile}
                onRenameFile={handleRenameFile}
                onMoveFile={vault.moveFile}
                conflictPaths={cloudConflictPaths}
                onConflictClick={() => openPanel("cloudSync")}
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
                  config={{
                    workMin: settings.pomodoroWorkMin,
                    breakMin: settings.pomodoroBreakMin,
                    longBreakMin: settings.pomodoroLongBreakMin,
                    cyclesBeforeLongBreak: settings.pomodoroCyclesBeforeLongBreak,
                  }}
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
                  renderHtml={(md) => sanitizeRenderedHtml(
                    renderMarkdown(md, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver)
                  )}
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
                  // Smooth caret animation keeps the GPU compositor busy (~6% CPU
                // on Linux/WebKitGTK). The visual gain isn't worth it.
                cursorSmoothCaretAnimation: "off",
                // Default "blink" repaints the cursor every 500 ms which keeps
                // the compositor thread alive. "solid" eliminates that idle
                // repaint without harming usability.
                cursorBlinking: "solid",
                }}
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
