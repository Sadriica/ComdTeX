# ComdTeX

![CI](https://github.com/Sadriica/ComdTeX/actions/workflows/ci.yml/badge.svg)

Desktop editor for `Markdown + LaTeX` aimed at mathematics and science, built with `Tauri + React + TypeScript`.

---

## Features

### Math and writing
- **Math environments** — `:::theorem`, `:::proof`, `:::definition` and 7 more, with automatic numbering and optional titles.
- **Shorthand system** — write `frac(a, b)`, `sqrt(x)`, `mat(1,0,0,1)` and expand with `Tab`, inside or outside `$...$`.
- **Equation numbering** — every `$$...$$` block is numbered automatically. Add `{#eq:label}` for cross-references with `@eq:label`.
- **Figure numbering** — `![Caption](image.png){#fig:label}` with `@fig:label` cross-references.
- **BibTeX citations** — put `references.bib` in the vault root, cite with `[@key]`, bibliography renders at the end of the preview.
- **Custom LaTeX macros** — define `\newcommand` in `macros.md` at the vault root; they apply to every file in the vault.
- **User snippets** — define reusable text snippets in `snippets.md` at the vault root.
- **Callout blocks** — `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]` and more Obsidian-style callouts.
- **Mermaid diagrams** — fenced code blocks with ` ```mermaid ` render as diagrams in the preview.
- **HTML embed** — write raw HTML directly in documents; images, video, collapsible blocks and inline formatting pass through. YouTube iframes are allowed via allowlist; dangerous tags (`script`, `iframe` from other origins, `form`, etc.) are stripped automatically.
- **Footnotes** — standard Markdown footnote syntax (`[^1]`).

### Editor
- **Typewriter mode** — cursor always centered vertically for distraction-free writing.
- **Focus mode** — `F11` hides all chrome for full-screen writing.
- **Vim mode** — toggle from Settings.
- **Auto-pair** — `$` and `$$` are auto-paired in the editor.
- **Clickable checkboxes** — `- [ ]` / `- [x]` in the preview are interactive.
- **Table editor GUI** — visual Markdown table editor (Ctrl+P → "Editor de tabla").
- **Session restore** — cursor position remembered per file across sessions.
- **Content linter** — real-time Monaco markers for broken wikilinks, citations, equations, and shorthand errors.

### Navigation and panels
- **Wikilinks & backlinks** — link notes with `[[note-name]]`, navigate by clicking in the preview, see incoming links in the Backlinks panel.
- **Command palette** — `Ctrl+P` to open files and run any command by name.
- **Outline panel** — heading structure of the current file.
- **Tag panel** — browse files by frontmatter tags.
- **Graph panel** — visual wikilink graph for the vault.
- **Environments panel** — collects all theorem/lemma/definition blocks across the vault.
- **Equations panel** — lists all numbered equations in the current file.
- **Frontmatter panel** — GUI editor for YAML frontmatter fields.
- **Citation Manager** — GUI for browsing and editing BibTeX entries.
- **Search & Replace** — vault-wide find and replace with match preview.
- **Vault statistics panel** — file count, word count, link health, equation and citation counts.
- **Todo panel** — collects `- [ ]` items across all open files.
- **Git panel** — shows branch, staged/unstaged changes, commit and push from inside the app.
- **Navigation history** — back/forward between files with `Alt+Left` / `Alt+Right`.
- **Breadcrumb bar** — shows vault-relative path and current heading.

### Vault and files
- **Autosave** — changes are saved automatically with crash-recovery drafts.
- **Pinned tabs** — keep important files always open.
- **File drag-and-drop** — move files between folders in the tree.
- **Vault backup** — export the entire vault as a zip archive.
- **Custom preview CSS** — put `custom.css` in the vault root to style the preview.
- **Recent vaults list** — welcome screen shows recently opened vaults.

### Export
- **PDF export** — via `pandoc` (fallback: `window.print()`).
- **LaTeX export** — full `.tex` file with preamble, environments, and macros.
- **Reveal.js export** — HTML presentation slides from your Markdown.
- **Copy as HTML / Copy as LaTeX** — clipboard export without saving a file.
- **DOCX and Beamer** — via `pandoc`.

### App
- **Auto-updater** — checks for new releases on startup and installs with one click.
- **Dependency warnings** — amber banner if `pandoc` or `zip` are missing.
- **YAML frontmatter** — `title`, `author`, `date`, `abstract`, `tags` rendered at the top of the preview.
- **Academic templates** — Article, Class notes, Homework, Theorem sheet, Research note, and more.
- **Language** — English and Spanish UI, switchable at runtime from Settings.

---

## Screenshots

> _Screenshots coming soon._

---

## Installation

### Linux — AppImage (portable)

Download the `.AppImage` from the [Releases](https://github.com/Sadriica/ComdTeX/releases) page, make it executable, and run it:

```bash
chmod +x comdtex_<version>_amd64.AppImage
./comdtex_<version>_amd64.AppImage
```

### Linux — Debian / Ubuntu

```bash
sudo apt install ./comdtex_<version>_amd64.deb
```

### Linux — Arch Linux

```bash
sudo pacman -U comdtex-<version>-1-x86_64.pkg.tar.zst
```

### Windows

Download the `.exe` installer from the [Releases](https://github.com/Sadriica/ComdTeX/releases) page and run it.

Packages are available in the [Releases](https://github.com/Sadriica/ComdTeX/releases) section.

> **Note:** PDF export requires [`pandoc`](https://pandoc.org/installing.html) installed on the system. Vault backup requires `zip`. If `pandoc` is unavailable, export falls back to `window.print()`. ComdTeX shows an amber warning banner on startup if either tool is missing.

### Language

ComdTeX supports **English** and **Spanish**. The default language is Spanish.

To change it: open **Settings** (menu `Vault → Settings` or `Ctrl+P → Settings`) and select your preferred language from the **Language** dropdown. The entire UI updates immediately — no restart required.

---

## Quick Start

### 1. Open a vault

A **vault** is a regular folder on your disk. ComdTeX reads and writes `.md`, `.tex`, and `.bib` files from it. Special files recognized in the vault root:

| File | Purpose |
|---|---|
| `macros.md` | LaTeX `\newcommand` definitions applied to every file |
| `references.bib` | BibTeX entries for `[@key]` citations |
| `snippets.md` | User-defined text snippets |
| `custom.css` | Custom CSS applied to the preview |

Click **Open folder** on the welcome screen, or use `File → Open vault` (`Ctrl+O`).

### 2. Write math with shorthands

Shorthands expand to LaTeX when you press `Tab`. They work **inside and outside** `$...$` — if used outside, they are automatically wrapped.

```
frac(1, n+1)          →  $\frac{1}{n+1}$
sqrt(x^2 + y^2)       →  $\sqrt{x^2 + y^2}$
sum(i=0, n)           →  $\sum_{i=0}^{n}$
int(a, b)             →  $\int_{a}^{b}$
lim(x, 0)             →  $\lim_{x \to 0}$
mat(1,0,0,1)          →  2×2 identity matrix
matf(2,3, a,b,c,d,e,f) →  fixed 2×3 matrix
norm(vec(v))          →  $\left\|\vec{v}\right\|$   (nesting works)
pder(f, x)            →  $\frac{\partial f}{\partial x}$
der(f, x)             →  $\frac{df}{dx}$
bb(R)                 →  $\mathbb{R}$
cal(A)                →  $\mathcal{A}$
```

### 3. Use math environments

```
:::theorem[Intermediate Value Theorem]
If $f$ is continuous on $[a, b]$ and $f(a) \cdot f(b) < 0$,
then there exists $c \in (a, b)$ with $f(c) = 0$.
:::

:::proof
Follows from the completeness of $\mathbb{R}$. $\square$
:::
```

Available types: `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `exercise` (auto-numbered), `proof`, `remark`, `note` (unnumbered). Prefix with `sm` or `lg` to change size.

### 4. Number equations and cross-reference

```markdown
$$\int_a^b f'(x)\,dx = f(b) - f(a)$$ {#eq:ftc}

See the Fundamental Theorem (@eq:ftc).
```

Every `$$...$$` block is numbered sequentially. The label is optional.

### 5. Add a BibTeX citation

In `references.bib`:
```bibtex
@book{knuth84,
  author    = {Knuth, Donald E.},
  title     = {The TeXbook},
  year      = {1984},
}
```

In your note:
```markdown
This result is described in [@knuth84].
```

### 6. Embed multimedia

Raw HTML works inside Markdown documents. Useful tags:

**Images with custom size:**
```html
<img src="./diagram.png" width="500" alt="Diagram">
```

**Local video:**
```html
<video controls width="600">
  <source src="./recording.mp4" type="video/mp4">
</video>
```

**YouTube embed:**
```html
<iframe width="560" height="315"
  src="https://www.youtube.com/embed/VIDEO_ID"
  allowfullscreen>
</iframe>
```

**Collapsible block:**
```html
<details>
  <summary>Ver demostración completa</summary>
  Contenido largo que se oculta por defecto...
</details>
```

**Inline formatting:**
```html
<mark>texto resaltado</mark>
Nota al pie<sup>1</sup>
H<sub>2</sub>O
```

> Allowed: `img`, `video`, `audio`, `figure`, `details`, `summary`, `table`, `mark`, `kbd`, `sub`, `sup`, `div`, `span`, `blockquote`, and YouTube `iframe`.  
> Blocked: `script`, `iframe` (non-YouTube), `object`, `embed`, `form`, `input`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+O` | Open vault |
| `Ctrl+P` | Command palette |
| `Ctrl+F` | Find in file |
| `Ctrl+Shift+F` | Search across vault |
| `Ctrl+Shift+P` | Toggle preview |
| `F11` | Toggle focus mode |
| `Alt+Left` | Navigate back (history) |
| `Alt+Right` | Navigate forward (history) |
| `Tab` | Expand shorthand / advance snippet placeholder |
| `[[` | Autocomplete wikilink |
| `?` | Show keyboard shortcuts |

---

## Development

### Requirements

- `Node.js` 18+
- `Rust` / `cargo`
- System dependencies (see below per distro)

**Arch Linux:**
```bash
sudo pacman -S webkit2gtk-4.1 libayatana-appindicator librsvg openssl base-devel
```

**Debian / Ubuntu:**
```bash
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev build-essential
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel libayatana-appindicator-devel librsvg2-devel openssl-devel
```

### Commands

```bash
npm install          # install dependencies
npm run tauri dev    # development mode with hot-reload
npm run build        # frontend only
npm run tauri build  # desktop app + bundles
```

---

## Bundles

### Linux

The build produces these formats:

| Format | Distros | Output path |
|---|---|---|
| `.AppImage` | Any Linux (portable) | `src-tauri/target/release/bundle/appimage/` |
| `.deb` | Debian, Ubuntu, Linux Mint | `src-tauri/target/release/bundle/deb/` |
| `.pkg.tar.zst` | Arch Linux, Manjaro | `src-tauri/target/release/bundle/pacman/` |

### Windows

| Format | Output path |
|---|---|
| `.exe` (NSIS installer) | `src-tauri/target/release/bundle/nsis/` |

To build a specific format:

```bash
npm run tauri build -- --bundles appimage
npm run tauri build -- --bundles deb
npm run tauri build -- --bundles pacman
npm run tauri build -- --bundles nsis
```

---

## Release

The CI workflow builds all bundles automatically when a `v*` tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers `.github/workflows/release.yml`, which builds:
- Linux: `.AppImage` + `.deb` (Ubuntu runner via `tauri-action`)
- Arch Linux: `.pkg.tar.zst` (Arch container)
- Windows: `.exe` (NSIS installer)

`TAURI_SIGNING_PRIVATE_KEY` must be set in GitHub Secrets for the updater signature to be included.

---

## Contributing

Contributions are welcome. Please open an issue before submitting a large change so we can discuss the approach.

1. Fork the repository and create a branch from `main`.
2. Install dependencies and verify the dev build works (`npm run tauri dev`).
3. Make your changes. If you add a shorthand, update both `src/preprocessor.ts` (render) and `src/monacoSetup.ts` (Tab expansion). If you add UI strings, add them to both `en` and `es` in `src/i18n.ts`.
4. Open a pull request with a clear description of the change and why it's needed.

### Project structure

| Path | Role |
|---|---|
| `src/App.tsx` | Root component, global state, layout, keybindings |
| `src/useVault.ts` | Vault, tabs, file CRUD, autosave, search |
| `src/useSettings.ts` | Settings persisted in localStorage |
| `src/useUpdater.ts` | Auto-updater: check, download, install |
| `src/renderer.ts` | Markdown + math → HTML pipeline |
| `src/preprocessor.ts` | Shorthand expansion before KaTeX |
| `src/monacoSetup.ts` | Monaco config, Tab expansion, vim mode |
| `src/environments.ts` | `:::type[Title]` block rendering |
| `src/equations.ts` | Automatic equation numbering |
| `src/figures.ts` | Figure numbering and cross-references |
| `src/bibtex.ts` | BibTeX parser and citation resolver |
| `src/frontmatter.ts` | YAML frontmatter extraction and rendering |
| `src/macros.ts` | `\newcommand` macro parser |
| `src/wikilinks.ts` | Wikilink helpers and backlink resolution |
| `src/exporter.ts` | Export to `.tex` and Reveal.js HTML |
| `src/contentLinter.ts` | Real-time Monaco editor diagnostics |
| `src/checkDeps.ts` | System dependency check (pandoc, zip) |
| `src/sanitizeRenderedHtml.ts` | DOMParser-based HTML sanitizer |
| `src/pathUtils.ts` | Cross-platform path helpers |
| `src/i18n.ts` | English / Spanish translations |
| `src/templates.ts` | Academic template content |
| `src/toast.ts` | Singleton toast module |
| `src/types.ts` | Shared TypeScript types |
| `src/EnvironmentsPanel.tsx` | Panel: all theorem/lemma/etc blocks across vault |
| `src/CitationManager.tsx` | Panel: BibTeX entry browser and editor |
| `src/SearchReplacePanel.tsx` | Panel: vault-wide find and replace |
| `src/TableEditor.tsx` | Modal: visual Markdown table editor |
| `src/WelcomeScreen.tsx` | Welcome screen with recent vaults |
| `src/DepsWarning.tsx` | Amber banner for missing system tools |
| `src/UpdateChecker.tsx` | Update notification banner |
| `src/ErrorBoundary.tsx` | React error boundary |
| `src/GitBar.tsx` | Git status panel (branch, stage, commit, push) |
| `src/Breadcrumb.tsx` | Vault-relative path and heading breadcrumb |
| `src/TagPanel.tsx` | Panel: browse vault files by tag |
| `src/GraphPanel.tsx` | Panel: wikilink graph visualization |
| `src/TodoPanel.tsx` | Panel: collects `- [ ]` tasks across vault |
| `src/EquationsPanel.tsx` | Panel: lists numbered equations in current file |
| `src/FrontmatterPanel.tsx` | Panel: GUI editor for frontmatter fields |
| `src/VaultStatsPanel.tsx` | Panel: vault-wide statistics |
| `src/FileTree.tsx` | File tree with context menu |
| `src/TabBar.tsx` | Open file tabs |
| `src/Toolbar.tsx` | Button/dropdown bar |
| `src/MenuBar.tsx` | Dropdown menu bar |
| `src/TitleBar.tsx` | Custom window titlebar |
| `src/StatusBar.tsx` | Bottom bar: mode, cursor, word count |
| `src/SearchPanel.tsx` | Vault-wide full-text search |
| `src/OutlinePanel.tsx` | Heading outline of current file |
| `src/BacklinksPanel.tsx` | Incoming wikilinks panel |
| `src/CommandPalette.tsx` | Ctrl+P fuzzy file + command launcher |
| `src/SettingsModal.tsx` | Settings dialog |
| `src/HelpModal.tsx` | Keyboard shortcuts reference |
| `src/HelpPanel.tsx` | `?` sidebar syntax reference |
| `src/TemplateModal.tsx` | New-file-from-template picker |
| `src/ContextMenu.tsx` | Generic right-click context menu |
| `src/Resizer.tsx` | Drag handle for panel resizing |
| `src/Toast.tsx` | Toast notification container |
| `src-tauri/` | Tauri backend, capabilities, bundle config |
