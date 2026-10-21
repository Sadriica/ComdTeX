// Extracted from App.tsx: the Command Palette entries factory. Declarative
// data built from handlers + translations: moved verbatim (no behavior
// change) to keep App.tsx smaller. See CLAUDE.md: App.tsx is a documented
// refactor target.
import { createElement, type RefObject } from "react"
import type { editor as MonacoEditor } from "monaco-editor"
import type { CursorContext, PaletteCommand, PaletteMode } from "./paletteTypes"
import { inlineToDisplayEdit, envTypeEdit } from "./cursorContext"
import { ALL_ENVS } from "./environments"
import { canNavigateAt, findUsages, goToDefinition } from "./editorNavigation"
import type { SidebarMode } from "./App"
import type { T } from "./i18n"
import type { DepStatus } from "./checkDeps"
import type { Settings } from "./useSettings"
import type { useExportActions } from "./useExportActions"
import type { UpdateInfo } from "./useUpdater"
import { showToast } from "./toastService"
import { COMPLETIONS } from "./monacoSetup"

/** Small coloured highlight swatch (CSS, `--mark-*` tokens) for the palette. */
const swatch = (colour: string) =>
  createElement("span", { className: `hl-swatch hl-swatch-${colour}`, "aria-hidden": true })

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
  /** Opens the palette in a mode (cite for citations, labels for references). */
  openPalette: (mode: PaletteMode, intent?: "insert") => void
  /** The live editor, for the contextual "Here" edits (null with no file open). */
  editorRef: RefObject<MonacoEditor.IStandaloneCodeEditor | null>
}

/**
 * Applies a single-line edit computed against the cursor context captured when
 * the palette opened, but only if that line still reads the same in the same
 * model. Returns false (and edits nothing) when the buffer moved on.
 */
export function applyGuardedLineEdit(
  editor: MonacoEditor.IStandaloneCodeEditor,
  modelUri: string | undefined,
  lineNumber: number,
  expectedLine: string,
  edit: { startColumn: number; endColumn: number; text: string },
): boolean {
  const model = editor.getModel()
  if (!model) return false
  if (modelUri !== undefined && model.uri.toString() !== modelUri) return false
  if (lineNumber < 1 || lineNumber > model.getLineCount()) return false
  if (model.getLineContent(lineNumber) !== expectedLine) return false
  editor.executeEdits("palette-here", [
    {
      range: {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: edit.startColumn,
        endColumn: edit.endColumn,
      },
      text: edit.text,
    },
  ])
  editor.focus()
  return true
}

