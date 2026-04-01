#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="comdtex"
APP_VERSION="${APP_VERSION:-0.1.0}"
APP_ID="${APP_ID:-com.comdtex}"
APPDIR="${APPDIR:-$ROOT_DIR/src-tauri/target/release/bundle/appimage-manual/${APP_NAME}.AppDir}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/src-tauri/target/release/bundle/appimage-manual}"
LINUXDEPLOY_BIN="${LINUXDEPLOY_BIN:-$HOME/.cache/tauri/linuxdeploy-x86_64.AppImage}"
LINUXDEPLOY_GTK_PLUGIN="${LINUXDEPLOY_GTK_PLUGIN:-$HOME/.cache/tauri/linuxdeploy-plugin-gtk.sh}"
APPIMAGE_PLUGIN="${APPIMAGE_PLUGIN:-$HOME/.cache/tauri/linuxdeploy-plugin-appimage.AppImage}"
ICON_PATH="${ICON_PATH:-$ROOT_DIR/src-tauri/icons/128x128.png}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_OUTPUT="${SKIP_OUTPUT:-0}"
PREPARE_ONLY="${PREPARE_ONLY:-0}"

require_file() {
  local path="$1"
  local label="$2"
  if [[ ! -f "$path" ]]; then
    echo "Missing $label: $path" >&2
    exit 1
  fi
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing command: $name" >&2
    exit 1
  fi
}

require_cmd npm
require_cmd cargo
require_cmd install
require_cmd cp
require_cmd ln
require_cmd mktemp

require_file "$LINUXDEPLOY_BIN" "linuxdeploy AppImage"
require_file "$LINUXDEPLOY_GTK_PLUGIN" "linuxdeploy GTK plugin"
require_file "$ICON_PATH" "application icon"

mkdir -p "$OUTPUT_DIR"

if [[ "$SKIP_BUILD" != "1" ]]; then
  (cd "$ROOT_DIR" && npm run build)
  (cd "$ROOT_DIR/src-tauri" && cargo build --release --bins --features tauri/custom-protocol)
fi

BIN_PATH="$ROOT_DIR/src-tauri/target/release/$APP_NAME"
require_file "$BIN_PATH" "release binary"

rm -rf "$APPDIR"
install -d \
  "$APPDIR/usr/bin" \
  "$APPDIR/usr/share/applications" \
  "$APPDIR/usr/share/icons/hicolor/128x128/apps"

install -m 0755 "$BIN_PATH" "$APPDIR/usr/bin/$APP_NAME"
install -m 0644 "$ICON_PATH" "$APPDIR/usr/share/icons/hicolor/128x128/apps/${APP_NAME}.png"
install -m 0644 "$ICON_PATH" "$APPDIR/${APP_NAME}.png"

cat >"$APPDIR/usr/share/applications/${APP_NAME}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ComdTeX
Exec=$APP_NAME
Icon=$APP_NAME
Categories=Office;Education;Science;
Comment=Markdown + LaTeX editor for mathematics and science
StartupWMClass=ComdTeX
X-AppImage-Version=$APP_VERSION
X-AppImage-Name=$APP_ID
Terminal=false
EOF

export LINUXDEPLOY="$LINUXDEPLOY_BIN"

if [[ "$PREPARE_ONLY" == "1" ]]; then
  echo "Prepared base AppDir at: $APPDIR"
  exit 0
fi

PLUGIN_DIR="$(mktemp -d)"
PHASE1_TOOLS_DIR="$PLUGIN_DIR/phase1"
PHASE2_TOOLS_DIR="$PLUGIN_DIR/phase2"
cleanup() {
  rm -rf "$PLUGIN_DIR"
}
trap cleanup EXIT

mkdir -p "$PHASE1_TOOLS_DIR" "$PHASE2_TOOLS_DIR"
cp "$LINUXDEPLOY_BIN" "$PHASE1_TOOLS_DIR/linuxdeploy-x86_64.AppImage"
cp "$LINUXDEPLOY_GTK_PLUGIN" "$PHASE1_TOOLS_DIR/linuxdeploy-plugin-gtk.sh"
chmod +x "$PHASE1_TOOLS_DIR/linuxdeploy-x86_64.AppImage" "$PHASE1_TOOLS_DIR/linuxdeploy-plugin-gtk.sh"
PHASE1_LINUXDEPLOY="$PHASE1_TOOLS_DIR/linuxdeploy-x86_64.AppImage"

PATH="$PHASE1_TOOLS_DIR:${PATH}" "$PHASE1_LINUXDEPLOY" \
  --appimage-extract-and-run \
  --verbosity=1 \
  --appdir "$APPDIR" \
  --desktop-file "$APPDIR/usr/share/applications/${APP_NAME}.desktop" \
  --icon-file "$ICON_PATH" \
  --executable "$APPDIR/usr/bin/$APP_NAME" \
  --plugin gtk

if [[ "$SKIP_OUTPUT" == "1" ]]; then
  echo "Prepared AppDir at: $APPDIR"
  exit 0
fi

if [[ -f "$APPIMAGE_PLUGIN" ]]; then
  chmod +x "$APPIMAGE_PLUGIN" || true
fi
cp "$LINUXDEPLOY_BIN" "$PHASE2_TOOLS_DIR/linuxdeploy-x86_64.AppImage"
cp "$APPIMAGE_PLUGIN" "$PHASE2_TOOLS_DIR/linuxdeploy-plugin-appimage.AppImage"
chmod +x "$PHASE2_TOOLS_DIR/linuxdeploy-x86_64.AppImage" "$PHASE2_TOOLS_DIR/linuxdeploy-plugin-appimage.AppImage"
PHASE2_LINUXDEPLOY="$PHASE2_TOOLS_DIR/linuxdeploy-x86_64.AppImage"

set +e
PATH="$PHASE2_TOOLS_DIR:${PATH}" "$PHASE2_LINUXDEPLOY" \
  --appimage-extract-and-run \
  --verbosity=1 \
  --appdir "$APPDIR" \
  --output appimage
status=$?
set -e

if [[ $status -ne 0 ]]; then
  cat >&2 <<EOF
AppImage packaging failed.

The current linuxdeploy toolchain is likely too old for some system libraries
that use the ELF .relr.dyn section. The failure can happen during dependency
deployment or final AppImage generation. You can still use the prepared AppDir:
  $APPDIR

To retry with newer tooling:
  LINUXDEPLOY_BIN=/path/to/newer/linuxdeploy-x86_64.AppImage \\
  APPIMAGE_PLUGIN=/path/to/newer/linuxdeploy-plugin-appimage.AppImage \\
  $0

Or prepare only the base AppDir without running linuxdeploy:
  PREPARE_ONLY=1 $0

Or stage the AppDir with linuxdeploy but skip final output:
  SKIP_OUTPUT=1 $0
EOF
  exit $status
fi

echo "AppImage bundle finished in: $OUTPUT_DIR"
