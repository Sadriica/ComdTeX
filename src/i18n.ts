import { createContext, useContext } from "react"

export type Lang = "en" | "es"

// ── Translation shape ─────────────────────────────────────────────────────────

export interface T {
  toolbar: {
    bold: string; italic: string; strikethrough: string; inlineCode: string
    headings: string; heading1: string; heading2: string; heading3: string
    insert: string; quote: string; separator: string; list: string
    orderedList: string; taskList: string; link: string; codeBlock: string
    mathInline: string; mathBlock: string
    mathOps: string; superscript: string; subscript: string
    fraction: string; sqrt: string; nthRoot: string; sum: string
    integral: string; limit: string; partialDer: string; derivative: string
    gradient: string; inverse: string; transpose: string
    decorators: string
    mathFonts: string
    greekLetters: string
    operators: string
    arrows: string
    environments: string
    theorem: string; lemma: string; corollary: string; proposition: string
    definition: string; example: string; exercise: string
    proof: string; remark: string; note: string
    structures: string; table: string; matAuto: string; matFixed: string; matLiteral: string
    more: string
    togglePreview: string
    symbolPicker: string
    // labels inside dropdowns
    lbl_heading1: string; lbl_heading2: string; lbl_heading3: string
    lbl_quote: string; lbl_separator: string; lbl_list: string
    lbl_orderedList: string; lbl_taskList: string; lbl_link: string; lbl_codeBlock: string
    lbl_superscript: string; lbl_subscript: string; lbl_fraction: string
    lbl_sqrt: string; lbl_nthRoot: string; lbl_sum: string; lbl_integral: string
    lbl_limit: string; lbl_partialDer: string; lbl_derivative: string
    lbl_gradient: string; lbl_inverse: string; lbl_transpose: string
    lbl_theorem: string; lbl_lemma: string; lbl_corollary: string
    lbl_proposition: string; lbl_definition: string; lbl_example: string
    lbl_exercise: string; lbl_proof: string; lbl_remark: string; lbl_note: string
    lbl_table: string; lbl_matAuto: string; lbl_matFixed: string; lbl_matLiteral: string
    // trig / math functions
    sin: string; cos: string; tan: string; cot: string; sec: string; csc: string
    exp: string; ln: string; log: string
  }

  fileTree: {
    noVault: string; openFolder: string
    newFile: string; newFolder: string; changeVault: string
    loading: string; noFiles: string
    filenamePlaceholder: string; folderPlaceholder: string
    open: string; rename: string; delete: string; deleteFolder: string
    confirmDelete: (name: string) => string
    confirmDeleteTitle: string
    vaultFiles: string
    newFileLabel: string; newFolderLabel: string
    renamingLabel: (name: string) => string
    folderLabel: (name: string) => string
    sortAZ: string; sortZA: string
    filterPlaceholder: string
    clearFilter: string
  }

  search: {
    placeholder: string; ariaLabel: string; searching: string
    noResults: string; limit: string
    count: (n: number) => string
    lineAriaLabel: (line: number, content: string) => string
    showLess: string; more: (n: number) => string
    toggleReplace: string; replacePlaceholder: string; replaceAll: string
    replaced: (n: number) => string
    regexTitle: string; caseSensitiveTitle: string
    errorPattern: string; errorSearching: string
    searchPlaceholder: string; replaceWithPlaceholder: string
  }

  outline: {
    noHeadings: string
    lineTitle: (n: number) => string
    totalWords: string
    wordsAbbr: string
  }

  backlinks: {
    noFile: string; searching: string
    links: (n: number) => string
    noLinks: string
  }

  settings: {
    title: string; language: string; editorFont: string; previewFont: string
    autosave: string; theme: string; vimMode: string; typewriterMode: string
    touchpadGestures: string; mathPreview: string; previewTheme: string; previewThemeSame: string
    dark: string; light: string; highContrast: string
    wordGoal: string; wordGoalOff: string; words: string
    wordWrap: string; minimap: string; spellcheck: string; syncScroll: string; previewVisible: string
    closeAriaLabel: string
    sectionEditor: string; sectionPreview: string; sectionGeneral: string
  }

  help: {
    title: string
    file: string; edit: string; view: string; editor: string; math: string
    save: string; saveAs: string; commandPalette: string; quickSwitcher: string
    findInFile: string; searchVault: string
    undo: string; redo: string; selectNextOccurrence: string
    focusMode: string; exitFocus: string; togglePreview: string; thisHelp: string
    zoomInOut: string; resetZoom: string; nextTab: string; prevTab: string; closeTab: string
    expandShorthand: string; navigatePlaceholders: string; autocompleteWikilink: string
    autoMatrix: string; fixedMatrix: string; markdownTable: string
  }

  templateModal: {
    title: string; filenameLabel: string; filenamePlaceholder: string
    cancel: string; create: string
    useTemplates: string; createTemplate: string
    namePlaceholder: string; descriptionPlaceholder: string
    saveTemplate: string; defaultDescription: string
    customBadge: string
    variablesHint: string
    closeAriaLabel: string
  }

  titleBar: {
    minimize: string; maximize: string; close: string; settings: string
  }

  statusBar: {
    macrosLoaded: string
    macros: (n: number) => string
    words: (n: number) => string
    chars: (n: number) => string
    selectedWords: (n: number) => string
    selectionTitle: string
    readingTimeTitle: string
    readingTime: (min: number) => string
    modeMarkdown: string; modeTex: string
    ln: string; col: string; goToLineTitle: string
    wordGoalTitle: (current: number, goal: number) => string
  }

  palette: {
    placeholder: string; noResults: string
    save: string; saveAs: string; exportTex: string; exportPdf: string; exportHtml: string
    findInFile: string; searchVault: string; focusMode: string; newFromTemplate: string
    editMacros: string; editBib: string; settings: string; shortcuts: string
    openVault: string; viewOutline: string; viewBacklinks: string
    viewTags: string; viewProperties: string; viewGraph: string
    viewTodo: string; viewEquations: string; viewStats: string
    insertToc: string; typewriterMode: string; syncScroll: string
    wordWrap: string; minimap: string; exportDocx: string
    spellcheck: string; exportBeamer: string
    goBack: string; goForward: string
    viewEnvironments: string; citationManager: string
    vaultBackup: string; copyHtml: string; copyLatex: string
    searchReplace: string; tableEditor: string; exportReveal: string
    checkUpdates: string
    exportAnkiCards: string
    symbolPicker: string
    exportProjectTex: string
    compileLatexPdf: string
    viewLabels: string
    viewQuality: string
  }

  ankiExport: {
    exportAnkiCards: string
    ankiNoCards: string
    ankiExported: (n: number) => string
  }

  quickSwitcher: {
    placeholder: string; noResults: string
    navigate: string; open: string; close: string
  }

  sidebar: {
    files: string; search: string; outline: string; backlinks: string; help: string
    tags: string; properties: string; graph: string
    todo: string; equations: string; stats: string; environments: string
    searchReplace: string; collapse: string; expand: string
    symbols: string
    labels: string
    quality: string
  }

  todo: {
    empty: string; all: string; pending: string; done: string
    summary: (done: number, total: number) => string
    markDone: string; markPending: string
  }

  equations: { empty: string; count: (n: number) => string; lineTitle: (n: number) => string }

  environments: {
    empty: string
    count: (n: number) => string
    types: Record<string, string>
    fileLineTitle: (fileName: string, line: number) => string
  }

  stats: {
    vault: string; content: string
    files: string; open: string; words: string; tags: string
    equations: string; figures: string; citations: string; wikilinks: string
    broken: (n: number) => string
  }

  brokenLinks: {
    createNote: (name: string) => string
    removeLink: string
    ignore: string
    noteCreated: (name: string) => string
    linkRemoved: string
    removeLinkError: (msg: string) => string
  }

  git: {
    noVault: string
    notRepo: string
    gitNotFound: string
    refresh: string
    noChanges: string
    staged: string
    changes: string
    untracked: string
    commitPlaceholder: string
    commit: string
    stageAll: string
    unstageAll: string
    stageOne: string
    unstageOne: string
    discard: string
    recentCommits: string
    initRepo: string
    initSuccess: string
    commitSuccess: string
    // remote
    fetch: string
    push: string
    pull: string
    fetchSuccess: string
    pushSuccess: string
    pullSuccess: string
    fetchError: (msg: string) => string
    pushError: (msg: string) => string
    pullError: (msg: string) => string
    // branches
    switchBranch: string
    newBranchPlaceholder: string
    newBranchSuccess: (name: string) => string
    newBranchError: (msg: string) => string
    // stash
    stash: string
    stashPop: string
    stashDrop: string
    stashList: string
    stashSuccess: string
    stashPopSuccess: string
    noStashes: string
    stashError: (msg: string) => string
    // panel
    showChanges: string
    hidePanel: string
    // remotes section
    remotes: string; reloadRemotes: string; noRemotes: string
    editRemoteUrl: string; removeRemote: string; addRemote: string
    remoteNamePlaceholder: string; remoteUrlPlaceholder: string
    remoteUpdated: (name: string) => string; remoteAdded: (name: string) => string
    remoteRemoved: (name: string) => string; confirmRemoveRemote: (name: string) => string
    remoteError: (msg: string) => string
    // config section
    configSection: string; configSaved: string; saveLocal: string
    // commits
    loadCommits: string
    // init state
    initGitRepo: string; recheckRepo: string
    // errors
    discardConfirm: (name: string) => string
    commitError: (msg: string) => string
    stageError: (msg: string) => string
    unstageError: (msg: string) => string
  }

  menus: {
    file: string; edit: string; view: string; vault: string
    openVault: string; newFromTemplate: string; save: string; saveAs: string
    exportMd: string; exportTex: string; exportPdf: string; exportDocx: string; exportBeamer: string
    exportReveal: string
    recent: string; clearRecent: string
    findInFile: string; searchVault: string; commandPalette: string
    focusMode: string; files: string; search: string; outline: string
    editMacros: string; editBib: string; settings: string; shortcuts: string
  }

  app: {
    subtitle: string; openFolder: string; dropImage: string
    f1: string; f2: string; f3: string; f4: string; f5: string
    pandocMissing: string; generatingPdf: string; pdfDone: string
    pandocError: (e: string) => string
    unsavedChanges: (names: string) => string
    imageAdded: (f: string) => string; imagePasted: (f: string) => string
    errCopyImage: (e: string) => string; errPasteImage: (e: string) => string
    noClipboardPath: string; noFilePath: string
    fileNotInVault: (name: string) => string
    dialogSelectVault: string; dialogExportMd: string
    dialogExportTex: string; dialogExportPdf: string
    exportDocxSuccess: string; exportDocxError: string
    exportBeamerSuccess: string; exportBeamerError: string
    backupSuccess: string; backupError: string
    copiedHtml: string; copiedLatex: string; copyError: string; bibSaved: string
    revealExportSuccess: string; revealExportError: string
    focusModeOn: string; focusModeOff: string
    upToDate: string
    bookmarks: string; noBookmarks: string; line: string; removeBookmark: string; bookmarkToggled: string
    noMainDocument: string
    pdfCompiledLocal: string
    compilationFailed: (err: string) => string
    pandocMissingDocx: string
    pandocMissingBeamer: string
    zipMissing: string
    htmlExported: string
    replaceError: (err: string) => string
    closeSplitPane: string
  }

  welcome: {
    tagline: string
    openExisting: string
    createNew: string
    features: string
    recents: string
    hint: string
    featureMath: string; featureMathDesc: string
    featureBib: string; featureBibDesc: string
    featureEnv: string; featureEnvDesc: string
    featureExport: string; featureExportDesc: string
  }

  vault: {
    nameEmpty: string; nameTooLong: string; nameInvalidChars: string
    nameStartsDot: string; nameReserved: string
    errorReading: (e: string) => string
    errorCreatingReadme: (e: string) => string
    binaryFile: (name: string) => string
    errorOpening: (name: string, e: string) => string
    errorCreating: (e: string) => string
    errorDeleting: (e: string) => string
    renamed: (name: string) => string
    errorRenaming: (e: string) => string
    errorCreatingFolder: (e: string) => string
    errorSaving: (e: string) => string
    fileChangedExternally: (name: string) => string
    recentlyClosed: string
    copiedLatex: string
    bookmarkToggled: string; bookmarks: string; noBookmarks: string; removeBookmark: string
    line: string
    renameRefactorConfirm: (old: string, newName: string, count: number) => string
    renameRefactorDone: (count: number) => string
    moved: (name: string) => string
    moveError: string
    replaceSuccess: (n: number) => string
    replaceError: string
  }

