# Changelog

All notable changes to ComdTeX will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.27.0] - 2026-08-06

### Fixed
- **The exported .tex now carries what it needs to compile.** The generated file referenced `\includegraphics{figure.png}` and `\bibliography{references}`, but the export copied neither the images nor `references.bib`, so anyone exporting to submit to a journal or upload to Overleaf received a broken bundle and had to gather the files by hand. Exporting as .tex now copies every referenced local image next to it (rewriting the reference to the bare filename so relative paths cannot break) and `references.bib` when the document cites anything, and says how many files it placed alongside. Remote URLs and data URIs are left alone.
- **Footnotes, callouts and highlights survive the LaTeX export.** They rendered correctly in the preview and were lost or printed literally in the PDF, because the exporter built its own bare markdown-it instance without the plugins and callout preprocessing the preview has. Now `[^1]` becomes a real `\footnote{}` with its nested markup escaped, `> [!warning] Title` becomes a titled box coloured by callout type, `==text==` becomes `\hl{}`, a coloured `<mark>` becomes a `\colorbox`, and `<u>` becomes `\underline{}`. The packages they need (tcolorbox, soul, xcolor) load only when the document actually uses the feature.
- **Every file the user owns is written atomically.** Eight paths wrote directly instead of through the crash-safe helper the repository documents as mandatory, including both paths that save `references.bib` (a crash mid-write could truncate an entire bibliography), the creation of any new file from a template, the vault README, `macros.md` and the daily note. All of them now write to a temporary file and rename it into place, and a guard test fails if a future handler reaches for the direct call again.

## [1.26.0] - 2026-08-06

### Added
- **Plots of your data, not only of your formulas.** A `:::plot` block can now name a dataset instead of a function, and draws one series per column:

  ```
  :::plot[Growth by strain]
  @data:growth
  x: time
  y: (S1, S2, S3)
  kind: line
  error: sd
  :::
  ```

  Four shapes: `line` (a line with a marker at every real measurement), `scatter` (markers only), `bars` (grouped by category) and error bars from a named uncertainty column, which can ride on any of them. Columns are chosen by header name, spreadsheet letter or index, exactly like a `:::csv` selection; leaving `y` out plots every column except x and the error column. A non-numeric x column (sample names, conditions) becomes evenly spaced categories, which is what bars need. The axes take their titles from the column headers, the legend combines functions and data series without ever reusing a colour, and the vertical range now respects real extremes and error bar caps instead of the percentile band that keeps a function's asymptotes from flattening the plot. Function plots are untouched. The plot reaches the PDF as an image like every other diagram.

## [1.25.0] - 2026-08-06

### Added
- **Named datasets: import once, use everywhere.** A `:::data` block declares a selection over a vault CSV and gives it a name, using the same label grammar as the rest of the editor:

  ```
  :::data{#data:growth}
  growth.csv (A:D) (1:20)
  :::
  ```

  The declaration prints nothing. Like a macro definition, it exists so other blocks can point at it: a `:::csv` block whose source is `@data:growth` renders that data as a table, and its own selection narrows the dataset further, so `@data:growth (A, C)` means "columns A and C of my growth data". A dataset is not a numbered element and is never cited in prose, which is why it has no number; but it does ride the label system, so the Labels panel reports duplicate declarations, references to datasets that do not exist, and datasets nobody uses. The editor warns about both mistakes while you write. A generated table can also carry `{#tbl:x}` and become citable with `@tbl:x` like any hand-written one. CSVs are parsed once and reused while the file is unchanged, so declaring a dataset costs nothing on the typing path.

## [1.24.0] - 2026-08-06

### Fixed
- **Citations reach the PDF.** `[@key]` was rendered in the preview but exported as literal text, so a compiled PDF showed `[@rudin1976]` instead of a citation and carried no bibliography at all. The LaTeX export now emits real `\cite` (with `\cite[p. 321]{key}` for locators) and closes the document with `\bibliographystyle` and `\bibliography{references}`, choosing the bst that matches the document's citation style. Documents without citations are unchanged.
- **Every export sees the same document.** Transclusions and `:::csv` selections were resolved on the preview and "Compile PDF" paths but not on "Export as .tex", "Export PDF" (pandoc), the project export or the rebuild-on-save, so the same note produced different output depending on the button pressed, and a `:::csv` block could ship as raw source. Resolution now lives in one place (`documentResolve.ts`) that every path calls, including inside transcluded notes, and a guard test fails if a future export handler forgets it.

### Added
- **Real citation styles.** `comdtex.citestyle` in the frontmatter picks how citations read, in the preview and in the PDF: `vancouver` (ICMJE, required by over a thousand biomedical journals), `ama`, `apa` (APA 7), `author-year` (astronomy and the social sciences), or the previous ComdTeX style, which stays the default so nothing changes silently. Numbered styles keep their superscript brackets; author-year styles render inline as `(Rudin & Smith, 1976)`. The LaTeX export loads natbib with the matching options, except under acmart and apa7, which manage citations themselves.
- **Cite by ADS bibcode and INSPIRE record.** The Citation Manager's fetch box now recognizes a NASA ADS bibcode (`2024ApJ...900....1A`) and an INSPIRE-HEP recid or URL alongside DOIs and arXiv ids, which is how astronomers and high-energy physicists actually cite. ADS needs a personal token: it is entered in Settings and stored in the OS keychain, never in the settings file.

## [1.23.0] - 2026-08-05

