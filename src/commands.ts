// Extracted from App.tsx: the Command Palette entries factory. Declarative
// data built from handlers + translations — moved verbatim (no behavior
// change) to keep App.tsx smaller. See CLAUDE.md — App.tsx is a documented
// refactor target.
import type { RefObject } from "react"
import type { PaletteCommand } from "./CommandPalette"
import type { SidebarMode } from "./App"
import type { T } from "./i18n"
import type { DepStatus } from "./checkDeps"
import type { Settings } from "./useSettings"
import type { useExportActions } from "./useExportActions"
import type { UpdateInfo } from "./useUpdater"
import { showToast } from "./toastService"
import { COMPLETIONS } from "./monacoSetup"

export interface PaletteCommandsCtx {
  t: T
  deps: DepStatus | null
  exportActions: ReturnType<typeof useExportActions>
  handleSave: () => void
  handleSaveAs: () => void
  handleFind: () => void
  openPanel: (m: SidebarMode) => void
  palInsert: (snippet: string) => void
  setTableEditorOpen: (open: boolean) => void
  handleNormalizeTable: () => void
  handleRegenerateFolderFiles: () => void
  handleSplitIntoSections: () => void
  handleFillGaps: (scope?: "cursor" | "all") => void
  toggleFocusPopover: () => void
  handleInsertToc: () => void
  handleInsertExcalidraw: () => void
  setCitationManagerOpen: (open: boolean) => void
  setFocusMode: (fn: (f: boolean) => boolean) => void
  typewriterMode: boolean
  syncScroll: boolean
  wordWrap: boolean
  minimapEnabled: boolean
  spellcheck: boolean
  updateSettings: (partial: Partial<Settings>) => void
  handleCopyHtml: () => void
  handleCopyLatex: () => void
  handleVaultBackup: () => void
  openCmdkRef: RefObject<() => void>
  selectVault: () => void
  setTemplateOpen: (open: boolean) => void
  handleOpenDailyNote: () => void
  handleOpenMacros: () => void
  handleOpenBib: () => void
  setSettingsOpen: (open: boolean) => void
  checkForUpdate: () => Promise<UpdateInfo>
  setUpdateInfo: (info: UpdateInfo) => void
  handleAddCommentAtCursor: () => void
  handleToggleCommentAtCursor: () => void
  setOnboardingOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  goBack: () => void
  goForward: () => void
  handleShowInPdf: () => void
}

