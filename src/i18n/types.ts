export type Lang = "en" | "es"

// ── Translation shape ─────────────────────────────────────────────────────────

export interface T {
  toolbar: {
    bold: string; italic: string; strikethrough: string; inlineCode: string
    underline: string
    highlight: string; hlDefault: string; hlGreen: string; hlBlue: string
    hlPurple: string; hlOrange: string; hlRed: string; hlPink: string
    headings: string; heading1: string; heading2: string; heading3: string
    insert: string; quote: string; separator: string; list: string; insertToc: string
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
    math: string
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
    // unified menu bar section titles
    secFiles: string; secTexts: string; secMath: string; secViews: string
    symbols: string
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
    newFileHere: string; newFolderHere: string; newFromTemplateHere: string
    folderRules: string; saveAsTemplate: string
    creatingIn: (folder: string) => string
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
    filterPlaceholder: string
    lineTitle: (n: number) => string
    totalWords: string
    wordsAbbr: string
    dragToReorder: string
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
    listContinuation: string; listContinuationDesc: string
    autoFoldExcalidraw: string; autoFoldExcalidrawDesc: string
    readingWpm: string; readingWpmDesc: string
    closeAriaLabel: string
    sectionEditor: string; sectionPreview: string; sectionGeneral: string
    sectionDailyNotes: string
    dailyNotesEnabled: string
    dailyNotesFolder: string
    dailyNotesFolderPlaceholder: string
    dailyNotesTemplate: string
    dailyNotesTemplateHint: string
    sectionPdf: string
    useWasmTex: string; useWasmTexDesc: string
    texliveUrl: string; texliveUrlDesc: string
    autoRebuildPdf: string; autoRebuildPdfDesc: string
    wasmTexInitializing: string; wasmTexCompiling: string; wasmTexFallback: string
    wasmTexUnavailable: string
    sections: {
      general: string
      editor: string
      preview: string
      dailyNotes: string
      pdf: string
      sync: string
    }
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
    searchPlaceholder: string
    noMatches: string
    dailyNote: string
    openAiAssistant: string; insertTocShortcut: string; toggleOutline: string
  }

  onboarding: {
    title: string
    step: (current: number, total: number) => string
    skip: string
    next: string
    back: string
    done: string
    step1Title: string; step1Text: string
    step2Title: string; step2Text: string
    step3Title: string; step3Text: string
    step4Title: string; step4Text: string
  }

  emptyStates: {
    todoIcon: string; todoMessage: string
    backlinksIcon: string; backlinksMessage: string
    equationsIcon: string; equationsMessage: string
    environmentsIcon: string; environmentsMessage: string
    labelsIcon: string; labelsMessage: string
    tagsIcon: string; tagsMessage: string
    outlineIcon: string; outlineMessage: string
    bookmarksIcon: string; bookmarksMessage: string
    closedTabsIcon: string; closedTabsMessage: string
  }

  aiGaps: {
    fillAtCursor: string; fillAll: string
    noGapAtCursor: string; noneFound: string; nothingGenerated: string
    filled: (n: number) => string
    working: string
    insertGap: string
  }

  splitSections: {
    title: string
    needSections: string
    confirm: (n: number, name: string) => string
    exists: (file: string) => string
    done: (n: number) => string
    command: string
  }

  panelSearch: {
    placeholder: string; helpPlaceholder: string; clear: string
    count: (shown: number, total: number) => string
  }