export function buildPaletteCommands(ctx: PaletteCommandsCtx): PaletteCommand[] {
  const {
    t,
    deps,
    exportActions,
    handleSave,
    handleSaveAs,
    handleFind,
    openPanel,
    palInsert,
    setTableEditorOpen,
    handleNormalizeTable,
    handleRegenerateFolderFiles,
    handleSplitIntoSections,
    handleFillGaps,
    toggleFocusPopover,
    handleInsertToc,
    handleInsertExcalidraw,
    setCitationManagerOpen,
    setFocusMode,
    typewriterMode,
    syncScroll,
    wordWrap,
    minimapEnabled,
    spellcheck,
    updateSettings,
    handleCopyHtml,
    handleCopyLatex,
    handleVaultBackup,
    openCmdkRef,
    selectVault,
    setTemplateOpen,
    handleOpenDailyNote,
    handleOpenMacros,
    handleOpenBib,
    setSettingsOpen,
    checkForUpdate,
    setUpdateInfo,
    handleAddCommentAtCursor,
    handleToggleCommentAtCursor,
    setOnboardingOpen,
    setHelpOpen,
    goBack,
    goForward,
    handleShowInPdf,
    openPalette,
    editorRef,
  } = ctx

  // Snippet placeholders are written as `${1:@text}` and localized here, so the
  // inserted skeleton reads in the interface language.
  const ph = t.palette.ph as Record<string, string>
  const ins = (snippet: string) =>
    palInsert(
      snippet.replace(
        /\$\{(\d+):@(\w+)\}/g,
        (_m, n: string, key: string) => `\${${n}:${ph[key] ?? key}}`,
      ),
    )

  const snippetCommands: PaletteCommand[] = COMPLETIONS.map((completion, index) => {
    const normalizedLabel = completion.label.replace(/^:::/, "")
    return {
      id: `snippet:${index}:${completion.label}`,
      label: completion.label,
      description: completion.detail,
      keywords: [normalizedLabel, completion.detail, "snippet", "autocompletado"],
      category: "Insertar",
      action: () => ins(completion.snippet),
    }
  })

  const applyLineEdit = (
    c: CursorContext,
    lineNumber: number,
    expectedLine: string,
    edit: { startColumn: number; endColumn: number; text: string } | null,
  ) => {
    const editor = editorRef.current
    if (!editor || !edit) return
    if (!applyGuardedLineEdit(editor, c.modelUri, lineNumber, expectedLine, edit)) {
      showToast(t.palette.here.staleEdit, "info")
    }
  }

  // Contextual commands: only offered where they apply, and listed first in the
  // "Here" group of the empty commands view.
  const hereCommands: PaletteCommand[] = [
    {
      id: "here:mathToDisplay",
      label: t.palette.here.mathToDisplay,
      keywords: ["display", "block", "$$", "bloque", "math", "matemáticas"],
      category: "Matemáticas",
      when: (c) => c.inMath === "inline",
      action: (c) => {
        if (c) applyLineEdit(c, c.lineNumber, c.line, inlineToDisplayEdit(c.line, c.column))
      },
    },
    {
      id: "nav:goToDefinition",
      label: t.editorNav.goToDefinition,
      keywords: ["definition", "definición", "follow", "link"],
      category: "Navegación",
      here: (c) =>
        canNavigateAt(
          { getLineContent: () => c.line },
          { lineNumber: c.lineNumber, column: c.column },
        ),
      action: () => {
        const editor = editorRef.current
        if (editor) void goToDefinition(editor)
      },
    },
    {
      id: "nav:findUsages",
      label: t.editorNav.findUsages,
      keywords: ["references", "usages", "usos", "referencias"],
      category: "Navegación",
      here: (c) =>
        canNavigateAt(
          { getLineContent: () => c.line },
          { lineNumber: c.lineNumber, column: c.column },
        ),
      action: () => {
        const editor = editorRef.current
        if (editor) void findUsages(editor)
      },
    },
    {
      id: "nav:quickFix",
      label: t.palette.quickFix,
      keywords: ["fix", "arreglar", "lint", "warning", "code action"],
      category: "Edición",
      action: () => {
        const editor = editorRef.current
        editor?.focus()
        void editor?.getAction("editor.action.quickFix")?.run()
      },
    },
    {
      id: "here:envType",
      label: t.palette.here.changeEnvType,
      keywords: ["environment", "entorno", "theorem", "lemma", "cambiar"],
      category: "Matemáticas",
      when: (c) => !!c.block && c.block.type in ALL_ENVS,
      children: Object.keys(ALL_ENVS).map((type) => ({
        id: `here:envType:${type}`,
        label: type,
        category: "Matemáticas" as const,
        action: (c) => {
          if (!c?.block) return
          const opener = c.blockOpener
          if (opener != null) applyLineEdit(c, c.block.startLine, opener, envTypeEdit(opener, type))
        },
      })),
    },
  ]

  return [
    ...hereCommands,
    // ── Edición ──────────────────────────────────────────────────────────────
    {
      id: "save",
      label: t.palette.save,
      category: "Edición",
      action: handleSave,
    },
    {
      id: "saveAs",
      label: t.palette.saveAs,
      category: "Edición",
      action: handleSaveAs,
    },
    {
      id: "find",
      label: t.palette.findInFile,
      category: "Edición",
      action: handleFind,
    },
    {
      id: "searchReplace",
      label: t.palette.searchReplace,
      category: "Edición",
      action: () => openPanel("searchReplace"),
    },
    {
      id: "fmt:bold",
      label: t.toolbar.bold,
      category: "Edición",
      action: () => ins("**${1:@text}**"),
    },
    {
      id: "fmt:italic",
      label: t.toolbar.italic,
      category: "Edición",
      action: () => ins("_${1:@text}_"),
    },
    {
      id: "fmt:underline",
      label: t.toolbar.underline,
      category: "Edición",
      action: () => ins("<u>${1:@text}</u>"),
    },
    {
      id: "fmt:strike",
      label: t.toolbar.strikethrough,
      category: "Edición",
      action: () => ins("~~${1:@text}~~"),
    },
    {
      id: "fmt:code",
      label: t.toolbar.inlineCode,
      category: "Edición",
      action: () => ins("`${1:@code}`"),
    },
    {
      id: "fmt:link",
      label: t.toolbar.link,
      category: "Edición",
      action: () => ins("[${1:@text}](${2:url})"),
    },
    {
      id: "fmt:highlight",
      label: t.toolbar.highlight,
      category: "Edición",
      children: [
        {
          id: "hl:yellow",
          label: t.toolbar.hlDefault,
          category: "Edición",
          icon: swatch("yellow"),
          action: () => ins("==${1:@text}=="),
        },
        {
          id: "hl:green",
          label: t.toolbar.hlGreen,
          category: "Edición",
          icon: swatch("green"),
          action: () => ins('<mark class="hl-green">${1:@text}</mark>'),
        },
        {
          id: "hl:blue",
          label: t.toolbar.hlBlue,
          category: "Edición",
          icon: swatch("blue"),
          action: () => ins('<mark class="hl-blue">${1:@text}</mark>'),
        },
        {
          id: "hl:purple",
          label: t.toolbar.hlPurple,
          category: "Edición",
          icon: swatch("purple"),
          action: () => ins('<mark class="hl-purple">${1:@text}</mark>'),
        },
        {
          id: "hl:orange",
          label: t.toolbar.hlOrange,
          category: "Edición",
          icon: swatch("orange"),
          action: () => ins('<mark class="hl-orange">${1:@text}</mark>'),
        },
        {
          id: "hl:red",
          label: t.toolbar.hlRed,
          category: "Edición",
          icon: swatch("red"),
          action: () => ins('<mark class="hl-red">${1:@text}</mark>'),
        },
        {
          id: "hl:pink",
          label: t.toolbar.hlPink,
          category: "Edición",
          icon: swatch("pink"),
          action: () => ins('<mark class="hl-pink">${1:@text}</mark>'),
        },
      ],
    },
    {
      id: "fmt:headings",
      label: t.toolbar.headings,
      category: "Edición",
      children: [
        {
          id: "h1",
          label: t.toolbar.lbl_heading1,
          category: "Edición",
          action: () => ins("# ${1:@title}"),
        },
        {
          id: "h2",
          label: t.toolbar.lbl_heading2,
          category: "Edición",
          action: () => ins("## ${1:@title}"),
        },
        {
          id: "h3",
          label: t.toolbar.lbl_heading3,
          category: "Edición",
          action: () => ins("### ${1:@title}"),
        },
      ],
    },
    {
      id: "fmt:lists",
      label: t.toolbar.list,
      category: "Edición",
      children: [
        {
          id: "list:ul",
          label: t.toolbar.lbl_list,
          category: "Edición",
          action: () => ins("- ${1:@item}\n- ${2:@item}\n- ${3:@item}"),
        },
        {
          id: "list:ol",
          label: t.toolbar.lbl_orderedList,
          category: "Edición",
          action: () => ins("1. ${1:@item}\n2. ${2:@item}\n3. ${3:@item}"),
        },
        {
          id: "list:task",
          label: t.toolbar.lbl_taskList,
          category: "Edición",
          action: () => ins("- [ ] ${1:@task}\n- [ ] ${2:@task}"),
        },
      ],
    },

    // ── Insertar ─────────────────────────────────────────────────────────────
    {
      id: "ins:table",
      label: t.palette.tableEditor,
      category: "Insertar",
      here: (c) => c.inTable,
      action: () => setTableEditorOpen(true),
    },
    {
      id: "fmt:normalizeTable",
      label: t.palette.normalizeTable,
      category: "Edición",
      here: (c) => c.inTable,
      keywords: ["tabla", "table", "columnas", "columns", "align"],
      action: handleNormalizeTable,
    },
    {
      id: "ai:fillGap",
      label: t.aiGaps.fillAtCursor,
      category: "Edición",
      here: (c) => c.onGap,
      keywords: ["hueco", "gap", "ia", "ai", "completar"],
      action: () => handleFillGaps("cursor"),
    },
    {
      id: "ai:fillGaps",
      label: t.aiGaps.fillAll,
      category: "Edición",
      keywords: ["huecos", "gaps", "ia", "ai", "completar", "todos"],
      action: () => handleFillGaps("all"),
    },
    {
      id: "ins:gap",
      label: t.aiGaps.insertGap,
      category: "Insertar",
      keywords: ["hueco", "gap", "placeholder"],
      action: () => ins("{{? ${1:@hint}}}"),
    },
    {
      id: "doc:split",
      label: t.splitSections.command,
      category: "Edición",
      keywords: ["dividir", "split", "secciones", "sections", "transclusión"],
      action: handleSplitIntoSections,
    },
    {
      id: "vault:regenerate",
      label: t.folderRules.regenerate,
      category: "Vault",
      keywords: [
        "tareas",
        "tasks",
        "calendario",
        "calendar",
        "índice",
        "index",
        "carpeta",
        "folder",
      ],
      action: handleRegenerateFolderFiles,
    },
    {
      id: "toc",
      label: t.palette.insertToc,
      category: "Insertar",
      action: handleInsertToc,
    },
    {
      id: "ins:code",
      label: t.palette.insertCodeBlock,
      category: "Insertar",
      action: () => ins("```${1:lang}\n${2:@code}\n```"),
    },
    {
      id: "ins:quote",
      label: t.toolbar.quote,
      category: "Insertar",
      action: () => ins("> ${1:@quote}"),
    },
    {
      id: "ins:sep",
      label: t.toolbar.separator,
      category: "Insertar",
      action: () => ins("\n---\n"),
    },
    {
      id: "ins:mathInline",
      label: t.toolbar.mathInline,
      category: "Insertar",
      action: () => ins("$${1}$"),
    },
    {
      id: "ins:mathBlock",
      label: t.toolbar.mathBlock,
      category: "Insertar",
      action: () => ins("$$\n${1}\n$$"),
    },
    {
      id: "ins:lineBreak",
      label: t.palette.lineBreak,
      description: t.palette.lineBreakHint,
      keywords: ["newline", "line break", "br", "salto de línea"],
      category: "Insertar",
      action: () => ins("\n"),
    },
    {
      id: "ins:snippets",
      label: t.palette.snippets,
      description: t.palette.snippetsHint,
      keywords: [
        "flowchart",
        "example",
        "pseudocode",
        "truth",
        "graph",
        "plot",
        "commdiag",
        "autocompletado",
        "autocomplete",
      ],
      category: "Insertar",
      children: snippetCommands,
    },
    {
      id: "insertExcalidraw",
      label: t.palette.insertExcalidraw,
      keywords: ["excalidraw", ":::excalidraw", "dibujo", "drawing", "sketch"],
      category: "Insertar",
      action: handleInsertExcalidraw,
    },
    {
      id: "ins:wikilink",
      label: t.palette.insertWikilink,
      keywords: ["wikilink", "[[", "enlace", "link"],
      category: "Insertar",
      action: () => ins("[[${1:@noteName}]]"),
    },
    {
      id: "ins:transclusion",
      label: t.palette.insertTransclusion,
      keywords: ["transclusion", "transclusión", "![["],
      category: "Insertar",
      action: () => ins("![[${1:@noteName}]]"),
    },
    {
      id: "ins:footnote",
      label: t.palette.insertFootnote,
      keywords: ["footnote", "nota al pie", "[^"],
      category: "Insertar",
      action: () => ins("${1:@text}[^${2:1}]\n\n[^${2:1}]: ${3:@footnote}"),
    },
    {
      id: "ins:citation",
      label: t.palette.insertCitation,
      keywords: ["citation", "cita", "bibtex", "[@"],
      category: "Insertar",
      action: () => openPalette("cite", "insert"),
    },
    {
      id: "ins:figure",
      label: t.palette.insertFigure,
      keywords: ["figure", "figura", "imagen", "image", "#fig"],
      category: "Insertar",
      action: () => ins("![${1:@caption}](${2:@imageFile}){#fig:${3:@label}}"),
    },
    {
      id: "ins:frontmatter",
      label: t.palette.insertFrontmatter,
      keywords: ["frontmatter", "yaml", "metadata", "título"],
      category: "Insertar",
      action: () =>
        ins(
          "---\ntitle: ${1:@title}\nauthor: ${2:@author}\ndate: ${3:" +
            new Date().toISOString().slice(0, 10) +
            "}\ntags: [${4}]\n---\n",
        ),
    },
    {
      id: "ins:envref",
      label: t.palette.insertEnvRef,
      keywords: ["referencia", "reference", "@def", "@thm", "envref"],
      category: "Insertar",
      action: () => openPalette("labels", "insert"),
    },
    {
      id: "ins:callout",
      label: t.palette.insertCallout,
      keywords: ["callout", "admonition", "[!note]"],
      category: "Insertar",
      children: [
        {
          id: "callout:note",
          label: "> [!NOTE]",
          keywords: ["nota", "note"],
          category: "Insertar",
          action: () => ins("> [!NOTE]\n> ${1:@content}"),
        },
        {
          id: "callout:warning",
          label: "> [!WARNING]",
          keywords: ["advertencia", "warning"],
          category: "Insertar",
          action: () => ins("> [!WARNING]\n> ${1:@content}"),
        },
        {
          id: "callout:tip",
          label: "> [!TIP]",
          keywords: ["consejo", "tip"],
          category: "Insertar",
          action: () => ins("> [!TIP]\n> ${1:@content}"),
        },
        {
          id: "callout:important",
          label: "> [!IMPORTANT]",
          keywords: ["importante", "important"],
          category: "Insertar",
          action: () => ins("> [!IMPORTANT]\n> ${1:@content}"),
        },
      ],
    },

    // ── Matemáticas ──────────────────────────────────────────────────────────
    {
      id: "math:symbols",
      label: t.toolbar.symbols,
      category: "Matemáticas",
      children: [
        {
          id: "sym:alpha",
          label: "α  \\alpha",
          category: "Matemáticas",
          action: () => ins("$\\alpha$"),
        },
        {
          id: "sym:beta",
          label: "β  \\beta",
          category: "Matemáticas",
          action: () => ins("$\\beta$"),
        },
        {
          id: "sym:gamma",
          label: "γ  \\gamma",
          category: "Matemáticas",
          action: () => ins("$\\gamma$"),
        },
        {
          id: "sym:delta",
          label: "δ  \\delta",
          category: "Matemáticas",
          action: () => ins("$\\delta$"),
        },
        {
          id: "sym:lambda",
          label: "λ  \\lambda",
          category: "Matemáticas",
          action: () => ins("$\\lambda$"),
        },
        {
          id: "sym:pi",
          label: "π  \\pi",
          category: "Matemáticas",
          action: () => ins("$\\pi$"),
        },
        {
          id: "sym:sigma",
          label: "σ  \\sigma",
          category: "Matemáticas",
          action: () => ins("$\\sigma$"),
        },
        {
          id: "sym:omega",
          label: "ω  \\omega",
          category: "Matemáticas",
          action: () => ins("$\\omega$"),
        },
        {
          id: "sym:infty",
          label: "∞  \\infty",
          category: "Matemáticas",
          action: () => ins("$\\infty$"),
        },
        {
          id: "sym:partial",
          label: "∂  \\partial",
          category: "Matemáticas",
          action: () => ins("$\\partial$"),
        },
        {
          id: "sym:nabla",
          label: "∇  \\nabla",
          category: "Matemáticas",
          action: () => ins("$\\nabla$"),
        },
        {
          id: "sym:times",
          label: "×  \\times",
          category: "Matemáticas",
          action: () => ins("$\\times$"),
        },
        {
          id: "sym:leq",
          label: "≤  \\leq",
          category: "Matemáticas",
          action: () => ins("$\\leq$"),
        },
        {
          id: "sym:geq",
          label: "≥  \\geq",
          category: "Matemáticas",
          action: () => ins("$\\geq$"),
        },
        {
          id: "sym:neq",
          label: "≠  \\neq",
          category: "Matemáticas",
          action: () => ins("$\\neq$"),
        },
        {
          id: "sym:approx",
          label: "≈  \\approx",
          category: "Matemáticas",
          action: () => ins("$\\approx$"),
        },
        {
          id: "sym:in",
          label: "∈  \\in",
          category: "Matemáticas",
          action: () => ins("$\\in$"),
        },
        {
          id: "sym:subset",
          label: "⊂  \\subset",
          category: "Matemáticas",
          action: () => ins("$\\subset$"),
        },
        {
          id: "sym:forall",
          label: "∀  \\forall",
          category: "Matemáticas",
          action: () => ins("$\\forall$"),
        },
        {
          id: "sym:exists",
          label: "∃  \\exists",
          category: "Matemáticas",
          action: () => ins("$\\exists$"),
        },
        {
          id: "sym:rarr",
          label: "→  \\rightarrow",
          category: "Matemáticas",
          action: () => ins("$\\rightarrow$"),
        },
        {
          id: "sym:Rarr",
          label: "⇒  \\Rightarrow",
          category: "Matemáticas",
          action: () => ins("$\\Rightarrow$"),
        },
      ],
    },
    {
      id: "math:ops",
      label: t.toolbar.mathOps,
      category: "Matemáticas",
      children: [
        {
          id: "op:frac",
          label: t.toolbar.lbl_fraction,
          category: "Matemáticas",
          action: () => ins("frac(${1:a}, ${2:b})"),
        },
        {
          id: "op:sqrt",
          label: t.toolbar.lbl_sqrt,
          category: "Matemáticas",
          action: () => ins("sqrt(${1:x})"),
        },
        {
          id: "op:root",
          label: t.toolbar.lbl_nthRoot,
          category: "Matemáticas",
          action: () => ins("root(${1:n}, ${2:x})"),
        },
        {
          id: "op:sum",
          label: t.toolbar.lbl_sum,
          category: "Matemáticas",
          action: () => ins("sum(${1:i=0}, ${2:n})"),
        },
        {
          id: "op:int",
          label: t.toolbar.lbl_integral,
          category: "Matemáticas",
          action: () => ins("int(${1:a}, ${2:b})"),
        },
        {
          id: "op:lim",
          label: t.toolbar.lbl_limit,
          category: "Matemáticas",
          action: () => ins("lim(${1:x}, ${2:0})"),
        },
        {
          id: "op:der",
          label: t.toolbar.lbl_derivative,
          category: "Matemáticas",
          action: () => ins("der(${1:f}, ${2:x})"),
        },
        {
          id: "op:pder",
          label: t.toolbar.lbl_partialDer,
          category: "Matemáticas",
          action: () => ins("pder(${1:f}, ${2:x})"),
        },
        {
          id: "op:sup",
          label: t.toolbar.lbl_superscript,
          category: "Matemáticas",
          action: () => ins("sup(${1:x}, ${2:n})"),
        },
        {
          id: "op:sub",
          label: t.toolbar.lbl_subscript,
          category: "Matemáticas",
          action: () => ins("sub(${1:x}, ${2:n})"),
        },
        {
          id: "op:grad",
          label: t.toolbar.lbl_gradient,
          category: "Matemáticas",
          action: () => ins("$\\nabla ${1:f}$"),
        },
        {
          id: "op:inv",
          label: t.toolbar.lbl_inverse,
          category: "Matemáticas",
          action: () => ins("inv(${1:A})"),
        },
        {
          id: "op:trans",
          label: t.toolbar.lbl_transpose,
          category: "Matemáticas",
          action: () => ins("trans(${1:A})"),
        },
        {
          id: "op:mat",
          label: t.toolbar.lbl_matAuto,
          category: "Matemáticas",
          action: () => ins("mat(${1:1}, ${2:2}, ${3:3}, ${4:4})"),
        },
        {
          id: "op:matf",
          label: t.toolbar.lbl_matFixed,
          category: "Matemáticas",
          action: () => ins("matf(${1:2}, ${2:3}, ${3:a}, ${4:b}, ${5:c}, ${6:d}, ${7:e}, ${8:f})"),
        },
        {
          id: "op:matlit",
          label: t.toolbar.lbl_matLiteral,
          category: "Matemáticas",
          action: () => ins("[[${1:1},${2:2}],[${3:3},${4:4}]]"),
        },
      ],
    },
    {
      id: "math:envs",
      label: t.toolbar.environments,
      category: "Matemáticas",
      children: [
        {
          id: "env:thm",
          label: t.toolbar.lbl_theorem,
          keywords: [":::theorem"],
          category: "Matemáticas",
          action: () => ins(":::theorem[${1:@title}]\n${2:@statement}\n:::"),
        },
        {
          id: "env:lem",
          label: t.toolbar.lbl_lemma,
          keywords: [":::lemma"],
          category: "Matemáticas",
          action: () => ins(":::lemma[${1:@title}]\n${2:@statement}\n:::"),
        },
        {
          id: "env:cor",
          label: t.toolbar.lbl_corollary,
          keywords: [":::corollary"],
          category: "Matemáticas",
          action: () => ins(":::corollary\n${1:@statement}\n:::"),
        },
        {
          id: "env:prop",
          label: t.toolbar.lbl_proposition,
          keywords: [":::proposition"],
          category: "Matemáticas",
          action: () => ins(":::proposition\n${1:@statement}\n:::"),
        },
        {
          id: "env:defn",
          label: t.toolbar.lbl_definition,
          keywords: [":::definition"],
          category: "Matemáticas",
          action: () => ins(":::definition\n${1:@definition}\n:::"),
        },
        {
          id: "env:ex",
          label: t.toolbar.lbl_example,
          keywords: [":::example"],
          category: "Matemáticas",
          action: () => ins(":::example\n${1:@example}\n:::"),
        },
        {
          id: "env:exc",
          label: t.toolbar.lbl_exercise,
          keywords: [":::exercise"],
          category: "Matemáticas",
          action: () => ins(":::exercise\n${1:@exercise}\n:::"),
        },
        {
          id: "env:proof",
          label: t.toolbar.lbl_proof,
          keywords: [":::proof"],
          category: "Matemáticas",
          action: () => ins(":::proof\n${1:@proof}\n:::"),
        },
        {
          id: "env:rem",
          label: t.toolbar.lbl_remark,
          keywords: [":::remark"],
          category: "Matemáticas",
          action: () => ins(":::remark\n${1:@remark}\n:::"),
        },
        {
          id: "env:note",
          label: t.toolbar.lbl_note,
          keywords: [":::note"],
          category: "Matemáticas",
          action: () => ins(":::note\n${1:@noteName}\n:::"),
        },
      ],
    },
    {
      id: "symbols",
      label: t.palette.symbolPicker,
      category: "Matemáticas",
      action: () => openPanel("symbols"),
    },

    // ── Vista (paneles) ──────────────────────────────────────────────────────
    {
      id: "panel:files",
      label: t.palette.openPanel(t.sidebar.files),
      category: "Vista",
      action: () => openPanel("files"),
    },
    {
      id: "outline",
      label: t.palette.openPanel(t.sidebar.outline),
      category: "Vista",
      action: () => openPanel("outline"),
    },
    {
      id: "equations",
      label: t.palette.openPanel(t.sidebar.equations),
      category: "Vista",
      action: () => openPanel("equations"),
    },
    {
      id: "environments",
      label: t.palette.openPanel(t.sidebar.environments),
      category: "Vista",
      action: () => openPanel("environments"),
    },
    {
      id: "citationManager",
      label: t.palette.openPanel(t.palette.citationManager),
      category: "Vista",
      action: () => setCitationManagerOpen(true),
    },
    {
      id: "graph",
      label: t.palette.openPanel(t.sidebar.graph),
      category: "Vista",
      action: () => openPanel("graph"),
    },
    {
      id: "tags",
      label: t.palette.openPanel(t.sidebar.tags),
      category: "Vista",
      action: () => openPanel("tags"),
    },
    {
      id: "labels",
      label: t.palette.openPanel(t.sidebar.labels),
      category: "Vista",
      action: () => openPanel("labels"),
    },
    {
      id: "keep",
      label: t.palette.openPanel(t.sidebar.keep),
      category: "Vista",
      action: () => openPanel("keep"),
    },
    {
      id: "properties",
      label: t.palette.openPanel(t.sidebar.properties),
      category: "Vista",
      action: () => openPanel("properties"),
    },
    {
      id: "viewComments",
      label: t.palette.openPanel(t.sidebar.comments),
      category: "Vista",
      action: () => openPanel("comments"),
    },
    {
      id: "todo",
      label: t.palette.openPanel(t.sidebar.todo),
      category: "Vista",
      action: () => openPanel("todo"),
    },
    {
      id: "stats",
      label: t.palette.openPanel(t.sidebar.stats),
      category: "Vista",
      action: () => openPanel("stats"),
    },
    {
      id: "quality",
      label: t.palette.openPanel(t.sidebar.quality),
      category: "Vista",
      action: () => openPanel("quality"),
    },
    {
      id: "backlinks",
      label: t.palette.openPanel(t.sidebar.backlinks),
      category: "Vista",
      action: () => openPanel("backlinks"),
    },
    {
      id: "findVault",
      label: t.palette.openPanel(t.sidebar.search),
      category: "Vista",
      action: () => openPanel("search"),
    },
    {
      id: "searchReplacePanel",
      label: t.palette.openPanel(t.sidebar.searchReplace),
      category: "Vista",
      action: () => openPanel("searchReplace"),
    },
    {
      id: "viewPdf",
      label: t.palette.openPanel(t.sidebar.pdfPreview),
      category: "Vista",
      action: () => openPanel("pdfPreview"),
    },
    {
      id: "focusTimer",
      label: t.palette.openPanel(t.sidebar.focusTimer),
      category: "Vista",
      action: toggleFocusPopover,
    },
    {
      id: "panel:cloud",
      label: t.palette.openPanel(t.sidebar.cloudSync),
      category: "Vista",
      action: () => openPanel("cloudSync"),
    },
    {
      id: "panel:help",
      label: t.palette.openPanel(t.sidebar.help),
      category: "Vista",
      action: () => openPanel("help"),
    },
    {
      id: "focus",
      label: t.palette.focusMode,
      category: "Vista",
      action: () =>
        setFocusMode((f) => {
          const next = !f
          showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info")
          return next
        }),
    },
    {
      id: "typewriter",
      label: t.palette.typewriterMode,
      checked: typewriterMode,
      category: "Vista",
      action: () => updateSettings({ typewriterMode: !typewriterMode }),
    },
    {
      id: "syncScroll",
      label: t.palette.syncScroll,
      checked: syncScroll,
      category: "Vista",
      action: () => updateSettings({ syncScroll: !syncScroll }),
    },
    {
      id: "wordWrap",
      label: t.palette.wordWrap,
      checked: wordWrap,
      category: "Vista",
      action: () => updateSettings({ wordWrap: !wordWrap }),
    },
    {
      id: "minimap",
      label: t.palette.minimap,
      checked: minimapEnabled,
      category: "Vista",
      action: () => updateSettings({ minimapEnabled: !minimapEnabled }),
    },
    {
      id: "spellcheck",
      label: t.palette.spellcheck,
      checked: spellcheck,
      category: "Vista",
      action: () => updateSettings({ spellcheck: !spellcheck }),
    },

    // ── Exportar ─────────────────────────────────────────────────────────────
    {
      id: "exportTex",
      label: t.palette.exportTex,
      category: "Exportar",
      action: exportActions.handleExportTex,
    },
    {
      id: "exportProjectTex",
      label: t.palette.exportProjectTex,
      category: "Exportar",
      action: exportActions.handleExportProjectTex,
    },
    {
      id: "compileLatexPdf",
      label: t.palette.compileLatexPdf,
      category: "Exportar",
      action: () => exportActions.handleCompileLatexPdf({ forceWasm: false }),
    },
    {
      id: "compileWasmPdf",
      label: t.palette.compileWasmPdf,
      category: "Exportar",
      action: () => exportActions.handleCompileLatexPdf({ forceWasm: true }),
    },
    { id: "showInPdf", label: t.palette.showInPdf, category: "Exportar", action: handleShowInPdf },
    {
      id: "compileTypstFilePdf",
      label: t.palette.compileTypstFilePdf,
      category: "Exportar",
      action: exportActions.handleCompileTypstFilePdf,
    },
    {
      id: "exportPdf",
      label: t.palette.exportPdf,
      category: "Exportar",
      action: exportActions.handleExportPdf,
    },
    {
      id: "exportHtml",
      label: t.palette.exportHtml,
      category: "Exportar",
      action: exportActions.handleExportHtml,
    },
    {
      id: "exportDocx",
      label: t.palette.exportDocx,
      category: "Exportar",
      action: exportActions.handleExportDocx,
    },
    {
      id: "exportTypst",
      label: t.palette.exportTypst,
      category: "Exportar",
      action: exportActions.handleExportTypst,
    },
    ...(deps?.typst
      ? [
          {
            id: "exportTypstPdf",
            label: t.palette.exportTypstPdf,
            category: "Exportar" as const,
            action: exportActions.handleExportTypstPdf,
          },
        ]
      : []),
    {
      id: "exportBeamer",
      label: t.palette.exportBeamer,
      category: "Exportar",
      action: exportActions.handleExportBeamer,
    },
    {
      id: "exportReveal",
      label: t.palette.exportReveal,
      category: "Exportar",
      action: exportActions.handleExportReveal,
    },
    {
      id: "exportObsidian",
      label: t.palette.exportObsidian,
      category: "Exportar",
      action: exportActions.handleExportObsidian,
    },
    {
      id: "exportAnki",
      label: t.palette.exportAnkiCards,
      category: "Exportar",
      action: exportActions.handleExportAnki,
    },
    {
      id: "importDoc",
      label: t.palette.importDoc,
      category: "Exportar",
      action: exportActions.handleImportDocument,
    },
    { id: "copyHtml", label: t.palette.copyHtml, category: "Exportar", action: handleCopyHtml },
    { id: "copyLatex", label: t.palette.copyLatex, category: "Exportar", action: handleCopyLatex },
    {
      id: "vaultBackup",
      label: t.palette.vaultBackup,
      category: "Exportar",
      action: handleVaultBackup,
    },

    // ── IA ──────────────────────────────────────────────────────────────────
    {
      id: "ai:open",
      label: t.palette.openAi,
      category: "IA",
      action: () => openPanel("ai"),
    },
    {
      id: "ai:cmdk",
      label: t.palette.aiInlineEdit,
      category: "IA",
      action: () => openCmdkRef.current?.(),
    },

    // ── Vault ────────────────────────────────────────────────────────────────
    { id: "vault", label: t.palette.openVault, category: "Vault", action: selectVault },
    {
      id: "template",
      label: t.palette.newFromTemplate,
      category: "Vault",
      action: () => setTemplateOpen(true),
    },
    {
      id: "dailyNote",
      label: t.palette.openDailyNote,
      category: "Vault",
      action: handleOpenDailyNote,
    },
    { id: "macros", label: t.palette.editMacros, category: "Vault", action: handleOpenMacros },
    { id: "bib", label: t.palette.editBib, category: "Vault", action: handleOpenBib },
    {
      id: "settings",
      label: t.palette.settings,
      category: "Vault",
      action: () => setSettingsOpen(true),
    },
    {
      id: "checkUpdates",
      label: t.palette.checkUpdates,
      category: "Vault",
      action: () =>
        checkForUpdate().then((info) => {
          setUpdateInfo(info)
          if (!info.available) showToast(t.app.upToDate)
        }),
    },
    {
      id: "addComment",
      label: t.palette.addComment,
      category: "Vault",
      action: () => {
        void handleAddCommentAtCursor()
      },
    },
    {
      id: "toggleCommentResolved",
      label: t.palette.toggleCommentResolved,
      category: "Vault",
      action: handleToggleCommentAtCursor,
    },
    {
      id: "onboarding",
      label: t.palette.showOnboarding,
      category: "Vault",
      action: () => setOnboardingOpen(true),
    },
    {
      id: "help",
      label: t.palette.shortcuts,
      category: "Vault",
      action: () => setHelpOpen(true),
    },

    // ── Navegación ───────────────────────────────────────────────────────────
    {
      id: "goBack",
      label: t.palette.goBack,
      category: "Navegación",
      action: goBack,
    },
    {
      id: "goForward",
      label: t.palette.goForward,
      category: "Navegación",
      action: goForward,
    },
  ]
}