  helpPanel: {
    environments: string; shorthands: string; equations: string
    macros: string; bibtex: string; frontmatter: string; wikilinks: string
    templates: string; greekLetters: string; operators: string
    // environment card labels
    theorem1: string; lemma1: string; corollary1: string; proposition1: string
    definition1: string; example1: string; exercise1: string
    proofLabel: string; remarkLabel: string; noteLabel: string
    // environment card bodies
    thmBody: string; lemBody: string; corBody: string; propBody: string
    defBody: string; exBody: string; exerBody: string
    proofBody: string; remarkBody: string; noteBody: string
    // sizes
    compact: string; normal: string; large: string
    numbered: string; unnumbered: string
    // shorthand section
    intro1: string; intro2: string; intro3: string
    // operation groups
    operations: string; fraction: string; sqrt: string; nthRoot: string
    abs: string; norm: string; ceil: string; floor: string
    superSub: string; superscript: string; subscript: string; inverse: string; transpose: string
    decorators: string; hat: string; bar: string; tilde: string; dot: string; ddot: string; vector: string
    mathFonts: string; bold: string; calligraphic: string; blackboard: string
    sumsLimits: string; sum: string; integral: string; limit: string; derivative: string; partialDer: string
    matrices: string; matAuto: string; matFixed: string; matTable: string; matLiteral: string
    nesting: string
    // trig / math functions
    trigFunctions: string
    hpSin: string; hpCos: string; hpTan: string; hpCot: string; hpSec: string; hpCsc: string
    hpExp: string; hpLn: string; hpLog: string
    // equations section
    numberedEq: string; numberedNoLabel: string; refLabel: string; directRef: string
    structuralLabels: string; structuralLabelsDesc: string
    sectionLabelDesc: string; tableLabelDesc: string; envLabelDesc: string
    labelsPanelDesc: string; labelAutocompleteDesc: string
    qualityWorkflow: string; qualityWorkflowDesc: string
    projectMainDesc: string; projectTransclusionDesc: string
    projectExportDesc: string; localLatexCompileDesc: string; mathBacklinksDesc: string
    // macros
    macrosDesc: string; noArgs: string; withArgs: string
    // bibtex
    bibtexDesc: string; cite: string; citeNote: string
    // frontmatter
    fmTitle: string; fmAuthor: string; fmDate: string; fmTags: string
    // wikilinks
    wikilinkRow: string; wikilinkDesc: string
    // templates
    templatesDesc: string
    tplArticle: string; tplArticleDesc: string
    tplNotes: string; tplNotesDesc: string
    tplHomework: string; tplHomeworkDesc: string
    tplTheorems: string; tplTheoremsDesc: string
    tplResearch: string; tplResearchDesc: string
    // misc
    headingsNote: string; headingsPurpose: string
    // env intro
    envSyntaxCode: string; envSyntaxMid: string; envCapabilities: string
    // eq code block
    eqCodeBlock: string
    // env card syntax titles
    syntaxPythagoras: string; syntaxUniqueness: string
    syntaxContinuity: string; syntaxEvenFunction: string
    // inline example
    inlineExample: string
    // example title in environment card
    exampleTitle: string
    // mermaid diagrams section
    mermaid: string; mermaidDesc: string
    mermaidFlow: string; mermaidSeq: string; mermaidGantt: string
    // callouts section
    callouts: string; calloutsDesc: string
    calloutNote: string; calloutNoteDesc: string
    calloutWarning: string; calloutWarningDesc: string
    calloutTip: string; calloutTipDesc: string
    calloutImportant: string; calloutImportantDesc: string
    // footnotes section
    footnotes: string; footnotesDesc: string
    footnoteInline: string; footnoteInlineDesc: string
    footnoteDef: string; footnoteDefDesc: string
    // checkboxes section
    checkboxes: string; checkboxesDesc: string
    checkboxUnchecked: string; checkboxUncheckedDesc: string
    checkboxChecked: string; checkboxCheckedDesc: string
    // figures section
    figures: string; figuresDesc: string
    figureLabel: string; figureLabelDesc: string
    figureRef: string; figureRefDesc: string
    // user snippets section
    userSnippets: string; userSnippetsDesc: string
    userSnippetFormat: string; userSnippetFormatDesc: string
    userSnippetExample: string; userSnippetExampleDesc: string
    // html & media section
    htmlMedia: string
    htmlMediaDesc: string
    htmlImg: string; htmlImgDesc: string
    htmlVideo: string; htmlVideoDesc: string
    htmlYoutube: string; htmlYoutubeDesc: string
    htmlDetails: string; htmlDetailsDesc: string
    htmlMark: string; htmlMarkDesc: string
    htmlAllowed: string; htmlBlocked: string
    // pseudocode section
    pseudocode: string; pseudocodeDesc: string
    pseudocodeExample: string; pseudocodeKeywords: string
    pseudocodeSyntax: string; pseudocodeSyntaxAlt: string
    // truth table section
    truthTable: string; truthTableDesc: string; truthTableExample: string
    // graph visualizer section
    graphViz: string; graphVizDesc: string; graphVizExample: string
    // function plotter section
    functionPlot: string; functionPlotDesc: string; functionPlotExample: string
    // commutative diagram section
    commDiag: string; commDiagDesc: string; commDiagExample: string
    // symbol picker / math preview section
    symbolPickerHelp: string; symbolPickerDesc: string
    mathPreviewHelp: string; mathPreviewDesc: string
    // editor toggles & sidebar panels section
    editorToggles: string; editorTogglesIntro: string
    sidebarPanels: string; sidebarPanelsIntro: string
    toggleTypewriter: string; toggleTypewriterDesc: string
    toggleSyncScroll: string; toggleSyncScrollDesc: string
    toggleWordWrap: string; toggleWordWrapDesc: string
    toggleMinimap: string; toggleMinimapDesc: string
    toggleSpellcheck: string; toggleSpellcheckDesc: string
    panelEnvironments: string; panelEnvironmentsDesc: string
    panelLabels: string; panelLabelsDesc: string
    panelQuality: string; panelQualityDesc: string
  }

  labelsPanel: {
    title: string
    filterPlaceholder: string
    allTypes: string
    broken: string
    duplicates: string
    unused: string
    brokenSection: string
    duplicateChip: string
    unusedChip: string
  }

  citationManager: {
    title: string
    close: string
    noEntries: string
    noTitle: string
    confirmDelete: string
    deleteEntry: string
    addEntry: string
    yearPlaceholder: string
    titlePlaceholder: string
    authorPlaceholder: string
    keyPlaceholder: string
    add: string
    cancel: string
    save: string
    keyRequired: string
    keyExists: (key: string) => string
    venueJournal: string
    venueBooktitle: string
    venueSource: string
  }

  graphPanel: {
    noFiles: string
    resetView: string
    graphInfo: (nodes: number, edges: number) => string
    root: string
  }

  frontmatterPanel: {
    fieldTitle: string
    fieldAuthor: string
    fieldDate: string
    fieldAbstract: string
    fieldTags: string
    removeField: string
    addField: string
    fieldKeyPlaceholder: string
    fieldValuePlaceholder: string
    layoutSection: string
    paperSize: string
    paperA4: string
    paperLetter: string
    paperA5: string
    paperA3: string
    paperLegal: string
    headerLabel: string
    footerLabel: string
    headerFooterHint: string
    orientation: string
    portrait: string
    landscape: string
    left: string; center: string; right: string
  }

  tagPanel: {
    noFiles: string
    noTags: string
    addTagsHint: string
    filterPlaceholder: string
    typeAriaLabel: string
    allTypes: string
    fileCount: (n: number) => string
  }

  tabBar: {
    warningCount: (n: number) => string
    pin: string
    unpin: string
    pinAriaLabel: string
    unpinAriaLabel: string
  }

  tableEditor: {
    alignLeft: string
    alignCenter: string
    alignRight: string
    copyLatex: string
    latexCopied: string
    addRow: string
    removeRow: string
    addColumn: string
    removeColumn: string
    preview: string
    cancel: string
    insert: string
  }

  latexErrors: {
    title: string
    noDetails: string
    errorLabel: string
    warningLabel: string
    line: string
    context: string
    suggestion: string
    close: string
  }

  documentLab: {
    diagnostics: string
    compatibility: string
    project: string
    structure: string
    mathlinks: string
    quality: string
    errors: string
    warnings: string
    info: string
    noIssues: string
    noIssuesCompat: string
    noIssuesStructure: string
    noMathBacklinks: string
    noMainDoc: string
    mainDocument: string
    included: string
    missingEmbeds: string
    includedFiles: string
    missingEmbed: (name: string) => string
    references: (n: number) => string
    line: string
    searchLabel: string
    replaceLabel: string
    searching: string
    replacing: string
    search: string
    replaceAll: string
    replace: string
  }

  breadcrumb: {
    location: string
    back: string
    backTitle: string
    forward: string
    forwardTitle: string
  }

  searchReplace: {
    searchAriaLabel: string
    replaceAriaLabel: string
  }

  templates: Record<string, { name: string; description: string }>

  symbolPicker: {
    title: string
    searchPlaceholder: string
    all: string
  }
}

// ── Spanish ───────────────────────────────────────────────────────────────────

