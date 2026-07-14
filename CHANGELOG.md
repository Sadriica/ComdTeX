# Changelog

All notable changes to ComdTeX will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- **Table labels no longer render as an extra table row.** `{#tbl:label}` written directly under a table (the documented form) was folded into the table by markdown-it as a lazy continuation, so the label text showed up as a cell. Both the documented form and the blank-line-separated form are now recognised by the prescan *and* consumed by the renderer, so the label never reaches the output either way.
- **`@tbl:` references resolve again.** The prescan only accepted the no-blank-line form while the renderer only consumed the blank-line form, so no way of writing a table label worked end-to-end: one leaked the label, the other degraded every reference to "Tabla (?)".
- **Table and figure cross-reference links are no longer dead.** `@tbl:data` linked to `#tbl-data` while the table was given `id="tbl-tbl:data"`, and `@fig:map` linked to `#fig-map` while the figure was given `id="fig-1"` (the label was smuggled through markdown-it in the title slot but read back from a `data-fig-label` attribute that was never emitted). Anchors are now derived from one canonical helper per module, so refs and ids always agree.
- **Figure labels no longer surface as a tooltip.** The internal `title="fig-label:fig:..."` used to carry labels through markdown-it is now stripped from the rendered `<img>`.
- **Pipe tables inside fenced code no longer shift table numbering.** The prescan counted them, the renderer did not, so `@tbl:` refs after a code sample containing a table resolved to the wrong number.
- **`@sec:` references resolve again.** `numberHeadings` stored heading labels with their `sec:` prefix while `resolveSectionRefs` looked them up without it, so the documented `@sec:intro` form never matched and the raw `@sec:intro` text appeared in the preview. Only the accidental `@sec:sec:intro` double-prefix form worked; both are now accepted.
- **Headings get an `id` in every document, not just ones containing a `[[toc]]`.** Heading ids were only assigned as a side effect of expanding the TOC, so in a document without one every in-page link was dead. Id assignment now always runs, and the auto-TOC links to the ids the headings actually have instead of re-deriving its own.
- **Explicit `{#sec:label}` ids now reach the rendered heading**, so a `@sec:` link points at the labeled heading rather than at a slug of its text.
- **`@sec:` / `@thm:`-family references at the end of a sentence resolve again.** Their label pattern swallowed the trailing period, so "ver @thm:main." looked up `main.` and rendered as unresolved. Dots inside a label (`@thm:1.2`) still work.
- **Clicking a cross-reference now scrolls the preview to its target.** In-page anchors are handled before the source-line fallback, which previously hijacked the click and jumped the editor to the line the reference was written on.
- **Unknown `@sec:` labels render as a broken-reference marker** (`sección (?)`) instead of leaking the raw `@sec:…` source text, matching how `@tbl:` and `@fig:` already behaved.

## [1.9.7] - 2026-07-14

### Fixed
- **Saving no longer fails on Linux.** Since 1.9.6 every write — autosave, save, save-as, vault-wide replace and the comment store — failed with `forbidden path: /<vault>/.<name>.tmp-<hex>`, leaving edits unsaved on disk. Atomic writes go to a temp file first, and that temp file was dot-prefixed; Tauri's fs scope matches with glob's `require_literal_leading_dot`, which is `true` by default on Unix, so the `<vault>/**` grant could not match a name starting with a dot. Temp files are no longer hidden (the file tree filters them by name instead), and `.comdtex-comments.json` — whose own name starts with a dot — is granted explicitly.
- **Preview sync now works inside code blocks.** Code blocks were never annotated with `data-source-line`, so double-clicking in the editor highlighted the nearest annotated block *above* the cursor (often many lines off), and clicking a code block in the preview did not move the editor at all. This mainly hit documents written as indented blocks, where the whole document is one code block. Fenced blocks are now indexed too, which also stops code text from stealing a prose line's number.