  folderRules: {
    title: (folder: string) => string
    close: string; intro: string
    defaultTemplate: string; noTemplate: string
    filenamePattern: string; filenameHint: string
    frontmatter: string; frontmatterHint: string
    generatedFiles: string; generatedHint: string; addGenerated: string; removeGenerated: string
    generatedFileName: string; generatedType: string; generatedScope: string
    scopeFolder: string; scopeVault: string
    generatorNames: { tasks: string; calendar: string; index: string }
    save: string; cancel: string; saved: string
    regenerate: string
    regenerated: (n: number) => string
    regenerateNoRules: string
    skippedNotGenerated: (file: string) => string
    savedAsTemplate: (name: string) => string
    templateNamePrompt: string
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
    texEngineWasm: string; texEngineLocal: string
    texEngineCompiling: string
    texEngineTitle: string
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
    normalizeTable: string; normalizeTableNone: string; normalizeTableDone: string
    checkUpdates: string
    exportAnkiCards: string
    symbolPicker: string
    exportProjectTex: string
    compileLatexPdf: string
    compileWasmPdf: string
    viewLabels: string
    viewQuality: string
    openDailyNote: string
    showOnboarding: string
    viewPdf: string
    addComment: string
    viewComments: string
    toggleCommentResolved: string
    importDoc: string
    exportTypst: string
    exportTypstPdf: string
    insertExcalidraw: string
    insertWikilink: string; insertTransclusion: string; insertFootnote: string
    insertCallout: string; insertCitation: string; insertFigure: string
    insertFrontmatter: string; insertEnvRef: string
    back: string
    openPanel: (name: string) => string
    insertCodeBlock: string
    openAi: string
    aiInlineEdit: string
    exportObsidian: string
    categories: {
      Edición: string
      Insertar: string
      Matemáticas: string
      Vista: string
      Exportar: string
      IA: string
      Vault: string
      Navegación: string
    }
  }

  excalidraw: {
    modalTitle: string
    save: string
    cancel: string
    loading: string
    placeholder: string
    unsavedPrompt: string
    discard: string
    keepEditing: string
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
    pdfPreview: string
    comments: string
    cloudSync: string
    focusTimer: string
    ai: string
    keep: string
    more: string
  }

  keepPanel: {
    title: string
    filterPlaceholder: string
    allCategories: string
    uncategorized: string
    count: (n: number) => string
    exportGlossary: string
    exportDialogTitle: string
    exported: string
    glossaryTitle: string
    emptyIcon: string
    emptyMessage: string
  }

  ai: {
    title: string
    disabledTitle: string
    disabledBody: string
    openSettings: string
    inputPlaceholder: string
    send: string
    sendHint: string
    clearThread: string
    newConversation: string
    conversations: string
    deleteConversation: string
    settingsShortcut: string
    stop: string
    thinking: string
    you: string
    assistant: string
    insertAtCursor: string
    replaceSelection: string
    copy: string
    copied: string
    noEditor: string
    noSelection: string
    emptyThread: string
    ctxCurrentFile: string
    ctxSelection: (n: number) => string
    ctxNote: string
    quickActions: string
    errMissingApiKey: string
    errMissingBaseUrl: string
    errMissingModel: string
    errMissingCli: string
    errGeneric: (msg: string) => string
    // Slash quick-actions: label + the instruction sent to the model.
    actions: {
      proofread: string;     proofreadInstr: string
      shorten: string;       shortenInstr: string
      latexify: string;      latexifyInstr: string
      explain: string;       explainInstr: string
      counterexample: string; counterexampleInstr: string
      translate: string;     translateInstr: string
      summarize: string;     summarizeInstr: string
    }
    // Ctrl/Cmd+K inline AI edit widget.
    cmdk: {
      placeholderEdit: string
      placeholderInsert: string
      disabledHint: string
      generating: string
      accept: string
      reject: string
      submit: string
      cancel: string
      original: string
      proposed: string
      emptyResult: string
    }
  }

