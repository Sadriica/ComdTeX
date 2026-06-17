# Installing optional dependencies

Most of ComdTeX works without anything else installed — the bundled WASM LaTeX engine handles PDF compilation since v1.3.0. The dependencies below are only needed for specific export and backup flows.

| Tool | Required for |
|------|-------------|
| `pandoc` | DOCX export, Beamer slides, Typst export, document import, Markdown → PDF (non-LaTeX path) |
| `typst` | Typst → PDF export (compiles pandoc's Typst output) |
| `zip` | Vault backup, `.cmdx` archive export |
| `git` | The Git panel (status, commit, push from inside the app) |

If a tool is installed but ComdTeX still says it's missing, check the [Troubleshooting](#troubleshooting) section.

---

## pandoc

PDF compilation no longer requires pandoc. Only install it if you need DOCX or Beamer exports.

### Linux

```bash
# Debian / Ubuntu
sudo apt install pandoc

# Arch / Manjaro
sudo pacman -S pandoc

# Fedora
sudo dnf install pandoc
```

### macOS

```bash
brew install pandoc
```

### Windows

Download the installer from <https://pandoc.org/installing.html> and run it. Make sure the install adds `pandoc` to your `PATH`.

---

## typst

Only needed for **Typst → PDF** export. The plain `.typ` (Typst source) export
needs only `pandoc`; `typst` is required to compile that source to a PDF.

### Linux

```bash
# Arch / Manjaro
sudo pacman -S typst

# Debian/Ubuntu/Fedora: download a release binary
# from https://github.com/typst/typst/releases and put it on your PATH,
# or install via Cargo:
cargo install --locked typst-cli
```

### macOS

```bash
brew install typst
```

### Windows

```powershell
winget install --id Typst.Typst
# or
scoop install typst
```

---

## zip

Used for the vault-backup feature and `.cmdx` archive export.

### Linux

```bash
# Debian / Ubuntu
sudo apt install zip

# Arch / Manjaro
sudo pacman -S zip

# Fedora
sudo dnf install zip
```

### macOS

`zip` ships with macOS by default — you should not need to install anything. If `zip --version` fails in your terminal, reinstall the developer tools:

```bash
xcode-select --install
```

### Windows

Recommended: install via [Scoop](https://scoop.sh/) or [Chocolatey](https://chocolatey.org/):

```powershell
scoop install zip
# or
choco install zip
```

---

## git

Only needed for the in-app Git panel. ComdTeX never assumes git is present elsewhere.

### Linux

```bash
sudo apt install git       # Debian/Ubuntu
sudo pacman -S git         # Arch
```

### macOS

```bash
brew install git
```

### Windows

Install [Git for Windows](https://git-scm.com/download/win).

---

## Troubleshooting

### "Tool is installed but ComdTeX says it's missing"

ComdTeX runs detection through the Tauri shell plugin, which only allows commands that are in the capability scope. The scope includes `pandoc`, `zip`, `git`, `typst`, `tectonic`, `xelatex`, `pdflatex`. If you upgraded from an older build and the warning persists:

1. Restart ComdTeX after the install — the shell plugin caches `PATH` at startup.
2. Verify the tool is in your `PATH` from the same shell that launched ComdTeX:
   ```bash
   which pandoc && pandoc --version
   ```
3. On macOS, GUI apps inherit a different `PATH` than your terminal. Launch ComdTeX from the terminal (`open -a ComdTeX`) once after the install.
4. On Windows, log out and back in after installing — Explorer-launched apps cache the user `PATH` at logon.

### "I don't want to see this banner"

Click **Ignorar** on each dep. Dismissals are stored in `localStorage` under `comdtex_deps_dismissed` and persist across restarts. To clear them, open DevTools (Ctrl+Shift+I) and run:

```js
localStorage.removeItem("comdtex_deps_dismissed")
```
