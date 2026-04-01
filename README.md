# ComdTeX

![CI](https://github.com/Sadriica/ComdTeX/actions/workflows/ci.yml/badge.svg)

Desktop editor for `Markdown + LaTeX` aimed at mathematics and science, built with `Tauri + React + TypeScript`.

---

## Features

- **Math environments** — `:::theorem`, `:::proof`, `:::definition` and 7 more, with automatic numbering and optional titles.
- **Shorthand system** — write `frac(a, b)`, `sqrt(x)`, `mat(1,0,0,1)` and expand with `Tab`, inside or outside `$...$`.
- **Equation numbering** — every `$$...$$` block is numbered automatically. Add `{#eq:label}` for cross-references with `@eq:label`.
- **BibTeX citations** — put `references.bib` in the vault root, cite with `[@key]`, bibliography renders at the end of the preview.
- **Custom LaTeX macros** — define `\newcommand` in `macros.md` at the vault root; they apply to every file in the vault.
- **Wikilinks & backlinks** — link notes with `[[note-name]]`, navigate by clicking in the preview, see incoming links in the backlinks panel.
- **Academic templates** — Article, Class notes, Homework, Theorem sheet, Research note, and more.
- **YAML frontmatter** — `title`, `author`, `date`, `tags` rendered at the top of the preview.
- **Command palette** — `Ctrl+P` to open files and run any command by name.
- **Vim mode** — toggle from Settings.
- **Focus mode** — `F11` hides all chrome for distraction-free writing.
- **Live preview** — split-pane preview with KaTeX rendering, resizable panels.
- **Autosave** — changes are saved automatically with crash-recovery drafts.
- **Language** — English and Spanish UI, switchable at runtime from Settings.

---

## Screenshots

> _Screenshots coming soon._

---

## Installation

### Arch Linux

```bash
sudo pacman -U comdtex-<version>-1-x86_64.pkg.tar.zst
```

### Debian / Ubuntu

```bash
sudo apt install ./comdtex_<version>_amd64.deb
```

### Fedora / RHEL

```bash
sudo dnf install comdtex-<version>-1.x86_64.rpm
```

Packages are available in the [Releases](https://github.com/Sadriica/ComdTeX/releases) section.

> **Note:** PDF export requires [`pandoc`](https://pandoc.org/installing.html) installed on the system. If unavailable, export falls back to `window.print()`.

### Language

ComdTeX supports **English** and **Spanish**. The default language is Spanish.

To change it: open **Settings** (menu `Vault → Settings` or `Ctrl+P → Settings`) and select your preferred language from the **Language** dropdown. The entire UI updates immediately — no restart required.

---

## Quick Start

### 1. Open a vault

A **vault** is a regular folder on your disk. ComdTeX reads and writes `.md`, `.tex`, and `.bib` files from it. Two special files are recognized in the vault root:

| File | Purpose |
|---|---|
| `macros.md` | LaTeX `\newcommand` definitions applied to every file |
| `references.bib` | BibTeX entries for `[@key]` citations |

Click **Open folder** on the welcome screen, or use `File → Open vault`.

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

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+P` | Command palette |
| `Ctrl+F` | Find in file |
| `Ctrl+Shift+F` | Search across vault |
| `Ctrl+Shift+P` | Toggle preview |
| `F11` | Toggle focus mode |
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

## Linux Bundles

The build produces three formats automatically:

| Format | Distros | Output path |
|---|---|---|
| `.pkg.tar.zst` | Arch Linux, Manjaro | `src-tauri/target/release/bundle/pacman/` |
| `.deb` | Debian, Ubuntu, Linux Mint | `src-tauri/target/release/bundle/deb/` |
| `.rpm` | Fedora, RHEL, openSUSE | `src-tauri/target/release/bundle/rpm/` |

To build a specific format:

```bash
npm run tauri build -- --bundles pacman
npm run tauri build -- --bundles deb
npm run tauri build -- --bundles rpm
```

---

## Release

The CI workflow builds all three bundles automatically when a `v*` tag is pushed:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## AppImage

Tauri's automatic AppImage flow is disabled due to a compatibility issue between the cached `linuxdeploy` and ELF libraries using the `.relr.dyn` section.

A manual script is available as a workaround:

```bash
npm run appimage:manual

# Prepare the AppDir without packaging:
PREPARE_ONLY=1 npm run appimage:manual

# Use a newer linuxdeploy version:
LINUXDEPLOY_BIN=/path/to/linuxdeploy-x86_64.AppImage \
APPIMAGE_PLUGIN=/path/to/linuxdeploy-plugin-appimage.AppImage \
npm run appimage:manual
```

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
| `src/renderer.ts` | Markdown + math → HTML pipeline |
| `src/preprocessor.ts` | Shorthand expansion before KaTeX |
| `src/monacoSetup.ts` | Monaco config, Tab expansion, vim mode |
| `src/environments.ts` | `:::type[Title]` block rendering |
| `src/bibtex.ts` | BibTeX parser and citation resolver |
| `src/equations.ts` | Automatic equation numbering |
| `src/i18n.ts` | English / Spanish translations |
| `src/templates.ts` | Academic template content |
| `src-tauri/` | Tauri backend, capabilities, bundle config |
