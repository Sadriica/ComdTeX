# Packaging

Distribution channels beyond the GitHub release itself. Every submission is an outward-facing action: prepare here, publish only on explicit request.

| Channel | Dir | Bump procedure | Publish procedure |
|---|---|---|---|
| AUR (Arch) | `aur/comdtex-bin/` | `aur/update.sh <version>` (fills sha256 from the release) | Copy PKGBUILD into the AUR git clone, `makepkg --printsrcinfo > .SRCINFO`, test with `makepkg -si`, push (needs an AUR account with SSH key) |
| Flatpak / Flathub | `flatpak/` | Update `url:`/`sha256:` in the manifest and the `<release>` entry in the metainfo | Local test per the manifest header; then PR to `flathub/flathub` per their submission docs |
| winget (Windows) | `winget/manifests/s/Sadriica/ComdTeX/<version>/` | Copy the three YAMLs to a new version dir, update version + InstallerSha256 (uppercase) from the `.exe.sha256` release asset | Validate with `winget validate --manifest <dir>` on a Windows machine, then PR to `microsoft/winget-pkgs` |

The one-line installer (`scripts/install.sh`) and the raw release assets remain the primary channel and need no per-release action.
