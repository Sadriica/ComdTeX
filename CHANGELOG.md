# Changelog

All notable changes to ComdTeX will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.11.0] - 2026-07-21

### Added
- **The preview respects manual line breaks and leading indentation inside paragraphs.** Paragraph text now renders with `pre-wrap` semantics plus dedicated indent markers, so hand-indented lines (common in poetry, addresses, or aligned notes) no longer collapse into a single flowed line.
- **Inserting a list over a selection converts it.** Applying the bullet/ordered/task-list insert action with several lines selected now turns each selected line into a list item (numbering sequentially for ordered lists, preserving indentation) instead of replacing the selection with placeholder items. Inline-math inserts wrap the selection correctly as well.
- **Command Palette entries match hidden keywords.** Palette search now looks at label, description, shortcut, category and per-command keyword lists (Spanish and English), covered by an e2e test searching `flowchart`.
- **Closing the Excalidraw editor with unsaved changes now asks first.** Esc, clicking outside the modal, or Cancel used to silently discard the drawing; with real edits present (element-version comparison — selection changes don't count) a save / discard / keep-editing prompt appears instead.
- **Contextual autocomplete inside special blocks.** With the cursor inside a `:::pseudocode`, `:::flowchart`, `:::truth`, `:::graph`, `:::plot` or `:::commdiag` block, suggestions switch to that block's own grammar (e.g. `for` + Tab expands the full `FOR i ← 1 TO n DO … END FOR` template; `and` + Tab inserts `∧` in a truth table; `square` drops a complete commutative square). The quick-suggest popup is enabled only while inside such a block, so prose writing stays undisturbed. Global shorthands are suppressed there — `sin` inside a `:::plot` stays plain `sin(x)`, never `\sin` — and typing the closing `:::` no longer pops the block-type list. See [docs/autocomplete.md](docs/autocomplete.md).
- **Typing bare `:::` now lists every block type.** Previously nothing appeared until the first letter was typed.
- **The Command Palette now covers practically everything.** New insert commands: wikilink, transclusion, footnote (mark + definition), BibTeX citation, numbered figure, YAML frontmatter, environment reference, and callouts (`[!NOTE]`/`[!WARNING]`/`[!TIP]`/`[!IMPORTANT]`). The environments submenu gains exercise/remark/note; the math submenu gains superscript/subscript/gradient/inverse/transpose and the three matrix forms. Entries match by name, syntax (`:::theorem`), or Spanish/English keywords.
- **Help panel: every syntax feature now shows a worked example** (code → rendered result): equation/section/figure/table/environment references show their resolved output, citations show the superscript marker, matrices render, and the previously undocumented cross-file environment references, inline-labeled math, flowchart and Excalidraw examples were added.

### Changed
- **More keystroke-stability work in large vaults.** The tab bar is memoized on display-relevant fields only, per-file content commits are debounced so rapid typing doesn't thrash React state, a stale render can no longer roll the in-memory tab content back behind newer keystrokes, and the display-math hover preview skips re-writing unchanged zones.

### Fixed
- **Tab after `:::` + letters could expand a math shorthand.** `:::ta` + Tab matched `table(...)`/`tan(...)` and replaced the block prefix with a math snippet; after `:::` only block snippets qualify now.
- **Zooming inside the Excalidraw editor (and the vault graph) was janky.** Touchpad pinch is delivered as a synthetic Ctrl+wheel, so every zoom tick inside the canvas also fired the app-wide font zoom — a full UI re-render per tick behind the modal. Surfaces with their own zoom now opt out of the global gesture handlers.
- **Session-long memory leak in the drawing/diagram caches.** The Excalidraw and Mermaid SVG caches were never evicted; every save of a drawing (whole base64 scenes and SVGs, MBs each with embedded images) added a new entry for the lifetime of the session. Both caches are now bounded.
- **Preview renders carried each Excalidraw scene twice.** The base64 scene was embedded in two attributes per block, doubling the HTML that is parsed, sanitized and morphed on every debounced preview refresh of image-heavy documents.
- **PDF export (pandoc) survives a TeX install without the Latin Modern fonts.** Pandoc ran only `--pdf-engine=xelatex`; on systems with the XeTeX engine but not the LM OpenType fonts (e.g. Arch's `texlive-xetex` without `texlive-fontsrecommended`) every export died with `Font TU/lmr … not loadable`. The export now retries with pdflatex before surfacing an error.
- **LaTeX error messages are no longer truncated mid-word.** TeX hard-wraps its log at 79 columns, so the error modal showed cut-off messages ("…not lo"). Wrapped log lines are now rejoined before parsing, and font-not-loadable errors carry a targeted suggestion naming the distro package to install.

## [1.10.2] - 2026-07-15

### Changed
- **Typing in large documents is dramatically smoother.** A KaTeX-heavy document's rendered HTML (easily multi-MB — each equation expands into hundreds of spans) was being HTML-parsed **three times and re-serialized twice on every preview refresh**, all on the same thread that handles keystrokes: once to annotate source lines (inside `renderMarkdown`), once to sanitize (DOMPurify string round-trip), and once to commit (`template.innerHTML`). The preview now uses a single-parse pipeline: DOMPurify returns its sanitized DOM directly (`sanitizeRenderedHtmlToFragment`), source-line annotation walks that fragment in place, and the block-level morph consumes it — one parse, zero re-serializes (measured ~2× faster commits). The new `commitPreview()` helper is the only sanctioned path from render output to the DOM, so sanitization can never be skipped.
- **The adaptive preview debounce now measures the real cost.** It previously timed only the DOM commit (a third of the work), so heavy documents under-throttled and saturated the editor's thread. It now measures the full render + commit, backs off up to 1.5 s on very heavy documents (typing stays smooth; the preview just follows a beat behind), keeps its 150 ms floor for light ones, resets when the preview is hidden, and the split reference pane no longer contaminates the active document's timing.
- **Held-key deletion no longer rebuilds the whole UI ~30× per second.** Menus, the command palette (~130 entries), and the top bars were being rebuilt and re-rendered on every keystroke. They are now memoized end-to-end (the vault handle is read through refs by action handlers, so their identities survive keystrokes), and the menu/toolbar subtrees skip per-keystroke re-renders entirely. Redundant per-keystroke localStorage writes for tab persistence were also eliminated.

### Fixed
- **Preview click-to-jump stays accurate.** Two annotation regressions from the pipeline rework were caught by review and fixed before release: line annotations could go stale after edits that shift lines without changing the rendered output (e.g. inserting a blank line), and a frontmatter title identical to a body heading could steal its jump target (annotation now skips the frontmatter header and bibliography, as before).
- Exported standalone HTML no longer ships internal `data-source-line` bookkeeping attributes.

## [1.10.1] - 2026-07-15

### Fixed
- **Unsaved edits no longer vanish on window focus.** Refocusing the window (very frequent on Wayland/Sway — tooltips, dialogs, workspace switches, external file managers) re-ran the full vault load, which rebuilt every open tab from disk/draft and silently discarded in-memory edits not yet flushed (drafts flush at 300 ms, autosave at 800 ms). Focus now only refreshes the file tree. `restoreTabs` also refuses to overwrite an already-open tab that has unsaved edits (defense in depth).
- **Autosave race could lose the last edit.** A keystroke landing while a save was in flight had its "unsaved" signal (`pendingContent` / `isDirty`) cleared when that save completed, stranding the newer text so it was lost on the next tab close, vault switch, or app quit. The signal is now only cleared when nothing newer arrived.
- **Search-and-replace no longer clobbers unsaved edits.** Replacing in an open, dirty file read from disk (ignoring the in-memory edits) and wrote directly without cancelling the pending autosave. It now uses the tab's current content and the safe write path.
- **Empty and unsupported-only folders appear in the file tree again.** A directory was hidden unless it contained a renderable file, so a newly created empty folder (or one holding only images/`.txt`/etc.) never showed up no matter how many reloads. Directories are now always listed, and an unreadable subdirectory no longer aborts the entire tree walk.
- **`:::code` blocks with a language survive saving.** A `:::code python` block (code with a language) was invisible to the special-block guard, so shorthand tokens in its body (`abs`, `sqrt`, `frac`, `table`, …) were expanded and the code corrupted on disk. Fixed, plus the case of a special block nested inside a normal environment (its callout prefix was applied to only the first line, garbling the block on reopen).
- **Equation numbering stays in sync around code fences.** `$$…$$` inside a fenced code block was numbered and rendered as live math, desyncing every following `@eq:` reference from the visible number. Fenced blocks are now excluded, matching the reference prescan.
- **DOCX / Beamer export can no longer destroy an extension-less target.** The temporary file was derived by swapping the `.docx`/`.pdf` suffix; when the Linux save dialog didn't append the extension, the temp path equalled the chosen path and the export overwrote then deleted the user's file. The temp path is now independent of the extension.
- **Frontmatter search (`fm:`) matches keys case-insensitively** — a document using `Author:` / `Title:` is no longer excluded by an `fm:author=…` filter. Also fixed a stray orphaned draft when renaming a file immediately after typing.

## [1.10.0] - 2026-07-14

### Added
- **Cross-file environment references.** Environment refs (`@def:valor`) previously only resolved within a single document. They can now point at a labelled environment in another vault note: `@gp/calendario@def:valor` renders as a link reading "Definición 3" — the target's *own* number — and clicking it opens that file and jumps to the environment. Use `@[mi carpeta/mi nota]@def:valor` when the path contains spaces. Refs are vault-path-based (not filename-based) so vaults with two same-named notes resolve unambiguously, and the `@` stays leading so refs never collide with `[@key]` BibTeX citations. A missing file or missing label degrades to the same `Definición (?)` marker as a broken local ref. Resolution is cached per target document and short-circuits on an unchanged-content pointer compare, so typing does not re-read or re-scan the vault.
- **"Keep" marks — invisible highlighting, plus a Keep panel.** Wrap a fragment in `^^texto^^` to mark it as worth keeping, or add a freeform category with `^^def: texto^^` / `^^duda: revisar esto^^`. The mark is visible **only** in the editor (faint dotted underline + a gutter glyph); the preview and every export — LaTeX, PDF, DOCX, Typst, Beamer, Reveal, HTML, Obsidian, Markdown, Anki — render the plain text with the delimiters and the `cat:` prefix removed, so a marked document is byte-for-byte identical to the same prose written unmarked. The new **Guardar / Keep** sidebar panel (menu bar → Vistas, or the command palette) collects every mark across the vault grouped by category, showing each one's text and `file:line`, and jumps to it on click. It reads the documents directly, so it is always in sync; a glossary is written only on demand via its export button — never automatically. Marks are never parsed inside math, inline/fenced/indented code, or ComdTeX special blocks; the math exclusion matters because `^` is LaTeX superscript, so `$x^{2^^3}$` and `$a^{n+1}$` are left alone. Trailing block ids (`^myid`) do not collide either — `^^a^^ ^blockid` parses as both. The text may contain a single caret (`^^dato: 2^10 = 1024^^`), and ordinary carets in prose never become marks. `^^` was chosen because the obvious delimiters were taken: `{{ }}` is Anki cloze deletions plus template and PDF header/footer variables, and `%%…%%` is Obsidian's comment syntax, which *hides* text where a keep mark shows it. A `:::definition` can now hold both a cloze and a keep mark. See [docs/keep-marks.md](docs/keep-marks.md).

### Changed
- **LaTeX export names the source document for cross-file refs.** `@gp/calendario@def:valor` exports as `Definición~(gp/calendario)` rather than a `\ref{}` to a label that isn't in the exported file, which LaTeX would silently typeset as `??`. Local refs are unchanged and still emit `\ref{}`.

## [1.9.8] - 2026-07-14

### Fixed
- **Mermaid diagrams render their labels again.** Since 1.9.6, every `:::flowchart` / `:::pseudocode` diagram (and any raw ```mermaid fence) drew its shapes and arrows correctly but with completely empty nodes — no label text at all. The 1.9.6 audit wave rebuilt `sanitizeRenderedHtml` on DOMPurify, which ships `foreignobject` in its `DEFAULT_FORBID_CONTENTS` set: it keeps the `<foreignObject>` element but deliberately drops its children. Mermaid's default `htmlLabels: true` renders every node label as HTML inside a `<foreignObject>`, so the sanitizer gutted all of them. Mermaid is now configured with `htmlLabels: false` (`src/mermaidConfig.ts`), emitting labels as native SVG `<text>`/`<tspan>`, which passes the sanitizer untouched. The sanitizer was **not** weakened — removing `foreignobject` from `FORBID_CONTENTS` does not restore the children anyway, and doing so would be the wrong trade.
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

### Security
- **Mermaid now runs at its default `securityLevel: "strict"`** instead of `"loose"`. The `"loose"` opt-in was justified by a comment claiming it was needed for the `↺` (and similar) characters in pseudocode-derived flowcharts; that turned out to be untrue — strict and loose render byte-identical SVG for those diagrams, since the characters are plain Unicode in SVG text and never involve HTML. Strict additionally makes Mermaid sanitize label text itself, so a hostile label in a raw ```mermaid fence is defanged before it reaches our own sanitizer. Nothing is lost: Mermaid's `click` handlers (the other thing strict disables) never worked here regardless, because the render path re-injects the sanitized SVG via `innerHTML`, dropping any listeners Mermaid attached.

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
