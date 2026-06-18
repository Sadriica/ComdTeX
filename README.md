# ComdTeX

![CI](https://github.com/Sadriica/ComdTeX/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

Desktop editor for `Markdown + LaTeX` aimed at mathematics and science, built with `Tauri + React + TypeScript`.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Installation](#installation)
- [Auto-Update](#auto-update)
- [Known Limitations](#known-limitations)
- [Development](#development)
- [Release](#release)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [Third-party / Acknowledgements](#third-party--acknowledgements)
- [License](#license)

---

## Quick Start

### 1. Open a Vault

A **vault** is a regular folder on your filesystem. ComdTeX reads and writes `.md`, `.tex`, and `.bib` files directly — no database, no hidden format.

On first launch, click **Open Vault** and select any folder. Four special files in the vault root are recognized automatically:

| File | Purpose |
|---|---|
| `macros.md` | `\newcommand` definitions applied to every file's math rendering |
| `references.bib` | BibTeX entries used by `[@key]` citations |
| `snippets.md` | User-defined text snippets available in the editor |
| `custom.css` | Custom CSS applied to the preview pane |

None of these files are required — ComdTeX works without them.

ComdTeX also writes a `.comdtex-comments.json` in the vault root to persist per-line comments out-of-band, so your `.md` and `.tex` files stay clean.

### 2. Vault Structure

A typical math student's vault:

```
my-vault/
├── macros.md
├── references.bib
├── custom.css
├── snippets.md
├── analysis/
│   ├── real-analysis.md
│   └── measure-theory.md
├── algebra/
│   └── linear-algebra.md
├── thesis/
│   ├── thesis-main.md
│   └── chapter-01-intro.md
└── notes/
    └── seminar-2026-03-14.md
```

### 3. Write Math with Shorthands

Shorthands expand to LaTeX when you press **Tab**. They work inside `$...$` and as standalone text (auto-wrapped on render). Nesting is supported: `frac(sqrt(x), abs(y-1))` renders as `\frac{\sqrt{x}}{\left|y-1\right|}`.

**Operations**

| Shorthand | Result |
|---|---|
| `frac(1, n+1)` | `\frac{1}{n+1}` |
| `sqrt(x)` | `\sqrt{x}` |
| `root(n, x)` | `\sqrt[n]{x}` |
| `abs(x)` | `\left|x\right|` |
| `norm(v)` | `\left\|v\right\|` |
| `ceil(x)` | `\lceil x\rceil` |
| `floor(x)` | `\lfloor x\rfloor` |

**Sums, integrals, limits**

| Shorthand | Result |
|---|---|
| `sum(i=0, n)` | `\sum_{i=0}^{n}` |
| `int(a, b)` | `\int_{a}^{b}` |
| `lim(x, 0)` | `\lim_{x \to 0}` |
| `der(f, x)` | `\frac{df}{dx}` |
| `pder(f, x)` | `\frac{\partial f}{\partial x}` |

**Algebra and decorators**

| Shorthand | Result |
|---|---|
| `vec(v)` | `\vec{v}` |
| `hat(x)` | `\hat{x}` |
| `bar(x)` | `\overline{x}` |
| `tilde(x)` | `\tilde{x}` |
| `dot(x)` | `\dot{x}` |
| `ddot(x)` | `\ddot{x}` |
| `inv(A)` | `A^{-1}` |
| `trans(A)` | `A^{\top}` |
| `sup(x, n)` | `x^{n}` |
| `sub(x, n)` | `x_{n}` |

**Fonts**

| Shorthand | Result |
|---|---|
| `bb(R)` | `\mathbb{R}` |
| `cal(A)` | `\mathcal{A}` |
| `bf(x)` | `\mathbf{x}` |

**Matrices**

| Shorthand | Result |
|---|---|
| `mat(1,0,0,1)` | auto-shaped bracket matrix (`[` `]`) |
| `matf(2,3, a,b,c, d,e,f)` | fixed 2×3 bracket matrix |
| `pmat(1,0,0,1)` | parenthesis matrix (`(` `)`) |
| `table(Col1, Col2)` | Markdown table header row |

### 4. Use Math Environments

```markdown
:::theorem[Intermediate Value Theorem]
Let $f : [a, b] \to bb(R)$ be continuous. If $f(a) < 0 < f(b)$,
then there exists $c \in (a, b)$ such that $f(c) = 0$.
:::

:::proof
By the completeness of bb(R), consider $S = \{x \in [a,b] \mid f(x) < 0\}$.
Let $c = \sup S$. A standard $\varepsilon$-$\delta$ argument shows $f(c) = 0$.
:::
```

**Auto-numbered:** `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `exercise`

**Unnumbered:** `proof`, `remark`, `note`

**Size prefixes:** `sm` (compact), `lg` (large) — e.g. `:::sm remark`

Environments can be labeled and cross-referenced:

```markdown
:::theorem[Bolzano]{#thm:bolzano}
If $f$ is continuous on $[a,b]$ and changes sign, then it has a root.
:::

The result follows from @thm:bolzano.
```

### 5. Number Equations and Cross-Reference

```markdown
$$
\hat{f}(\xi) = \int_{-\infty}^{\infty} f(x)\, e^{-2\pi i x \xi}\, dx
$$ {#eq:fourier}

Equation @eq:fourier shows that $\hat{f}$ depends linearly on $f$.
```

`@eq:fourier` resolves to a clickable `(1)` link in the preview. Every `$$...$$` block is numbered sequentially; the label is optional.

### 6. Label Sections, Figures, and Tables

Use structural labels for stable cross-references that also export cleanly to LaTeX/Overleaf:

```markdown
# Introduction {#sec:intro}

See @sec:intro and @tbl:constants for notation.

| Symbol | Meaning |
|---|---|
| $G$ | Group |
| $e$ | Identity |
{#tbl:constants}
```

| Prefix | Use |
|---|---|
| `sec:` | Headings |
| `eq:` | Display equations |
| `fig:` | Figures |
| `tbl:` | Markdown tables |
| `thm:`, `lem:`, `cor:`, `prop:`, `def:`, `ex:`, `exer:` | Theorem-like environments |

Open the **Labels** panel to audit broken references, duplicates, and unused labels.

### 7. Obsidian and LaTeX File Interoperability

ComdTeX uses an internal format (CMDX) while you edit. The conversion is automatic and transparent:

| File on disk | What you see in the editor |
|---|---|
| `> [!note] Title` (Obsidian callout) | `:::note[Title]` |
| `\begin{theorem}[Name]` (LaTeX) | `:::theorem[Name]` |
| `\frac{a}{b}` (LaTeX) | `frac(a, b)` |
| `\begin{bmatrix}…\end{bmatrix}` (LaTeX) | `mat(…)` |

When you save, the file is written back in its original format. `.md` files stay Obsidian-compatible; `.tex` files stay valid LaTeX. Open a vault in Obsidian and ComdTeX simultaneously — changes round-trip cleanly.

### 8. Validate, Export, and Compile

The **Diagnostics** panel is the main pre-export checklist:

| Tab | Purpose |
|---|---|
| Diagnostics | Broken refs, duplicate labels, missing citations, malformed math, export risks |
| Export | Compatibility score for Overleaf/LaTeX and Obsidian Markdown |
| Project | Detects a main document and included `![[transclusions]]` |
| Structure | Academic structure checks (frontmatter title, theorem/proof proximity) |
| Math backlinks | Which sections and blocks reference each structural label |

A typical multi-file project:

```markdown
---
title: My Thesis
comdtex.main: true
---

![[chapters/01-introduction]]
![[chapters/02-background]]
```

Use **Export project as .tex** to generate one Overleaf-ready `.tex` from the main document. Use **Compile PDF with local LaTeX** to compile with `tectonic`, `xelatex`, or `pdflatex` if installed locally.

### 9. Add a BibTeX Citation

In `references.bib`:

```bibtex
@book{rudin1976,
  author    = {Walter Rudin},
  title     = {Principles of Mathematical Analysis},
  edition   = {3},
  publisher = {McGraw-Hill},
  year      = {1976}
}
```

In your note:

```markdown
The proof follows from the dominated convergence theorem [@rudin1976, p. 321].
```

All cited entries are collected into a bibliography at the bottom of the preview.

---

## Features

### Math & Writing
- Shorthand system — expands to LaTeX on Tab, works inside and outside `$...$`, supports nesting
- Structured math environments: auto-numbered `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `exercise`; unnumbered `proof`, `remark`, `note`; size prefixes `sm`/`lg`; labels and `@thm:...` cross-references
- Auto-numbered `$$...$$` equations with `{#eq:label}` labels and `@eq:label` cross-references
- Auto-numbered figures with `{#fig:label}` labels and `@fig:label` cross-references
- Structural labels for headings, equations, figures, tables, and theorem-like environments — plus `@...` cross-references
- BibTeX citations via `references.bib` and `[@key]` syntax
- Custom LaTeX macros via `\newcommand` in `macros.md` (applied vault-wide)
- User-defined text snippets via `snippets.md`
- YAML frontmatter (title, author, date, abstract, tags)
- Callout blocks (`> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`, etc.)
- Auto-numbered special blocks, independent per type: `:::truth` (Truth Table N), `:::graph` (Graph N, Graphviz/DOT), `:::plot` (Plot N), `:::commdiag` (Diagram N, tikz-cd), `:::pseudocode` (Algorithm N), `:::flowchart` (Flowchart N, Mermaid), `:::excalidraw` (a built-in, lazy-loaded freehand drawing editor) — each accepts an optional `[name]` and is stored verbatim in the file (data-safe round-trip)
- Text formatting: `==highlight==`, coloured highlights (`<mark class="hl-green">…</mark>` and friends), `<u>underline</u>`
- Live auto table of contents — drop a `[[toc]]` line and it expands into a navigable, always-current heading list
- Mermaid diagrams
- Footnotes
- HTML embed with sanitizer (YouTube iframes allowed; `<script>` and `<form>` blocked)

### Editor
- Monaco Editor with syntax highlighting
- Vim mode (toggle in Settings)
- Offline spellcheck (Hunspell dictionaries via `nspell`, Spanish + English) — gated by a Settings toggle; no network required
- Real-time content linter: broken wikilinks, missing citations, malformed equations, shorthand errors shown as Monaco markers
- Per-line comments — annotate any line; comments are persisted out-of-band in `.comdtex-comments.json` so source files stay clean
- Auto-pair `$` and `$$`
- Clickable checkboxes in preview
- Visual table editor (Ctrl+P → "Table editor")
- Typewriter mode and focus mode (F11)
- Autosave (debounced) with crash recovery via drafts
- Session restore (tabs, active file, pinned tabs)

### Preview
- Live PDF preview pane (pdf.js, virtualized for fast scrolling on large documents)
- Wikilink hover preview — peek at the contents of `[[note]]` without leaving the file
- Transclusion: embed an entire note with `![[note]]`, a single section with `![[note#heading]]`, or a tagged block via block IDs (`^id` / `![[note#^id]]`)
- Custom preview CSS via `custom.css`
- First-render correctness — macros are loaded before the initial render (no flash of unrendered math)

### Navigation & Panels
- Command palette (Ctrl+P): a categorized, selection-aware universal launcher — eight categories (Edit / Insert / Math / View / Export / AI / Vault / Navigation), each command shown with an icon and a keyboard-shortcut chip. Commands with variants (highlight colours, headings, lists, symbols, math operations, environments) drill into sub-menus; with text selected, format commands wrap the selection
- Quick switcher (Ctrl+;): fast file switching
- Daily notes (Ctrl+Shift+D): create or jump to today's dated note
- Outline panel (document headings) — drag headings to reorder sections in the source
- Backlinks panel (incoming `[[wikilinks]]`)
- Wikilinks with `[[note-name]]` autocomplete
- Tag panel (browse files by frontmatter tag)
- Labels panel (structural labels, broken references, duplicate labels, unused labels)
- Diagnostics panel (diagnostics, export compatibility, project plan, academic structure, math backlinks)
- Graph panel — improved visual wikilink map with clustering and filtering
- Environments panel (all theorem/lemma/etc. blocks across vault)
- Equations panel (all numbered equations in current file)
- Frontmatter panel (GUI editor for YAML fields)
- Citation manager (browse and edit BibTeX entries)
- Todo panel (collects `- [ ]` task items across open files)
- Vault stats panel (file count, word count, link health, equations, citations)
- Git panel (branch, staged/unstaged changes, commit, push)
- Navigation history (Alt+Left / Alt+Right)
- Breadcrumb bar
- Focus timer panel — Pomodoro (work/break/long-break cycles) plus live writing-session stats (word delta, words-per-minute, daily-goal progress)
- AI assistant panel — optional, bring-your-own provider (see [AI assistant](#ai-assistant) below)
- Unified top menu bar — a classic dropdown bar (File/Edit/View/Vault) plus a sectioned **Files / Texts / Math / Views** menu with direct **Focus / AI / Sync / Help** buttons. Opening a panel un-collapses the sidebar; the old sidebar tab strip is gone

### Vault & Files
- Vault = a regular folder on disk; open any folder
- Recent vaults list on welcome screen
- File tree with context menu (rename, delete, drag-to-move)
- Vault-wide full-text search and search-and-replace
- Vault backup (exports as `.zip`)

### Export
- **PDF via built-in WASM LaTeX engine (SwiftLaTeX)** — bundled at v1.3.0; compiles real LaTeX to PDF in-process, no `pandoc` / `xelatex` install required. Status bar shows `TeX: WASM | local`. See [docs/wasm-tex.md](docs/wasm-tex.md).
- Local LaTeX PDF fallback: if the WASM engine fails, ComdTeX automatically tries `tectonic`, then `xelatex`, then `pdflatex`
- LaTeX (`.tex`) with preamble, environments, and macros — Overleaf-compatible
- Project export: compose a multi-file project from a main document with `![[transclusions]]`
- Reveal.js presentation
- DOCX and Beamer via pandoc
- Typst export (`.typ` via pandoc); Typst → PDF when the `typst` binary is installed
- Obsidian-friendly Markdown export
- Document import via pandoc (`.docx`, `.odt`, `.tex`, `.html`, `.epub`, `.rst`, `.org`, … → Markdown, with embedded images extracted)
- Copy as HTML or LaTeX
- Academic templates: article, notes, problem set, theorem sheet, research notes, Overleaf paper, thesis, book

### App
- Themes: light, dark, and high-contrast — driven by CSS variables (`data-theme`), switchable at runtime in Settings
- Settings modal with left-tabbed sections: General, Editor, Preview, Daily notes, PDF compilation, Sync, AI assistant
- First-launch onboarding tour with polished empty states throughout the UI
- English and Spanish UI with full parity — switch at runtime via Settings → **Language** (no restart needed)
- Auto-updater with in-app banner and one-click install
- Dependency warnings when pandoc, zip, git, or typst are missing — dismissible per-dep, persisted in localStorage

### AI assistant
- Optional and **off by default** — bring your own provider and API key; ComdTeX ships none and makes no requests until you enable it
- Providers: Anthropic, OpenAI, Google Gemini, any OpenAI-compatible endpoint (including local **Ollama** / LM Studio / OpenRouter / DeepSeek), or a local agent **CLI** (e.g. `claude` / `opencode`)
- Two entry points: the **panel** (`Ctrl+Shift+A`, or the **AI** menu-bar button) and **inline edit** (`Ctrl+K`) — describe a change and it is applied to the selection or at the cursor
- Edits are applied through the editor, so every AI change is fully **undo-able** (Ctrl+Z) and never silently rewrites your files
- Base URLs are validated to `https://` or loopback (`http://localhost`) as an SSRF guard
- Configured in Settings → **AI assistant**

### Citations
- DOI / arXiv → BibTeX: paste a DOI or arXiv ID in the Citation Manager and ComdTeX fetches the entry from CrossRef / DataCite
- Zotero import: pull entries directly from a running Zotero with the Better BibTeX plugin (local JSON-RPC API at `http://localhost:23119`) — no export step required

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save current file |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+O` | Open vault |
| `Ctrl+P` | Command palette |
| `Ctrl+;` | Quick switcher |
| `Ctrl+Shift+D` | Open or create today's daily note |
| `Ctrl+F` | Find in file |
| `Ctrl+Shift+F` | Search across vault |
| `Ctrl+D` | Select next occurrence |
| `Ctrl+Shift+P` | Toggle preview |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Reset zoom |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+W` | Close tab |
| `Ctrl+Shift+T` | Reopen last closed tab |
| `Ctrl+Shift+B` | Show bookmarks |
| `Ctrl+Shift+1`…`9` | Set/clear bookmark in slot N |
| `Ctrl+Alt+1`…`9` | Jump to bookmark slot N |
| `Ctrl+Shift+A` | Open AI assistant panel |
| `Ctrl+K` | AI inline edit (applies to selection or at cursor) |
| `Ctrl+Shift+O` | Insert table of contents (`[[toc]]`) |
| `Ctrl+Shift+E` | Toggle Outline panel |
| `F11` | Focus mode |
| `Escape` | Exit focus mode |
| `Alt+Left` | Navigate back |
| `Alt+Right` | Navigate forward |
| `Tab` | Expand shorthand / advance snippet placeholder |
| `[[` | Autocomplete wikilink |
| `?` | Show keyboard shortcuts reference |

---

## Installation

### Linux — AppImage (universal)

Download the `.AppImage` from the [latest release](https://github.com/sadriica/comdtex/releases/latest), make it executable, and run it:

```bash
chmod +x ComdTeX_*.AppImage
./ComdTeX_*.AppImage
```

The released AppImage is patched in CI for Mesa 24+ EGL compatibility (libwayland-egl removed, `WEBKIT_DISABLE_DMABUF_RENDERER=1` set). It runs portably on Arch, Fedora, openSUSE Tumbleweed, Debian/Ubuntu, and other distros — no system install required.

### Linux — Debian/Ubuntu (.deb)

Download the `.deb` from the [latest release](https://github.com/sadriica/comdtex/releases/latest) and install it:

```bash
sudo dpkg -i comdtex_*.deb
sudo apt-get install -f   # resolve any missing dependencies
```

If the app does not launch after installation:

```bash
sudo apt install libwebkit2gtk-4.1-0
```

### Linux — Arch / Manjaro / Fedora / other rolling distros

Use the `.AppImage` above — it is already patched for Mesa 24+ and is the recommended way to install on rolling distros.

### Windows

Download the `.exe` (NSIS installer) from the [latest release](https://github.com/sadriica/comdtex/releases/latest) and run it.

### Optional dependencies

Since v1.3.0, PDF compilation works out of the box thanks to the bundled WASM LaTeX engine — no external tools required.

| Tool | Purpose | Install |
|---|---|---|
| `pandoc` | DOCX, Beamer, Typst export, and document import (PDF no longer needs it) | [pandoc.org/installing.html](https://pandoc.org/installing.html) |
| `typst` | Typst → PDF export | [github.com/typst/typst](https://github.com/typst/typst) |
| `zip` | Vault backup, `.cmdx` archive | `apt install zip` / `pacman -S zip` / `dnf install zip` |
| `git` | In-app Git panel | distro package manager |
| `tectonic` / `xelatex` / `pdflatex` | Optional local LaTeX fallback if the WASM engine fails | distro package manager |

If any tool is missing, ComdTeX shows an amber warning banner on startup. The banner is dismissible per-tool and the choice persists across sessions.

---

## Auto-Update

ComdTeX checks for updates automatically on startup. If a newer version is available, an in-app banner appears — no need to visit GitHub. Clicking **Install** downloads the update and relaunches the app. All artifacts are signed with [minisign](https://jedisct1.github.io/minisign/); the updater verifies the signature before applying any update.

---

## Known Limitations

| Limitation | Notes |
|---|---|
| DOCX / Beamer / Typst export & import require pandoc | PDF no longer needs pandoc (WASM engine bundled); DOCX, Beamer, Typst, and document import still do. Typst → PDF additionally needs the `typst` binary. |
| AI assistant is bring-your-own | Off by default; you supply your own provider and API key. ComdTeX ships no keys and makes no AI requests until enabled. |
| Vim mode | Provided by `monaco-vim` (community library). Some advanced motions may not work. |
| No mobile support | Desktop only (Linux, Windows). |
| Cloud sync is BYO | Use Dropbox / Google Drive / OneDrive's native client. ComdTeX detects the setup and surfaces a sync indicator and a conflicts panel — see [docs/cloud-sync.md](docs/cloud-sync.md). |
| Reveal.js export needs internet to render | The exported `.html` deck loads Reveal.js assets from `https://unpkg.com/...`, so the exported file needs an internet connection to display correctly. |
| SyncTeX forward/inverse sync is not available yet | The `.synctex` parser exists, but the bundled WASM LaTeX engine ships without synctex output, so no engine currently emits the data it needs. |

---

## Development

### Requirements

- **Node.js** 20 or later (CI builds on Node 22; Vite 8 requires Node 20+)
- **Rust** (stable) and `cargo` — install via [rustup](https://rustup.rs/)
- System libraries for your distro:

| Distro | Command |
|---|---|
| Arch/Manjaro | `sudo pacman -S webkit2gtk-4.1 libayatana-appindicator librsvg openssl base-devel` |
| Debian/Ubuntu | `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev build-essential` |
| Fedora | `sudo dnf install webkit2gtk4.1-devel libayatana-appindicator-devel librsvg2-devel openssl-devel` |
| Gentoo/other | Install equivalents of `webkit2gtk:4.1`, `libayatana-appindicator`, `librsvg`, `openssl` |

### Build from source — step by step

Full path from a clean machine to a packaged desktop app.

**1. Install the prerequisites** above (Node.js 20+, Rust + `cargo`, and your distro's system libraries from the table).

**2. Clone the repository**

```bash
git clone https://github.com/Sadriica/ComdTeX.git
cd ComdTeX
```

**3. Install dependencies**

```bash
npm ci          # lockfile-exact (recommended); or `npm install`
```

**4. (Optional) Run in development** — hot-reloads the frontend:

```bash
npm run tauri dev
```

**5. Build the desktop app + installers** (release mode):

```bash
npm run tauri build
```

> On **modern/Arch Linux**, the binary + `.deb` + `.rpm` build fine, but the AppImage step can fail in `linuxdeploy` (`strip: unknown type [0x13]`). If so, disable stripping:
> ```bash
> NO_STRIP=true npm run tauri build
> ```

`npm run tauri build` runs `npm run build` (eslint + tsc + vite) internally, then compiles the Rust binary and packages the bundles. Running `npm run build` on its own only produces the frontend `dist/` — not a desktop app.

### Other commands

```bash
npm run tauri dev     # development mode with hot-reload
npm test              # run the test suite (vitest)
npm run build         # frontend only (eslint + tsc + vite)
```

### Build output

After `npm run tauri build`, bundles are written to `src-tauri/target/release/bundle/`:

| Bundle | Path |
|---|---|
| AppImage | `appimage/comdtex_*_amd64.AppImage` |
| .deb | `deb/comdtex_*_amd64.deb` |
| .rpm | `rpm/comdtex-*-1.x86_64.rpm` |
| .exe (Windows) | `nsis/ComdTeX_*_x64-setup.exe` |

To build a specific format:

```bash
npm run tauri build -- --bundles appimage
npm run tauri build -- --bundles deb
npm run tauri build -- --bundles nsis       # Windows only
```

### Building the AppImage on Arch Linux

The bundled `linuxdeploy` ships an old `strip` that cannot handle modern `.relr.dyn` ELF sections, so AppImage creation fails on Arch unless stripping is disabled:

```bash
NO_STRIP=true npm run tauri build -- --bundles appimage
```

This is only relevant when building locally on Arch — release artifacts downloaded from GitHub already work everywhere.

---

## Release

Releases are triggered by pushing a version tag:

```bash
git tag v1.9.5
git push origin v1.9.5
```

This triggers the GitHub Actions release workflow:

| Job | Runner | Output |
|---|---|---|
| `build` (matrix) | `ubuntu-22.04` | `.AppImage` (patched for Mesa 24+) and `.deb` |
| `build` (matrix) | `windows-latest` | `.exe` (NSIS installer) |
| `publish` | `ubuntu-22.04` | Removes draft status after the build matrix succeeds |

> The repository must have `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set in **Settings → Secrets and variables → Actions**.

---

## Troubleshooting

### AppImage fails to start on a Mesa 24+ system

Released AppImages are already patched in CI (libwayland-egl removed, `WEBKIT_DISABLE_DMABUF_RENDERER=1`) and should run on Arch, Fedora, and other rolling distros without intervention. If you self-build an AppImage and hit `EGL_BAD_PARAMETER`, replicate the CI patch or use the system webkit2gtk-4.1 instead.

### Local AppImage build on Arch fails with strip errors

The bundled `linuxdeploy` ships an old `strip`. Set `NO_STRIP=true` before running `npm run tauri build` (see [Development](#development)).

### `vite build` fails to resolve `@excalidraw/excalidraw/index.css`

**Symptom:** `Rolldown failed to resolve import "@excalidraw/excalidraw/index.css"` during `npm run tauri build`.

**Cause:** an outdated `@excalidraw/excalidraw` is installed (the separate `index.css` export only exists in **0.18+**; 0.17.x embedded styles in the JS). This happens on a stale clone or when `node_modules` drifted from `package-lock.json`.

**Fix:** sync dependencies to the lockfile — `npm ci` (clean, lockfile-exact) or `npm install`. Do **not** delete the CSS import; the pinned version (`^0.18.1`) ships it.

### pandoc / zip / git not detected

**Symptom:** Amber banner on startup, or "Scoped command X not found" in the dev console.

ComdTeX runs detection through the Tauri shell plugin, which only allows commands explicitly listed in the capability scope. The scope includes `pandoc`, `zip`, `git`, `typst`, `tectonic`, `xelatex`, `pdflatex`. If the tool is on your `PATH` but the banner still shows, restart ComdTeX (the shell plugin caches `PATH` at startup) — the in-app **Install** button opens a per-tool install guide at [docs/installing-deps.md](docs/installing-deps.md).

PDF compilation no longer needs any of these — the WASM engine is bundled. Pandoc is required for DOCX / Beamer / Typst / document import / Markdown→PDF (non-LaTeX path); typst is additionally needed for Typst→PDF; zip is required for vault backup and `.cmdx` archive export; git is only used by the in-app Git panel.

### .deb package: app does not launch

```bash
sudo apt install libwebkit2gtk-4.1-0
```

### Auto-updater rejects artifacts

**Cause:** `TAURI_SIGNING_PRIVATE_KEY` is missing from GitHub Secrets, or the public key in `tauri.conf.json` does not match.

**Fix:** Ensure both `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set in GitHub Secrets, and that `tauri.conf.json → plugins.updater.pubkey` matches the private key used at build time.

---

## Contributing

Contributions are welcome. Open an issue before submitting a large change so we can discuss the approach.

### Setup

```bash
git clone https://github.com/Sadriica/ComdTeX.git
cd ComdTeX
npm install
npm run tauri dev
```

Verify the dev build launches and the editor opens a vault before submitting a PR.

### Adding a shorthand

Requires updating **all five** of the following — omitting any causes inconsistency between the editor and renderer:

1. `src/preprocessor.ts` — add a handler to `HANDLERS`
2. `src/monacoSetup.ts` — add a completion entry to `COMPLETIONS`
3. `src/Toolbar.tsx` — add an entry to the appropriate section in `getSections(t)` (the unified menu bar)
4. `src/HelpPanel.tsx` — add a `<Row>` entry in the corresponding section
5. `src/i18n.ts` — add the label to `T.toolbar` and `T.helpPanel` in **both** `en` and `es`

### Adding UI strings

1. Add the key and type to the `T` interface in `src/i18n.ts`
2. Provide the translation in both the `en` and `es` objects
3. Access via `useT()` in the component — never hardcode English text

### Project structure

#### `src/` — Frontend

| File | Role |
|---|---|
| `App.tsx` | `App` wrapper (`LanguageContext` provider) + `AppContent` (all state, layout, keybindings, menus) |
| `useVault.ts` | Central hook: vault folder, tabs, file tree, CRUD, autosave, search |
| `useSettings.ts` | Settings persisted in `localStorage`: font sizes, theme, vim mode, language, word wrap, WASM TeX, touchpad gestures, Pomodoro durations, AI provider config, cloud-sync toggles |
| `useUpdater.ts` | Auto-updater: `checkForUpdate()`, `downloadAndInstallUpdate()` |
| `renderer.ts` | Markdown + math → HTML pipeline |
| `preprocessor.ts` | Expands shorthands before KaTeX |
| `monacoSetup.ts` | Monaco config: autocomplete, structural label suggestions, Tab shorthand expansion, vim mode |
| `cmdxFormat.ts` | Bidirectional CMDX format converter: storage ↔ editor content |
| `exportActions.ts` | All export and save-as operations |
| `exportConversion.ts` | Export-path format helpers (Pandoc input, Obsidian export) |
| `equations.ts` | Auto-numbering of `$$...$$` blocks, label/reference resolution |
| `references.ts` | Numbered headings and `@sec:label` cross-references |
| `tables.ts` | Numbered Markdown tables and `@tbl:label` cross-references |
| `structuralLabels.ts` | Vault-wide index of labels, references, duplicates, broken refs, unused labels |
| `documentDiagnostics.ts` | Document quality checks |
| `exportCompatibility.ts` | Overleaf/LaTeX and Obsidian Markdown compatibility scoring |
| `projectExport.ts` | Main-document detection and transclusion-aware project export |
| `mathBacklinks.ts` | Backlinks for structural/math references |
| `environments.ts` | Renders `:::type[title]{#label}` blocks |
| `figures.ts` | Figure numbering and `@fig:label` cross-references |
| `bibtex.ts` | BibTeX parser and `[@key]` citation resolver |
| `doiFetch.ts` | DOI / arXiv → BibTeX fetch (CrossRef / DataCite) used by the Citation Manager |
| `ai/aiProvider.ts` | BYO AI provider layer (Anthropic / OpenAI / Gemini / OpenAI-compatible / CLI) |
| `ai/comdtex-context.md` | Built-in AI system prompt (ComdTeX syntax) bundled at build time |
| `pomodoro.ts` | Pomodoro state machine + writing-session stats (backs `FocusTimerPanel`) |
| `synctex.ts` | SyncTeX parsing for forward/inverse sync between source and PDF |
| `frontmatter.ts` | Extracts and renders YAML frontmatter |
| `macros.ts` | Parses `\newcommand` from `macros.md` |
| `exporter.ts` | Exports Overleaf-compatible `.tex`; Reveal.js HTML |
| `obsidianExport.ts` | Exports Obsidian-friendly Markdown |
| `templates.ts` | Built-in academic templates plus custom template persistence |
| `wikilinks.ts` | `[[note-name]]` link helpers and backlink resolution |
| `transclusion.ts` | Resolves `![[note]]` and `![[note#heading]]` embeds |
| `pathUtils.ts` | Cross-platform path helpers |
| `sanitizeRenderedHtml.ts` | DOMParser-based HTML sanitizer |
| `contentLinter.ts` | Real-time Monaco markers: broken links, citations, equations, shorthand errors |
| `checkDeps.ts` | Checks optional shell tools (`pandoc`, `zip`, `git`, `typst`) on startup |
| `i18n.ts` | EN/ES translation system: `T` interface, `LANGS`, `LanguageContext`, `useT()` |
| `toastService.ts` | Singleton toast module |
| `types.ts` | Shared TypeScript types (`FileNode`, `OpenFile`, `SearchResult`) |

#### `src-tauri/` — Rust / Tauri backend

| File | Role |
|---|---|
| `src/main.rs` | Tauri entry point |
| `src/lib.rs` | Plugin registration and Tauri builder |
| `tauri.conf.json` | App config: window size, CSP, updater endpoint, bundle settings |
| `Cargo.toml` | Rust dependencies |
| `capabilities/default.json` | Tauri v2 ACL capability declarations |
| `icons/` | App icons for all platforms |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

---

## Third-party / Acknowledgements

ComdTeX bundles open-source components. Notable ones with their own licenses:

| Component | Use | License |
|---|---|---|
| [SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX) (`pdftex` WASM engine) | Built-in PDF compilation | MIT |
| [`nspell`](https://github.com/wooorm/nspell) | Offline spellcheck engine | MIT |
| [`dictionary-en`](https://github.com/wooorm/dictionaries) | English spellcheck dictionary | MIT AND BSD |
| [`dictionary-es`](https://github.com/wooorm/dictionaries) | Spanish spellcheck dictionary | GPL-3.0 OR LGPL-3.0 OR MPL-1.1 |
| [KaTeX](https://katex.org/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), [Mermaid](https://mermaid.js.org/), [Excalidraw](https://excalidraw.com/), [pdf.js](https://mozilla.github.io/pdf.js/) | Rendering and editing | MIT / Apache-2.0 |

**Spanish dictionary data:** `dictionary-es` is tri-licensed `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)`. ComdTeX **elects the MPL-1.1** option for its use of the Spanish dictionary data. The English dictionary (`dictionary-en`) is `MIT AND BSD`.

---

## License

MIT © [ComdTeX contributors](https://github.com/Sadriica/ComdTeX)