  aiSettings: {
    section: string
    enabled: string
    enabledDesc: string
    provider: string
    baseUrl: string
    baseUrlPlaceholder: string
    model: string
    modelPlaceholder: string
    apiKey: string
    apiKeyPlaceholder: string
    apiKeyNote: string
    cliCommand: string
    cliCommandPlaceholder: string
    cliNote: string
    warmup: string
    warmupDesc: string
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

  focusTimer: {
    title: string
    phaseWork: string; phaseBreak: string; phaseLongBreak: string
    start: string; pause: string; reset: string
    cycles: string
    durations: string; workMin: string; breakMin: string; longBreakMin: string; cyclesLabel: string
    session: string
    wordsThisSession: string
    peakWords: string; activeTime: string; pausedTime: string; activeWpm: string
    pomodorosDone: string; wordsPerPomodoro: string; filesTouched: string
    barTitle: string
    elapsed: string
    wpm: string
    goalProgress: string
    noActiveDoc: string
    phaseDone: (phase: string) => string
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
    gitNotFoundTitle: string
    gitNotFoundHint: string
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
    exportReveal: string; importDoc: string
    exportTypst: string; exportTypstPdf: string
    recent: string; clearRecent: string
    findInFile: string; searchVault: string; commandPalette: string
    undo: string; redo: string; cut: string; copy: string; paste: string; selectAll: string
    duplicateLine: string; moveLineUp: string; moveLineDown: string; toggleComment: string
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
    dailyNoteCreated: (name: string) => string
    dailyNoteOpened: (name: string) => string
    dailyNoteError: (err: string) => string
    dailyNoteNoVault: string
    updateInstallFailed: (err: string) => string
    importDocTitle: string
    importing: string
    importSuccess: (name: string) => string
    importError: (err: string) => string
    pandocMissingImport: string
    typstExportTitle: string
    typstGenerating: string
    typstSuccess: string
    typstError: (err: string) => string
    typstPdfSuccess: string
    typstPdfError: (err: string) => string
    pandocMissingTypst: string
    /** Spell-check marker message for an unknown word. */
    spellError: (word: string) => string
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
    featureWasmTex: string; featureWasmTexDesc: string
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
    conflictDiff: (added: number, removed: number) => string
    conflictReload: string; conflictKeepMine: string; conflictCancel: string
    conflictReloadHint: string; conflictKeepHint: string; conflictCancelHint: string
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
    closeTabSaveError: (name: string, err: string) => string
    invalidPath: (path: string) => string
    invalidPathSystem: string
    selectVaultError: (err: string) => string
  }

  helpPanel: {
    environments: string; shorthands: string; equations: string
    macros: string; bibtex: string; frontmatter: string; wikilinks: string
    tplFromFile: string; tplFromFileDesc: string
    folderRules: string; folderRulesDesc: string
    frOpen: string; frOpenDesc: string
    frTemplate: string; frTemplateDesc: string
    frPattern: string; frPatternDesc: string
    frFrontmatter: string; frFrontmatterDesc: string
    frGeneratedLabel: string; frGeneratedDesc: string
    frTasks: string; frTasksDesc: string
    frCalendar: string; frCalendarDesc: string
    frIndex: string; frIndexDesc: string
    frRegenerate: string; frRegenerateDesc: string
    frMarker: string; frMarkerDesc: string
    longDocs: string; longDocsDesc: string
    ldFold: string; ldFoldDesc: string
    ldSplit: string; ldSplitDesc: string
    ldEnter: string; ldEnterDesc: string
    ldNormalizeTable: string; ldNormalizeTableDesc: string
    templates: string; greekLetters: string; operators: string
    // markdown formatting section
    formatting: string; formattingIntro: string
    fmtBoldDesc: string; fmtItalicDesc: string; fmtStrikeDesc: string
    fmtUnderlineDesc: string; fmtHighlightDesc: string; fmtHighlightColorDesc: string
    fmtInlineCodeDesc: string; fmtCommentDesc: string; fmtAnnotationDesc: string
    fmtTocDesc: string
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
    inlineNumberedDesc: string
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
    transclusionFile: string; transclusionFileDesc: string
    transclusionHeading: string; transclusionHeadingDesc: string
    transclusionBlock: string; transclusionBlockDesc: string
    blockIdRow: string; blockIdDesc: string
    wikilinkHoverDesc: string
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
    envRefs: string; envRefLabelDesc: string; envRefLocalDesc: string
    envRefCrossDesc: string; envRefSpacesDesc: string
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
    specialBlocksNote: string
    blockAutocompleteNote: string
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
    // flowchart section
    flowchart: string; flowchartDesc: string; flowchartExample: string
    // excalidraw section
    excalidraw: string; excalidrawDesc: string; excalidrawExample: string
    // AI assistant section
    aiAssistant: string; aiAssistantDesc: string
    aiPanelRow: string; aiPanelRowDesc: string
    aiGapRow: string; aiGapRowDesc: string
    aiInlineRow: string; aiInlineRowDesc: string
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
    doiPlaceholder: string
    doiAdd: string
    doiFetching: string
    doiSuccess: (key: string) => string
    doiError: string
    doiExists: (key: string) => string
    zoteroHeading: string
    zoteroPlaceholder: string
    zoteroSearch: string
    zoteroSearching: string
    zoteroFetching: string
    zoteroNoResults: string
    zoteroImportAll: string
    zoteroUnavailable: string
    zoteroImported: (n: number) => string
    zoteroDuplicate: (key: string) => string
  }

  graphPanel: {
    noFiles: string
    resetView: string
    graphInfo: (nodes: number, edges: number) => string
    root: string
    searchPlaceholder: string
    filterPlaceholder: string
  }

  preview: {
    hoverLoading: string
    hoverNotFound: string
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

  deps: {
    intro: string
    pandocFeatureWasm: string
    pandocFeatureNoWasm: string
    zipFeature: string
    install: string
    ignore: string
    ignoreTitle: (label: string) => string
  }

  updateBanner: {
    available: (version: string | undefined) => string
    installing: string
    installRestart: string
    later: string
  }

  comments: {
    title: string
    addAriaLabel: string
    addAtCursor: string
    addPlaceholder: string
    save: string
    cancel: string
    resolved: string
    unresolved: string
    all: string
    deleteAriaLabel: string
    noComments: string
    noResolved: string
    noUnresolved: string
    atLine: (line: number) => string
    jumpTitle: (line: number) => string
    count: (n: number) => string
    markResolved: string
    markUnresolved: string
    editTitle: string
    emptyBody: string
    filterAriaLabel: string
    promptForBody: string
    addedToast: string
    deletedToast: string
    noVault: string
    noFile: string
    noCommentAtCursor: string
  }

  templates: Record<string, { name: string; description: string }>

  symbolPicker: {
    title: string
    searchPlaceholder: string
    all: string
  }

  pdfPreview: {
    title: string
    loading: string
    noPdf: string
    error: string
    zoomIn: string
    zoomOut: string
    fitWidth: string
    previousPage: string
    nextPage: string
    page: string
    jumpedToHeading: (heading: string) => string
    headingNotFound: (heading: string) => string
  }

  cloudSync: {
    statusBadge: (provider: string) => string
    statusBadgeTitle: (provider: string, root: string) => string
    bannerTitle: (provider: string) => string
    bannerBody: string
    bannerOpenFolder: string
    bannerDismiss: string
    panelTitle: string
    panelEmpty: string
    panelHelp: string
    conflictWith: (provider: string) => string
    conflictMissingOriginal: string
    conflictBadge: string
    actionOpenBoth: string
    actionKeepMine: string
    actionKeepCopy: string
    actionDeleteCopy: string
    actionRevealInFolder: string
    confirmDeleteCopy: (name: string) => string
    confirmKeepCopy: (name: string) => string
    deletedToast: (name: string) => string
    keptCopyToast: (name: string) => string
    errorAction: (err: string) => string
    settings: {
      intro: string
      bannerEnabled: string
      bannerEnabledDesc: string
      detectEnabled: string
      detectEnabledDesc: string
      providerDetected: (provider: string) => string
      providerNone: string
      resetDismissed: string
      resetDismissedDesc: string
      resetDismissedDone: string
    }
  }
}
