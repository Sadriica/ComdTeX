#!/usr/bin/env bash
# Bumps the AUR PKGBUILD to a released version, filling in the real sha256
# from the checksum file published with the GitHub release.
#
# Usage: ./update.sh 1.11.0
# Then, from an Arch machine with the AUR repo cloned:
#   cp comdtex-bin/PKGBUILD <aur-clone>/ && cd <aur-clone>
#   makepkg --printsrcinfo > .SRCINFO && makepkg -si   # test locally
#   git commit -am "v<version>" && git push            # publish
set -euo pipefail

VER="${1:?usage: ./update.sh <version, e.g. 1.11.0>}"
VER="${VER#v}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKGBUILD="${DIR}/comdtex-bin/PKGBUILD"

URL="https://github.com/Sadriica/ComdTeX/releases/download/v${VER}/comdtex_${VER}_amd64.deb.sha256"
SHA=$(curl -fsSL "$URL" | awk '{print $1}')
[[ ${#SHA} -eq 64 ]] || { echo "error: could not fetch a valid sha256 from ${URL}" >&2; exit 1; }

sed -i \
  -e "s/^pkgver=.*/pkgver=${VER}/" \
  -e "s/^pkgrel=.*/pkgrel=1/" \
  -e "s/^sha256sums=.*/sha256sums=('${SHA}')/" \
  "$PKGBUILD"

echo "PKGBUILD bumped to ${VER} (sha256: ${SHA})"
