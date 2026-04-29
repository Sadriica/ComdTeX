# Changelog

All notable changes to ComdTeX will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.2] - 2026-04-29

### Added
- **`:::flowchart` environment:** native flowchart rendering from pseudocode syntax, via mermaid runtime (transparent background, dark theme variables). Coexists with `:::pseudocode` (numbered code + collapsible flowchart)
- **Inline labeled equations:** `$inline$ {#eq:label}` is now numbered and referenceable like `$$display$$ {#eq:label}` — both forms share the same counter (`NUMBERED_MATH_RE` + `wrapInlineNumbered`)
- **Callout-style environment aliases** (unnumbered): `tip`, `hint`, `info`, `warning`, `caution`, `attention`, `important`, `danger`, `error`, `failure`, `success`, `check`, `done`, `question`, `help`, `faq`, `quote`, `cite`, `abstract`. Themed border/background/label colors per category
- **Plot bounds shorthand:** `:::plot` accepts `xmin = N` / `xmax = N` per-line (in addition to `range: [a, b]`)
- **`docs/installing-deps.md`:** per-OS install guide for `pandoc` / `zip` / `git`, with troubleshooting for the Tauri shell scope `PATH` cache

### Fixed
- **Toolbar code-block snippet** inserted literal `\`` (backslash + backtick) instead of triple backticks — the JS string was over-escaped (`"\\\`\\\`\\\`"` produced `\` `` ` `` repeated). Same bug in the bundled `comdtex.md` template (auto-migrated on open: `\\`` → `` ` ``)
- **Special envs (`:::plot/graph/truth/commdiag/pseudocode/flowchart`) corrupted** by shorthand expansion — `exp(...)` / `sqrt(...)` were auto-wrapped in `$..$`, then the env's parser choked on `$`. Preprocessor now masks special-env bodies before shorthand expansion (`SPECIAL_ENV_RE` in `maskCode`)
- **`:::commdiag` rendering as a thin strip** (height 0) — `__height__` sentinel was stored as `{x: height, y: 0}` but read as `.y`. Inversion fixed
- **Graph layout wrapped backwards** (right-then-left-and-down) for small graphs — replaced circular layout with grid (left→right, top→bottom)
- **`$$..$$` and `$..$` inside backticks rendered as math** in prose talking about math syntax — the math regex now skips inline-code spans
- **CMDX warnings on opening `comdtex.md`** about `lg`/`sm` size prefixes — removed the prefixes from the bundled template
- **Tauri shell scope rejected `pandoc`/`zip`/`git`** — `shell:allow-execute` now uses the v2 object form with an explicit `allow` list (`pandoc`, `zip`, `git`, `tectonic`, `xelatex`, `pdflatex`)
- **DepsWarning install button did nothing** — `openPath` is for filesystem paths; switched to `openUrl` for the `https://` doc link
- **Math overflow in callout/env bodies** for long `$$..$$` equations — `.eq-block` now allows shrinking (`min-width: 0`); inner `.katex-wrapper` scrolls horizontally
- **Click-to-jump preview→editor scrolled imprecisely** — env handlers now wrap output in `<div class="env-wrap" data-source-line="N">`, with `N` resolved against the editor's *raw* text (not the post-`preprocessCallouts`/`preRenderDisplayMath` text where multi-line constructs collapse to one-line placeholders)
- **Preview yanked back to the section heading** after a preview-click moved the editor cursor — added `suppressPreviewScrollOnce` ref consumed by the heading-active scroll-sync effect; smooth scroll on the editor side (`ScrollType.Smooth`)
- **`:::flowchart` had three disconnected terminal nodes** (`Start`, `END`, `End`) floating at the top — strip a trailing structural `END` from the AST and skip the virtual `End` when all paths already terminate via `RETURN/STOP`
- **Settings dropdowns illegible** — added `appearance: none`, transparent background, contrasting text + custom chevron; `<option>` elements force their colors per theme

### Changed
- **`:::env` source-line annotation:** the wrapper `.env-wrap` carries the editor line via `data-source-line`. The annotator selector includes it so click-sync targets envs precisely
- **Mermaid theme:** initialized with `themeVariables: { background, mainBkg, primaryColor, secondaryColor, tertiaryColor: 'transparent' }` so flowchart canvas matches the surrounding preview background
- **`comdtex.md` enriched** with examples for code blocks, pseudocode, flowchart, truth tables, graphs, function plots, commutative diagrams, transclusion, callouts, and inline labeled equations

---

## [1.3.1] - 2026-04-28

