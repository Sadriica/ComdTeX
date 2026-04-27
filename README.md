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

The **Quality** panel is the main pre-export checklist:

| Tab | Purpose |
|---|---|
| Diagnóstico | Broken refs, duplicate labels, missing citations, malformed math, export risks |
| Export | Compatibility score for Overleaf/LaTeX and Obsidian Markdown |
| Proyecto | Detects a main document and included `![[transclusions]]` |
| Estructura | Academic structure checks (frontmatter title, theorem/proof proximity) |
| Backlinks math | Which sections and blocks reference each structural label |

A typical multi-file project:

```markdown
---
title: My Thesis
comdtex.main: true
---

![[chapters/01-introduction]]
![[chapters/02-background]]
```

Use **Exportar proyecto .tex** to generate one Overleaf-ready `.tex` from the main document. Use **Compilar PDF con LaTeX local** to compile with `tectonic`, `xelatex`, or `pdflatex` if installed locally.

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
- Auto-numbered math environments: `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `exercise`; unnumbered: `proof`, `remark`, `note`
- Auto-numbered `$$...$$` equations with `{#eq:label}` labels and `@eq:label` cross-references
- Auto-numbered figures with `{#fig:label}` labels and `@fig:label` cross-references
- Structural labels for headings, equations, figures, tables, and theorem-like environments — plus `@...` cross-references
- BibTeX citations via `references.bib` and `[@key]` syntax
- Custom LaTeX macros via `\newcommand` in `macros.md` (applied vault-wide)
- User-defined text snippets via `snippets.md`
- YAML frontmatter (title, author, date, abstract, tags)
- Callout blocks (`> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`, etc.)
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
- Quick switcher (Ctrl+;): fast file switching
- Outline panel (document headings)
- Backlinks panel (incoming `[[wikilinks]]`)
- Wikilinks with `[[note-name]]` autocomplete
- Tag panel (browse files by frontmatter tag)
- Labels panel (structural labels, broken references, duplicate labels, unused labels)
- Quality panel (diagnostics, export compatibility, project plan, academic structure, math backlinks)
- Graph panel (visual wikilink map)
- Environments panel (all theorem/lemma/etc. blocks across vault)
- Equations panel (all numbered equations in current file)
- Frontmatter panel (GUI editor for YAML fields)
- Citation manager (browse and edit BibTeX entries)
- Todo panel (collects `- [ ]` task items across open files)
- Vault stats panel (file count, word count, link health, equations, citations)
- Git panel (branch, staged/unstaged changes, commit, push)
- Navigation history (Alt+Left / Alt+Right)
- Breadcrumb bar

### Vault & Files
- Vault = a regular folder on disk; open any folder
- Recent vaults list on welcome screen
- File tree with context menu (rename, delete, drag-to-move)
- Vault-wide full-text search and search-and-replace
- Vault backup (exports as `.zip`)
- Custom preview CSS via `custom.css`

### Export
- PDF via pandoc (falls back to `window.print()` if pandoc is absent)
- LaTeX (`.tex`) with preamble, environments, and macros — Overleaf-compatible
- Project export: compose a multi-file project from a main document with `![[transclusions]]`
- Local LaTeX PDF compile via `tectonic`, `xelatex`, or `pdflatex`
- Reveal.js presentation
- DOCX and Beamer via pandoc
- Obsidian-friendly Markdown export
- Copy as HTML or LaTeX
- Academic templates: article, notes, problem set, theorem sheet, research notes, Overleaf paper, thesis, book

### App
- English and Spanish UI — switch at runtime via Settings → **Language** (no restart needed)
- Auto-updater with in-app banner and one-click install
- Dependency warnings when pandoc or zip are missing

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save current file |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+O` | Open vault |
| `Ctrl+P` | Command palette |
| `Ctrl+;` | Quick switcher |
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

## Installation

### Linux — AppImage

Download the `.AppImage` from the [latest release](https://github.com/sadriica/comdtex/releases/latest), make it executable, and run it:

```bash
chmod +x ComdTeX_*.AppImage
./ComdTeX_*.AppImage
```

> **Mesa 24+ crash (Arch, Fedora, and other rolling distros)**
> The AppImage bundles Ubuntu 22.04's webkit2gtk, which calls `eglGetDisplay()` during init. Mesa 24 returns `EGL_BAD_PARAMETER` before any environment variable overrides take effect, causing an immediate abort. Use the native `.pkg.tar.zst` on Arch/Manjaro, or build from source on other rolling distros (see [Development](#development)).

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

Download the `.pkg.tar.zst` from the [latest release](https://github.com/sadriica/comdtex/releases/latest):

```bash
sudo pacman -U comdtex-*.pkg.tar.zst
```

This package links against the system webkit2gtk-4.1 and is fully compatible with Mesa 24+. It is the recommended install method on Arch-based systems.

### Linux — Other rolling distros

Pre-built AppImages are not compatible with Mesa 24+. Build from source instead — see [Development](#development).

### Windows

Download the `.exe` (NSIS installer) from the [latest release](https://github.com/sadriica/comdtex/releases/latest) and run it.

### Optional dependencies

| Tool | Purpose | Install |
|---|---|---|
| `pandoc` | PDF, DOCX, Beamer export | [pandoc.org/installing.html](https://pandoc.org/installing.html) |
| `zip` | Vault backup | `apt install zip` / `pacman -S zip` / `dnf install zip` |

If either tool is missing, ComdTeX shows an amber warning banner on startup.

---

## Auto-Update

ComdTeX checks for updates automatically on startup. If a newer version is available, an in-app banner appears — no need to visit GitHub. Clicking **Install** downloads the update and relaunches the app. All artifacts are signed with [minisign](https://jedisct1.github.io/minisign/); the updater verifies the signature before applying any update.

---

## Known Limitations

| Limitation | Notes |
|---|---|
| AppImage + Mesa 24+ | `EGL_BAD_PARAMETER` crash on Arch, Fedora, and other Mesa 24+ systems. Use `.pkg.tar.zst` on Arch; build from source elsewhere. |
| No native package for non-Arch rolling distros | No pre-built package for Gentoo, Void, or openSUSE Tumbleweed — build from source. |
| PDF export requires pandoc | Falls back to `window.print()` if pandoc is not found. |
| Vim mode | Provided by `monaco-vim` (community library). Some advanced motions may not work. |
| No mobile support | Desktop only (Linux, Windows). |
| No cloud sync | The vault is a local folder. Sync with any file sync tool (Syncthing, rclone, etc.). |

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

After `npm run tauri build`, bundles are written to `src-tauri/target/release/bundle/`:

| Bundle | Path |
|---|---|
| AppImage | `appimage/ComdTeX_*.AppImage` |
| .deb | `deb/comdtex_*.deb` |
| .pkg.tar.zst | `pacman/comdtex-*.pkg.tar.zst` |
| .exe (Windows) | `nsis/ComdTeX_*_x64-setup.exe` |

To build a specific format:

```bash
npm run tauri build -- --bundles appimage
npm run tauri build -- --bundles deb
npm run tauri build -- --bundles nsis       # Windows only
```

On Arch Linux, `@tauri-apps/cli` does not support the `pacman` bundler. Use `cargo tauri build` instead:

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

> The repository must have `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set in **Settings → Secrets and variables → Actions**.

---

## Troubleshooting

### AppImage crashes with `EGL_BAD_PARAMETER`

**Cause:** Mesa 24 (Arch, Fedora, rolling distros) is incompatible with the Ubuntu 22.04 webkit2gtk bundled in the AppImage.

**Fix:**
- **Arch/Manjaro:** Install the `.pkg.tar.zst` package.
- **Other rolling distros:** Build from source (see [Development](#development)).

### pandoc not detected

**Symptom:** Amber banner on startup; PDF export uses `window.print()`.

**Fix:** Install pandoc from [pandoc.org/installing.html](https://pandoc.org/installing.html) and restart ComdTeX.

### zip not detected

**Symptom:** Amber banner on startup; vault backup is disabled.

**Fix:**

```bash
sudo apt install zip    # Debian/Ubuntu
sudo pacman -S zip      # Arch
sudo dnf install zip    # Fedora
```

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
3. `src/Toolbar.tsx` — add an entry to the appropriate group in `getGroups(t)`
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
| `useSettings.ts` | Settings persisted in `localStorage`: font sizes, theme, vim mode, language |
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
| `checkDeps.ts` | Checks `pandoc` and `zip` on startup |
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

## License

MIT © [ComdTeX contributors](https://github.com/Sadriica/ComdTeX)