const es: T = {
  toolbar: {
    bold: "Negrita", italic: "Itálica", strikethrough: "Tachado", inlineCode: "Código inline",
    headings: "Encabezados", heading1: "Encabezado 1", heading2: "Encabezado 2", heading3: "Encabezado 3",
    insert: "Insertar", quote: "Cita", separator: "Separador", list: "Lista",
    orderedList: "Lista numerada", taskList: "Lista de tareas", link: "Enlace", codeBlock: "Bloque de código",
    mathInline: "Math inline", mathBlock: "Math bloque",
    mathOps: "Operaciones math", superscript: "Superíndice", subscript: "Subíndice",
    fraction: "Fracción", sqrt: "Raíz cuadrada", nthRoot: "Raíz n-ésima", sum: "Sumatoria",
    integral: "Integral", limit: "Límite", partialDer: "Derivada parcial", derivative: "Derivada",
    gradient: "Gradiente", inverse: "Inversa", transpose: "Transpuesta",
    decorators: "Decoradores",
    mathFonts: "Fuentes matemáticas",
    greekLetters: "Letras griegas",
    operators: "Operadores",
    arrows: "Flechas",
    environments: "Entornos",
    theorem: "Teorema", lemma: "Lema", corollary: "Corolario", proposition: "Proposición",
    definition: "Definición", example: "Ejemplo", exercise: "Ejercicio",
    proof: "Demostración", remark: "Observación", note: "Nota",
    structures: "Estructuras", table: "Tabla", matAuto: "Matriz auto", matFixed: "Matriz fija", matLiteral: "Matriz literal",
    more: "Más",
    togglePreview: "Toggle preview (Ctrl+Shift+P)",
    symbolPicker: "Selector de símbolos matemáticos",
    lbl_heading1: "H1  # Título", lbl_heading2: "H2  ## Título", lbl_heading3: "H3  ### Título",
    lbl_quote: "❝  Cita", lbl_separator: "—  Separador", lbl_list: "•  Lista",
    lbl_orderedList: "1. Lista numerada", lbl_taskList: "☐  Lista tareas",
    lbl_link: "🔗 Enlace", lbl_codeBlock: "``` Bloque código",
    lbl_superscript: "xⁿ  superíndice", lbl_subscript: "xₙ  subíndice",
    lbl_fraction: "½  fracción", lbl_sqrt: "√  raíz", lbl_nthRoot: "ⁿ√  raíz n-ésima",
    lbl_sum: "∑  sumatoria", lbl_integral: "∫  integral", lbl_limit: "lim  límite",
    lbl_partialDer: "∂  derivada parcial", lbl_derivative: "d  derivada",
    lbl_gradient: "∇  gradiente", lbl_inverse: "A⁻¹ inversa", lbl_transpose: "Aᵀ  transpuesta",
    lbl_theorem: "theorem   Teorema", lbl_lemma: "lemma     Lema", lbl_corollary: "corollary Corolario",
    lbl_proposition: "prop      Proposición", lbl_definition: "def       Definición",
    lbl_example: "example   Ejemplo", lbl_exercise: "exercise  Ejercicio",
    lbl_proof: "proof     Demostración", lbl_remark: "remark    Observación", lbl_note: "note      Nota",
    lbl_table: "tabla  table(Col1, Col2)", lbl_matAuto: "mat    auto-matriz",
    lbl_matFixed: "matf   matriz fija", lbl_matLiteral: "[[]]   matriz literal",
    sin: "Seno", cos: "Coseno", tan: "Tangente", cot: "Cotangente",
    sec: "Secante", csc: "Cosecante", exp: "Exponencial", ln: "Logaritmo natural", log: "Logaritmo",
  },

  fileTree: {
    noVault: "Sin vault", openFolder: "Abrir carpeta",
    newFile: "Nuevo archivo", newFolder: "Nueva carpeta", changeVault: "Cambiar vault",
    loading: "Cargando…", noFiles: "No hay archivos .md, .tex o .bib",
    filenamePlaceholder: "nombre.md", folderPlaceholder: "carpeta",
    open: "Abrir", rename: "Renombrar", delete: "Eliminar", deleteFolder: "Eliminar carpeta",
    confirmDelete: (name) => `¿Eliminar "${name}"?\nEsta acción no se puede deshacer.`,
    confirmDeleteTitle: "Confirmar eliminación",
    vaultFiles: "Archivos del vault",
    newFileLabel: "Nuevo archivo", newFolderLabel: "Nueva carpeta",
    renamingLabel: (name) => `Renombrar ${name}`,
    folderLabel: (name) => `Carpeta: ${name}`,
    sortAZ: "Ordenar A→Z", sortZA: "Ordenar Z→A",
    filterPlaceholder: "Filtrar archivos…",
    clearFilter: "Limpiar filtro",
  },

  search: {
    placeholder: "Buscar en vault…", ariaLabel: "Buscar en vault", searching: "Buscando…",
    noResults: "Sin resultados", limit: "Mostrando primeros 500 resultados",
    count: (n) => `${n} resultados`,
    lineAriaLabel: (line, content) => `Línea ${line}: ${content}`,
    showLess: "Mostrar menos", more: (n) => `+${n} más`,
    toggleReplace: "Buscar y reemplazar", replacePlaceholder: "Reemplazar con…",
    replaceAll: "Reemplazar todo", replaced: (n) => `${n} reemplazo${n !== 1 ? "s" : ""} realizado${n !== 1 ? "s" : ""}`,
    regexTitle: "Expresión regular (.*)", caseSensitiveTitle: "Distinguir mayúsculas (Aa)",
    errorPattern: "Expresión regular inválida", errorSearching: "Error al buscar en el vault",
    searchPlaceholder: "Buscar…", replaceWithPlaceholder: "Reemplazar con…",
  },

  outline: {
    noHeadings: "Sin encabezados",
    lineTitle: (n) => `Línea ${n}`,
    totalWords: "Total",
    wordsAbbr: "pal",
  },

  backlinks: {
    noFile: "Sin archivo abierto", searching: "Buscando...",
    links: (n) => `${n} enlace${n !== 1 ? "s" : ""} entrante${n !== 1 ? "s" : ""}`,
    noLinks: "Ninguna nota enlaza aquí",
  },

  settings: {
    title: "Configuración", language: "Idioma",
    editorFont: "Fuente del editor", previewFont: "Fuente del preview",
    autosave: "Autoguardado", theme: "Tema", vimMode: "Modo Vim",
    typewriterMode: "Modo máquina de escribir",
    touchpadGestures: "Gestos de touchpad",
    mathPreview: "Vista previa de ecuaciones",
    previewTheme: "Tema del preview", previewThemeSame: "Mismo que editor",
    dark: "Oscuro", light: "Claro", highContrast: "Alto contraste",
    wordGoal: "Meta de palabras", wordGoalOff: "Sin meta", words: "palabras",
    wordWrap: "Ajuste de línea", minimap: "Minimapa", spellcheck: "Corrector ortográfico",
    syncScroll: "Sincronizar scroll editor↔preview", previewVisible: "Mostrar preview",
    closeAriaLabel: "Cerrar configuración",
    sectionEditor: "Editor", sectionPreview: "Vista previa", sectionGeneral: "General",
  },

  help: {
    title: "Atajos de teclado",
    file: "Archivo", edit: "Editar", view: "Vista", editor: "Editor", math: "Math shorthands",
    save: "Guardar", saveAs: "Guardar como...", commandPalette: "Paleta de comandos", quickSwitcher: "Cambiador rápido",
    findInFile: "Buscar en archivo", searchVault: "Buscar en vault",
    undo: "Deshacer", redo: "Rehacer", selectNextOccurrence: "Seleccionar siguiente coincidencia",
    focusMode: "Modo enfoque (toggle)", exitFocus: "Salir modo enfoque",
    togglePreview: "Toggle preview", thisHelp: "Esta ayuda",
    zoomInOut: "Zoom in/out", resetZoom: "Reset zoom",
    nextTab: "Pestaña siguiente", prevTab: "Pestaña anterior", closeTab: "Cerrar pestaña",
    expandShorthand: "Expandir shorthand (frac, sqrt, mat…)",
    navigatePlaceholders: "Navegar entre placeholders de snippet",
    autocompleteWikilink: "Autocompletar wikilink",
    autoMatrix: "Matriz auto-dimensionada",
    fixedMatrix: "Matriz de dimensión fija",
    markdownTable: "Tabla markdown",
  },

  templateModal: {
    title: "Nuevo archivo desde plantilla",
    filenameLabel: "Nombre del archivo", filenamePlaceholder: "mi-documento.md",
    cancel: "Cancelar", create: "Crear",
    useTemplates: "Usar plantillas", createTemplate: "Crear plantilla",
    namePlaceholder: "Nombre de la plantilla", descriptionPlaceholder: "Descripción",
    saveTemplate: "Guardar plantilla", defaultDescription: "Plantilla personalizada",
    customBadge: "personal",
    variablesHint: "Variables",
    closeAriaLabel: "Cerrar",
  },

  titleBar: {
    minimize: "Minimizar", maximize: "Maximizar", close: "Cerrar", settings: "Configuración",
  },

  statusBar: {
    macrosLoaded: "Macros cargados",
    readingTime: (min) => `~${min} min`,
    macros: (n) => `${n} macros`,
    words: (n) => `${n} palabras`,
    chars: (n) => `${n} caracteres`,
    selectedWords: (n) => `${n} sel.`,
    selectionTitle: "Palabras seleccionadas",
    readingTimeTitle: "Tiempo de lectura estimado (~200 pal/min)",
    modeMarkdown: "Markdown", modeTex: "LaTeX",
    ln: "Ln", col: "Col", goToLineTitle: "Click para ir a línea",
    wordGoalTitle: (c, g) => `${c} / ${g} palabras`,
  },

  palette: {
    placeholder: "Buscar archivos y comandos...", noResults: "Sin resultados",
    save: "Guardar", saveAs: "Guardar como...", exportTex: "Exportar como .tex",
    exportPdf: "Exportar como PDF", exportHtml: "Exportar como HTML",
    findInFile: "Buscar en archivo",
    searchVault: "Buscar en vault", focusMode: "Modo enfoque",
    newFromTemplate: "Nuevo desde plantilla", editMacros: "Editar macros.md",
    editBib: "Editar references.bib", settings: "Configuración",
    shortcuts: "Atajos de teclado", openVault: "Abrir vault...",
    viewOutline: "Ver esquema", viewBacklinks: "Ver backlinks",
    viewTags: "Ver tags", viewProperties: "Ver propiedades", viewGraph: "Ver grafo",
    viewTodo: "Ver tareas", viewEquations: "Ver ecuaciones", viewStats: "Estadísticas del vault",
    insertToc: "Insertar índice (TOC)",
    typewriterMode: "Modo máquina de escribir (centrar cursor)",
    syncScroll: "Sincronizar scroll del preview",
    wordWrap: "Ajuste de línea",
    minimap: "Minimapa",
    exportDocx: "Exportar a DOCX",
    spellcheck: "Corrector ortográfico",
    exportBeamer: "Exportar presentación (Beamer)",
    goBack: "Atrás", goForward: "Adelante",
    viewEnvironments: "Ver entornos matemáticos",
    citationManager: "Gestor de citas",
    vaultBackup: "Hacer backup del vault (.zip)",
    copyHtml: "Copiar como HTML",
    copyLatex: "Copiar como LaTeX",
    searchReplace: "Buscar y reemplazar",
    tableEditor: "Editor de tabla",
    exportReveal: "Exportar presentación (Reveal.js)",
    checkUpdates: "Buscar actualizaciones",
    exportAnkiCards: "Exportar tarjetas Anki",
    symbolPicker: "Selector de símbolos matemáticos",
    exportProjectTex: "Exportar proyecto como .tex",
    compileLatexPdf: "Compilar PDF con LaTeX local",
    viewLabels: "Ver labels",
    viewQuality: "Diagnóstico de documento",
  },

  ankiExport: {
    exportAnkiCards: "Exportar tarjetas Anki",
    ankiNoCards: "No se encontraron bloques exportables",
    ankiExported: (n) => `${n} tarjeta${n !== 1 ? "s" : ""} exportada${n !== 1 ? "s" : ""}`,
  },

  quickSwitcher: {
    placeholder: "Buscar archivo…",
    noResults: "Sin resultados",
    navigate: "navegar", open: "abrir", close: "cerrar",
  },

  sidebar: {
    files: "Archivos", search: "Buscar", outline: "Esquema",
    backlinks: "Backlinks", help: "Ayuda",
    tags: "Tags", properties: "Propiedades", graph: "Grafo",
    todo: "Tareas", equations: "Ecuaciones", stats: "Estadísticas",
    environments: "Entornos",
    searchReplace: "Buscar y reemplazar",
    collapse: "Colapsar sidebar", expand: "Expandir sidebar",
    symbols: "Símbolos",
    labels: "Labels",
    quality: "Diagnóstico",
  },

  todo: {
    empty: "No hay tareas en los archivos abiertos",
    all: "Todas", pending: "Pendientes", done: "Hechas",
    summary: (done, total) => `${done}/${total} completadas`,
    markDone: "Marcar como hecha", markPending: "Marcar como pendiente",
  },

  equations: {
    empty: "No hay ecuaciones en este documento",
    count: (n) => `${n} ecuación${n !== 1 ? "es" : ""}`,
    lineTitle: (n) => `Línea ${n}`,
  },

  environments: {
    empty: "No hay entornos en los archivos abiertos",
    count: (n) => `${n} entorno${n === 1 ? "" : "s"}`,
    types: {
      theorem: "Teorema", lemma: "Lema", corollary: "Corolario",
      proposition: "Proposición", definition: "Definición",
      example: "Ejemplo", exercise: "Ejercicio",
      proof: "Demostración", remark: "Observación", note: "Nota",
    },
    fileLineTitle: (fileName, line) => `${fileName} — línea ${line}`,
  },

  stats: {
    vault: "Vault", content: "Contenido",
    files: "Archivos en vault", open: "Archivos abiertos", words: "Palabras (abiertos)",
    tags: "Tags únicos", equations: "Ecuaciones", figures: "Figuras",
    citations: "Citas", wikilinks: "Wikilinks",
    broken: (n) => `${n} enlace${n !== 1 ? "s" : ""} roto${n !== 1 ? "s" : ""}`,
  },

  brokenLinks: {
    createNote: (name) => `Crear nota "${name}"`,
    removeLink: "Eliminar enlace",
    ignore: "Ignorar",
    noteCreated: (name) => `Nota "${name}" creada.`,
    linkRemoved: "Enlace eliminado.",
    removeLinkError: (msg) => `Error al eliminar enlace: ${msg}`,
  },

  git: {
    noVault: "Abre un vault para usar Git.",
    notRepo: "Esta carpeta no es un repositorio Git.",
    gitNotFound: "Git no encontrado. Instálalo para usar esta función.",
    refresh: "Actualizar",
    noChanges: "Sin cambios en el repositorio.",
    staged: "Cambios preparados",
    changes: "Cambios",
    untracked: "Archivos sin seguimiento",
    commitPlaceholder: "Mensaje del commit (Ctrl+Enter)",
    commit: "Commit",
    stageAll: "Preparar todo",
    unstageAll: "Quitar todo",
    stageOne: "Preparar",
    unstageOne: "Quitar",
    discard: "Descartar cambios",
    recentCommits: "Commits recientes",
    initRepo: "Inicializar repositorio",
    initSuccess: "Repositorio Git inicializado.",
    commitSuccess: "Commit creado.",
    discardConfirm: (name) => `¿Descartar cambios en "${name}"? Esta acción no se puede deshacer.`,
    commitError: (msg) => `Error al hacer commit: ${msg}`,
    stageError: (msg) => `Error al preparar: ${msg}`,
    unstageError: (msg) => `Error al quitar: ${msg}`,
    fetch: "Fetch", push: "Push", pull: "Pull",
    fetchSuccess: "Fetch completado.", pushSuccess: "Push completado.", pullSuccess: "Pull completado.",
    fetchError: (msg) => `Error en fetch: ${msg}`,
    pushError: (msg) => `Error en push: ${msg}`,
    pullError: (msg) => `Error en pull: ${msg}`,
    switchBranch: "Cambiar rama", newBranchPlaceholder: "nueva-rama",
    newBranchSuccess: (name) => `Rama "${name}" creada.`,
    newBranchError: (msg) => `Error al crear rama: ${msg}`,
    stash: "Stash", stashPop: "Pop stash", stashDrop: "Descartar stash", stashList: "Lista de stashes",
    stashSuccess: "Cambios guardados en stash.", stashPopSuccess: "Stash aplicado.",
    noStashes: "No hay stashes.",
    stashError: (msg) => `Error en stash: ${msg}`,
    showChanges: "Mostrar cambios", hidePanel: "Ocultar panel",
    remotes: "Remotos", reloadRemotes: "Recargar remotos", noRemotes: "Sin remotos configurados",
    editRemoteUrl: "Editar URL", removeRemote: "Eliminar", addRemote: "Agregar remote",
    remoteNamePlaceholder: "nombre (ej. origin)", remoteUrlPlaceholder: "URL del repositorio",
    remoteUpdated: (name) => `Remote "${name}" actualizado.`,
    remoteAdded:   (name) => `Remote "${name}" agregado.`,
    remoteRemoved: (name) => `Remote "${name}" eliminado.`,
    confirmRemoveRemote: (name) => `¿Eliminar remote "${name}"?`,
    remoteError: (msg) => `Error en remote: ${msg}`,
    configSection: "Configuración", configSaved: "Configuración guardada.",
    saveLocal: "Guardar local", loadCommits: "Cargar commits",
    initGitRepo: "Inicializar repositorio Git", recheckRepo: "Verificar de nuevo",
  },

  menus: {
    file: "Archivo", edit: "Editar", view: "Ver", vault: "Vault",
    openVault: "Abrir vault...", newFromTemplate: "Nuevo desde plantilla",
    save: "Guardar", saveAs: "Guardar como...",
    exportMd: "Exportar como .md", exportTex: "Exportar como .tex", exportPdf: "Exportar como PDF",
    exportDocx: "Exportar a Word (.docx)",
    exportBeamer: "Exportar presentación Beamer (.pdf)",
    exportReveal: "Exportar Reveal.js",
    recent: "Recientes", clearRecent: "Limpiar recientes",
    findInFile: "Buscar en archivo", searchVault: "Buscar en vault",
    commandPalette: "Paleta de comandos", focusMode: "Modo enfoque",
    files: "Archivos", search: "Búsqueda", outline: "Esquema",
    editMacros: "Editar macros.md", editBib: "Editar references.bib",
    settings: "Configuración", shortcuts: "Atajos de teclado",
  },

  app: {
    subtitle: "Editor de Markdown + LaTeX para matemáticas y ciencias",
    openFolder: "Abrir carpeta", dropImage: "Soltar imagen aquí",
    f1: "∑ Entornos matemáticos: theorem, proof, definition…",
    f2: "∫ Numeración de ecuaciones y referencias cruzadas",
    f3: "📄 Plantillas académicas: artículo, apuntes, tarea…",
    f4: "🔗 Wikilinks entre notas, backlinks automáticos",
    f5: "📚 Bibliografía BibTeX con citas [@key]",
    pandocMissing: "pandoc no está instalado. Instálalo desde pandoc.org/installing.html — usando impresión del navegador como alternativa.",
    generatingPdf: "Generando PDF con pandoc…",
    pdfDone: "PDF generado correctamente",
    pandocError: (e) => `Error pandoc: ${e}`,
    unsavedChanges: (names) => `Tienes cambios sin guardar en: ${names}\n¿Salir de todos modos?`,
    imageAdded: (f) => `Imagen añadida: assets/${f}`,
    imagePasted: (f) => `Imagen pegada: assets/${f}`,
    errCopyImage: (e) => `Error copiando imagen: ${e}`,
    errPasteImage: (e) => `Error pegando imagen: ${e}`,
    noClipboardPath: "No se puede pegar imagen desde portapapeles: sin ruta de archivo",
    noFilePath: "No se pudo obtener la ruta del archivo",
    fileNotInVault: (name) => `Archivo no encontrado en el vault actual: ${name}`,
    dialogSelectVault: "Seleccionar carpeta del vault",
    dialogExportMd: "Exportar como Markdown",
    dialogExportTex: "Exportar como LaTeX",
    dialogExportPdf: "Exportar como PDF",
    exportDocxSuccess: "DOCX exportado",
    exportDocxError: "Error al exportar DOCX",
    exportBeamerSuccess: "Presentación exportada",
    exportBeamerError: "Error al exportar presentación",
    backupSuccess: "Backup creado",
    backupError: "Error al crear backup",
    copiedHtml: "HTML copiado",
    copiedLatex: "LaTeX copiado",
    copyError: "Error al copiar",
    bibSaved: "Referencias guardadas",
    revealExportSuccess: "Presentación exportada",
    revealExportError: "Error al exportar presentación",
    focusModeOn: "Modo enfoque activado",
    focusModeOff: "Modo enfoque desactivado",
    upToDate: "ComdTeX está al día",
    bookmarks: "Marcadores",
    noBookmarks: "No hay marcadores",
    line: "Línea",
    removeBookmark: "Quitar marcador",
    bookmarkToggled: "Marcador actualizado",
    noMainDocument: "No hay documento principal para exportar",
    pdfCompiledLocal: "PDF compilado con LaTeX local",
    compilationFailed: (err) => `No se pudo compilar: ${err}`,
    pandocMissingDocx: "Pandoc no está instalado. Visita pandoc.org para instalarlo.",
    pandocMissingBeamer: "Pandoc no está instalado. Visita pandoc.org para instalarlo.",
    zipMissing: "zip no está instalado. En Linux: sudo apt install zip / En Mac: brew install zip",
    htmlExported: "HTML exportado",
    replaceError: (err) => `Error al reemplazar: ${err}`,
    closeSplitPane: "Cerrar panel dividido",
  },

  welcome: {
    tagline: "Editor académico para Markdown + LaTeX",
    openExisting: "Abrir carpeta existente",
    createNew: "Crear nueva carpeta",
    features: "Funciones",
    recents: "Recientes",
    hint: "Ctrl+O para abrir vault",
    featureMath: "Matemáticas KaTeX", featureMathDesc: "Ecuaciones, entornos, shorthands",
    featureBib: "BibTeX", featureBibDesc: "Citas y bibliografía automática",
    featureEnv: "Entornos", featureEnvDesc: "theorem, proof, definition…",
    featureExport: "Exportar", featureExportDesc: "PDF, LaTeX, HTML, DOCX",
  },

  vault: {
    nameEmpty: "El nombre no puede estar vacío",
    nameTooLong: "Nombre demasiado largo (máx. 255 caracteres)",
    nameInvalidChars: 'Caracteres inválidos: < > : " | ? * \\',
    nameStartsDot: "El nombre no puede empezar con punto",
    nameReserved: "Nombre reservado en Windows",
    errorReading: (e) => `Error leyendo vault: ${e}`,
    errorCreatingReadme: (e) => `No se pudo crear README.md: ${e}`,
    binaryFile: (name) => `${name} es un archivo binario y no se puede abrir`,
    errorOpening: (name, e) => `No se pudo abrir ${name}: ${e}`,
    errorCreating: (e) => `No se pudo crear: ${e}`,
    errorDeleting: (e) => `No se pudo eliminar: ${e}`,
    renamed: (name) => `Renombrado a ${name}`,
    errorRenaming: (e) => `No se pudo renombrar: ${e}`,
    errorCreatingFolder: (e) => `No se pudo crear la carpeta: ${e}`,
    errorSaving: (e) => `Error guardando: ${e}`,
    fileChangedExternally: (name) => `${name} modificado externamente. Guarda de nuevo para sobrescribir.`,
    recentlyClosed: "Pestañas cerradas recientemente",
    copiedLatex: "LaTeX copiado al portapapeles",
    bookmarkToggled: "Marcador toggled",
    bookmarks: "Marcadores",
    noBookmarks: "Sin marcadores",
    removeBookmark: "Eliminar marcador",
    line: "Línea",
    renameRefactorConfirm: (old, newName, count) => `¿Actualizar ${count} referencia${count !== 1 ? "s" : ""} a [[${old}]] → [[${newName}]] en los archivos abiertos?`,
    renameRefactorDone: (count) => `${count} referencia${count !== 1 ? "s" : ""} actualizada${count !== 1 ? "s" : ""}`,
    moved: (name) => `"${name}" movido`,
    moveError: "No se pudo mover el archivo",
    replaceSuccess: (n) => `${n} reemplazos realizados`,
    replaceError: "Error al reemplazar",
  },

  helpPanel: {
    environments: "Entornos matemáticos", shorthands: "Shorthands matemáticos — Tab",
    equations: "Ecuaciones numeradas y referencias",
    macros: "Macros personalizados (macros.md)", bibtex: "Citas BibTeX (references.bib)",
    frontmatter: "Frontmatter YAML", wikilinks: "Wikilinks y backlinks",
    templates: "Plantillas", greekLetters: "Letras griegas", operators: "Operadores y símbolos",
    theorem1: "Teorema 1 (Pitágoras)", lemma1: "Lema 1",
    corollary1: "Corolario 1 (Unicidad)", proposition1: "Proposición 1",
    definition1: "Definición 1 (Continuidad)", example1: "Ejemplo 1 (Función par)",
    exercise1: "Ejercicio 1", proofLabel: "Demostración", remarkLabel: "Observación", noteLabel: "Nota",
    thmBody: "a² + b² = c² en todo triángulo rectángulo.",
    lemBody: "Toda sucesión convergente es acotada.",
    corBody: "El límite de una sucesión es único.",
    propBody: "La suma de continuas es continua.",
    defBody: "f es continua si para todo ε>0 existe δ>0 tal que |x−x₀|<δ ⟹ |f(x)−f(x₀)|<ε.",
    exBody: "f(x)=x² satisface f(−x)=f(x).",
    exerBody: "Demuestra que |x| no es diferenciable en 0.",
    proofBody: "Por inducción. El caso base es trivial. El paso inductivo se sigue de la hipótesis. □",
    remarkBody: "El recíproco no siempre es válido.",
    noteBody: "Los entornos admiten math inline y ecuaciones en bloque.",
    compact: "Compacto — notas secundarias", normal: "Normal — tamaño por defecto",
    large: "Grande — definiciones principales",
    numbered: "Numerados automáticamente", unnumbered: "Sin número",
    intro1: "Escribe el nombre y pulsa", intro2: "Funcionan dentro y fuera de",
    intro3: "Soportan anidamiento:",
    operations: "Operaciones", fraction: "Fracción", sqrt: "Raíz cuadrada", nthRoot: "Raíz n-ésima",
    abs: "Valor absoluto", norm: "Norma", ceil: "Techo", floor: "Piso",
    superSub: "Superíndice / subíndice", superscript: "Superíndice", subscript: "Subíndice",
    inverse: "Inversa", transpose: "Transpuesta",
    decorators: "Decoradores", hat: "Sombrero", bar: "Barra", tilde: "Tilde",
    dot: "Punto", ddot: "Doble punto", vector: "Vector",
    mathFonts: "Fuentes matemáticas", bold: "Negrita", calligraphic: "Caligráfica",
    blackboard: "Pizarrón (ℝ ℕ ℤ)",
    sumsLimits: "Sumatorias, integrales y límites",
    sum: "Sumatoria", integral: "Integral", limit: "Límite",
    derivative: "Derivada", partialDer: "Derivada parcial",
    matrices: "Matrices y tablas",
    matAuto: "Matriz auto-dim (4→2×2, 9→3×3…)",
    matFixed: "Matriz fija — matf(filas, cols, vals…)",
    matTable: "Tabla Markdown lista para rellenar",
    matLiteral: "Matriz numérica literal → bmatrix",
    nesting: "Anidamiento:",
    trigFunctions: "Funciones trigonométricas y logarítmicas",
    hpSin: "Seno", hpCos: "Coseno", hpTan: "Tangente", hpCot: "Cotangente",
    hpSec: "Secante", hpCsc: "Cosecante", hpExp: "Exponencial",
    hpLn: "Logaritmo natural", hpLog: "Logaritmo",
    numberedEq: "Ecuación numerada con etiqueta",
    numberedNoLabel: "Numerada sin etiqueta",
    refLabel: "Referencia → (N)", directRef: "Referencia por número directo",
    structuralLabels: "Labels estructurales",
    structuralLabelsDesc: "Etiquetas internas para referenciar secciones, ecuaciones, figuras, tablas y entornos. Exportan como \\label/\\ref en LaTeX y quedan limpias en Markdown para Obsidian.",
    sectionLabelDesc: "Etiqueta una sección; referencia con @sec:intro",
    tableLabelDesc: "Etiqueta una tabla Markdown; referencia con @tbl:constants",
    envLabelDesc: "Etiqueta un teorema/lema/definición; referencia con @thm:main",
    labelsPanelDesc: "Panel que audita referencias rotas, labels duplicados, labels sin uso y salta al archivo/línea",
    labelAutocompleteDesc: "Autocompleta labels existentes al escribir @eq:, @fig:, @tbl:, @sec:, @thm:, etc.",
    qualityWorkflow: "Calidad, exportación y proyecto",
    qualityWorkflowDesc: "Usa el panel Calidad antes de exportar: concentra diagnóstico, compatibilidad Overleaf/Obsidian, estructura académica, proyecto principal y backlinks matemáticos.",
    projectMainDesc: "Marca un archivo como documento principal del proyecto",
    projectTransclusionDesc: "Incluye archivos en exportación de proyecto mediante transclusiones",
    projectExportDesc: "Resuelve transclusiones y genera un .tex único para Overleaf",
    localLatexCompileDesc: "Usa tectonic, xelatex o pdflatex si están instalados",
    mathBacklinksDesc: "Muestra qué ecuaciones, secciones, tablas o teoremas usan cada label",
    macrosDesc: "Vault → Editar macros.md. Se aplican en todo el vault.",
    noArgs: "Sin argumentos", withArgs: "Con N argumentos (#1, #2…)",
    bibtexDesc: "Vault → Editar references.bib.",
    cite: "Cita → [N] con enlace", citeNote: "Cita con nota",
    fmTitle: "H1 destacado al inicio del preview", fmAuthor: "Nombre del autor",
    fmDate: "Fecha del documento", fmTags: "Lista: [t1, t2] o - bullet",
    wikilinkRow: "Enlace — clic en preview para navegar",
    wikilinkDesc: 'La pestaña ← muestra los backlinks del archivo activo. El autocompletado sugiere nombres al escribir [[.',
    templatesDesc: 'Archivo → Nuevo desde plantilla · o Ctrl+P → "plantilla". Puedes guardar plantillas propias con variables {{title}}, {{filename}}, {{date}} y {{datetime}}.',
    tplArticle: "Artículo", tplArticleDesc: "Abstract + secciones + BibTeX",
    tplNotes: "Apuntes de clase", tplNotesDesc: "Defs, teoremas, demostraciones",
    tplHomework: "Tarea / Problem set", tplHomeworkDesc: "Ejercicios numerados",
    tplTheorems: "Hoja de teoremas", tplTheoremsDesc: "Teoremas, lemas, corolarios",
    tplResearch: "Nota de investigación", tplResearchDesc: "Ecuación principal + citas",
    headingsNote: "Headings dentro del entorno: usa", headingsPurpose: " para organizar el contenido con jerarquía visual.",
    envSyntaxCode: ":::tipo[Título]", envSyntaxMid: "— contenido —",
    envCapabilities: "Admiten Markdown, math $...$, ecuaciones $$...$$, y headings ## ###.",
    eqCodeBlock: "$$\nE = mc^2\n$$ {#eq:energia}\n\nVer @eq:energia",
    syntaxPythagoras: "Pitágoras", syntaxUniqueness: "Unicidad",
    syntaxContinuity: "Continuidad", syntaxEvenFunction: "Función par",
    inlineExample: "Inline:",
    exampleTitle: "Título",
    mermaid: "Diagramas Mermaid",
    mermaidDesc: "Los bloques de código con lenguaje 'mermaid' se renderizan como diagramas interactivos.",
    mermaidFlow: "Diagrama de flujo",
    mermaidSeq: "Diagrama de secuencia",
    mermaidGantt: "Diagrama Gantt",
    callouts: "Callouts (avisos destacados)",
    calloutsDesc: "Bloques de cita con tipo especial, estilo Obsidian. El texto del tipo es libre.",
    calloutNote: "> [!NOTE]\n> Información adicional.",
    calloutNoteDesc: "Nota informativa (azul)",
    calloutWarning: "> [!WARNING]\n> Precaución importante.",
    calloutWarningDesc: "Advertencia (amarillo)",
    calloutTip: "> [!TIP]\n> Sugerencia útil.",
    calloutTipDesc: "Consejo (verde)",
    calloutImportant: "> [!IMPORTANT]\n> No ignorar.",
    calloutImportantDesc: "Importante (púrpura)",
    footnotes: "Notas al pie",
    footnotesDesc: "Sintaxis estándar de Markdown para notas al pie. Se renderizan al final del preview.",
    footnoteInline: "Texto con nota.[^1]",
    footnoteInlineDesc: "Referencia inline — muestra un superíndice clicable",
    footnoteDef: "[^1]: Contenido de la nota al pie.",
    footnoteDefDesc: "Definición de la nota — puede ir en cualquier parte del documento",
    checkboxes: "Listas de tareas",
    checkboxesDesc: "Los checkboxes del preview son interactivos: al hacer clic actualizan el documento.",
    checkboxUnchecked: "- [ ] Tarea pendiente",
    checkboxUncheckedDesc: "Tarea sin completar",
    checkboxChecked: "- [x] Tarea completada",
    checkboxCheckedDesc: "Tarea completada — clic para desmarcar",
    figures: "Figuras numeradas",
    figuresDesc: "Las imágenes con etiqueta {#fig:id} se numeran automáticamente y se pueden referenciar.",
    figureLabel: "![Leyenda](imagen.png){#fig:diagrama}",
    figureLabelDesc: "Imagen numerada — genera 'Figura N: Leyenda'",
    figureRef: "@fig:diagrama",
    figureRefDesc: "Referencia → (N)",
    userSnippets: "Snippets de usuario (snippets.md)",
    userSnippetsDesc: "Crea snippets personalizados en snippets.md en la raíz del vault. Se expanden en el autocompletado del editor.",
    userSnippetFormat: "> prefijo | descripción | cuerpo del snippet",
    userSnippetFormatDesc: "Formato de cada snippet (una línea por snippet)",
    userSnippetExample: "> thm | Plantilla teorema | :::theorem[${1:Título}]\\n${2:Enunciado}\\n:::",
    userSnippetExampleDesc: "Ejemplo: snippet que inserta un entorno theorem",
    htmlMedia: "HTML y multimedia",
    htmlMediaDesc: "El editor acepta HTML directo en el documento. Las etiquetas peligrosas son eliminadas automáticamente.",
    htmlImg: '<img src="ruta.png" width="400" alt="desc">',
    htmlImgDesc: "Imagen con ancho personalizado",
    htmlVideo: '<video controls width="500"><source src="./video.mp4" type="video/mp4"></video>',
    htmlVideoDesc: "Video local (mp4, webm)",
    htmlYoutube: '<iframe width="560" height="315" src="https://www.youtube.com/embed/ID" allowfullscreen></iframe>',
    htmlYoutubeDesc: "Video de YouTube (único iframe permitido)",
    htmlDetails: '<details><summary>Ver más</summary>Contenido oculto</details>',
    htmlDetailsDesc: "Bloque colapsable",
    htmlMark: '<mark>texto resaltado</mark>   <sub>sub</sub>   <sup>sup</sup>',
    htmlMarkDesc: "Resaltado, subíndice, superíndice inline",
    htmlAllowed: "Etiquetas permitidas: div, span, p, img, video, audio, figure, figcaption, details, summary, table, mark, kbd, sub, sup, br, hr, blockquote, iframe (solo YouTube)",
    htmlBlocked: "Etiquetas bloqueadas: script, iframe (otros), object, embed, form, input, button",
    pseudocode: "Pseudocódigo",
    pseudocodeDesc: "Bloque de algoritmo con numeración de líneas, palabras clave resaltadas y diagrama de flujo generado automáticamente.",
    pseudocodeSyntax: "#algo[Título] … #end",
    pseudocodeSyntaxAlt: "Alternativa: :::pseudocode[Título] … :::",
    pseudocodeExample: "#algo[Bubble Sort]\nINPUT: Array A[1..n]\nFOR i ← 1 TO n-1 DO\n  IF A[j] > A[j+1] THEN\n    SWAP A[j] ↔ A[j+1]\n  END IF\nEND FOR\n#end",
    pseudocodeKeywords: "Palabras clave: INPUT, OUTPUT, FOR, WHILE, IF, THEN, ELSE, RETURN, FUNCTION, PROCEDURE, REPEAT, UNTIL, SWAP, PRINT, BEGIN, END, …",
    truthTable: "Tabla de verdad",
    truthTableDesc: "Genera la tabla de verdad de una o varias expresiones booleanas.",
    truthTableExample: ":::truth[De Morgan]\n¬(p ∧ q)\n¬p ∨ ¬q\n:::",
    graphViz: "Grafo (Teoría de grafos)",
    graphVizDesc: "Visualiza grafos dirigidos y no dirigidos a partir de una lista de aristas.",
    graphVizExample: ":::graph[Ejemplo]\nA -- B\nA -- C\nB -> D\n:::",
    functionPlot: "Graficador de funciones",
    functionPlotDesc: "Grafica funciones matemáticas: sin(x), x^2, etc. Soporta múltiples funciones y rango personalizado.",
    functionPlotExample: ":::plot[Trigonométricas]\nf(x) = sin(x)\ng(x) = cos(x)\nrange: [-6.28, 6.28]\n:::",
    commDiag: "Diagrama conmutativo",
    commDiagDesc: "Diagrama de flechas para álgebra categórica. Nodos y aristas con etiquetas.",
    commDiagExample: ":::commdiag[Ejemplo]\nA -> B [f]\nA -> C [g]\nB -> D [h]\nC -> D [k]\n:::",
    symbolPickerHelp: "Selector de símbolos (panel lateral)",
    symbolPickerDesc: "Abre el panel de símbolos matemáticos desde la paleta de comandos (Ctrl+P → 'Selector de símbolos'). Haz clic en cualquier símbolo para insertarlo en el cursor. Puedes buscar por nombre o categoría (griego, operadores, flechas, lógica…).",
    mathPreviewHelp: "Vista previa de matemáticas en línea",
    mathPreviewDesc: "Al mover el cursor fuera de un bloque de matemáticas en línea ($...$), aparece una vista previa renderizada debajo. Se puede desactivar en Configuración → Vista previa de ecuaciones.",
    editorToggles: "Ajustes del editor",
    editorTogglesIntro: "Acceso rápido desde la paleta (Ctrl+P) o desde Configuración. Todos se conservan entre sesiones.",
    sidebarPanels: "Paneles laterales",
    sidebarPanelsIntro: "Cambia entre paneles desde la barra lateral o la paleta de comandos.",
    toggleTypewriter: "Modo máquina de escribir",
    toggleTypewriterDesc: "Mantiene el cursor centrado verticalmente en el editor.",
    toggleSyncScroll: "Scroll sincronizado",
    toggleSyncScrollDesc: "El preview se desplaza junto al cursor del editor.",
    toggleWordWrap: "Ajuste de línea",
    toggleWordWrapDesc: "Las líneas largas se ajustan al ancho del editor en lugar de hacer scroll horizontal.",
    toggleMinimap: "Minimapa",
    toggleMinimapDesc: "Vista en miniatura del archivo a la derecha del editor.",
    toggleSpellcheck: "Corrector ortográfico",
    toggleSpellcheckDesc: "Activa el corrector nativo del navegador en el editor.",
    panelEnvironments: "Entornos",
    panelEnvironmentsDesc: "Lista todos los bloques :::theorem, :::lemma, etc. del vault con enlaces directos.",
    panelLabels: "Etiquetas estructurales",
    panelLabelsDesc: "Muestra todas las etiquetas {#sec:..} {#eq:..} {#fig:..} {#thm:..} y dónde se referencian.",
    panelQuality: "Diagnóstico del documento",
    panelQualityDesc: "Linter de calidad: enlaces rotos, citas faltantes, etiquetas duplicadas, ecuaciones sin numerar.",
  },

  labelsPanel: {
    title: "Etiquetas",
    filterPlaceholder: "Filtrar etiquetas…",
    allTypes: "Todos los tipos",
    broken: "rotas",
    duplicates: "duplicadas",
    unused: "sin usar",
    brokenSection: "Referencias rotas",
    duplicateChip: "dup",
    unusedChip: "sin uso",
  },

  citationManager: {
    title: "Gestor de Referencias BibTeX",
    close: "Cerrar",
    noEntries: "No hay entradas. Agrega una abajo.",
    noTitle: "Sin título",
    confirmDelete: "Confirmar eliminación",
    deleteEntry: "Eliminar entrada",
    addEntry: "Agregar entrada",
    yearPlaceholder: "Año",
    titlePlaceholder: "Título",
    authorPlaceholder: "Autor(es)",
    keyPlaceholder: "Clave *",
    add: "Añadir",
    cancel: "Cancelar",
    save: "Guardar",
    keyRequired: "Key requerido",
    keyExists: (key) => `Key "${key}" ya existe`,
    venueJournal: "Revista (journal)",
    venueBooktitle: "Evento (booktitle)",
    venueSource: "Booktitle / Fuente",
  },

  graphPanel: {
    noFiles: "Sin archivos en el vault",
    resetView: "Reiniciar vista",
    graphInfo: (n, e) => `${n} nodos · ${e} enlaces`,
    root: "raíz",
  },

  frontmatterPanel: {
    fieldTitle: "Título",
    fieldAuthor: "Autor/es",
    fieldDate: "Fecha",
    fieldAbstract: "Abstract",
    fieldTags: "Tags",
    removeField: "Eliminar campo",
    addField: "Añadir campo",
    fieldKeyPlaceholder: "campo",
    fieldValuePlaceholder: "valor",
    layoutSection: "Diseño del documento",
    paperSize: "Tamaño de página",
    paperA4: "A4 (210×297 mm)",
    paperLetter: "Carta US (8.5×11 in)",
    paperA5: "A5 (148×210 mm)",
    paperA3: "A3 (297×420 mm)",
    paperLegal: "Oficio (8.5×14 in)",
    headerLabel: "Encabezado",
    footerLabel: "Pie de página",
    headerFooterHint: "Variables: {{title}}, {{author}}, {{date}}, {{page}}",
    orientation: "Orientación",
    portrait: "Vertical (Portrait)",
    landscape: "Horizontal (Landscape)",
    left: "Izquierda", center: "Centro", right: "Derecha",
  },

  tagPanel: {
    noFiles: "No hay archivos para analizar tags",
    noTags: "Sin tags encontrados",
    addTagsHint: "Añade tags en frontmatter:",
    filterPlaceholder: "Filtrar tags…",
    typeAriaLabel: "Tipo de tag",
    allTypes: "Todos los tipos",
    fileCount: (n) => `${n} archivo${n === 1 ? "" : "s"}`,
  },

  tabBar: {
    warningCount: (n) => `${n} aviso${n === 1 ? "" : "s"}`,
    pin: "Anclar",
    unpin: "Desanclar",
    pinAriaLabel: "Anclar pestaña",
    unpinAriaLabel: "Desanclar pestaña",
  },

  tableEditor: {
    alignLeft: "Izquierda",
    alignCenter: "Centro",
    alignRight: "Derecha",
    copyLatex: "Copiar como LaTeX",
    latexCopied: "¡Copiado!",
    addRow: "+ Fila",
    removeRow: "− Fila",
    addColumn: "+ Columna",
    removeColumn: "− Columna",
    preview: "Vista previa",
    cancel: "Cancelar",
    insert: "Insertar",
  },

  symbolPicker: {
    title: "Símbolos matemáticos",
    searchPlaceholder: "Buscar símbolo…",
    all: "Todos",
  },

  latexErrors: {
    title: "Error al exportar PDF",
    noDetails: "No se encontraron detalles del error.",
    errorLabel: "Error",
    warningLabel: "Advertencia",
    line: "línea",
    context: "Contexto",
    suggestion: "Sugerencia",
    close: "Cerrar",
  },

  templates: {
    blank:      { name: "Vacío",                description: "Archivo en blanco" },
    article:    { name: "Artículo",             description: "Documento académico con abstract y secciones" },
    notes:      { name: "Apuntes de clase",     description: "Definiciones, teoremas y demostraciones" },
    homework:   { name: "Tarea / Problem set",  description: "Ejercicios numerados con espacio para soluciones" },
    theorems:   { name: "Hoja de teoremas",     description: "Colección de teoremas, lemas y corolarios" },
    research:   { name: "Nota de investigación",description: "Plantilla con ecuación principal y bibliografía" },
    letter:     { name: "Carta",                description: "Carta formal con destinatario y firma" },
  },

  documentLab: {
    diagnostics: "Diagnóstico",
    compatibility: "Export",
    project: "Proyecto",
    structure: "Estructura",
    mathlinks: "Backlinks matemáticos",
    quality: "Calidad",
    errors: "Errores",
    warnings: "Warnings",
    info: "Info",
    noIssues: "Sin problemas detectados.",
    noIssuesCompat: "Sin degradaciones detectadas.",
    noIssuesStructure: "Estructura académica sin alertas.",
    noMathBacklinks: "Sin backlinks matemáticos.",
    noMainDoc: "No hay documento principal detectado.",
    mainDocument: "Documento principal",
    included: "Incluidos",
    missingEmbeds: "Embeds faltantes",
    includedFiles: "Archivos incluidos",
    missingEmbed: (name) => `Embed faltante: ${name}`,
    references: (n) => `${n} referencia${n !== 1 ? "s" : ""}`,
    line: "línea",
    searchLabel: "Término de búsqueda",
    replaceLabel: "Texto de reemplazo",
    searching: "Buscando…",
    replacing: "Reemplazando…",
    search: "Buscar",
    replaceAll: "Reemplazar todo",
    replace: "Reemplazar",
  },

  breadcrumb: {
    location: "Ubicación",
    back: "Atrás",
    backTitle: "Atrás (Alt+←)",
    forward: "Adelante",
    forwardTitle: "Adelante (Alt+→)",
  },

  searchReplace: {
    searchAriaLabel: "Término de búsqueda",
    replaceAriaLabel: "Texto de reemplazo",
  },
}

