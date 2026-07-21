#!/usr/bin/env bash
# ComdTeX Linux installer — downloads the latest AppImage release and integrates
# it with the desktop (launcher entry for rofi/wofi/GNOME/KDE, icon, CLI symlink).
#
# Everything lands under ~/.local (XDG), no sudo required:
#   ~/.local/bin/comdtex.AppImage      the app
#   ~/.local/bin/comdtex               CLI symlink
#   ~/.local/share/applications/com.comdtex.desktop
#   ~/.local/share/icons/hicolor/128x128/apps/comdtex.png
#
# Usage:
#   ./install.sh                 install/update to the latest release
#   ./install.sh --version v1.11.0
#   ./install.sh --no-desktop    binary only, skip launcher integration
#   ./install.sh --uninstall     remove everything listed above
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/Sadriica/ComdTeX/main/scripts/install.sh | bash
set -euo pipefail

REPO="Sadriica/ComdTeX"
APP_ID="com.comdtex"
BIN_DIR="${HOME}/.local/bin"
APP_PATH="${BIN_DIR}/comdtex.AppImage"
LINK_PATH="${BIN_DIR}/comdtex"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_PATH="${DESKTOP_DIR}/${APP_ID}.desktop"
ICON_DIR="${HOME}/.local/share/icons/hicolor/128x128/apps"
ICON_PATH="${ICON_DIR}/comdtex.png"

VERSION=""
DO_DESKTOP=1
DO_UNINSTALL=0

msg()  { printf '\033[1;34m::\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)    VERSION="${2:?--version needs an argument}"; shift 2 ;;
    --no-desktop) DO_DESKTOP=0; shift ;;
    --uninstall)  DO_UNINSTALL=1; shift ;;
    -h|--help)    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

if [[ $DO_UNINSTALL -eq 1 ]]; then
  msg "Uninstalling ComdTeX from ~/.local"
  rm -f "$APP_PATH" "$LINK_PATH" "$DESKTOP_PATH" "$ICON_PATH"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP_DIR" || true
  msg "Done. Your vaults and settings were not touched."
  exit 0
fi

[[ "$(uname -s)" == "Linux" ]] || die "this installer is Linux-only (use the .exe on Windows)"
[[ "$(uname -m)" == "x86_64" ]] || die "prebuilt AppImages are x86_64-only — use scripts/build-from-source.sh"
command -v curl >/dev/null 2>&1 || die "curl is required"

# ── Resolve version ──────────────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  msg "Resolving latest release…"
  # Fetch fully before grepping: `grep -m1` closing the pipe early makes curl
  # fail with code 23 under pipefail.
  RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest") \
    || die "could not query the GitHub releases API"
  VERSION=$(printf '%s' "$RELEASE_JSON" | sed -nE 's/.*"tag_name": *"([^"]+)".*/\1/p' | head -1)
  [[ -n "$VERSION" ]] || die "could not resolve the latest release tag"
fi
VER_NUM="${VERSION#v}"
ASSET="comdtex_${VER_NUM}_amd64.AppImage"
BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"

# ── Download + verify ────────────────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
msg "Downloading ${ASSET} (${VERSION})…"
curl -fL --progress-bar -o "${TMP_DIR}/${ASSET}" "${BASE_URL}/${ASSET}" \
  || die "download failed — does release ${VERSION} exist and include Linux assets?"

if curl -fsSL -o "${TMP_DIR}/${ASSET}.sha256" "${BASE_URL}/${ASSET}.sha256" 2>/dev/null; then
  msg "Verifying checksum…"
  # The published file is "<hash>  <name>"; recompute against our download path.
  EXPECTED=$(awk '{print $1}' "${TMP_DIR}/${ASSET}.sha256")
  ACTUAL=$(sha256sum "${TMP_DIR}/${ASSET}" | awk '{print $1}')
  [[ "$EXPECTED" == "$ACTUAL" ]] || die "checksum mismatch — corrupted download, try again"
else
  msg "No checksum published for ${VERSION}; skipping verification."
fi

# ── Install binary + CLI symlink ─────────────────────────────────────────────
mkdir -p "$BIN_DIR"
chmod +x "${TMP_DIR}/${ASSET}"
mv "${TMP_DIR}/${ASSET}" "$APP_PATH"
ln -sf "$APP_PATH" "$LINK_PATH"
msg "Installed ${APP_PATH}"

case ":$PATH:" in
  *":${BIN_DIR}:"*) ;;
  *) msg "Note: ${BIN_DIR} is not in your PATH — add it to run 'comdtex' from a terminal." ;;
esac

# ── Desktop integration (launcher entry + icon) ──────────────────────────────
if [[ $DO_DESKTOP -eq 1 ]]; then
  msg "Integrating with the desktop (launcher + icon)…"
  mkdir -p "$DESKTOP_DIR" "$ICON_DIR"

  # Pull the icon out of the AppImage itself so it always matches the version.
  ( cd "$TMP_DIR" && "$APP_PATH" --appimage-extract 'usr/share/icons/hicolor/128x128/apps/*' >/dev/null 2>&1 ) || true
  EXTRACTED=$(find "${TMP_DIR}/squashfs-root" -name '*.png' 2>/dev/null | head -1 || true)
  if [[ -n "$EXTRACTED" ]]; then
    cp "$EXTRACTED" "$ICON_PATH"
  else
    curl -fsSL -o "$ICON_PATH" \
      "https://raw.githubusercontent.com/${REPO}/main/src-tauri/icons/128x128.png" || true
  fi

  cat > "$DESKTOP_PATH" <<EOF
[Desktop Entry]
Type=Application
Name=ComdTeX
Comment=Markdown + LaTeX IDE for academic writing
Exec=${APP_PATH} %F
Icon=comdtex
Terminal=false
Categories=Office;TextEditor;
MimeType=text/markdown;text/x-tex;
StartupWMClass=comdtex
EOF

  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP_DIR" || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "${HOME}/.local/share/icons/hicolor" 2>/dev/null || true
  msg "Launcher entry created — ComdTeX should now appear in rofi/wofi/your app menu."
fi

msg "ComdTeX ${VERSION} installed. Run 'comdtex' or launch it from your app menu."