### Added
- **Tables from a CSV, by selection.** A `:::csv` block holds a spreadsheet-style selection instead of a copy of the data, so regenerating the CSV updates the table:

  ```
  :::csv[Growth rates]
  data.csv (A:B, D) (1:8, 12)
  :::
  ```

  Columns accept spreadsheet letters, 1-based indices or header names; rows are 1-based over the data rows. Ranges use `:` and non-contiguous selections group in parentheses, so `(A, C, F)` and `(1:3, 7, 9:12)` both work, and the written order is respected: `(C, A)` really does put C first. Omitting a selector means everything. The CSV parser follows RFC 4180 (quoted fields, escaped quotes, embedded separators) and sniffs comma, semicolon, tab or pipe. A missing file or an unreadable selection leaves an honest note in the document instead of rendering nothing. `.csv` files are now first-class vault citizens, and the block expands in the preview, the PDF and every export.

## [1.22.0] - 2026-08-05

### Added
- **Units and chemistry, written once and typeset twice.** New shorthands `si(9.81, m/s^2)`, `num(6.022e23)`, `unit(mol/L)` and `ce(H2O)`. The preview renders them through KaTeX (upright units, real scientific notation, and chemistry via KaTeX's own mhchem extension) while the LaTeX export emits genuine `siunitx` and `mhchem`, so journals get the formatting they demand. A unit parser (`units.ts`) understands SI prefixes, products, divisions and exponents, and degrades an unknown unit to upright text instead of breaking the compile. The packages load only when a document actually uses them, since recent mhchem versions cost real compile time.
- **Biology typography check.** Opt in with `comdtex.domain: biology` in the frontmatter and the editor warns about taxonomic binomials and gene symbols that are not italicized, the two conventions manuscripts get returned over. Warnings only, never automatic rewrites: `Bacillus` may be a genus or a surname, and only the author knows. Code, math, links and already-italic text are never flagged, and common lab acronyms (PCR, ELISA, DNA) are not mistaken for gene symbols.

## [1.21.0] - 2026-08-05

### Added
- **Diagrams reach the PDF.** Exports used to degrade every visual block to captioned source code; now flowcharts (Mermaid), Graphviz graphs, function plots, commutative diagrams and Excalidraw drawings rasterize to real images in "Compile PDF", "Export PDF" (pandoc) and "Export as .tex" (PNGs saved beside the file for Overleaf), and truth tables become real tables. Auto-rebuild on save carries them too, and the print palette keeps diagrams readable on a white page regardless of the app theme. Honest limits: the bundled WASM engine cannot read image files, so documents with diagrams prefer a local engine (tectonic/xelatex/pdflatex) and fall back to WASM with the previous code-fence degradation; pseudocode and code blocks stay as code on purpose.

## [1.20.0] - 2026-08-05

### Added
- **Typst, first class (phase A).** `.typ` files are now vault citizens: they appear in the tree, open with their own Monaco language (headings, `#functions`, labels/references, math, raw blocks), and edit raw (no CMDX conversion touches them). "Compilar PDF (archivo Typst)" compiles the open file natively with the local `typst` binary (no pandoc in the path; unsaved changes compile too) and feeds the same PDF preview panel; with auto-rebuild on, saving recompiles in place, which at Typst speed behaves like a live preview. The Markdown preview pane steps aside for `.typ` tabs: their preview is the compiled PDF. Phase B (native Markdown-to-Typst export preserving environments and shorthands) and phase C (a WASM Typst engine for zero-install parity) come next.

## [1.19.0] - 2026-08-05

### Added
- **Guided collaboration.** A "Write with someone else" section at the top of the Git panel speaks plain language over the git the panel already knew: connect the vault to a shared private repository (guided, with a paste-the-address box), then live with one sentence and two buttons: "Bring changes" / "Send changes" / "Save and send" (empty message becomes an honest dated one). A rejected send explains that the coauthor got there first instead of printing git errors. Conflicts list each file with "Keep mine" / "Use theirs" buttons (or edit the markers by hand) and a "Finish the merge" step. State logic is pure and tested (`collabGuide.ts`); user guide in `docs/collaboration.md`.

## [1.18.0] - 2026-08-05

### Added
- **SyncTeX click-to-source.** When the PDF preview shows a locally compiled document (tectonic, xelatex or pdflatex, now invoked with `-synctex=1`), clicking the PDF jumps the editor to the exact source line, and the new "Show current line in PDF" palette command scrolls the preview to the page that line produced. The bridge is a monotonic text alignment (`texLineMap.ts`) between the edited Markdown/CMDX and the generated LaTeX, since SyncTeX speaks in generated-tex lines; accuracy is exact for prose and paragraph-level for math-only lines. PDFs from the bundled WASM engine keep the previous heading-based fallback (the engine emits no SyncTeX), and the UI says so instead of guessing.

## [1.17.0] - 2026-08-05

### Added
- **Journal templates.** A new Journals section in the template picker: IEEE (IEEEtran), ACM (acmart), Elsevier (elsarticle) and APA 7 (apa7). Each template sets `comdtex.texclass` in its frontmatter, and **Export as .tex** now honors that key: the exported document uses the real journal class with the right title block (IEEEauthorblock, acmart authors, an elsarticle frontmatter environment, apa7 authorsnames) and a theorem setup that respects what each class already defines (acmart predefines the theorem family, so only the missing environments are added). Without the key the export is unchanged.

## [1.16.0] - 2026-07-30

> Jumps from 1.11.2: the work was planned and built as five increments
> (1.12 editor stability → 1.16 AI gaps) and ships as one release.

### Fixed
- **Lists, task items and quotes continue again when you press Enter.** `setLanguageConfiguration("markdown", …)` *replaces* Monaco's built-in configuration instead of merging into it, so passing only the auto-closing-pair options had been silently discarding markdown's `onEnterRules`. Enter is now handled explicitly (`markdownEditing.ts` + `monacoSetup.ts`), which also does what the declarative rules never could: ordered lists renumber (`1.` → `2.`), nested items keep their indentation without an extra Enter, task items continue as `- [ ]` even from a checked one, and an abandoned marker outdents one level (or clears at the top level) rather than spawning another empty bullet.
- **Pipe tables continue on Enter** with a fresh row of the same width, and an empty row exits the table.
- **Blocks no longer unfold on their own.** Collapsed regions, scroll position and the caret are now persisted per file as a Monaco view state (`editorViewState.ts`) and restored synchronously on mount. Previously they were lost on every tab remount and on every `setValue()` from the external-content sync, worst of all for `:::excalidraw`, whose scene is a single base64 line that word-wraps into dozens of screen lines. Excalidraw blocks are also auto-collapsed the first time a file is opened.
- **Fast Ctrl+Tab lands where you left off.** The old cursor save was debounced by 500 ms, so switching faster than that never recorded the position; the snapshot is now taken synchronously as the tab changes. The 100 ms restore timer is gone too: it was visible as a jump and could race the first keystrokes after a switch.
- **Text no longer pastes, deletes or reorders itself while you type.** The external-content sync effect used `editor.setValue()`, which resets the undo stack, folding, decorations and the selection. It now (a) refuses to touch the buffer while the editor has focus and the user's edits are still queued for disk (that content is *newer* than anything it would push in), and (b) applies the smallest edit that reconciles the two (`textDiff.ts`) through the model's edit stack.
- **Pasting a screenshot works.** Image paste only ever handled clipboard entries backed by a file on disk (`file.path`); a plain screenshot carries raw bytes and hit the "no path" error every time. Those bytes are now written directly, under a timestamped name, and an existing asset is never overwritten (`name-2.png`, …).
- **The "changed on disk" prompt was English-only.** Its text and buttons are now translated, and it reports how many lines actually differ, so the reload-or-keep decision is informed rather than blind.
- **A file created during the session was saved unguarded.** `createFile` (and the auto-created vault README) never recorded a disk mtime, so the external-change guard had no baseline for those tabs and never ran for the rest of the session. Both now stat after writing, like the file-open paths already did. This matters most where a sync client rewrites files in place and leaves no conflict copy behind to notice, Google Drive's desktop client being the usual case.

### Added
- **Per-folder rules** (`.comdtex-folder.json`, stored inside the folder it governs): a default template, a filename pattern (`{{date:YYYY-MM-DD}}-{{title}}`), default frontmatter, and declared generated files. Subfolders inherit field by field, nearest folder winning. Edited from the folder's context menu.
- **Generated folder files:** `tasks`, `calendar` and `index` views built from the notes around them, refreshed by "Regenerar archivos de carpeta". A target with hand-written content is never overwritten: only an empty file or one carrying the `comdtex:generated` marker is rewritten. The task collector is the same parser the Todo panel uses, so the panel and the file cannot disagree.
- **Full folder context menu**: new file / new folder / new from template inside that folder, rename, and folder rules. Folders answer to F2 and Delete like files do.
- **New files land in the selected folder**, not always at the vault root (`createFile` was hard-coded to the root). The create prompt names its destination.
- **"Guardar como plantilla"** on a file: parameterises the frontmatter title/date and a matching H1 into `{{title}}`/`{{date}}`, leaving body prose untouched (a date inside a paragraph is content, not a field).
- **Warning for ragged tables.** A row whose column count differs from the header is flagged in the editor: GFM silently drops the extra cells or renders the missing ones empty, so the preview quietly disagreed with the source.
- **"Normalizar tabla" command** (palette and Edición menu): pads every row to the header's width and re-aligns the pipes, preserving alignment colons, in a single undo step.
- **Full Edición menu.** Undo, Redo, Cut, Copy, Paste, Select all, Duplicate line, Move line up/down and Toggle comment are now visible menu entries instead of shortcut-only features.
- **Toolbar buttons toggle.** Pressing the button of the panel already on screen puts it away. Programmatic opens (a search hit, a comment glyph) still always show the panel.
- **Search inside panels.** The Help panel gains a filter that hides non-matching rows and expands what survives; the Outline, Equations and Environments panels gain one too. Matching folds accents ("indice" finds "índice") but keeps ñ distinct from n, since in Spanish it is its own letter.
- **Pomodoro clock in the top bar** while a session is running, so the countdown stays visible with the Enfoque panel closed. Session stats now also cover active vs paused time, words per minute against *active* time, completed pomodoros, words per pomodoro, files worked on, and the peak word count (so a late delete does not erase the record).
- **Heading-based folding.** Sections fold from their heading to just before the next heading of the same or higher level, which is what makes one long per-subject file workable. Headings inside fenced code are ignored.
- **"Dividir documento en secciones"** turns a long note into one file per `##`, replacing each section with a `![[transclusion]]` so the rendered output is unchanged. Refuses to run if any target filename already exists.
- **AI gap filling.** Leave `{{?}}` or `{{? a hint}}` while writing and fill it later with "Completar hueco con IA" (cursor) or "Completar todos los huecos" (document). Gaps are flagged in the editor as info markers, ignored inside fenced code, and every fill is applied through `executeEdits`: a normal undo step, never a direct disk write. Deliberately not ghost-text autocompletion: nothing is generated until asked, and Tab stays free for shorthand expansion.
- **New settings**: reading speed for the status-bar estimate (was hard-coded at 200 wpm), auto-folding of Excalidraw blocks, and a switch for list continuation on Enter.

## [1.11.2] - 2026-07-22

### Fixed
- **Special blocks no longer leak raw `:::` markup into pandoc exports.** "Export as PDF" (and every pandoc-based format) now degrades `pseudocode`/`truth`/`graph`/`plot`/`commdiag`/`flowchart`/`code` blocks to captioned code fences (`**Truth Table: name**` + the readable body); `:::code lang` keeps its language for highlighting; Excalidraw bodies (JSON scene dumps) are replaced by a "drawing omitted" note.
- **PDF save dialogs default to the active file's folder inside the vault** instead of the process working directory / last-used folder.
- **Opening the finished file is best-effort.** A PDF viewer/opener failure after a successful export no longer surfaces as "Error pandoc: undefined" next to the success toast, in any export path.
- **"Export as PDF" (pandoc) now tries `tectonic` before `xelatex`/`pdflatex`.** With a partial TeX install (e.g. Arch `texlive-basic` + `texlive-latex` without `texlive-latexrecommended`), pandoc's xelatex/pdflatex engines die with `File 'xcolor.sty' not found`: the same message the WASM engine produces when its package server is down, which made the two failures easy to conflate. Tectonic fetches missing packages on demand, so the pandoc export now survives incomplete TeX installations.
- **PDF export died with `\begin{document} ended by \end{quoting}` on documents containing `->>` / `>->` arrow text.** `babel-spanish` treats `<<`/`>>` as guillemet shorthands backed by an internal `quoting` environment, so literal arrow sequences (e.g. the commutative-diagram help text) emitted a stray `\end{quoting}`. The exporter now loads babel with `es-noquoting,es-noshorthands`: exported documents use real Unicode, never babel shorthands.
- **A successful fallback compile no longer shows the LaTeX error modal.** When the WASM engine failed but a local engine (`tectonic`/`xelatex`/`pdflatex`) then produced the PDF, the WASM error modal still popped over the successful export. Diagnostics are now held and only surfaced if every engine fails.

### Added
- **Configurable TeX package server** (Settings → PDF, `texliveUrl`). The WASM engine downloads `.sty`/font files on demand from `texlive2.swiftlatex.com`, a community server with a history of outages (down at the time of writing, which made WASM PDF compiles fail with `File 'xcolor.sty' not found`). The URL is now a setting so users can point at a mirror; the package-not-found error suggestion explains the server/offline cause and the tectonic alternative.
- **Local TeX package mirror (infrastructure).** The bundled engine glue is patched to serve files from `public/wasm-tex/texlive/` (flat, filename-keyed) before hitting the network; the directory ships empty with population instructions (`public/wasm-tex/texlive/README.md`).

## [1.11.1] - 2026-07-21

### Fixed
- **The window could not be closed: quit silently did nothing.** The close-confirmation handler (`onCloseRequested`) relies on the Tauri JS API calling `window.destroy()` once the event is not prevented, but the capability only granted `core:window:allow-close`, so the ACL denied the destroy and the window stayed open with no visible error; every quit path (titlebar ✕, WM close, `$mod+Shift+q`) was affected. Added `core:window:allow-destroy` to `capabilities/default.json`.
- **Blank white window on Arch-based distros (installer).** On Arch/Manjaro/EndeavourOS the AppImage's bundled `libwayland-client/cursor/server` are older than the system Mesa/Wayland stack, making WebKit's EGL init abort with `EGL_BAD_PARAMETER`: the window opened but never rendered. `scripts/install.sh` now detects Arch-like distros (`/etc/os-release`), extracts the AppImage to `~/.local/opt/comdtex`, removes the bundled `libwayland-*` so the system copies are used, and installs a `comdtex` wrapper that launches the patched tree. It also strips the CI-baked `WEBKIT_DISABLE_DMABUF_RENDERER=1` from the AppRun hooks, unnecessary once the system wayland libs are in use, and it forced software rendering (sluggish Excalidraw canvas and visible preview repaints while typing). Other distros keep the plain AppImage install; `--uninstall` cleans up both layouts.

### Added
- **One-line Linux installer with desktop integration** (`scripts/install.sh`). Downloads the latest AppImage, verifies the published sha256, installs to `~/.local` (no sudo), creates the launcher entry (rofi/wofi/GNOME/KDE) + icon + `comdtex` CLI symlink, and uninstalls cleanly with `--uninstall`.
- **Build-from-source helper** (`scripts/build-from-source.sh`). Checks prerequisites with per-distro install hints (pacman/apt/dnf, including the webkit2gtk-4.1 pitfall), applies the Arch `NO_STRIP` AppImage workaround automatically, and `--install` integrates the locally built binary with the desktop.
- **AUR packaging** (`packaging/aur/comdtex-bin/`). PKGBUILD that repackages the official `.deb` with correct dependencies and optdepends (pandoc, typst, zip, git, TeX fonts); `packaging/aur/update.sh` bumps it to a release pulling the published checksum.

## [1.11.0] - 2026-07-21

### Added
- **The preview respects manual line breaks and leading indentation inside paragraphs.** Paragraph text now renders with `pre-wrap` semantics plus dedicated indent markers, so hand-indented lines (common in poetry, addresses, or aligned notes) no longer collapse into a single flowed line.
- **Inserting a list over a selection converts it.** Applying the bullet/ordered/task-list insert action with several lines selected now turns each selected line into a list item (numbering sequentially for ordered lists, preserving indentation) instead of replacing the selection with placeholder items. Inline-math inserts wrap the selection correctly as well.
- **Command Palette entries match hidden keywords.** Palette search now looks at label, description, shortcut, category and per-command keyword lists (Spanish and English), covered by an e2e test searching `flowchart`.
- **Closing the Excalidraw editor with unsaved changes now asks first.** Esc, clicking outside the modal, or Cancel used to silently discard the drawing; with real edits present (element-version comparison, selection changes don't count) a save / discard / keep-editing prompt appears instead.
- **Contextual autocomplete inside special blocks.** With the cursor inside a `:::pseudocode`, `:::flowchart`, `:::truth`, `:::graph`, `:::plot` or `:::commdiag` block, suggestions switch to that block's own grammar (e.g. `for` + Tab expands the full `FOR i ← 1 TO n DO … END FOR` template; `and` + Tab inserts `∧` in a truth table; `square` drops a complete commutative square). The quick-suggest popup is enabled only while inside such a block, so prose writing stays undisturbed. Global shorthands are suppressed there (`sin` inside a `:::plot` stays plain `sin(x)`, never `\sin`), and typing the closing `:::` no longer pops the block-type list. See [docs/autocomplete.md](docs/autocomplete.md).
- **Typing bare `:::` now lists every block type.** Previously nothing appeared until the first letter was typed.
- **The Command Palette now covers practically everything.** New insert commands: wikilink, transclusion, footnote (mark + definition), BibTeX citation, numbered figure, YAML frontmatter, environment reference, and callouts (`[!NOTE]`/`[!WARNING]`/`[!TIP]`/`[!IMPORTANT]`). The environments submenu gains exercise/remark/note; the math submenu gains superscript/subscript/gradient/inverse/transpose and the three matrix forms. Entries match by name, syntax (`:::theorem`), or Spanish/English keywords.
- **Help panel: every syntax feature now shows a worked example** (code → rendered result): equation/section/figure/table/environment references show their resolved output, citations show the superscript marker, matrices render, and the previously undocumented cross-file environment references, inline-labeled math, flowchart and Excalidraw examples were added.

### Changed
- **More keystroke-stability work in large vaults.** The tab bar is memoized on display-relevant fields only, per-file content commits are debounced so rapid typing doesn't thrash React state, a stale render can no longer roll the in-memory tab content back behind newer keystrokes, and the display-math hover preview skips re-writing unchanged zones.

### Fixed
- **Tab after `:::` + letters could expand a math shorthand.** `:::ta` + Tab matched `table(...)`/`tan(...)` and replaced the block prefix with a math snippet; after `:::` only block snippets qualify now.
- **Zooming inside the Excalidraw editor (and the vault graph) was janky.** Touchpad pinch is delivered as a synthetic Ctrl+wheel, so every zoom tick inside the canvas also fired the app-wide font zoom: a full UI re-render per tick behind the modal. Surfaces with their own zoom now opt out of the global gesture handlers.
- **Session-long memory leak in the drawing/diagram caches.** The Excalidraw and Mermaid SVG caches were never evicted; every save of a drawing (whole base64 scenes and SVGs, MBs each with embedded images) added a new entry for the lifetime of the session. Both caches are now bounded.
- **Preview renders carried each Excalidraw scene twice.** The base64 scene was embedded in two attributes per block, doubling the HTML that is parsed, sanitized and morphed on every debounced preview refresh of image-heavy documents.
- **PDF export (pandoc) survives a TeX install without the Latin Modern fonts.** Pandoc ran only `--pdf-engine=xelatex`; on systems with the XeTeX engine but not the LM OpenType fonts (e.g. Arch's `texlive-xetex` without `texlive-fontsrecommended`) every export died with `Font TU/lmr … not loadable`. The export now retries with pdflatex before surfacing an error.
- **LaTeX error messages are no longer truncated mid-word.** TeX hard-wraps its log at 79 columns, so the error modal showed cut-off messages ("…not lo"). Wrapped log lines are now rejoined before parsing, and font-not-loadable errors carry a targeted suggestion naming the distro package to install.

## [1.10.2] - 2026-07-15

### Changed
- **Typing in large documents is dramatically smoother.** A KaTeX-heavy document's rendered HTML (easily multi-MB, each equation expands into hundreds of spans) was being HTML-parsed **three times and re-serialized twice on every preview refresh**, all on the same thread that handles keystrokes: once to annotate source lines (inside `renderMarkdown`), once to sanitize (DOMPurify string round-trip), and once to commit (`template.innerHTML`). The preview now uses a single-parse pipeline: DOMPurify returns its sanitized DOM directly (`sanitizeRenderedHtmlToFragment`), source-line annotation walks that fragment in place, and the block-level morph consumes it: one parse, zero re-serializes (measured ~2× faster commits). The new `commitPreview()` helper is the only sanctioned path from render output to the DOM, so sanitization can never be skipped.
- **The adaptive preview debounce now measures the real cost.** It previously timed only the DOM commit (a third of the work), so heavy documents under-throttled and saturated the editor's thread. It now measures the full render + commit, backs off up to 1.5 s on very heavy documents (typing stays smooth; the preview just follows a beat behind), keeps its 150 ms floor for light ones, resets when the preview is hidden, and the split reference pane no longer contaminates the active document's timing.
- **Held-key deletion no longer rebuilds the whole UI ~30× per second.** Menus, the command palette (~130 entries), and the top bars were being rebuilt and re-rendered on every keystroke. They are now memoized end-to-end (the vault handle is read through refs by action handlers, so their identities survive keystrokes), and the menu/toolbar subtrees skip per-keystroke re-renders entirely. Redundant per-keystroke localStorage writes for tab persistence were also eliminated.

### Fixed
- **Preview click-to-jump stays accurate.** Two annotation regressions from the pipeline rework were caught by review and fixed before release: line annotations could go stale after edits that shift lines without changing the rendered output (e.g. inserting a blank line), and a frontmatter title identical to a body heading could steal its jump target (annotation now skips the frontmatter header and bibliography, as before).
- Exported standalone HTML no longer ships internal `data-source-line` bookkeeping attributes.

## [1.10.1] - 2026-07-15

### Fixed
- **Unsaved edits no longer vanish on window focus.** Refocusing the window (very frequent on Wayland/Sway: tooltips, dialogs, workspace switches, external file managers) re-ran the full vault load, which rebuilt every open tab from disk/draft and silently discarded in-memory edits not yet flushed (drafts flush at 300 ms, autosave at 800 ms). Focus now only refreshes the file tree. `restoreTabs` also refuses to overwrite an already-open tab that has unsaved edits (defense in depth).
- **Autosave race could lose the last edit.** A keystroke landing while a save was in flight had its "unsaved" signal (`pendingContent` / `isDirty`) cleared when that save completed, stranding the newer text so it was lost on the next tab close, vault switch, or app quit. The signal is now only cleared when nothing newer arrived.
- **Search-and-replace no longer clobbers unsaved edits.** Replacing in an open, dirty file read from disk (ignoring the in-memory edits) and wrote directly without cancelling the pending autosave. It now uses the tab's current content and the safe write path.
- **Empty and unsupported-only folders appear in the file tree again.** A directory was hidden unless it contained a renderable file, so a newly created empty folder (or one holding only images/`.txt`/etc.) never showed up no matter how many reloads. Directories are now always listed, and an unreadable subdirectory no longer aborts the entire tree walk.
- **`:::code` blocks with a language survive saving.** A `:::code python` block (code with a language) was invisible to the special-block guard, so shorthand tokens in its body (`abs`, `sqrt`, `frac`, `table`, …) were expanded and the code corrupted on disk. Fixed, plus the case of a special block nested inside a normal environment (its callout prefix was applied to only the first line, garbling the block on reopen).
- **Equation numbering stays in sync around code fences.** `$$…$$` inside a fenced code block was numbered and rendered as live math, desyncing every following `@eq:` reference from the visible number. Fenced blocks are now excluded, matching the reference prescan.
- **DOCX / Beamer export can no longer destroy an extension-less target.** The temporary file was derived by swapping the `.docx`/`.pdf` suffix; when the Linux save dialog didn't append the extension, the temp path equalled the chosen path and the export overwrote then deleted the user's file. The temp path is now independent of the extension.
- **Frontmatter search (`fm:`) matches keys case-insensitively**: a document using `Author:` / `Title:` is no longer excluded by an `fm:author=…` filter. Also fixed a stray orphaned draft when renaming a file immediately after typing.

## [1.10.0] - 2026-07-14

### Added
- **Cross-file environment references.** Environment refs (`@def:valor`) previously only resolved within a single document. They can now point at a labelled environment in another vault note: `@gp/calendario@def:valor` renders as a link reading "Definición 3" (the target's *own* number), and clicking it opens that file and jumps to the environment. Use `@[mi carpeta/mi nota]@def:valor` when the path contains spaces. Refs are vault-path-based (not filename-based) so vaults with two same-named notes resolve unambiguously, and the `@` stays leading so refs never collide with `[@key]` BibTeX citations. A missing file or missing label degrades to the same `Definición (?)` marker as a broken local ref. Resolution is cached per target document and short-circuits on an unchanged-content pointer compare, so typing does not re-read or re-scan the vault.
- **"Keep" marks: invisible highlighting, plus a Keep panel.** Wrap a fragment in `^^texto^^` to mark it as worth keeping, or add a freeform category with `^^def: texto^^` / `^^duda: revisar esto^^`. The mark is visible **only** in the editor (faint dotted underline + a gutter glyph); the preview and every export (LaTeX, PDF, DOCX, Typst, Beamer, Reveal, HTML, Obsidian, Markdown, Anki) render the plain text with the delimiters and the `cat:` prefix removed, so a marked document is byte-for-byte identical to the same prose written unmarked. The new **Guardar / Keep** sidebar panel (menu bar → Vistas, or the command palette) collects every mark across the vault grouped by category, showing each one's text and `file:line`, and jumps to it on click. It reads the documents directly, so it is always in sync; a glossary is written only on demand via its export button, never automatically. Marks are never parsed inside math, inline/fenced/indented code, or ComdTeX special blocks; the math exclusion matters because `^` is LaTeX superscript, so `$x^{2^^3}$` and `$a^{n+1}$` are left alone. Trailing block ids (`^myid`) do not collide either: `^^a^^ ^blockid` parses as both. The text may contain a single caret (`^^dato: 2^10 = 1024^^`), and ordinary carets in prose never become marks. `^^` was chosen because the obvious delimiters were taken: `{{ }}` is Anki cloze deletions plus template and PDF header/footer variables, and `%%…%%` is Obsidian's comment syntax, which *hides* text where a keep mark shows it. A `:::definition` can now hold both a cloze and a keep mark. See [docs/keep-marks.md](docs/keep-marks.md).

### Changed
- **LaTeX export names the source document for cross-file refs.** `@gp/calendario@def:valor` exports as `Definición~(gp/calendario)` rather than a `\ref{}` to a label that isn't in the exported file, which LaTeX would silently typeset as `??`. Local refs are unchanged and still emit `\ref{}`.

## [1.9.8] - 2026-07-14

### Fixed
- **Mermaid diagrams render their labels again.** Since 1.9.6, every `:::flowchart` / `:::pseudocode` diagram (and any raw ```mermaid fence) drew its shapes and arrows correctly but with completely empty nodes: no label text at all. The 1.9.6 audit wave rebuilt `sanitizeRenderedHtml` on DOMPurify, which ships `foreignobject` in its `DEFAULT_FORBID_CONTENTS` set: it keeps the `<foreignObject>` element but deliberately drops its children. Mermaid's default `htmlLabels: true` renders every node label as HTML inside a `<foreignObject>`, so the sanitizer gutted all of them. Mermaid is now configured with `htmlLabels: false` (`src/mermaidConfig.ts`), emitting labels as native SVG `<text>`/`<tspan>`, which passes the sanitizer untouched. The sanitizer was **not** weakened: removing `foreignobject` from `FORBID_CONTENTS` does not restore the children anyway, and doing so would be the wrong trade.
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
- **Mermaid now runs at its default `securityLevel: "strict"`** instead of `"loose"`. The `"loose"` opt-in was justified by a comment claiming it was needed for the `↺` (and similar) characters in pseudocode-derived flowcharts; that turned out to be untrue: strict and loose render byte-identical SVG for those diagrams, since the characters are plain Unicode in SVG text and never involve HTML. Strict additionally makes Mermaid sanitize label text itself, so a hostile label in a raw ```mermaid fence is defanged before it reaches our own sanitizer. Nothing is lost: Mermaid's `click` handlers (the other thing strict disables) never worked here regardless, because the render path re-injects the sanitized SVG via `innerHTML`, dropping any listeners Mermaid attached.

## [1.9.7] - 2026-07-14

### Fixed
- **Saving no longer fails on Linux.** Since 1.9.6 every write (autosave, save, save-as, vault-wide replace and the comment store) failed with `forbidden path: /<vault>/.<name>.tmp-<hex>`, leaving edits unsaved on disk. Atomic writes go to a temp file first, and that temp file was dot-prefixed; Tauri's fs scope matches with glob's `require_literal_leading_dot`, which is `true` by default on Unix, so the `<vault>/**` grant could not match a name starting with a dot. Temp files are no longer hidden (the file tree filters them by name instead), and `.comdtex-comments.json` (whose own name starts with a dot) is granted explicitly.
- **Preview sync now works inside code blocks.** Code blocks were never annotated with `data-source-line`, so double-clicking in the editor highlighted the nearest annotated block *above* the cursor (often many lines off), and clicking a code block in the preview did not move the editor at all. This mainly hit documents written as indented blocks, where the whole document is one code block. Fenced blocks are now indexed too, which also stops code text from stealing a prose line's number.

### Dependencies
- `undici` 7.25.0 → 7.28.0 and `lodash-es` pinned to ^4.18.1 via overrides, clearing both high-severity npm advisories without downgrading `@excalidraw/excalidraw` (npm's suggested `--force` fix would have broken the build).
- `quick-xml` 0.38.4 → 0.41.0 via `plist` 1.10.0, clearing RUSTSEC-2026-0194 and RUSTSEC-2026-0195. Neither reaches the Linux or Windows binaries (`quick-xml` is macOS-only in this tree), so no shipped artifact was affected.

## [1.9.6] - 2026-07-14

### Security
- **Vault-scoped filesystem access.** The Tauri fs-plugin scope no longer grants `$HOME`-recursive read/write/delete. Access is now granted per-vault at runtime through a new Rust command `allow_vault_dir` (see `src/vaultScope.ts`), called on every vault open. The asset-protocol scope was narrowed from `["**"]` to empty + runtime vault grant. Pre-vault cloud-sync detection keeps read-only scope for the specific provider paths it probes.
- **AI API key moved out of `localStorage` into the OS keychain** (Secret Service / macOS Keychain / Windows Credential Manager) via the `keyring` crate and `src/secretStore.ts`. Legacy plaintext keys are migrated off the settings JSON on first run; a namespaced `localStorage` fallback is used only when no keychain backend is available.
- **Preview HTML sanitizer rebuilt on DOMPurify** (allowlist) replacing the hand-rolled blocklist: closes mXSS/namespace-confusion vectors. `file:` links are no longer accepted; `asset:` is allowed only on image sources; YouTube embeds are now explicitly sandboxed.

### Fixed
- **Flowchart `REPEAT`/`UNTIL` loop-back.** The `:::flowchart` / `:::pseudocode` generator drew the `UNTIL` condition diamond looping back to *itself*; it now loops back to the first node of the loop body, as a real do-while flowchart should.
- **Flowchart `IF` branch labels.** Condition diamonds now label their branches `Yes`/`No` (previously only `ELSE IF` chains were labelled, leaving a plain `IF`/`ELSE` fork ambiguous).
- **Data safety: atomic disk writes.** Document saves (`saveFile`, `writeFileSafe`, `replaceInVault`, Save-As paths, inline comments) now write to a temp file and `rename()` onto the target, so a crash/power-cut mid-write can't truncate the real file.
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
- **AI assistant (bring-your-own, off by default):** multi-provider support: Anthropic, OpenAI, Google Gemini, any OpenAI-compatible endpoint (incl. local **Ollama** / LM Studio / OpenRouter / DeepSeek), and a local agent **CLI** bridge (e.g. `claude` / `opencode`). Chat panel (`Ctrl+Shift+A`, or the **IA** menu button) plus **inline edit** (`Ctrl+K`). All edits are applied through Monaco `executeEdits()`, so every change is undo-safe. Base URLs are SSRF-guarded (`https://` or loopback only). ComdTeX ships no keys and makes no requests until enabled
- **`:::excalidraw` special block:** a built-in, lazy-loaded freehand drawing editor; the drawing is stored verbatim in the file and auto-numbered per type, like the other special blocks
- **Offline spellcheck:** Hunspell dictionaries (Spanish + English) via `nspell`, gated by a Settings toggle: no network access
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
- **Data safety (masking bypass):** several write paths (todo-checkbox toggle, wikilink rename refactor, backlink removal) wrote editor content to disk without the special-block masking, corrupting `.tex` files; all now route through the masked, autosave-race-safe write path. `:::excalidraw` blocks are now stored verbatim like the other special blocks
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
- **Inline labeled equations:** `$inline$ {#eq:label}` is now numbered and referenceable like `$$display$$ {#eq:label}`: both forms share the same counter (`NUMBERED_MATH_RE` + `wrapInlineNumbered`)
- **Callout-style environment aliases** (unnumbered): `tip`, `hint`, `info`, `warning`, `caution`, `attention`, `important`, `danger`, `error`, `failure`, `success`, `check`, `done`, `question`, `help`, `faq`, `quote`, `cite`, `abstract`. Themed border/background/label colors per category
- **Plot bounds shorthand:** `:::plot` accepts `xmin = N` / `xmax = N` per-line (in addition to `range: [a, b]`)
- **`docs/installing-deps.md`:** per-OS install guide for `pandoc` / `zip` / `git`, with troubleshooting for the Tauri shell scope `PATH` cache

### Fixed
- **Toolbar code-block snippet** inserted literal `\`` (backslash + backtick) instead of triple backticks: the JS string was over-escaped (`"\\\`\\\`\\\`"` produced `\` `` ` `` repeated). Same bug in the bundled `comdtex.md` template (auto-migrated on open: `\\`` → `` ` ``)
- **Special envs (`:::plot/graph/truth/commdiag/pseudocode/flowchart`) corrupted** by shorthand expansion: `exp(...)` / `sqrt(...)` were auto-wrapped in `$..$`, then the env's parser choked on `$`. Preprocessor now masks special-env bodies before shorthand expansion (`SPECIAL_ENV_RE` in `maskCode`)
- **`:::commdiag` rendering as a thin strip** (height 0): `__height__` sentinel was stored as `{x: height, y: 0}` but read as `.y`. Inversion fixed
- **Graph layout wrapped backwards** (right-then-left-and-down) for small graphs: replaced circular layout with grid (left→right, top→bottom)
- **`$$..$$` and `$..$` inside backticks rendered as math** in prose talking about math syntax: the math regex now skips inline-code spans
- **CMDX warnings on opening `comdtex.md`** about `lg`/`sm` size prefixes: removed the prefixes from the bundled template
- **Tauri shell scope rejected `pandoc`/`zip`/`git`**: `shell:allow-execute` now uses the v2 object form with an explicit `allow` list (`pandoc`, `zip`, `git`, `tectonic`, `xelatex`, `pdflatex`)
- **DepsWarning install button did nothing**: `openPath` is for filesystem paths; switched to `openUrl` for the `https://` doc link
- **Math overflow in callout/env bodies** for long `$$..$$` equations: `.eq-block` now allows shrinking (`min-width: 0`); inner `.katex-wrapper` scrolls horizontally
- **Click-to-jump preview→editor scrolled imprecisely**: env handlers now wrap output in `<div class="env-wrap" data-source-line="N">`, with `N` resolved against the editor's *raw* text (not the post-`preprocessCallouts`/`preRenderDisplayMath` text where multi-line constructs collapse to one-line placeholders)
- **Preview yanked back to the section heading** after a preview-click moved the editor cursor: added `suppressPreviewScrollOnce` ref consumed by the heading-active scroll-sync effect; smooth scroll on the editor side (`ScrollType.Smooth`)
- **`:::flowchart` had three disconnected terminal nodes** (`Start`, `END`, `End`) floating at the top: strip a trailing structural `END` from the AST and skip the virtual `End` when all paths already terminate via `RETURN/STOP`
- **Settings dropdowns illegible**: added `appearance: none`, transparent background, contrasting text + custom chevron; `<option>` elements force their colors per theme

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
- CI: `arch-release` job: Tauri does not support pacman bundles and the job was always failing

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
- **Arch Linux CI:** Removed `arch-check` and `arch-release` CI jobs entirely: Tauri v2 does not support `pacman` as a bundle target (valid Linux targets: `deb`, `rpm`, `appimage`); Arch Linux users are directed to use the `.AppImage` build instead
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
