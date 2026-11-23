# Packaging

Distribution channels beyond the GitHub release itself. Every submission is an outward-facing action: prepare here, publish only on explicit request.

**Status: none of these channels has been published.** The winget manifests are current (1.37.0, real sha256, validated against the 1.12.0 JSON schemas). The AUR PKGBUILD and the Flatpak manifest are still frozen at 1.16.0 and need a bump (`aur/update.sh <version>`; the Flatpak `url:`/`sha256:` pairs are edited by hand from the release's `.sha256` assets). The AUR package, the Flathub submission and the winget PR do not exist yet.

| Channel | Dir | Bump procedure | Publish procedure |
|---|---|---|---|
| AUR (Arch) | `aur/comdtex-bin/` | `aur/update.sh <version>` (fills sha256 from the release) | Copy PKGBUILD into the AUR git clone, `makepkg --printsrcinfo > .SRCINFO`, test with `makepkg -si`, push (needs an AUR account with SSH key) |
| Flatpak / Flathub | `flatpak/` | Update `url:`/`sha256:` in the manifest and the `<release>` entry in the metainfo | Local test per the manifest header; then PR to `flathub/flathub` per their submission docs |
| winget (Windows) | `winget/manifests/s/Sadriica/ComdTeX/<version>/` | `winget/update.sh <version>` (regenerates the three YAMLs; see below) | First PR by hand with `wingetcreate`, later ones automated; see below |

## winget

`winget/update.sh <version>` rewrites `winget/manifests/s/Sadriica/ComdTeX/<version>/` (and removes older version dirs). By default it reads the hash from the release asset `comdtex_<version>_x64-setup.exe.sha256`; pass `--sha256 <hex>` to supply a hash you computed, or `--file <exe>` to hash a local copy. Nothing is submitted.

Notes on the manifests:

- Schema 1.12.0. `InstallerType` is `nullsoft` (winget's name for NSIS; the schema has no `nsis` value). The Tauri installer is per-machine, hence `Scope: machine` and `ElevationRequirement: elevatesSelf`. `/S` is the NSIS silent switch.
- `ProductCode` is omitted: the installer is compressed NSIS and the uninstall registry key could not be read without running it. winget still matches upgrades through the package identifier and version. Add it only after checking `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall` on a Windows machine that installed it.
- The Windows installer is not code-signed. winget accepts that, but Windows SmartScreen may warn on first run, and the winget-pkgs validation pipeline can flag it for manual review.

Validate before submitting. On Windows: `winget validate --manifest <version dir>` and `winget install --manifest <version dir>` in a Windows Sandbox. Without Windows, validate the YAML against the schemas at `https://aka.ms/winget-manifest.{installer,defaultLocale,version}.1.12.0.schema.json` (for example with Python `jsonschema`).

### First submission (manual, once)

Needs a Windows machine (or CI runner) and a GitHub account that can fork `microsoft/winget-pkgs`.

1. `winget install Microsoft.WingetCreate`, then `wingetcreate token --store` with a classic GitHub token that has `public_repo` scope.
2. Run `winget/update.sh <version>`, copy the version dir into a fork of `microsoft/winget-pkgs` under `manifests/s/Sadriica/ComdTeX/<version>/`, or let wingetcreate build it: `wingetcreate new https://github.com/Sadriica/ComdTeX/releases/download/v<version>/comdtex_<version>_x64-setup.exe`, answering with the same metadata as the locale file.
3. Submit with `wingetcreate submit <manifest dir>` (or open the PR from your fork). The winget bots validate the installer; fix anything they report in the same PR. The first PR needs a human moderator approval, which can take days.

### Updates after the first PR is merged

Use `wingetcreate update Sadriica.ComdTeX --version <version> --urls https://github.com/Sadriica/ComdTeX/releases/download/v<version>/comdtex_<version>_x64-setup.exe --submit --token <token>`. It downloads the installer, computes the hash and opens the PR, so `winget/update.sh` is not needed for it. Run it from a `windows-latest` job triggered on `release: published` (the official `vedantmgoyal9/winget-releaser` action does the same thing) with the token in a repository secret such as `WINGET_TOKEN`. Such a job does not exist yet. `winget/update.sh` remains the way to regenerate and inspect the manifests locally or to feed a custom job.

The one-line installer (`scripts/install.sh`) and the raw release assets remain the primary channel and need no per-release action.