export function buildPaletteCommands(ctx: PaletteCommandsCtx): PaletteCommand[] {
  const {
    t, deps, exportActions, handleSave, handleSaveAs, handleFind, openPanel, palInsert,
    setTableEditorOpen, handleNormalizeTable, handleRegenerateFolderFiles, handleSplitIntoSections, handleFillGaps, toggleFocusPopover, handleInsertToc, handleInsertExcalidraw, setCitationManagerOpen,
    setFocusMode, typewriterMode, syncScroll, wordWrap, minimapEnabled, spellcheck,
    updateSettings, handleCopyHtml, handleCopyLatex, handleVaultBackup, openCmdkRef,
    selectVault, setTemplateOpen, handleOpenDailyNote, handleOpenMacros, handleOpenBib,
    setSettingsOpen, checkForUpdate, setUpdateInfo, handleAddCommentAtCursor,
    handleToggleCommentAtCursor, setOnboardingOpen, setHelpOpen, goBack, goForward,
    handleShowInPdf,
  } = ctx

  const snippetCommands: PaletteCommand[] = COMPLETIONS.map((completion, index) => {
    const normalizedLabel = completion.label.replace(/^:::/, "")
    return {
      id: `snippet:${index}:${completion.label}`,
      label: completion.label,
      description: completion.detail,
      keywords: [normalizedLabel, completion.detail, "snippet", "autocompletado"],
      category: "Insertar",
      action: () => palInsert(completion.snippet),
    }
  })

  return [
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
    { id: "fmt:normalizeTable", label: t.palette.normalizeTable, category: "Edición", keywords: ["tabla", "table", "columnas", "columns", "align"], action: handleNormalizeTable },
    { id: "ai:fillGap",  label: t.aiGaps.fillAtCursor, category: "Edición", keywords: ["hueco", "gap", "ia", "ai", "completar"], action: () => handleFillGaps("cursor") },
    { id: "ai:fillGaps", label: t.aiGaps.fillAll,      category: "Edición", keywords: ["huecos", "gaps", "ia", "ai", "completar", "todos"], action: () => handleFillGaps("all") },
    { id: "ins:gap",     label: t.aiGaps.insertGap,    category: "Insertar", keywords: ["hueco", "gap", "placeholder"], action: () => palInsert("{{? ${1:pista}}}") },
    { id: "doc:split", label: t.splitSections.command, category: "Edición", keywords: ["dividir", "split", "secciones", "sections", "transclusión"], action: handleSplitIntoSections },
    { id: "vault:regenerate", label: t.folderRules.regenerate, category: "Vault", keywords: ["tareas", "tasks", "calendario", "calendar", "índice", "index", "carpeta", "folder"], action: handleRegenerateFolderFiles },
    { id: "toc",        label: t.palette.insertToc,    shortcut: "Ctrl+Shift+O", category: "Insertar", action: handleInsertToc },
    { id: "ins:code",   label: t.palette.insertCodeBlock,  category: "Insertar", action: () => palInsert("```${1:lang}\n${2:código}\n```") },
    { id: "ins:quote",  label: t.toolbar.quote,        category: "Insertar", action: () => palInsert("> ${1:cita}") },
    { id: "ins:sep",    label: t.toolbar.separator,    category: "Insertar", action: () => palInsert("\n---\n") },
    { id: "ins:mathInline", label: t.toolbar.mathInline, category: "Insertar", action: () => palInsert("$${1}$") },
    { id: "ins:mathBlock",  label: t.toolbar.mathBlock,  category: "Insertar", action: () => palInsert("$$\n${1}\n$$") },
    { id: "ins:lineBreak", label: "Salto de línea", description: "Nueva línea", keywords: ["newline", "line break", "br"], category: "Insertar", action: () => palInsert("\n") },
    { id: "ins:snippets", label: "Snippets / autocompletado", description: "Todos los snippets del editor", keywords: ["flowchart", "example", "pseudocode", "truth", "graph", "plot", "commdiag"], category: "Insertar", children: snippetCommands },
    { id: "insertExcalidraw", label: t.palette.insertExcalidraw, keywords: ["excalidraw", ":::excalidraw", "dibujo", "drawing", "sketch"], category: "Insertar", action: handleInsertExcalidraw },
    { id: "ins:wikilink",     label: t.palette.insertWikilink,     keywords: ["wikilink", "[[", "enlace", "link"],                category: "Insertar", action: () => palInsert("[[${1:nota}]]") },
    { id: "ins:transclusion", label: t.palette.insertTransclusion, keywords: ["transclusion", "transclusión", "![["],            category: "Insertar", action: () => palInsert("![[${1:nota}]]") },
    { id: "ins:footnote",     label: t.palette.insertFootnote,     keywords: ["footnote", "nota al pie", "[^"],                  category: "Insertar", action: () => palInsert("${1:texto}[^${2:1}]\n\n[^${2:1}]: ${3:nota al pie}") },
    { id: "ins:citation",     label: t.palette.insertCitation,     keywords: ["citation", "cita", "bibtex", "[@"],               category: "Insertar", action: () => palInsert("[@${1:clave}]") },
    { id: "ins:figure",       label: t.palette.insertFigure,       keywords: ["figure", "figura", "imagen", "image", "#fig"],    category: "Insertar", action: () => palInsert("![${1:Leyenda}](${2:imagen.png}){#fig:${3:etiqueta}}") },
    { id: "ins:frontmatter",  label: t.palette.insertFrontmatter,  keywords: ["frontmatter", "yaml", "metadata", "título"],      category: "Insertar", action: () => palInsert("---\ntitle: ${1:Título}\nauthor: ${2:Autor}\ndate: ${3:" + new Date().toISOString().slice(0, 10) + "}\ntags: [${4}]\n---\n") },
    { id: "ins:envref",       label: t.palette.insertEnvRef,       keywords: ["referencia", "reference", "@def", "@thm", "envref"], category: "Insertar", action: () => palInsert("@${1:def}:${2:etiqueta}") },
    { id: "ins:callout", label: t.palette.insertCallout, keywords: ["callout", "admonition", "[!note]"], category: "Insertar", children: [
      { id: "callout:note",      label: "> [!NOTE]",      keywords: ["nota", "note"],           category: "Insertar", action: () => palInsert("> [!NOTE]\n> ${1:contenido}") },
      { id: "callout:warning",   label: "> [!WARNING]",   keywords: ["advertencia", "warning"], category: "Insertar", action: () => palInsert("> [!WARNING]\n> ${1:contenido}") },
      { id: "callout:tip",       label: "> [!TIP]",       keywords: ["consejo", "tip"],         category: "Insertar", action: () => palInsert("> [!TIP]\n> ${1:contenido}") },
      { id: "callout:important", label: "> [!IMPORTANT]", keywords: ["importante", "important"],category: "Insertar", action: () => palInsert("> [!IMPORTANT]\n> ${1:contenido}") },
    ] },

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
      { id: "op:sup",  label: t.toolbar.lbl_superscript, category: "Matemáticas", action: () => palInsert("sup(${1:x}, ${2:n})") },
      { id: "op:sub",  label: t.toolbar.lbl_subscript,   category: "Matemáticas", action: () => palInsert("sub(${1:x}, ${2:n})") },
      { id: "op:grad", label: t.toolbar.lbl_gradient,    category: "Matemáticas", action: () => palInsert("$\\nabla ${1:f}$") },
      { id: "op:inv",  label: t.toolbar.lbl_inverse,     category: "Matemáticas", action: () => palInsert("inv(${1:A})") },
      { id: "op:trans",label: t.toolbar.lbl_transpose,   category: "Matemáticas", action: () => palInsert("trans(${1:A})") },
      { id: "op:mat",  label: t.toolbar.lbl_matAuto,     category: "Matemáticas", action: () => palInsert("mat(${1:1}, ${2:2}, ${3:3}, ${4:4})") },
      { id: "op:matf", label: t.toolbar.lbl_matFixed,    category: "Matemáticas", action: () => palInsert("matf(${1:2}, ${2:3}, ${3:a}, ${4:b}, ${5:c}, ${6:d}, ${7:e}, ${8:f})") },
      { id: "op:matlit", label: t.toolbar.lbl_matLiteral, category: "Matemáticas", action: () => palInsert("[[${1:1},${2:2}],[${3:3},${4:4}]]") },
    ] },
    { id: "math:envs", label: t.toolbar.environments, category: "Matemáticas", children: [
      { id: "env:thm",   label: t.toolbar.lbl_theorem,     keywords: [":::theorem"],     category: "Matemáticas", action: () => palInsert(":::theorem[${1:título}]\n${2:enunciado}\n:::") },
      { id: "env:lem",   label: t.toolbar.lbl_lemma,       keywords: [":::lemma"],       category: "Matemáticas", action: () => palInsert(":::lemma[${1:título}]\n${2:enunciado}\n:::") },
      { id: "env:cor",   label: t.toolbar.lbl_corollary,   keywords: [":::corollary"],   category: "Matemáticas", action: () => palInsert(":::corollary\n${1:enunciado}\n:::") },
      { id: "env:prop",  label: t.toolbar.lbl_proposition, keywords: [":::proposition"], category: "Matemáticas", action: () => palInsert(":::proposition\n${1:enunciado}\n:::") },
      { id: "env:defn",  label: t.toolbar.lbl_definition,  keywords: [":::definition"],  category: "Matemáticas", action: () => palInsert(":::definition\n${1:definición}\n:::") },
      { id: "env:ex",    label: t.toolbar.lbl_example,     keywords: [":::example"],     category: "Matemáticas", action: () => palInsert(":::example\n${1:ejemplo}\n:::") },
      { id: "env:exc",   label: t.toolbar.lbl_exercise,    keywords: [":::exercise"],    category: "Matemáticas", action: () => palInsert(":::exercise\n${1:ejercicio}\n:::") },
      { id: "env:proof", label: t.toolbar.lbl_proof,       keywords: [":::proof"],       category: "Matemáticas", action: () => palInsert(":::proof\n${1:demostración}\n:::") },
      { id: "env:rem",   label: t.toolbar.lbl_remark,      keywords: [":::remark"],      category: "Matemáticas", action: () => palInsert(":::remark\n${1:observación}\n:::") },
      { id: "env:note",  label: t.toolbar.lbl_note,        keywords: [":::note"],        category: "Matemáticas", action: () => palInsert(":::note\n${1:nota}\n:::") },
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
    { id: "keep",          label: t.palette.openPanel(t.sidebar.keep),    category: "Vista", action: () => openPanel("keep") },
    { id: "properties",    label: t.palette.openPanel(t.sidebar.properties), category: "Vista", action: () => openPanel("properties") },
    { id: "viewComments",  label: t.palette.openPanel(t.sidebar.comments), category: "Vista", action: () => openPanel("comments") },
    { id: "todo",          label: t.palette.openPanel(t.sidebar.todo),    category: "Vista", action: () => openPanel("todo") },
    { id: "stats",         label: t.palette.openPanel(t.sidebar.stats),   category: "Vista", action: () => openPanel("stats") },
    { id: "quality",       label: t.palette.openPanel(t.sidebar.quality), category: "Vista", action: () => openPanel("quality") },
    { id: "backlinks",     label: t.palette.openPanel(t.sidebar.backlinks), category: "Vista", action: () => openPanel("backlinks") },
    { id: "findVault",     label: t.palette.openPanel(t.sidebar.search),  shortcut: "Ctrl+Shift+F", category: "Vista", action: () => openPanel("search") },
    { id: "searchReplacePanel", label: t.palette.openPanel(t.sidebar.searchReplace), category: "Vista", action: () => openPanel("searchReplace") },
    { id: "viewPdf",       label: t.palette.openPanel(t.sidebar.pdfPreview), category: "Vista", action: () => openPanel("pdfPreview") },
    { id: "focusTimer",    label: t.palette.openPanel(t.sidebar.focusTimer), category: "Vista", action: toggleFocusPopover },
    { id: "panel:cloud",   label: t.palette.openPanel(t.sidebar.cloudSync), category: "Vista", action: () => openPanel("cloudSync") },
    { id: "panel:help",    label: t.palette.openPanel(t.sidebar.help),    category: "Vista", action: () => openPanel("help") },
    { id: "focus",         label: t.palette.focusMode,       shortcut: "F11",  category: "Vista", action: () => setFocusMode((f) => { const next = !f; showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info"); return next }) },
    { id: "typewriter", label: t.palette.typewriterMode,  shortcut: typewriterMode ? "✓" : "", category: "Vista", action: () => updateSettings({ typewriterMode: !typewriterMode }) },
    { id: "syncScroll", label: t.palette.syncScroll,      shortcut: syncScroll ? "✓" : "",     category: "Vista", action: () => updateSettings({ syncScroll: !syncScroll }) },
    { id: "wordWrap",    label: t.palette.wordWrap,        shortcut: wordWrap ? "✓" : "",       category: "Vista", action: () => updateSettings({ wordWrap: !wordWrap }) },
    { id: "minimap",     label: t.palette.minimap,         shortcut: minimapEnabled ? "✓" : "", category: "Vista", action: () => updateSettings({ minimapEnabled: !minimapEnabled }) },
    { id: "spellcheck",  label: t.palette.spellcheck,      shortcut: spellcheck ? "✓" : "",     category: "Vista", action: () => updateSettings({ spellcheck: !spellcheck }) },

    // ── Exportar ─────────────────────────────────────────────────────────────
    { id: "exportTex",  label: t.palette.exportTex,        category: "Exportar", action: exportActions.handleExportTex },
    { id: "exportProjectTex", label: t.palette.exportProjectTex, category: "Exportar", action: exportActions.handleExportProjectTex },
    { id: "compileLatexPdf", label: t.palette.compileLatexPdf, category: "Exportar", action: () => exportActions.handleCompileLatexPdf({ forceWasm: false }) },
    { id: "compileWasmPdf",  label: t.palette.compileWasmPdf,  category: "Exportar", action: () => exportActions.handleCompileLatexPdf({ forceWasm: true }) },
    { id: "showInPdf",       label: t.palette.showInPdf,       category: "Exportar", action: handleShowInPdf },
    { id: "exportPdf",  label: t.palette.exportPdf,         category: "Exportar", action: exportActions.handleExportPdf },
    { id: "exportHtml", label: t.palette.exportHtml,        category: "Exportar", action: exportActions.handleExportHtml },
    { id: "exportDocx", label: t.palette.exportDocx,        category: "Exportar", action: exportActions.handleExportDocx },
    { id: "exportTypst", label: t.palette.exportTypst,      category: "Exportar", action: exportActions.handleExportTypst },
    ...(deps?.typst ? [{ id: "exportTypstPdf", label: t.palette.exportTypstPdf, category: "Exportar" as const, action: exportActions.handleExportTypstPdf }] : []),
    { id: "exportBeamer", label: t.palette.exportBeamer,    category: "Exportar", action: exportActions.handleExportBeamer },
    { id: "exportReveal", label: t.palette.exportReveal,    category: "Exportar", action: exportActions.handleExportReveal },
    { id: "exportObsidian", label: t.palette.exportObsidian, category: "Exportar", action: exportActions.handleExportObsidian },
    { id: "exportAnki", label: t.palette.exportAnkiCards,   category: "Exportar", action: exportActions.handleExportAnki },
    { id: "importDoc",  label: t.palette.importDoc,         category: "Exportar", action: exportActions.handleImportDocument },
    { id: "copyHtml",   label: t.palette.copyHtml,          category: "Exportar", action: handleCopyHtml },
    { id: "copyLatex",  label: t.palette.copyLatex,         category: "Exportar", action: handleCopyLatex },
    { id: "vaultBackup", label: t.palette.vaultBackup,      category: "Exportar", action: handleVaultBackup },

    // ── IA ──────────────────────────────────────────────────────────────────
    { id: "ai:open",   label: t.palette.openAi, shortcut: "Ctrl+Shift+A", category: "IA", action: () => openPanel("ai") },
    { id: "ai:cmdk",   label: t.palette.aiInlineEdit, shortcut: "Ctrl+K", category: "IA", action: () => openCmdkRef.current?.() },

    // ── Vault ────────────────────────────────────────────────────────────────
    { id: "vault",     label: t.palette.openVault,       category: "Vault", action: selectVault },
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
}