// ── English ───────────────────────────────────────────────────────────────────

const en: T = {
  toolbar: {
    bold: "Bold", italic: "Italic", strikethrough: "Strikethrough", inlineCode: "Inline code",
    headings: "Headings", heading1: "Heading 1", heading2: "Heading 2", heading3: "Heading 3",
    insert: "Insert", quote: "Quote", separator: "Separator", list: "List",
    orderedList: "Numbered list", taskList: "Task list", link: "Link", codeBlock: "Code block",
    mathInline: "Inline math", mathBlock: "Block math",
    mathOps: "Math operations", superscript: "Superscript", subscript: "Subscript",
    fraction: "Fraction", sqrt: "Square root", nthRoot: "Nth root", sum: "Summation",
    integral: "Integral", limit: "Limit", partialDer: "Partial derivative", derivative: "Derivative",
    gradient: "Gradient", inverse: "Inverse", transpose: "Transpose",
    decorators: "Decorators",
    mathFonts: "Math fonts",
    greekLetters: "Greek letters",
    operators: "Operators",
    arrows: "Arrows",
    environments: "Environments",
    theorem: "Theorem", lemma: "Lemma", corollary: "Corollary", proposition: "Proposition",
    definition: "Definition", example: "Example", exercise: "Exercise",
    proof: "Proof", remark: "Remark", note: "Note",
    structures: "Structures", table: "Table", matAuto: "Auto matrix", matFixed: "Fixed matrix", matLiteral: "Literal matrix",
    more: "More",
    togglePreview: "Toggle preview (Ctrl+Shift+P)",
    symbolPicker: "Math symbol picker",
    lbl_heading1: "H1  # Title", lbl_heading2: "H2  ## Title", lbl_heading3: "H3  ### Title",
    lbl_quote: "❝  Quote", lbl_separator: "—  Separator", lbl_list: "•  List",
    lbl_orderedList: "1. Numbered list", lbl_taskList: "☐  Task list",
    lbl_link: "🔗 Link", lbl_codeBlock: "``` Code block",
    lbl_superscript: "xⁿ  superscript", lbl_subscript: "xₙ  subscript",
    lbl_fraction: "½  fraction", lbl_sqrt: "√  sqrt", lbl_nthRoot: "ⁿ√  nth root",
    lbl_sum: "∑  summation", lbl_integral: "∫  integral", lbl_limit: "lim  limit",
    lbl_partialDer: "∂  partial derivative", lbl_derivative: "d  derivative",
    lbl_gradient: "∇  gradient", lbl_inverse: "A⁻¹ inverse", lbl_transpose: "Aᵀ  transpose",
    lbl_theorem: "theorem   Theorem", lbl_lemma: "lemma     Lemma", lbl_corollary: "corollary Corollary",
    lbl_proposition: "prop      Proposition", lbl_definition: "def       Definition",
    lbl_example: "example   Example", lbl_exercise: "exercise  Exercise",
    lbl_proof: "proof     Proof", lbl_remark: "remark    Remark", lbl_note: "note      Note",
    lbl_table: "table  table(Col1, Col2)", lbl_matAuto: "mat    auto-matrix",
    lbl_matFixed: "matf   fixed matrix", lbl_matLiteral: "[[]]   literal matrix",
    sin: "Sine", cos: "Cosine", tan: "Tangent", cot: "Cotangent",
    sec: "Secant", csc: "Cosecant", exp: "Exponential", ln: "Natural log", log: "Logarithm",
  },

  fileTree: {
    noVault: "No vault", openFolder: "Open folder",
    newFile: "New file", newFolder: "New folder", changeVault: "Change vault",
    loading: "Loading…", noFiles: "No .md, .tex or .bib files",
    filenamePlaceholder: "filename.md", folderPlaceholder: "folder",
    open: "Open", rename: "Rename", delete: "Delete", deleteFolder: "Delete folder",
    confirmDelete: (name) => `Delete "${name}"?\nThis action cannot be undone.`,
    confirmDeleteTitle: "Confirm deletion",
    vaultFiles: "Vault files",
    newFileLabel: "New file", newFolderLabel: "New folder",
    renamingLabel: (name) => `Rename ${name}`,
    folderLabel: (name) => `Folder: ${name}`,
    sortAZ: "Sort A→Z", sortZA: "Sort Z→A",
    filterPlaceholder: "Filter files…",
    clearFilter: "Clear filter",
  },

  search: {
    placeholder: "Search in vault…", ariaLabel: "Search in vault", searching: "Searching…",
    noResults: "No results", limit: "Showing first 500 results",
    count: (n) => `${n} results`,
    lineAriaLabel: (line, content) => `Line ${line}: ${content}`,
    showLess: "Show less", more: (n) => `+${n} more`,
    toggleReplace: "Find & replace", replacePlaceholder: "Replace with…",
    replaceAll: "Replace all", replaced: (n) => `${n} replacement${n !== 1 ? "s" : ""} made`,
    regexTitle: "Regular expression (.*)", caseSensitiveTitle: "Case sensitive (Aa)",
    errorPattern: "Invalid regular expression", errorSearching: "Error searching in vault",
    searchPlaceholder: "Search…", replaceWithPlaceholder: "Replace with…",
  },

  outline: {
    noHeadings: "No headings",
    lineTitle: (n) => `Line ${n}`,
    totalWords: "Total",
    wordsAbbr: "w",
  },

  backlinks: {
    noFile: "No file open", searching: "Searching...",
    links: (n) => `${n} incoming link${n !== 1 ? "s" : ""}`,
    noLinks: "No notes link here",
  },

  settings: {
    title: "Settings", language: "Language",
    editorFont: "Editor font", previewFont: "Preview font",
    autosave: "Autosave", theme: "Theme", vimMode: "Vim mode",
    typewriterMode: "Typewriter mode",
    touchpadGestures: "Touchpad gestures",
    mathPreview: "Equation preview",
    previewTheme: "Preview theme", previewThemeSame: "Same as editor",
    dark: "Dark", light: "Light", highContrast: "High contrast",
    wordGoal: "Word goal", wordGoalOff: "No goal", words: "words",
    wordWrap: "Word wrap", minimap: "Minimap", spellcheck: "Spellcheck",
    syncScroll: "Sync editor↔preview scroll", previewVisible: "Show preview",
    closeAriaLabel: "Close settings",
    sectionEditor: "Editor", sectionPreview: "Preview", sectionGeneral: "General",
  },

  help: {
    title: "Keyboard shortcuts",
    file: "File", edit: "Edit", view: "View", editor: "Editor", math: "Math shorthands",
    save: "Save", saveAs: "Save as...", commandPalette: "Command palette", quickSwitcher: "Quick switcher",
    findInFile: "Find in file", searchVault: "Search in vault",
    undo: "Undo", redo: "Redo", selectNextOccurrence: "Select next occurrence",
    focusMode: "Focus mode (toggle)", exitFocus: "Exit focus mode",
    togglePreview: "Toggle preview", thisHelp: "This help",
    zoomInOut: "Zoom in/out", resetZoom: "Reset zoom",
    nextTab: "Next tab", prevTab: "Previous tab", closeTab: "Close tab",
    expandShorthand: "Expand shorthand (frac, sqrt, mat…)",
    navigatePlaceholders: "Navigate between snippet placeholders",
    autocompleteWikilink: "Autocomplete wikilink",
    autoMatrix: "Auto-dimensioned matrix",
    fixedMatrix: "Fixed-dimension matrix",
    markdownTable: "Markdown table",
  },

  templateModal: {
    title: "New file from template",
    filenameLabel: "File name", filenamePlaceholder: "my-document.md",
    cancel: "Cancel", create: "Create",
    useTemplates: "Use templates", createTemplate: "Create template",
    namePlaceholder: "Template name", descriptionPlaceholder: "Description",
    saveTemplate: "Save template", defaultDescription: "Custom template",
    customBadge: "custom",
    variablesHint: "Variables",
    closeAriaLabel: "Close",
  },

  titleBar: {
    minimize: "Minimize", maximize: "Maximize", close: "Close", settings: "Settings",
  },

  statusBar: {
    macrosLoaded: "Macros loaded",
    readingTime: (min) => `~${min} min`,
    macros: (n) => `${n} macros`,
    words: (n) => `${n} words`,
    chars: (n) => `${n} chars`,
    selectedWords: (n) => `${n} sel.`,
    selectionTitle: "Selected words",
    readingTimeTitle: "Estimated reading time (~200 wpm)",
    modeMarkdown: "Markdown", modeTex: "LaTeX",
    ln: "Ln", col: "Col", goToLineTitle: "Click to go to line",
    wordGoalTitle: (c, g) => `${c} / ${g} words`,
  },

  palette: {
    placeholder: "Search files and commands...", noResults: "No results",
    save: "Save", saveAs: "Save as...", exportTex: "Export as .tex",
    exportPdf: "Export as PDF", findInFile: "Find in file",
    searchVault: "Search in vault", focusMode: "Focus mode",
    newFromTemplate: "New from template", editMacros: "Edit macros.md",
    editBib: "Edit references.bib", settings: "Settings",
    shortcuts: "Keyboard shortcuts", openVault: "Open vault...",
    viewOutline: "View outline", viewBacklinks: "View backlinks",
    viewTags: "View tags", viewProperties: "View properties", viewGraph: "View graph",
    viewTodo: "View tasks", viewEquations: "View equations", viewStats: "Vault statistics",
    insertToc: "Insert table of contents (TOC)",
    exportHtml: "Export as HTML",
    typewriterMode: "Typewriter mode (center cursor)",
    syncScroll: "Sync preview scroll",
    wordWrap: "Toggle word wrap",
    minimap: "Toggle minimap",
    exportDocx: "Export to DOCX",
    spellcheck: "Toggle spellcheck",
    exportBeamer: "Export presentation (Beamer)",
    goBack: "Go back", goForward: "Go forward",
    viewEnvironments: "View math environments",
    citationManager: "Citation manager",
    vaultBackup: "Backup vault (.zip)",
    copyHtml: "Copy as HTML",
    copyLatex: "Copy as LaTeX",
    searchReplace: "Find and replace",
    tableEditor: "Table editor",
    exportReveal: "Export presentation (Reveal.js)",
    checkUpdates: "Check for updates",
    exportAnkiCards: "Export Anki cards",
    symbolPicker: "Math symbol picker",
    exportProjectTex: "Export project as .tex",
    compileLatexPdf: "Compile PDF with local LaTeX",
    viewLabels: "View labels",
    viewQuality: "Document diagnostics",
  },

  ankiExport: {
    exportAnkiCards: "Export Anki cards",
    ankiNoCards: "No exportable blocks found",
    ankiExported: (n) => `${n} card${n !== 1 ? "s" : ""} exported`,
  },

  quickSwitcher: {
    placeholder: "Search file…",
    noResults: "No results",
    navigate: "navigate", open: "open", close: "close",
  },

  sidebar: {
    files: "Files", search: "Search", outline: "Outline",
    backlinks: "Backlinks", help: "Help",
    tags: "Tags", properties: "Properties", graph: "Graph",
    todo: "Tasks", equations: "Equations", stats: "Statistics",
    environments: "Environments",
    searchReplace: "Find & Replace",
    collapse: "Collapse sidebar", expand: "Expand sidebar",
    symbols: "Symbols",
    labels: "Labels",
    quality: "Diagnostics",
  },

  todo: {
    empty: "No tasks in open files",
    all: "All", pending: "Pending", done: "Done",
    summary: (done, total) => `${done}/${total} completed`,
    markDone: "Mark as done", markPending: "Mark as pending",
  },

  equations: {
    empty: "No equations in this document",
    count: (n) => `${n} equation${n !== 1 ? "s" : ""}`,
    lineTitle: (n) => `Line ${n}`,
  },

  environments: {
    empty: "No environments in open files",
    count: (n) => `${n} environment${n === 1 ? "" : "s"}`,
    types: {
      theorem: "Theorem", lemma: "Lemma", corollary: "Corollary",
      proposition: "Proposition", definition: "Definition",
      example: "Example", exercise: "Exercise",
      proof: "Proof", remark: "Remark", note: "Note",
    },
    fileLineTitle: (fileName, line) => `${fileName} — line ${line}`,
  },

  stats: {
    vault: "Vault", content: "Content",
    files: "Files in vault", open: "Open files", words: "Words (open)", tags: "Unique tags",
    equations: "Equations", figures: "Figures", citations: "Citations", wikilinks: "Wikilinks",
    broken: (n) => `${n} broken link${n !== 1 ? "s" : ""}`,
  },

  brokenLinks: {
    createNote: (name) => `Create note "${name}"`,
    removeLink: "Remove link",
    ignore: "Ignore",
    noteCreated: (name) => `Note "${name}" created.`,
    linkRemoved: "Link removed.",
    removeLinkError: (msg) => `Error removing link: ${msg}`,
  },

  git: {
    noVault: "Open a vault to use Git.",
    notRepo: "This folder is not a Git repository.",
    gitNotFound: "Git not found. Install it to use this feature.",
    refresh: "Refresh",
    noChanges: "No changes in the repository.",
    staged: "Staged changes",
    changes: "Changes",
    untracked: "Untracked files",
    commitPlaceholder: "Commit message (Ctrl+Enter)",
    commit: "Commit",
    stageAll: "Stage all",
    unstageAll: "Unstage all",
    stageOne: "Stage",
    unstageOne: "Unstage",
    discard: "Discard changes",
    recentCommits: "Recent commits",
    initRepo: "Initialize repository",
    initSuccess: "Git repository initialized.",
    commitSuccess: "Commit created.",
    discardConfirm: (name) => `Discard changes to "${name}"? This cannot be undone.`,
    commitError: (msg) => `Commit failed: ${msg}`,
    stageError: (msg) => `Stage failed: ${msg}`,
    unstageError: (msg) => `Unstage failed: ${msg}`,
    fetch: "Fetch", push: "Push", pull: "Pull",
    fetchSuccess: "Fetch complete.", pushSuccess: "Push complete.", pullSuccess: "Pull complete.",
    fetchError: (msg) => `Fetch failed: ${msg}`,
    pushError: (msg) => `Push failed: ${msg}`,
    pullError: (msg) => `Pull failed: ${msg}`,
    switchBranch: "Switch branch", newBranchPlaceholder: "new-branch",
    newBranchSuccess: (name) => `Branch "${name}" created.`,
    newBranchError: (msg) => `Branch creation failed: ${msg}`,
    stash: "Stash", stashPop: "Pop stash", stashDrop: "Drop stash", stashList: "Stash list",
    stashSuccess: "Changes stashed.", stashPopSuccess: "Stash applied.",
    noStashes: "No stashes.",
    stashError: (msg) => `Stash failed: ${msg}`,
    showChanges: "Show changes", hidePanel: "Hide panel",
    remotes: "Remotes", reloadRemotes: "Reload remotes", noRemotes: "No remotes configured",
    editRemoteUrl: "Edit URL", removeRemote: "Remove", addRemote: "Add remote",
    remoteNamePlaceholder: "name (e.g. origin)", remoteUrlPlaceholder: "Repository URL",
    remoteUpdated: (name) => `Remote "${name}" updated.`,
    remoteAdded:   (name) => `Remote "${name}" added.`,
    remoteRemoved: (name) => `Remote "${name}" removed.`,
    confirmRemoveRemote: (name) => `Remove remote "${name}"?`,
    remoteError: (msg) => `Remote error: ${msg}`,
    configSection: "Configuration", configSaved: "Configuration saved.",
    saveLocal: "Save local", loadCommits: "Load commits",
    initGitRepo: "Initialize Git repository", recheckRepo: "Check again",
  },

  menus: {
    file: "File", edit: "Edit", view: "View", vault: "Vault",
    openVault: "Open vault...", newFromTemplate: "New from template",
    save: "Save", saveAs: "Save as...",
    exportMd: "Export as .md", exportTex: "Export as .tex", exportPdf: "Export as PDF",
    exportDocx: "Export to Word (.docx)",
    exportBeamer: "Export Beamer slides (.pdf)",
    exportReveal: "Export Reveal.js",
    recent: "Recent", clearRecent: "Clear recent",
    findInFile: "Find in file", searchVault: "Search in vault",
    commandPalette: "Command palette", focusMode: "Focus mode",
    files: "Files", search: "Search", outline: "Outline",
    editMacros: "Edit macros.md", editBib: "Edit references.bib",
    settings: "Settings", shortcuts: "Keyboard shortcuts",
  },

  app: {
    subtitle: "Markdown + LaTeX editor for mathematics and science",
    openFolder: "Open folder", dropImage: "Drop image here",
    f1: "∑ Math environments: theorem, proof, definition…",
    f2: "∫ Equation numbering and cross-references",
    f3: "📄 Academic templates: article, notes, homework…",
    f4: "🔗 Wikilinks between notes, automatic backlinks",
    f5: "📚 BibTeX bibliography with citations [@key]",
    pandocMissing: "pandoc is not installed. Install it from pandoc.org/installing.html — falling back to browser print.",
    generatingPdf: "Generating PDF with pandoc…",
    pdfDone: "PDF generated successfully",
    pandocError: (e) => `Pandoc error: ${e}`,
    unsavedChanges: (names) => `You have unsaved changes in: ${names}\nExit anyway?`,
    imageAdded: (f) => `Image added: assets/${f}`,
    imagePasted: (f) => `Image pasted: assets/${f}`,
    errCopyImage: (e) => `Error copying image: ${e}`,
    errPasteImage: (e) => `Error pasting image: ${e}`,
    noClipboardPath: "Cannot paste image from clipboard: no file path",
    noFilePath: "Could not get file path",
    fileNotInVault: (name) => `File not found in current vault: ${name}`,
    dialogSelectVault: "Select vault folder",
    dialogExportMd: "Export as Markdown",
    dialogExportTex: "Export as LaTeX",
    dialogExportPdf: "Export as PDF",
    exportDocxSuccess: "DOCX exported",
    exportDocxError: "DOCX export failed",
    exportBeamerSuccess: "Presentation exported",
    exportBeamerError: "Beamer export failed",
    backupSuccess: "Backup created",
    backupError: "Backup failed",
    copiedHtml: "HTML copied",
    copiedLatex: "LaTeX copied",
    copyError: "Copy failed",
    bibSaved: "References saved",
    revealExportSuccess: "Presentation exported",
    revealExportError: "Error exporting presentation",
    focusModeOn: "Focus mode on",
    focusModeOff: "Focus mode off",
    upToDate: "ComdTeX is up to date",
    bookmarks: "Bookmarks",
    noBookmarks: "No bookmarks",
    line: "Line",
    removeBookmark: "Remove bookmark",
    bookmarkToggled: "Bookmark updated",
    noMainDocument: "No main document to export",
    pdfCompiledLocal: "PDF compiled with local LaTeX",
    compilationFailed: (err) => `Compilation failed: ${err}`,
    pandocMissingDocx: "Pandoc is not installed. Visit pandoc.org to install it.",
    pandocMissingBeamer: "Pandoc is not installed. Visit pandoc.org to install it.",
    zipMissing: "zip is not installed. On Linux: sudo apt install zip / On Mac: brew install zip",
    htmlExported: "HTML exported",
    replaceError: (err) => `Replace error: ${err}`,
    closeSplitPane: "Close split pane",
  },

  welcome: {
    tagline: "Academic editor for Markdown + LaTeX",
    openExisting: "Open existing folder",
    createNew: "Create new folder",
    features: "Features",
    recents: "Recent",
    hint: "Ctrl+O to open vault",
    featureMath: "KaTeX Math", featureMathDesc: "Equations, environments, shorthands",
    featureBib: "BibTeX", featureBibDesc: "Citations and bibliography",
    featureEnv: "Environments", featureEnvDesc: "theorem, proof, definition…",
    featureExport: "Export", featureExportDesc: "PDF, LaTeX, HTML, DOCX",
  },

  vault: {
    nameEmpty: "Name cannot be empty",
    nameTooLong: "Name too long (max. 255 characters)",
    nameInvalidChars: 'Invalid characters: < > : " | ? * \\',
    nameStartsDot: "Name cannot start with a dot",
    nameReserved: "Reserved name on Windows",
    errorReading: (e) => `Error reading vault: ${e}`,
    errorCreatingReadme: (e) => `Could not create README.md: ${e}`,
    binaryFile: (name) => `${name} is a binary file and cannot be opened`,
    errorOpening: (name, e) => `Could not open ${name}: ${e}`,
    errorCreating: (e) => `Could not create: ${e}`,
    errorDeleting: (e) => `Could not delete: ${e}`,
    renamed: (name) => `Renamed to ${name}`,
    errorRenaming: (e) => `Could not rename: ${e}`,
    errorCreatingFolder: (e) => `Could not create folder: ${e}`,
    errorSaving: (e) => `Error saving: ${e}`,
    fileChangedExternally: (name) => `${name} modified externally. Save again to overwrite.`,
    recentlyClosed: "Recently closed tabs",
    copiedLatex: "LaTeX copied to clipboard",
    bookmarkToggled: "Bookmark toggled",
    bookmarks: "Bookmarks",
    noBookmarks: "No bookmarks",
    removeBookmark: "Remove bookmark",
    line: "Line",
    renameRefactorConfirm: (old, newName, count) => `Update ${count} reference${count !== 1 ? "s" : ""} to [[${old}]] → [[${newName}]] in open files?`,
    renameRefactorDone: (count) => `${count} reference${count !== 1 ? "s" : ""} updated`,
    moved: (name) => `"${name}" moved`,
    moveError: "Could not move file",
    replaceSuccess: (n) => `${n} replacements made`,
    replaceError: "Error replacing",
  },

  helpPanel: {
    environments: "Math environments", shorthands: "Math shorthands — Tab",
    equations: "Numbered equations and references",
    macros: "Custom macros (macros.md)", bibtex: "BibTeX citations (references.bib)",
    frontmatter: "YAML frontmatter", wikilinks: "Wikilinks and backlinks",
    templates: "Templates", greekLetters: "Greek letters", operators: "Operators and symbols",
    theorem1: "Theorem 1 (Pythagorean)", lemma1: "Lemma 1",
    corollary1: "Corollary 1 (Uniqueness)", proposition1: "Proposition 1",
    definition1: "Definition 1 (Continuity)", example1: "Example 1 (Even function)",
    exercise1: "Exercise 1", proofLabel: "Proof", remarkLabel: "Remark", noteLabel: "Note",
    thmBody: "a² + b² = c² in every right triangle.",
    lemBody: "Every convergent sequence is bounded.",
    corBody: "The limit of a sequence is unique.",
    propBody: "The sum of continuous functions is continuous.",
    defBody: "f is continuous if for every ε>0 there exists δ>0 such that |x−x₀|<δ ⟹ |f(x)−f(x₀)|<ε.",
    exBody: "f(x)=x² satisfies f(−x)=f(x).",
    exerBody: "Prove that |x| is not differentiable at 0.",
    proofBody: "By induction. The base case is trivial. The inductive step follows from the hypothesis. □",
    remarkBody: "The converse does not always hold.",
    noteBody: "Environments support inline math and display equations.",
    compact: "Compact — secondary notes", normal: "Normal — default size",
    large: "Large — main definitions",
    numbered: "Automatically numbered", unnumbered: "Unnumbered",
    intro1: "Type the name and press", intro2: "Work inside and outside",
    intro3: "Support nesting:",
    operations: "Operations", fraction: "Fraction", sqrt: "Square root", nthRoot: "Nth root",
    abs: "Absolute value", norm: "Norm", ceil: "Ceiling", floor: "Floor",
    superSub: "Superscript / subscript", superscript: "Superscript", subscript: "Subscript",
    inverse: "Inverse", transpose: "Transpose",
    decorators: "Decorators", hat: "Hat", bar: "Bar", tilde: "Tilde",
    dot: "Dot", ddot: "Double dot", vector: "Vector",
    mathFonts: "Math fonts", bold: "Bold", calligraphic: "Calligraphic",
    blackboard: "Blackboard (ℝ ℕ ℤ)",
    sumsLimits: "Summations, integrals and limits",
    sum: "Summation", integral: "Integral", limit: "Limit",
    derivative: "Derivative", partialDer: "Partial derivative",
    matrices: "Matrices and tables",
    matAuto: "Auto-dim matrix (4→2×2, 9→3×3…)",
    matFixed: "Fixed matrix — matf(rows, cols, vals…)",
    matTable: "Markdown table ready to fill",
    matLiteral: "Literal numeric matrix → bmatrix",
    nesting: "Nesting:",
    trigFunctions: "Trigonometric and logarithmic functions",
    hpSin: "Sine", hpCos: "Cosine", hpTan: "Tangent", hpCot: "Cotangent",
    hpSec: "Secant", hpCsc: "Cosecant", hpExp: "Exponential",
    hpLn: "Natural log", hpLog: "Logarithm",
    numberedEq: "Numbered equation with label",
    numberedNoLabel: "Numbered without label",
    refLabel: "Reference → (N)", directRef: "Reference by direct number",
    structuralLabels: "Structural labels",
    structuralLabelsDesc: "Internal labels for referencing sections, equations, figures, tables, and environments. They export as \\label/\\ref in LaTeX and stay clean in Obsidian Markdown.",
    sectionLabelDesc: "Labels a section; reference with @sec:intro",
    tableLabelDesc: "Labels a Markdown table; reference with @tbl:constants",
    envLabelDesc: "Labels a theorem/lemma/definition; reference with @thm:main",
    labelsPanelDesc: "Panel that audits broken references, duplicate labels, unused labels, and jumps to file/line",
    labelAutocompleteDesc: "Autocompletes existing labels when typing @eq:, @fig:, @tbl:, @sec:, @thm:, etc.",
    qualityWorkflow: "Quality, export, and project",
    qualityWorkflowDesc: "Use the Quality panel before exporting: it combines diagnostics, Overleaf/Obsidian compatibility, academic structure, main-document planning, and mathematical backlinks.",
    projectMainDesc: "Marks a file as the main project document",
    projectTransclusionDesc: "Includes files in project export through transclusions",
    projectExportDesc: "Resolves transclusions and generates one Overleaf-ready .tex file",
    localLatexCompileDesc: "Uses tectonic, xelatex, or pdflatex when installed",
    mathBacklinksDesc: "Shows which equations, sections, tables, or theorems use each label",
    macrosDesc: "Vault → Edit macros.md. Applied throughout the vault.",
    noArgs: "Without arguments", withArgs: "With N arguments (#1, #2…)",
    bibtexDesc: "Vault → Edit references.bib.",
    cite: "Citation → [N] with link", citeNote: "Citation with note",
    fmTitle: "H1 highlighted at start of preview", fmAuthor: "Author name",
    fmDate: "Document date", fmTags: "List: [t1, t2] or - bullet",
    wikilinkRow: "Link — click in preview to navigate",
    wikilinkDesc: "The ← tab shows backlinks of the active file. Autocomplete suggests names when typing [[.",
    templatesDesc: 'File → New from template · or Ctrl+P → "template". You can save custom templates with {{title}}, {{filename}}, {{date}}, and {{datetime}} variables.',
    tplArticle: "Article", tplArticleDesc: "Abstract + sections + BibTeX",
    tplNotes: "Class notes", tplNotesDesc: "Defs, theorems, proofs",
    tplHomework: "Homework / Problem set", tplHomeworkDesc: "Numbered exercises",
    tplTheorems: "Theorem sheet", tplTheoremsDesc: "Theorems, lemmas, corollaries",
    tplResearch: "Research note", tplResearchDesc: "Main equation + citations",
    headingsNote: "Headings inside the environment: use", headingsPurpose: " to organize content with visual hierarchy.",
    envSyntaxCode: ":::type[Title]", envSyntaxMid: "— content —",
    envCapabilities: "Support Markdown, math $...$, equations $$...$$, and headings ## ###.",
    eqCodeBlock: "$$\nE = mc^2\n$$ {#eq:energy}\n\nSee @eq:energy",
    syntaxPythagoras: "Pythagoras", syntaxUniqueness: "Uniqueness",
    syntaxContinuity: "Continuity", syntaxEvenFunction: "Even function",
    inlineExample: "Inline:",
    exampleTitle: "Title",
    mermaid: "Mermaid diagrams",
    mermaidDesc: "Code blocks with language 'mermaid' render as interactive diagrams.",
    mermaidFlow: "Flowchart",
    mermaidSeq: "Sequence diagram",
    mermaidGantt: "Gantt chart",
    callouts: "Callouts (highlighted notices)",
    calloutsDesc: "Quote blocks with a special type, Obsidian-style. The type text is free-form.",
    calloutNote: "> [!NOTE]\n> Additional info.",
    calloutNoteDesc: "Informational note (blue)",
    calloutWarning: "> [!WARNING]\n> Important caution.",
    calloutWarningDesc: "Warning (yellow)",
    calloutTip: "> [!TIP]\n> Useful suggestion.",
    calloutTipDesc: "Tip (green)",
    calloutImportant: "> [!IMPORTANT]\n> Do not ignore.",
    calloutImportantDesc: "Important (purple)",
    footnotes: "Footnotes",
    footnotesDesc: "Standard Markdown footnote syntax. Rendered at the bottom of the preview.",
    footnoteInline: "Text with note.[^1]",
    footnoteInlineDesc: "Inline reference — shows a clickable superscript",
    footnoteDef: "[^1]: Footnote content.",
    footnoteDefDesc: "Footnote definition — can go anywhere in the document",
    checkboxes: "Task lists",
    checkboxesDesc: "Checkboxes in the preview are interactive: clicking them updates the document.",
    checkboxUnchecked: "- [ ] Pending task",
    checkboxUncheckedDesc: "Unchecked task",
    checkboxChecked: "- [x] Completed task",
    checkboxCheckedDesc: "Checked task — click to uncheck",
    figures: "Numbered figures",
    figuresDesc: "Images with {#fig:id} labels are auto-numbered and can be referenced.",
    figureLabel: "![Caption](image.png){#fig:diagram}",
    figureLabelDesc: "Numbered image — generates 'Figure N: Caption'",
    figureRef: "@fig:diagram",
    figureRefDesc: "Reference → (N)",
    userSnippets: "User snippets (snippets.md)",
    userSnippetsDesc: "Create custom snippets in snippets.md at the vault root. They appear in the editor's autocomplete.",
    userSnippetFormat: "> prefix | description | snippet body",
    userSnippetFormatDesc: "Format of each snippet (one per line)",
    userSnippetExample: "> thm | Theorem template | :::theorem[${1:Title}]\\n${2:Statement}\\n:::",
    userSnippetExampleDesc: "Example: snippet that inserts a theorem environment",
    htmlMedia: "HTML & multimedia",
    htmlMediaDesc: "The editor accepts raw HTML in documents. Dangerous tags are stripped automatically.",
    htmlImg: '<img src="path.png" width="400" alt="desc">',
    htmlImgDesc: "Image with custom width",
    htmlVideo: '<video controls width="500"><source src="./video.mp4" type="video/mp4"></video>',
    htmlVideoDesc: "Local video (mp4, webm)",
    htmlYoutube: '<iframe width="560" height="315" src="https://www.youtube.com/embed/ID" allowfullscreen></iframe>',
    htmlYoutubeDesc: "YouTube video (only allowed iframe)",
    htmlDetails: '<details><summary>Show more</summary>Hidden content</details>',
    htmlDetailsDesc: "Collapsible block",
    htmlMark: '<mark>highlighted</mark>   <sub>sub</sub>   <sup>sup</sup>',
    htmlMarkDesc: "Highlight, subscript, superscript inline",
    htmlAllowed: "Allowed tags: div, span, p, img, video, audio, figure, figcaption, details, summary, table, mark, kbd, sub, sup, br, hr, blockquote, iframe (YouTube only)",
    htmlBlocked: "Blocked tags: script, iframe (others), object, embed, form, input, button",
    pseudocode: "Pseudocode",
    pseudocodeDesc: "Algorithm block with line numbers, highlighted keywords, and an auto-generated flowchart.",
    pseudocodeSyntax: "#algo[Title] … #end",
    pseudocodeSyntaxAlt: "Alternative: :::pseudocode[Title] … :::",
    pseudocodeExample: "#algo[Bubble Sort]\nINPUT: Array A[1..n]\nFOR i ← 1 TO n-1 DO\n  IF A[j] > A[j+1] THEN\n    SWAP A[j] ↔ A[j+1]\n  END IF\nEND FOR\n#end",
    pseudocodeKeywords: "Keywords: INPUT, OUTPUT, FOR, WHILE, IF, THEN, ELSE, RETURN, FUNCTION, PROCEDURE, REPEAT, UNTIL, SWAP, PRINT, BEGIN, END, …",
    truthTable: "Truth table",
    truthTableDesc: "Generates the truth table for one or more boolean expressions.",
    truthTableExample: ":::truth[De Morgan]\n¬(p ∧ q)\n¬p ∨ ¬q\n:::",
    graphViz: "Graph (Graph theory)",
    graphVizDesc: "Visualizes directed and undirected graphs from an edge list.",
    graphVizExample: ":::graph[Example]\nA -- B\nA -- C\nB -> D\n:::",
    functionPlot: "Function plotter",
    functionPlotDesc: "Plots mathematical functions: sin(x), x^2, etc. Supports multiple functions and custom range.",
    functionPlotExample: ":::plot[Trigonometric]\nf(x) = sin(x)\ng(x) = cos(x)\nrange: [-6.28, 6.28]\n:::",
    commDiag: "Commutative diagram",
    commDiagDesc: "Arrow diagram for category theory. Nodes and labeled edges, auto-laid out.",
    commDiagExample: ":::commdiag[Example]\nA -> B [f]\nA -> C [g]\nB -> D [h]\nC -> D [k]\n:::",
    symbolPickerHelp: "Symbol picker (sidebar panel)",
    symbolPickerDesc: "Open the math symbol panel from the command palette (Ctrl+P → 'Math symbol picker'). Click any symbol to insert it at the cursor. Search by name or category (greek, operators, arrows, logic…).",
    mathPreviewHelp: "Inline math preview",
    mathPreviewDesc: "When moving the cursor away from an inline math block ($...$), a rendered preview appears below it. Can be disabled in Settings → Equation preview.",
    editorToggles: "Editor toggles",
    editorTogglesIntro: "Quick access from the command palette (Ctrl+P) or Settings. All persist across sessions.",
    sidebarPanels: "Sidebar panels",
    sidebarPanelsIntro: "Switch panels from the sidebar tabs or the command palette.",
    toggleTypewriter: "Typewriter mode",
    toggleTypewriterDesc: "Keeps the cursor vertically centered in the editor while you type.",
    toggleSyncScroll: "Sync scroll",
    toggleSyncScrollDesc: "The preview scrolls together with the editor cursor.",
    toggleWordWrap: "Word wrap",
    toggleWordWrapDesc: "Long lines wrap to the editor width instead of scrolling horizontally.",
    toggleMinimap: "Minimap",
    toggleMinimapDesc: "Thumbnail overview of the file shown to the right of the editor.",
    toggleSpellcheck: "Spellcheck",
    toggleSpellcheckDesc: "Enables the browser's native spellchecker inside the editor.",
    panelEnvironments: "Environments",
    panelEnvironmentsDesc: "Lists every :::theorem, :::lemma, etc. block in the vault with direct links.",
    panelLabels: "Structural labels",
    panelLabelsDesc: "Shows every {#sec:..} {#eq:..} {#fig:..} {#thm:..} label and where it's referenced.",
    panelQuality: "Document diagnostics",
    panelQualityDesc: "Quality linter: broken links, missing citations, duplicate labels, unnumbered equations.",
  },

  labelsPanel: {
    title: "Labels",
    filterPlaceholder: "Filter labels…",
    allTypes: "All types",
    broken: "broken",
    duplicates: "duplicates",
    unused: "unused",
    brokenSection: "Broken references",
    duplicateChip: "dup",
    unusedChip: "unused",
  },

  citationManager: {
    title: "BibTeX Reference Manager",
    close: "Close",
    noEntries: "No entries. Add one below.",
    noTitle: "No title",
    confirmDelete: "Confirm deletion",
    deleteEntry: "Delete entry",
    addEntry: "Add entry",
    yearPlaceholder: "Year",
    titlePlaceholder: "Title",
    authorPlaceholder: "Author(s)",
    keyPlaceholder: "Key *",
    add: "Add",
    cancel: "Cancel",
    save: "Save",
    keyRequired: "Key required",
    keyExists: (key) => `Key "${key}" already exists`,
    venueJournal: "Journal",
    venueBooktitle: "Event (booktitle)",
    venueSource: "Booktitle / Source",
  },

  graphPanel: {
    noFiles: "No files in vault",
    resetView: "Reset view",
    graphInfo: (n, e) => `${n} nodes · ${e} links`,
    root: "root",
  },

  frontmatterPanel: {
    fieldTitle: "Title",
    fieldAuthor: "Author(s)",
    fieldDate: "Date",
    fieldAbstract: "Abstract",
    fieldTags: "Tags",
    removeField: "Remove field",
    addField: "Add field",
    fieldKeyPlaceholder: "field",
    fieldValuePlaceholder: "value",
    layoutSection: "Document layout",
    paperSize: "Paper size",
    paperA4: "A4 (210×297 mm)",
    paperLetter: "US Letter (8.5×11 in)",
    paperA5: "A5 (148×210 mm)",
    paperA3: "A3 (297×420 mm)",
    paperLegal: "Legal (8.5×14 in)",
    headerLabel: "Header",
    footerLabel: "Footer",
    headerFooterHint: "Variables: {{title}}, {{author}}, {{date}}, {{page}}",
    orientation: "Orientation",
    portrait: "Portrait",
    landscape: "Landscape",
    left: "Left", center: "Center", right: "Right",
  },

  tagPanel: {
    noFiles: "No files to analyze tags",
    noTags: "No tags found",
    addTagsHint: "Add tags in frontmatter:",
    filterPlaceholder: "Filter tags…",
    typeAriaLabel: "Tag type",
    allTypes: "All types",
    fileCount: (n) => `${n} file${n === 1 ? "" : "s"}`,
  },

  tabBar: {
    warningCount: (n) => `${n} warning${n === 1 ? "" : "s"}`,
    pin: "Pin",
    unpin: "Unpin",
    pinAriaLabel: "Pin tab",
    unpinAriaLabel: "Unpin tab",
  },

  tableEditor: {
    alignLeft: "Left",
    alignCenter: "Center",
    alignRight: "Right",
    copyLatex: "Copy as LaTeX",
    latexCopied: "Copied!",
    addRow: "+ Row",
    removeRow: "− Row",
    addColumn: "+ Col",
    removeColumn: "− Col",
    preview: "Preview",
    cancel: "Cancel",
    insert: "Insert",
  },

  symbolPicker: {
    title: "Math symbols",
    searchPlaceholder: "Search symbol…",
    all: "All",
  },

  latexErrors: {
    title: "PDF Export Failed",
    noDetails: "No error details available.",
    errorLabel: "Error",
    warningLabel: "Warning",
    line: "line",
    context: "Context",
    suggestion: "Fix",
    close: "Close",
  },

  templates: {
    blank:      { name: "Blank",          description: "Empty file" },
    article:    { name: "Article",        description: "Academic document with abstract and sections" },
    notes:      { name: "Class notes",    description: "Definitions, theorems and proofs" },
    homework:   { name: "Homework",       description: "Numbered exercises with space for solutions" },
    theorems:   { name: "Theorem sheet",  description: "Collection of theorems, lemmas and corollaries" },
    research:   { name: "Research note",  description: "Template with main equation and bibliography" },
    letter:     { name: "Letter",         description: "Formal letter with recipient and signature" },
  },

  documentLab: {
    diagnostics: "Diagnostics",
    compatibility: "Export",
    project: "Project",
    structure: "Structure",
    mathlinks: "Math backlinks",
    quality: "Quality",
    errors: "Errors",
    warnings: "Warnings",
    info: "Info",
    noIssues: "No issues detected.",
    noIssuesCompat: "No degradations detected.",
    noIssuesStructure: "Academic structure — no alerts.",
    noMathBacklinks: "No math backlinks.",
    noMainDoc: "No main document detected.",
    mainDocument: "Main document",
    included: "Included",
    missingEmbeds: "Missing embeds",
    includedFiles: "Included files",
    missingEmbed: (name) => `Missing embed: ${name}`,
    references: (n) => `${n} reference${n !== 1 ? "s" : ""}`,
    line: "line",
    searchLabel: "Search term",
    replaceLabel: "Replacement text",
    searching: "Searching…",
    replacing: "Replacing…",
    search: "Search",
    replaceAll: "Replace all",
    replace: "Replace",
  },

  breadcrumb: {
    location: "Location",
    back: "Back",
    backTitle: "Back (Alt+←)",
    forward: "Forward",
    forwardTitle: "Forward (Alt+→)",
  },

  searchReplace: {
    searchAriaLabel: "Search term",
    replaceAriaLabel: "Replacement text",
  },
}

// ── Context & hook ────────────────────────────────────────────────────────────

export const LANGS: Record<Lang, T> = { en, es }

export const LanguageContext = createContext<T>(es)

export function useT(): T {
  return useContext(LanguageContext)
}
