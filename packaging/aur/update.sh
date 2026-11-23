#!/usr/bin/env bash
# Regenerates the AUR package files for a released version: pkgver, real
# sha256 sums (the .deb from its published .sha256 asset, LICENSE from the tag)
# and .SRCINFO. Works on any machine with bash, curl and awk (no makepkg
# needed), so CI can run it.
#
# Usage: ./update.sh <version or tag, e.g. 1.37.0 or v1.37.0>
# Then publish by copying comdtex-bin/PKGBUILD and comdtex-bin/.SRCINFO into the
# AUR git clone of comdtex-bin and pushing (see ../README.md). The release
# workflow does this automatically when the AUR_SSH_PRIVATE_KEY secret exists.
set -euo pipefail

VER="${1:?usage: ./update.sh <version, e.g. 1.37.0>}"
VER="${VER#v}"
[[ "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "error: '${VER}' is not a plain x.y.z version" >&2; exit 1; }
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKGDIR="${DIR}/comdtex-bin"
PKGBUILD="${PKGDIR}/PKGBUILD"
REPO="Sadriica/ComdTeX"

DEB_SHA=$(curl -fsSL "https://github.com/${REPO}/releases/download/v${VER}/comdtex_${VER}_amd64.deb.sha256" | awk '{print $1}')
LIC_SHA=$(curl -fsSL "https://raw.githubusercontent.com/${REPO}/v${VER}/LICENSE" | sha256sum | awk '{print $1}')
for h in "$DEB_SHA" "$LIC_SHA"; do
  [[ "$h" =~ ^[0-9a-f]{64}$ ]] || { echo "error: could not fetch a valid sha256 for v${VER}" >&2; exit 1; }
done

sed -i \
  -e "s/^pkgver=.*/pkgver=${VER}/" \
  -e "s/^pkgrel=.*/pkgrel=1/" \
  "$PKGBUILD"
# sha256sums spans two lines: replace the whole block.
awk -v a="$DEB_SHA" -v b="$LIC_SHA" '
  /^sha256sums=\(/ { print "sha256sums=('"'"'" a "'"'"'"; print "            '"'"'" b "'"'"')"; skip=1; if ($0 ~ /\)$/) skip=0; next }
  skip { if ($0 ~ /\)$/) skip=0; next }
  { print }
' "$PKGBUILD" > "${PKGBUILD}.tmp" && mv "${PKGBUILD}.tmp" "$PKGBUILD"

# .SRCINFO generated from the PKGBUILD (our own file) so it never needs makepkg.
(
  # shellcheck disable=SC1090
  source "$PKGBUILD"
  {
    echo "pkgbase = ${pkgname}"
    echo "	pkgdesc = ${pkgdesc}"
    echo "	pkgver = ${pkgver}"
    echo "	pkgrel = ${pkgrel}"
    echo "	url = ${url}"
    echo "	arch = ${arch[*]}"
    for l in "${license[@]}"; do echo "	license = ${l}"; done
    for d in "${depends[@]}"; do echo "	depends = ${d}"; done
    for d in "${optdepends[@]}"; do echo "	optdepends = ${d}"; done
    for d in "${provides[@]}"; do echo "	provides = ${d}"; done
    for d in "${conflicts[@]}"; do echo "	conflicts = ${d}"; done
    for d in "${noextract[@]}"; do echo "	noextract = ${d}"; done
    for d in "${options[@]}"; do echo "	options = ${d}"; done
    for d in "${source[@]}"; do echo "	source = ${d}"; done
    for d in "${sha256sums[@]}"; do echo "	sha256sums = ${d}"; done
    echo
    echo "pkgname = ${pkgname}"
  } > "${PKGDIR}/.SRCINFO"
)

echo "PKGBUILD and .SRCINFO updated to ${VER}"
echo "  deb sha256:     ${DEB_SHA}"
echo "  LICENSE sha256: ${LIC_SHA}"
