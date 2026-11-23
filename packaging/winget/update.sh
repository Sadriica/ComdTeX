#!/usr/bin/env bash
# Regenerates the winget manifests for a released ComdTeX version.
#
# Usage:
#   ./update.sh 1.37.0                      # fetch sha256 from the release's .exe.sha256 asset
#   ./update.sh 1.37.0 --sha256 <64 hex>    # use a hash you already computed (CI)
#   ./update.sh 1.37.0 --file path/to.exe   # compute the hash from a local copy of the installer
#
# Output: manifests/s/Sadriica/ComdTeX/<version>/ (three YAMLs). Older version
# directories are removed so the tree always holds exactly one version, which is
# what a winget-pkgs PR expects. Nothing is submitted; see ../README.md.
set -euo pipefail

VER="${1:?usage: ./update.sh <version, e.g. 1.37.0> [--sha256 HEX | --file EXE]}"
VER="${VER#v}"
shift
SHA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha256) SHA="${2:?missing value}"; shift 2 ;;
    --file) SHA="$(sha256sum "${2:?missing value}" | awk '{print $1}')"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

REPO="Sadriica/ComdTeX"
ASSET="comdtex_${VER}_x64-setup.exe"
BASE="https://github.com/${REPO}/releases/download/v${VER}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${DIR}/manifests/s/Sadriica/ComdTeX"
OUT="${ROOT}/${VER}"

if [[ -z "$SHA" ]]; then
  SHA=$(curl -fsSL "${BASE}/${ASSET}.sha256" | awk '{print $1}')
fi
SHA="$(printf '%s' "$SHA" | tr 'A-F' 'a-f')"
[[ "$SHA" =~ ^[0-9a-f]{64}$ ]] || { echo "error: not a valid sha256: '${SHA}'" >&2; exit 1; }
SHA_UP="$(printf '%s' "$SHA" | tr 'a-f' 'A-F')"

# Best effort: the release date for the installer manifest (YYYY-MM-DD).
RELEASE_DATE=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/tags/v${VER}" 2>/dev/null \
  | sed -n 's/^  "published_at": "\([0-9-]*\)T.*/\1/p' | head -n1 || true)

# Keep exactly one version directory.
find "$ROOT" -mindepth 1 -maxdepth 1 -type d ! -name "$VER" -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$OUT"

SCHEMA=1.12.0

cat > "${OUT}/Sadriica.ComdTeX.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.version.${SCHEMA}.schema.json

PackageIdentifier: Sadriica.ComdTeX
PackageVersion: ${VER}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${SCHEMA}
YAML

{
  cat <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.installer.${SCHEMA}.schema.json

PackageIdentifier: Sadriica.ComdTeX
PackageVersion: ${VER}
InstallerType: nullsoft
Scope: machine
InstallModes:
  - interactive
  - silent
  - silentWithProgress
InstallerSwitches:
  Silent: /S
  SilentWithProgress: /S
UpgradeBehavior: install
ElevationRequirement: elevatesSelf
YAML
  [[ -n "$RELEASE_DATE" ]] && echo "ReleaseDate: ${RELEASE_DATE}"
  cat <<YAML
Installers:
  - Architecture: x64
    InstallerUrl: ${BASE}/${ASSET}
    InstallerSha256: ${SHA_UP}
ManifestType: installer
ManifestVersion: ${SCHEMA}
YAML
} > "${OUT}/Sadriica.ComdTeX.installer.yaml"

cat > "${OUT}/Sadriica.ComdTeX.locale.en-US.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.defaultLocale.${SCHEMA}.schema.json

PackageIdentifier: Sadriica.ComdTeX
PackageVersion: ${VER}
PackageLocale: en-US
Publisher: Witara
PublisherUrl: https://witara.site
PublisherSupportUrl: https://github.com/${REPO}/issues
PackageName: ComdTeX
PackageUrl: https://comdtex.witara.site
License: MIT
LicenseUrl: https://github.com/${REPO}/blob/main/LICENSE
ShortDescription: Desktop editor for Markdown and LaTeX aimed at mathematics and science.
Description: |-
  ComdTeX is a desktop editor for academic writing in Markdown + LaTeX.
  Your files are plain text in a folder you own: no database, no hidden
  format, no cloud. Shorthands expand to LaTeX on Tab, theorem environments
  and equations are auto-numbered, citations come from BibTeX with DOI and
  arXiv fetch, and PDF compiles with a bundled WASM LaTeX engine so no TeX
  installation is required. Interoperable with Obsidian and Overleaf.
  Bilingual interface (English and Spanish). Free forever.
Moniker: comdtex
Tags:
  - latex
  - markdown
  - math
  - academic
  - editor
ReleaseNotesUrl: https://github.com/${REPO}/releases/tag/v${VER}
ManifestType: defaultLocale
ManifestVersion: ${SCHEMA}
YAML

echo "winget manifests for ${VER} written to ${OUT} (sha256: ${SHA_UP})"
