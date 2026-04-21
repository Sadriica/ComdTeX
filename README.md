# ComdTeX

![CI](https://github.com/Sadriica/ComdTeX/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

Desktop editor for `Markdown + LaTeX` aimed at mathematics and science, built with `Tauri + React + TypeScript`.

---

## Table of Contents

- [Installation](#installation)
- [Development](#development)
- [Bundles](#bundles)
- [Release](#release)
- [Troubleshooting](#troubleshooting)
- [Features](#features)
- [Quick Start](#quick-start)
- [Auto-Update](#auto-update)
- [Known Limitations](#known-limitations)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

---

## Installation

### Linux — AppImage

Download the `.AppImage` from the [latest release](https://github.com/sadriica/comdtex/releases/latest), make it executable, and run it:

```bash
chmod +x ComdTeX_*.AppImage
./ComdTeX_*.AppImage
```

> **Mesa 24+ crash (Arch, Fedora, and other rolling distros)**
> The AppImage bundles Ubuntu 22.04's webkit2gtk, which calls `eglGetDisplay()` during init. Mesa 24 returns `EGL_BAD_PARAMETER` before any environment variable overrides take effect, causing an immediate abort:
> ```
> Could not create default EGL display: EGL_BAD_PARAMETER. Aborting.
> ```
> There is no reliable workaround for this at runtime. Use the native `.pkg.tar.zst` on Arch/Manjaro, or build from source on other rolling distros (see [Development](#development)).

### Linux — Debian/Ubuntu

Download the `.deb` from the [latest release](https://github.com/sadriica/comdtex/releases/latest) and install it:

```bash
sudo dpkg -i comdtex_*.deb
sudo apt-get install -f   # resolve any missing dependencies
```

If the app does not launch after installation:

```bash
sudo apt install libwebkit2gtk-4.1-0
```

### Linux — Arch/Manjaro

Download the `.pkg.tar.zst` from the [latest release](https://github.com/sadriica/comdtex/releases/latest) and install it:

```bash
sudo pacman -U comdtex-*.pkg.tar.zst
```

This package is built natively against Arch's webkit2gtk-4.1 and is fully compatible with Mesa 24+. It is the recommended install method on Arch-based systems.

### Linux — Other rolling distros (Fedora, Gentoo, Void, openSUSE Tumbleweed, etc.)

Pre-built AppImages are not compatible with Mesa 24+. Build from source instead — see [Development](#development).

### Windows

Download the `.exe` (NSIS installer) from the [latest release](https://github.com/sadriica/comdtex/releases/latest) and run it.

### Optional dependencies

| Tool | Purpose | Install |
|---|---|---|
| `pandoc` | PDF export | [pandoc.org/installing.html](https://pandoc.org/installing.html) |
| `zip` | Vault backup | System package manager (`apt install zip`, `pacman -S zip`, etc.) |

If either tool is missing, ComdTeX shows an amber warning banner on startup. PDF export falls back to `window.print()` if pandoc is absent; vault backup is disabled if zip is absent.

---

## Development

### Requirements

- **Node.js** 18 or later
- **Rust** (stable) and `cargo` — install via [rustup](https://rustup.rs/)
- System libraries for your distro:

| Distro | Command |
|---|---|
| Arch/Manjaro | `sudo pacman -S webkit2gtk-4.1 libayatana-appindicator librsvg openssl base-devel` |
| Debian/Ubuntu | `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev build-essential` |
| Fedora | `sudo dnf install webkit2gtk4.1-devel libayatana-appindicator-devel librsvg2-devel openssl-devel` |
| Gentoo/other | Install equivalents of `webkit2gtk:4.1`, `libayatana-appindicator`, `librsvg`, `openssl` |

### Commands

```bash
npm install           # install dependencies
npm run tauri dev     # development mode with hot-reload
npm run build         # frontend only
npm run tauri build   # desktop app + bundles (release mode)
```

### Build output

After `npm run tauri build`, the compiled binary and installable bundles are written to `src-tauri/target/release/`:

| What | Path |
|---|---|
| Raw binary (Linux) | `src-tauri/target/release/comdtex` |
| AppImage | `src-tauri/target/release/bundle/appimage/ComdTeX_*.AppImage` |
| .deb | `src-tauri/target/release/bundle/deb/comdtex_*.deb` |
| .pkg.tar.zst | `src-tauri/target/release/bundle/pacman/comdtex-*.pkg.tar.zst` |
| .exe (Windows) | `src-tauri/target/release/bundle/nsis/ComdTeX_*_x64-setup.exe` |

To run the app after a release build:

```bash
# Linux — run the binary directly
./src-tauri/target/release/comdtex

# Linux — run the AppImage
./src-tauri/target/release/bundle/appimage/ComdTeX_*.AppImage

# Arch — install and run via pacman
sudo pacman -U src-tauri/target/release/bundle/pacman/comdtex-*.pkg.tar.zst
comdtex
```

To build a specific bundle format only:

```bash
npm run tauri build -- --bundles appimage
npm run tauri build -- --bundles deb
npm run tauri build -- --bundles nsis       # Windows only
```

On Arch Linux, the npm `@tauri-apps/cli` binary does not support the `pacman` bundler. Use `cargo tauri build` instead:

```bash
cargo install tauri-cli --locked            # one-time install
cargo tauri build --bundles pacman
```

---

## Release

Releases are triggered by pushing a version tag:

```bash
git tag v1.0.x
git push origin v1.0.x
```

This triggers the GitHub Actions release workflow:

| Job | Runner | Output |
|---|---|---|
| `build` | `ubuntu-22.04` | `.AppImage`, `.deb` (Linux) + `.exe` (Windows) |
| `arch-release` | `archlinux:latest` container | `.pkg.tar.zst` |
| `publish` | `ubuntu-22.04` | Removes draft status after all jobs succeed |

> The repository must have `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set in **Settings → Secrets and variables → Actions**. Builds without these secrets will complete but will not embed a valid updater signature.

---

## Troubleshooting

### AppImage crashes with `EGL_BAD_PARAMETER`

```
Could not create default EGL display: EGL_BAD_PARAMETER. Aborting.
```

**Cause:** The AppImage bundles Ubuntu 22.04's webkit2gtk. Mesa 24 (shipped on Arch, Fedora, and other rolling distros) returns `EGL_BAD_PARAMETER` from `eglGetDisplay()` during webkit init, before any environment variable overrides take effect.

**Fix:**
- **Arch/Manjaro:** Install the `.pkg.tar.zst` package — it links against the system webkit2gtk.
- **Other rolling distros:** Build from source (see [Development](#development)).

### pandoc not detected

**Symptom:** Amber warning banner on startup; PDF export uses `window.print()` instead of pandoc.

**Fix:** Install pandoc from [pandoc.org/installing.html](https://pandoc.org/installing.html) and restart ComdTeX.

### zip not detected

**Symptom:** Amber warning banner on startup; vault backup option is disabled.

**Fix:**

```bash
sudo pacman -S zip      # Arch
sudo apt install zip    # Debian/Ubuntu
sudo dnf install zip    # Fedora
```

### .deb package: app does not launch

**Fix:**

```bash
sudo apt install libwebkit2gtk-4.1-0
```

### Auto-updater rejects artifacts

**Symptom:** The updater downloads an update but refuses to install it; or CI builds complete without embedding a signature.

**Cause:** `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is missing from GitHub Secrets, or the public key in `tauri.conf.json` does not match the private key used during the build.

**Fix:** Ensure `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set in GitHub Secrets, and that the public key in `tauri.conf.json → plugins.updater.pubkey` matches the private key used during the build.

---

## Features

### Math & Writing
- Shorthand system: `frac(a,b)`, `sqrt(x)`, `int(a,b)`, `sum(i=0,n)`, `lim(x,0)`, `mat(...)`, `vec(v)`, `norm(v)`, `pder(f,x)`, `der(f,x)`, `bb(R)`, `cal(A)`, `abs(x)`, and more — expand to LaTeX on Tab, work inside and outside `$...$`
- Auto-numbered math environments: `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `exercise`; unnumbered: `proof`, `remark`, `note`
- Auto-numbered `$$...$$` equations with `{#eq:label}` labels and `@eq:label` cross-references
- Auto-numbered figures with `{#fig:label}` labels and `@fig:label` cross-references
- BibTeX citations via `references.bib` and `[@key]` syntax
- Custom LaTeX macros via `\newcommand` in `macros.md` (applied vault-wide)
- User-defined text snippets via `snippets.md`
- YAML frontmatter rendering (title, author, date, abstract, tags)
- Callout blocks (`>[!NOTE]`, `>[!WARNING]`, `>[!TIP]`, etc.)
- Mermaid diagrams
- Footnotes
- HTML embed with sanitizer (YouTube iframes allowed; `<script>` and `<form>` blocked)

### Editor
- Monaco Editor with syntax highlighting
- Vim mode (toggle in Settings)
- Real-time content linter: broken wikilinks, missing citations, malformed equations, shorthand errors shown as Monaco markers
- Auto-pair `$` and `$$`
- Clickable checkboxes in preview
- Visual table editor (Ctrl+P → "Table Editor")
- Typewriter mode and focus mode (F11)
- Autosave (debounced) with crash recovery via drafts
- Session restore (tabs, active file, pinned tabs)

### Navigation & Panels
- Command palette (Ctrl+P): fuzzy file + command search
- Outline panel (document headings)
- Backlinks panel (incoming `[[wikilinks]]`)
- Wikilinks with `[[note-name]]` autocomplete
- Tag panel (browse files by frontmatter tag)
- Graph panel (visual wikilink map)
- Environments panel (all theorem/lemma/etc. blocks across vault)
- Equations panel (all numbered equations in current file)
- Frontmatter panel (GUI editor for YAML fields)
- Citation manager (browse and edit BibTeX entries)
- Todo panel (collects `- [ ]` task items across open files)
- Vault stats panel (file count, word count, link health, equations, citations)
- Git panel (branch, staged/unstaged changes, commit, push)
- Navigation history (Alt+Left / Alt+Right)
- Breadcrumb bar showing vault-relative path

### Vault & Files
- Vault = a regular folder on disk; open any folder
- Recent vaults list on welcome screen
- File tree with context menu (rename, delete, drag-to-move)
- Vault-wide full-text search and search-and-replace
- Vault backup (exports as `.zip`)
- Custom preview CSS via `custom.css`

### Export
- PDF export via pandoc (falls back to `window.print()` if pandoc is absent)
- LaTeX export (`.tex` with preamble, environments, and macros)
- Reveal.js presentation export
- DOCX and Beamer via pandoc
- Copy as HTML or LaTeX
- 7 academic templates for new files

### App
- English and Spanish UI — switch at runtime via `Vault → Settings` (or `Ctrl+P → Settings`) → **Language** dropdown; no restart required
- Auto-updater with in-app banner and one-click install
- Dependency warnings when pandoc or zip are missing

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
│   ├── measure-theory.md
│   └── functional-analysis.md
├── algebra/
│   ├── linear-algebra.md
│   └── group-theory.md
├── topology/
│   └── point-set-topology.md
├── thesis/
│   ├── thesis-main.md
│   ├── chapter-01-intro.md
│   └── chapter-02-background.md
└── notes/
    ├── seminar-2026-03-14.md
    └── problem-sets.md
```

### 3. Write Math with Shorthands

Shorthands expand to LaTeX when you press **Tab**. They work inside `$...$` and as standalone text (auto-wrapped on render). Nesting is supported: `frac(sqrt(x), abs(y-1))` → `\frac{\sqrt{x}}{\left|y-1\right|}`.

| Shorthand | Expands to |
|---|---|
| `frac(1, n+1)` | `\frac{1}{n+1}` |
| `sqrt(x)` | `\sqrt{x}` |
| `sum(i=0, n)` | `\sum_{i=0}^{n}` |
| `int(a, b)` | `\int_{a}^{b}` |
| `lim(x, 0)` | `\lim_{x \to 0}` |
| `vec(v)` | `\vec{v}` |
| `norm(vec(v))` | `\left\|\vec{v}\right\|` |
| `abs(x)` | `\left|x\right|` |
| `pder(f, x)` | `\frac{\partial f}{\partial x}` |
| `der(f, x)` | `\frac{df}{dx}` |
| `mat(1,0,0,1)` | 2×2 identity matrix |
| `bb(R)` | `\mathbb{R}` |
| `cal(A)` | `\mathcal{A}` |

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

Available types — auto-numbered: `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `exercise`. Unnumbered: `proof`, `remark`, `note`. Size prefixes: `sm`, `lg`.

### 5. Number Equations and Cross-Reference

```markdown
$$
\hat{f}(\xi) = \int_{-\infty}^{\infty} f(x)\, e^{-2\pi i x \xi}\, dx
$$ {#eq:fourier}

Equation @eq:fourier shows that $\hat{f}$ depends linearly on $f$.
```

`@eq:fourier` resolves to a clickable `(1)` link in the preview. Every `$$...$$` block is numbered sequentially; the label is optional.

### 6. Add a BibTeX Citation

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

All cited entries are collected into a bibliography section at the bottom of the preview.

---

## Auto-Update

ComdTeX checks for updates automatically on startup using `tauri-plugin-updater`. If a newer version is available, an in-app banner appears — no need to visit GitHub. Clicking **Install** downloads the update and relaunches the app. All artifacts are signed with [minisign](https://jedisct1.github.io/minisign/); the updater verifies the signature before applying any update, so tampered or incomplete downloads are rejected.

---

## Known Limitations

| Limitation | Notes |
|---|---|
| AppImage + Mesa 24+ | `EGL_BAD_PARAMETER` crash on Arch, Fedora, and other Mesa 24+ systems. Use `.pkg.tar.zst` on Arch; build from source elsewhere. |
| No native package for non-Arch rolling distros | No pre-built package for Gentoo, Void, or openSUSE Tumbleweed — build from source. |
| PDF export requires pandoc | Falls back to `window.print()` if pandoc is not found. |
| Vim mode | Provided by `monaco-vim` (community library). Some advanced motions may not work. |
| No mobile support | Desktop only (Linux, Windows). |
| No cloud sync | The vault is a local folder. Sync manually with any file sync tool (Syncthing, rclone, etc.). |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save current file |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+O` | Open vault |
| `Ctrl+P` | Command palette |
| `Ctrl+F` | Find in file |
| `Ctrl+Shift+F` | Search across vault |
| `Ctrl+Shift+P` | Toggle preview |
| `F11` | Focus mode |
| `Alt+Left` | Navigate back |
| `Alt+Right` | Navigate forward |
| `Tab` | Expand shorthand / advance snippet placeholder |
| `[[` | Autocomplete wikilink |
| `?` | Show keyboard shortcuts reference |

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

### Rules for adding a shorthand

Adding a shorthand requires updating **all five** of the following — omitting any will cause inconsistency between the editor and renderer:

1. `src/preprocessor.ts` — add a handler to `HANDLERS`
2. `src/monacoSetup.ts` — add a completion entry to `COMPLETIONS`
3. `src/Toolbar.tsx` — add an entry to the appropriate group in `getGroups(t)`
4. `src/HelpPanel.tsx` — add a `<Row>` entry in the corresponding section
5. `src/i18n.ts` — add the label to `T.toolbar` and `T.helpPanel` in **both** `en` and `es`

### Rules for adding UI strings

1. Add the key and type to the `T` interface in `src/i18n.ts`
2. Provide the translation in both the `en` and `es` objects
3. Access the string via `useT()` in the component — never hardcode English text

### Project structure

#### `src/` — Frontend

| File | Role |
|---|---|
| `App.tsx` | `App` wrapper (`LanguageContext` provider) + `AppContent` (all state, layout, keybindings, menus) |
| `useVault.ts` | Central hook: vault folder, tabs, file tree, CRUD, autosave, search |
| `useSettings.ts` | Settings persisted in `localStorage`: font sizes, theme, vim mode, language |
| `useUpdater.ts` | Auto-updater: `checkForUpdate()`, `downloadAndInstallUpdate()` |
| `renderer.ts` | Markdown + math → HTML pipeline |
| `preprocessor.ts` | Expands shorthands before KaTeX |
| `monacoSetup.ts` | Monaco config: autocomplete, Tab shorthand expansion, vim mode |
| `equations.ts` | Auto-numbering of `$$...$$` blocks, label/reference resolution |
| `environments.ts` | Renders `:::type[title]` blocks |
| `figures.ts` | Figure numbering and `@fig:label` cross-references |
| `bibtex.ts` | BibTeX parser and `[@key]` citation resolver |
| `frontmatter.ts` | Extracts and renders YAML frontmatter |
| `macros.ts` | Parses `\newcommand` from `macros.md` |
| `exporter.ts` | Exports to `.tex`; `exportReveal()` → Reveal.js HTML |
| `templates.ts` | Content for 7 academic templates |
| `wikilinks.ts` | `[[note-name]]` link helpers and backlink resolution |
| `pathUtils.ts` | Cross-platform path helpers |
| `sanitizeRenderedHtml.ts` | DOMParser-based HTML sanitizer — runs on every preview render |
| `contentLinter.ts` | Real-time Monaco markers: broken links, citations, equations, shorthand errors |
| `checkDeps.ts` | Checks `pandoc` and `zip` on startup |
| `i18n.ts` | EN/ES translation system: `T` interface, `LANGS`, `LanguageContext`, `useT()` |
| `toastService.ts` | Singleton toast module |
| `types.ts` | Shared TypeScript types (`FileNode`, `OpenFile`, `SearchResult`) |
| `Toolbar.tsx` | Button/dropdown bar; groups defined in `getGroups(t)` |
| `HelpPanel.tsx` | `?` sidebar panel with full syntax reference |
| `FileTree.tsx` | File tree with context menu (rename, delete, drag-to-move) |
| `TabBar.tsx` | Open file tabs with pinning support |
| `TitleBar.tsx` | Custom frameless window titlebar |
| `StatusBar.tsx` | Bottom bar: mode, cursor, word/char count, macro count, reading time |
| `MenuBar.tsx` | Dropdown menu bar |
| `SearchPanel.tsx` | Vault-wide full-text search |
| `SearchReplacePanel.tsx` | Vault-wide find and replace |
| `OutlinePanel.tsx` | Heading outline of the current file |
| `BacklinksPanel.tsx` | Incoming wikilinks for the active file |
| `EnvironmentsPanel.tsx` | All theorem/lemma/etc. blocks across the vault |
| `CitationManager.tsx` | GUI browser and editor for BibTeX entries |
| `EquationsPanel.tsx` | All numbered equations in the current file |
| `FrontmatterPanel.tsx` | GUI editor for YAML frontmatter fields |
| `TagPanel.tsx` | Browse vault files by frontmatter tag |
| `GraphPanel.tsx` | Visual wikilink graph |
| `TodoPanel.tsx` | Collects `- [ ]` task items across open files |
| `VaultStatsPanel.tsx` | Vault statistics: file count, word count, link health, equations, citations |
| `GitBar.tsx` | Git status panel: branch, staged/unstaged, commit, push |
| `Breadcrumb.tsx` | Vault-relative breadcrumb with navigation history |
| `ContextMenu.tsx` | Generic right-click context menu |
| `CommandPalette.tsx` | Ctrl+P fuzzy file and command launcher |
| `SettingsModal.tsx` | Settings dialog (language, fonts, theme, vim) |
| `HelpModal.tsx` | Keyboard shortcuts reference |
| `TemplateModal.tsx` | New-file-from-template picker |
| `TableEditor.tsx` | Modal visual Markdown table editor |
| `WelcomeScreen.tsx` | Welcome screen with recent vaults list |
| `DepsWarning.tsx` | Amber banner shown when `pandoc` or `zip` are missing |
| `UpdateChecker.tsx` | In-app update notification banner |
| `ErrorBoundary.tsx` | React error boundary wrapping `AppContent` |
| `Resizer.tsx` | Drag handle for panel resizing |
| `Toast.tsx` | Toast notification container |

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

## License

MIT © [ComdTeX contributors](https://github.com/Sadriica/ComdTeX)