### Fixed
- **Update install button stuck on "Installing…":** wrapped install flow in try/finally with error toast on failure
- **`useUpdater.downloadAndInstallUpdate`:** added error handling and typed rethrow so failures surface to the UI
- **Hardcoded `/` path separators on Windows:** fixed in `useVault.rename`, `App.tsx`, `exportActions.ts`, `GraphPanel.tsx`, `GitBar.tsx`, `Breadcrumb.tsx`, `documentDiagnostics.ts`, and `monacoSetup.ts`
- **`closeTab` data-loss risk:** save errors are now toasted and the tab is kept open instead of silently swallowed
- **`wasmTex.ts` sticky init promise:** rejection no longer prevents retrying the WASM compile
- **First-render preview race:** equations at the top of a file rendered as raw LaTeX because preview ran before macros loaded; preview is now gated until macros are ready

### Changed
- **SettingsModal:** redesigned as a tabbed left-sidebar layout with five sections (General, Editor, Vista previa, Notas diarias, Compilación PDF) and a scrollable right pane
- **Sidebar tab strip:** reduced from 18 stacked icons to 6 essentials plus an overflow `⋯` popup containing the remaining 12
- **Command palette:** vertically positioned at 35vh instead of the very top of the screen
- **DepsWarning:** persistent per-dep dismissal in localStorage (`comdtex_deps_dismissed`); pandoc and zip dismissed independently
- **`pathBasename` / `pathDirname`:** converted from async (Tauri IPC roundtrip) to sync helpers handling both `/` and `\`

### Added
- 9 new unit tests for `pathBasename`/`pathDirname` plus 1 regression test for the first-render preview bug (324 total, was 314)
- CI: version-consistency check (tag vs `package.json` / `Cargo.toml` / `tauri.conf.json`)
- CI: SHA256 checksum generation for release artifacts
- CI: auto-generated changelog from git log between tags
- CI: `cargo clippy --all-targets -- -D warnings` and `cargo fmt -- --check`
- CI: Playwright e2e job (currently `continue-on-error: true` pending Tauri API mocking)
- CI: new `audit.yml` workflow (weekly + on lockfile change) running `npm audit` and `cargo audit`, opening an issue on scheduled failure
- CI: pinned `tauri-apps/tauri-action` to a specific version, added concurrency control (cancel-in-progress on PRs only) and `timeout-minutes` on all jobs

### Removed
- CI: `arch-release` job — Tauri does not support pacman bundles and the job was always failing

### Security
- `npm audit fix`: bumped Vite to patched 7.x (high-severity path-traversal CVE in dev server); moderate `dompurify` and `postcss` findings auto-fixed in the same pass

---

## [1.3.0] - 2026-04-27

### Added
- **Bundled WASM LaTeX engine (SwiftLaTeX):** PDF compilation no longer requires `pandoc`, `xelatex`, or `tectonic` to be installed
- SwiftLaTeX PdfTeX engine ships in `public/wasm-tex/` (84 KB JS + 1.7 MB WASM) and runs in a Web Worker
- `compileLatexPdf` tries the WASM engine first when `settings.useWasmTex` is enabled (default `true`), falling back to local `tectonic` / `xelatex` / `pdflatex` on failure
- Exotic LaTeX packages are lazy-fetched from `texlive2.swiftlatex.com` and cached in IndexedDB
- New "Compile PDF (WASM engine)" command in the command palette
- `LatexErrorModal` surfaces compile errors with log excerpts
- StatusBar indicator shows `TeX: WASM | local` plus a transient "compiling…" state
- New "PDF compilation" section in Settings with a `useWasmTex` toggle
- 11 new unit tests (314 total, was 303)

### Changed
- **DepsWarning copy:** pandoc is now described as required only for DOCX / Beamer / Markdown-to-PDF flows

---

## [1.2.0] - 2026-04-27

### Added
- **PDF preview pane** powered by `pdfjs-dist`: virtualized rendering with zoom, fit-width, and pan
- Heading-based click-to-source jumps from the PDF preview back to the editor
- Auto-rebuild of the PDF preview on file save
- **Per-line comments** with a sidebar panel and All / Unresolved / Resolved filter, persisted in `.comdtex-comments.json`, with drift detection when the underlying line moves
- **Daily notes** (`Ctrl+Shift+D`) with a configurable folder and template
- **Transclusion:** block references via `![[note]]`, block IDs via `^id`
- **Wikilink hover preview** showing the linked note's content inline
- **Improved graph view:** zoom, pan, search, and filter
- First-launch onboarding tour (4 steps, replayable)
- Polished empty states across 9 panels
- Searchable keyboard shortcut help
- 33 new tests (303 total, was 270)

---

## [1.1.0] - 2026-04-24

### Added
- **Themes:** additional theme options beyond dark / light / high-contrast
- **Structured environments:** richer rendering and metadata for `:::theorem` / `:::lemma` / etc. blocks
- **Full i18n parity:** every remaining UI string translated; English and Spanish are now feature-complete

### Fixed
- Multiple **data-loss** edge cases around tab close, autosave, and crash recovery

---

## [1.0.1] - 2026-04-17

### Fixed
- **Windows build (TS1149/TS1192):** Renamed `src/toast.ts` → `src/toastService.ts` to eliminate a filename case collision with `src/Toast.tsx` that caused TypeScript errors on Windows (case-insensitive filesystem)
- **Arch Linux CI:** Removed `arch-check` and `arch-release` CI jobs entirely — Tauri v2 does not support `pacman` as a bundle target (valid Linux targets: `deb`, `rpm`, `appimage`); Arch Linux users are directed to use the `.AppImage` build instead
- **Copy error toast:** `handleCopyHtml` and `handleCopyLatex` now show the correct error message on clipboard failure instead of the success message
- **Hardcoded i18n strings in HelpPanel:** `"Inline:"` and `":::theorem[Título]"` were not translated; now use `hp.inlineExample` and `hp.exampleTitle` respectively
- **Duplicate keyboard shortcut:** `Ctrl+Shift+F` was bound to both Focus mode and Search vault simultaneously; Focus mode binding removed (only `F11` now)
- **Menu entry not translated:** "Backlinks" menu item was hardcoded in English regardless of language setting
- **Focus mode menu inconsistency:** Toggling Focus mode from the View menu now shows a toast notification, consistent with the palette and keyboard shortcut
- **`onCreateVault` did nothing different:** "Create new folder" on the welcome screen now actually creates a new folder via a save dialog instead of reusing the open-folder dialog
- **`BacklinksPanel` unhandled rejection:** Added `.catch()` to the `Promise.all` that reads vault files

---

## [1.0.0] - 2026-04-15

### Added

**Editor**
- Monaco Editor with full syntax highlighting for Markdown and LaTeX
- Vim mode (via monaco-vim) toggleable from settings
- Word wrap, minimap, and typewriter mode
- Spellcheck support
- Tab-based shorthand expansion with snippet placeholders
- Autocomplete for shorthands and BibTeX citation keys

**Math**
- KaTeX rendering for inline (`$...$`) and display (`$$...$$`) math
- Shorthand system: `frac(a,b)`, `sqrt(x)`, `sum(i,n)`, `int(a,b)`, `mat(...)`, and more
- Preprocessor expands shorthands before KaTeX, with nesting support
- Auto-numbered display equations with label/reference resolution (`{#eq:label}` / `@eq:label`)
- Math environments via `:::type[title]` blocks: `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `exercise` (auto-numbered), `proof`, `remark`, `note`
- Size-prefixed environments (`sm`, `lg`)
- User-defined `\newcommand` macros loaded from `macros.md`

**References**
- BibTeX parser reading `references.bib` from vault root
- `[@key]` citation syntax with automatic bibliography rendering
- Citation autocomplete in the editor
- Citation Manager GUI for browsing and managing references

**Navigation**
- Wikilinks (`[[note-name]]`) with in-preview navigation
- Backlinks panel showing all incoming links to the active file
- File graph visualization
- Navigation history with back/forward buttons

**Export**
- PDF export via Pandoc with fallback to `window.print()`
- LaTeX (`.tex`) export with compilable output
- DOCX export via Pandoc
- Beamer presentation export
- Reveal.js presentation export
- HTML export

**Vault**
- File tree with drag-and-drop reordering
- Vault-wide full-text search and replace
- Outline panel showing heading hierarchy of the active file
- Tags support via YAML frontmatter
- File properties panel
- Autosave with 800 ms debounce
- Crash recovery via localStorage drafts
- Vault backup utility
- Recent vaults list on the welcome screen

**UI**
- Focus mode for distraction-free writing
- Custom preview CSS support
- Word count goal with progress indicator
- Estimated reading time display
- Dark, light, and high-contrast themes
- Custom window titlebar (minimize, maximize, close)
- Command palette (Ctrl+P) for fuzzy file and command search
- Status bar with cursor position, word/character count, and macro count
- Toast notifications
- Keyboard shortcuts reference modal
- New-file-from-template picker (7 academic templates)
- Settings modal for language, fonts, theme, and vim mode

**Internationalization**
- Full Spanish and English UI translations
- Runtime language switching without restart

**Desktop**
- Tauri v2 desktop application for Linux, macOS, and Windows
- Auto-updater via GitHub Releases
- AppImage packaging for Linux