### Dependencies
- `undici` 7.25.0 → 7.28.0 and `lodash-es` pinned to ^4.18.1 via overrides, clearing both high-severity npm advisories without downgrading `@excalidraw/excalidraw` (npm's suggested `--force` fix would have broken the build).
- `quick-xml` 0.38.4 → 0.41.0 via `plist` 1.10.0, clearing RUSTSEC-2026-0194 and RUSTSEC-2026-0195. Neither reaches the Linux or Windows binaries — `quick-xml` is macOS-only in this tree — so no shipped artifact was affected.

## [1.9.6] - 2026-07-14

### Security
- **Vault-scoped filesystem access.** The Tauri fs-plugin scope no longer grants `$HOME`-recursive read/write/delete. Access is now granted per-vault at runtime through a new Rust command `allow_vault_dir` (see `src/vaultScope.ts`), called on every vault open. The asset-protocol scope was narrowed from `["**"]` to empty + runtime vault grant. Pre-vault cloud-sync detection keeps read-only scope for the specific provider paths it probes.
- **AI API key moved out of `localStorage` into the OS keychain** (Secret Service / macOS Keychain / Windows Credential Manager) via the `keyring` crate and `src/secretStore.ts`. Legacy plaintext keys are migrated off the settings JSON on first run; a namespaced `localStorage` fallback is used only when no keychain backend is available.
- **Preview HTML sanitizer rebuilt on DOMPurify** (allowlist) replacing the hand-rolled blocklist — closes mXSS/namespace-confusion vectors. `file:` links are no longer accepted; `asset:` is allowed only on image sources; YouTube embeds are now explicitly sandboxed.

### Fixed
- **Flowchart `REPEAT`/`UNTIL` loop-back.** The `:::flowchart` / `:::pseudocode` generator drew the `UNTIL` condition diamond looping back to *itself*; it now loops back to the first node of the loop body, as a real do-while flowchart should.
- **Flowchart `IF` branch labels.** Condition diamonds now label their branches `Yes`/`No` (previously only `ELSE IF` chains were labelled, leaving a plain `IF`/`ELSE` fork ambiguous).
- **Data safety — atomic disk writes.** Document saves (`saveFile`, `writeFileSafe`, `replaceInVault`, Save-As paths, inline comments) now write to a temp file and `rename()` onto the target, so a crash/power-cut mid-write can't truncate the real file.
- **Typing-lag fix.** The background per-tab linter no longer re-runs synchronously on every keystroke; it is debounced (~1s) and skips tabs whose content is unchanged.
- **Preview task-list checkboxes** (`- [ ]`) now survive sanitization (the old sanitizer stripped all `<input>` elements).
- **localStorage key collisions** (`RECENT_KEY`, `ACTIVE_KEY` meaning different things in different modules; `comdtex_cloud_banner_dismissed` written from two files) resolved via a single typed `src/storageKeys.ts` source of truth.

### Changed
- **Vault search is now indexed in memory** (`src/searchIndex.ts`), invalidated by file mtime, instead of re-reading every file from disk on each query. Wired through `useVault.search`, `replaceInVault`, and the Search & Replace panel.
- **`i18n.ts` split** into `src/i18n/{types,es,en}.ts` (thin re-export shim preserves the public API) with a new EN/ES key-parity test.
- **`App.tsx` slimmed by ~555 lines**: export/import/compile handlers extracted to `src/useExportActions.ts`; command-palette and menu-bar data extracted to `src/commands.ts` / `src/menus.ts`.
- **Test/CI**: Vitest coverage (`@vitest/coverage-v8`) with a regression-floor threshold; `typecheck` / `test:coverage` / `format:check` scripts; the Playwright e2e job is now a required gate (was informational) with an added command-palette spec. Test count 504 → 732: new suites for `aiProvider`, `frontmatter`, `searchIndex`, `storageKeys`, `atomicWrite`, i18n-parity, plus the previously untested pure modules `latexErrors`, `macros`, `sectionWordCount`, `truthTable`, `pseudocodeFlowchart`, `graphViz`, `functionPlot`, `commDiag`. Line coverage ~26% → ~36% (i18n data excluded).

## [1.9.5] - 2026-06-17

### Added
- **AI assistant (bring-your-own, off by default):** multi-provider support — Anthropic, OpenAI, Google Gemini, any OpenAI-compatible endpoint (incl. local **Ollama** / LM Studio / OpenRouter / DeepSeek), and a local agent **CLI** bridge (e.g. `claude` / `opencode`). Chat panel (`Ctrl+Shift+A`, or the **IA** menu button) plus **inline edit** (`Ctrl+K`). All edits are applied through Monaco `executeEdits()`, so every change is undo-safe. Base URLs are SSRF-guarded (`https://` or loopback only). ComdTeX ships no keys and makes no requests until enabled
- **`:::excalidraw` special block:** a built-in, lazy-loaded freehand drawing editor; the drawing is stored verbatim in the file and auto-numbered per type, like the other special blocks
- **Offline spellcheck:** Hunspell dictionaries (Spanish + English) via `nspell`, gated by a Settings toggle — no network access
- **Zotero import in the Citation Manager:** pulls entries from a running Zotero with the Better BibTeX plugin via its local JSON-RPC API (`http://localhost:23119`)
- **Typst export:** `.typ` source via pandoc, plus **Typst → PDF** when the `typst` binary is installed
- **Pandoc document import:** `.docx` / `.odt` / `.tex` / `.html` / `.epub` / `.rst` / `.org` → Markdown, with embedded images extracted
- **Live auto table of contents:** a standalone `[[toc]]` (or `[toc]`) line expands into a navigable, always-current heading list (`Ctrl+Shift+O` inserts the marker)
- **Text formatting:** `==highlight==` (yellow), coloured highlights via `<mark class="hl-green|hl-blue|hl-purple|hl-orange|hl-red|hl-pink">…</mark>`, and `<u>underline</u>`
- **Outline panel drag-reorder:** drag headings to reorder sections in the source
- **New global keyboard shortcuts:** `Ctrl/Cmd+Shift+A` (open AI assistant), `Ctrl/Cmd+Shift+O` (insert TOC), `Ctrl/Cmd+Shift+E` (toggle Outline panel), `Ctrl/Cmd+K` (AI inline edit)
- **Third-party license notice:** README now lists bundled dictionary licenses; ComdTeX elects MPL-1.1 for the `dictionary-es` data

### Changed
- **Unified sectioned menu bar:** a classic dropdown bar (Archivo/Edición/Vista/Vault) plus a sectioned **Archivos / Textos / Matemáticas / Vistas** menu with direct **Enfoque / IA / Sync / Ayuda** buttons (monochrome icons). Replaced the old toolbar and the sidebar tab strip; opening a panel un-collapses the sidebar
- **Enriched Command Palette (`Ctrl+P`):** now a categorized, selection-aware universal launcher with eight categories (Edición / Insertar / Matemáticas / Vista / Exportar / IA / Vault / Navegación). Each command shows an icon and a keyboard-shortcut chip; commands with variants (highlight colours, headings, lists, symbols, math operations, environments) drill into sub-menus; format commands wrap the current selection
- **Word wrap is now on by default**
- **Build:** migrated to Vite 8 (rolldown backend); manual chunks now use `output.codeSplitting.groups`

### Fixed
- **WASM LaTeX `PdfTeXEngine.js` wrapper:** fix landed so PDF compilation works with no system LaTeX installed (fallback chain WASM → `tectonic` → `xelatex` → `pdflatex`)
- **Data safety — masking bypass:** several write paths (todo-checkbox toggle, wikilink rename refactor, backlink removal) wrote editor content to disk without the special-block masking, corrupting `.tex` files; all now route through the masked, autosave-race-safe write path. `:::excalidraw` blocks are now stored verbatim like the other special blocks
- **Save As / Export:** *Save As* no longer applies a lossy Obsidian transform (it now saves the document faithfully); *Export Markdown* now produces clean Markdown; DOCX/Beamer export convert the live editor content through the pandoc input pipeline
- **Quit safety:** closing the app (window manager, `Cmd+Q`) now flushes pending autosaves and warns about unsaved changes instead of silently dropping the last edits
- **Panels opened from the palette/menu/shortcut/status bar** now un-collapse the sidebar instead of changing the panel invisibly
- **Autosave interval setting** is now actually applied (was always 800 ms); added an **Auto-rebuild PDF** Settings control that previously had no UI
- **Settings inputs** no longer lose focus after each keystroke (focus-trap fix)
- **Theming:** added light / high-contrast overrides for the focus timer, AI panel, and cloud-sync UI; defined the previously-undefined `--muted` variable; replaced colour-emoji icons (folder, sparkle, trash) with monochrome inline SVGs that render correctly in WebKitGTK
- **Reveal.js export** escapes the document title and guards against content breaking out of the slide template

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
