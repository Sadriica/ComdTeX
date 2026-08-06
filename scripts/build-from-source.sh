#!/usr/bin/env bash
# ComdTeX build-from-source helper: checks prerequisites (with per-distro
# install hints), builds the desktop app, and optionally installs it into
# ~/.local with full launcher integration (same layout as scripts/install.sh,
# but pointing at the locally built binary).
#
# Usage:
#   ./build-from-source.sh                build (binary + .deb; AppImage on demand)
#   ./build-from-source.sh --check       only verify prerequisites
#   ./build-from-source.sh --appimage    also build the AppImage bundle
#   ./build-from-source.sh --install     build, then install to ~/.local + launcher entry
#   ./build-from-source.sh --uninstall   remove a previous --install
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_PATH="${DESKTOP_DIR}/com.comdtex.desktop"
ICON_DIR="${HOME}/.local/share/icons/hicolor/128x128/apps"

CHECK_ONLY=0
WANT_APPIMAGE=0
DO_INSTALL=0
DO_UNINSTALL=0

msg() { printf '\033[1;34m::\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)     CHECK_ONLY=1; shift ;;
    --appimage)  WANT_APPIMAGE=1; shift ;;
    --install)   DO_INSTALL=1; shift ;;
    --uninstall) DO_UNINSTALL=1; shift ;;
    -h|--help)   sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

if [[ $DO_UNINSTALL -eq 1 ]]; then
  msg "Removing ~/.local install"
  rm -f "${BIN_DIR}/comdtex" "$DESKTOP_PATH" "${ICON_DIR}/comdtex.png"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP_DIR" || true
  msg "Done. Vaults and settings were not touched."
  exit 0
fi

# ── Detect distro for install hints ──────────────────────────────────────────
DISTRO="unknown"
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}${ID_LIKE:-}" in
    *arch*)           DISTRO="arch" ;;
    *debian*|*ubuntu*) DISTRO="debian" ;;
    *fedora*|*rhel*)  DISTRO="fedora" ;;
  esac
fi

hint() {
  # hint <tool> <arch-pkg> <debian-pkg> <fedora-pkg>
  case "$DISTRO" in
    arch)   echo "sudo pacman -S $2" ;;
    debian) echo "sudo apt install $3" ;;
    fedora) echo "sudo dnf install $4" ;;
    *)      echo "(install '$1' with your package manager)" ;;
  esac
}

# ── Prerequisite checks ──────────────────────────────────────────────────────
MISSING=0
need() {
  # need <command> <arch-pkg> <debian-pkg> <fedora-pkg>
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '  \033[1;31m✗\033[0m %-10s → %s\n' "$1" "$(hint "$1" "$2" "$3" "$4")"
    MISSING=1
  else
    printf '  \033[1;32m✓\033[0m %s\n' "$1"
  fi
}

msg "Checking prerequisites (distro: ${DISTRO})"
need node  nodejs   nodejs        nodejs
need npm   npm      npm           npm
need cargo rust     cargo         cargo
need rustc rust     rustc         rust
need pkg-config pkgconf pkg-config pkgconf

# webkit2gtk 4.1 is the one dependency that fails cryptically at link time.
if command -v pkg-config >/dev/null 2>&1; then
  if pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    printf '  \033[1;32m✓\033[0m webkit2gtk-4.1\n'
  else
    printf '  \033[1;31m✗\033[0m %-10s → %s\n' "webkit2gtk-4.1" \
      "$(hint webkit2gtk-4.1 webkit2gtk-4.1 libwebkit2gtk-4.1-dev webkit2gtk4.1-devel)"
    MISSING=1
  fi
fi

[[ $MISSING -eq 0 ]] || die "install the missing prerequisites above, then re-run"
[[ $CHECK_ONLY -eq 1 ]] && { msg "All prerequisites present."; exit 0; }

# ── Node modules ─────────────────────────────────────────────────────────────
cd "$ROOT_DIR"
if [[ ! -d node_modules ]] || [[ package-lock.json -nt node_modules ]]; then
  msg "Installing npm dependencies (npm ci)…"
  npm ci
fi

# ── Build ────────────────────────────────────────────────────────────────────
# NO_STRIP: the linuxdeploy bundled by tauri ships an old strip that fails on
# modern toolchains ('.relr.dyn' unknown type, hits Arch and other rolling
# distros). Harmless elsewhere, so set it whenever building the AppImage.
BUNDLES="deb"
[[ $WANT_APPIMAGE -eq 1 ]] && BUNDLES="deb,appimage" && export NO_STRIP=true

msg "Building ComdTeX (bundles: ${BUNDLES}); this compiles Rust, expect several minutes…"
npm run tauri build -- --bundles "$BUNDLES"

TARGET="${ROOT_DIR}/src-tauri/target/release"
msg "Build finished:"
echo "  binary : ${TARGET}/comdtex"
ls "${TARGET}/bundle/deb/"*.deb 2>/dev/null | sed 's/^/  deb    : /' || true
ls "${TARGET}/bundle/appimage/"*.AppImage 2>/dev/null | sed 's/^/  appimg : /' || true

# ── Optional ~/.local install with launcher integration ──────────────────────
if [[ $DO_INSTALL -eq 1 ]]; then
  msg "Installing to ~/.local…"
  mkdir -p "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR"
  install -m755 "${TARGET}/comdtex" "${BIN_DIR}/comdtex"
  install -m644 "${ROOT_DIR}/src-tauri/icons/128x128.png" "${ICON_DIR}/comdtex.png"
  cat > "$DESKTOP_PATH" <<EOF
[Desktop Entry]
Type=Application
Name=ComdTeX
Comment=Markdown + LaTeX IDE for academic writing
Exec=${BIN_DIR}/comdtex %F
Icon=comdtex
Terminal=false
Categories=Office;TextEditor;
MimeType=text/markdown;text/x-tex;
StartupWMClass=comdtex
EOF
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP_DIR" || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "${HOME}/.local/share/icons/hicolor" 2>/dev/null || true
  msg "Installed. ComdTeX should now appear in rofi/wofi/your app menu."
fi
