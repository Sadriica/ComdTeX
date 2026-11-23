# Packaging

Distribution channels beyond the GitHub release itself. Every submission is an outward-facing action: prepare here, publish only on explicit request.

**Status: none of these channels has been published.** The winget manifests and the AUR files are current (1.37.0, real sha256). The release workflow updates the AUR package automatically once the owner completes the AUR setup below. The Flatpak manifest is still frozen at 1.16.0 (edit its `url:`/`sha256:` pairs by hand from the release's `.sha256` assets), and the Flathub submission, the winget PR and the AUR package do not exist yet.

| Channel | Dir | Bump procedure | Publish procedure |
|---|---|---|---|
| AUR (Arch) | `aur/comdtex-bin/` | `aur/update.sh <version>` (rewrites pkgver, sha256 sums and `.SRCINFO`) | Automatic on every stable `vX.Y.Z` tag once `AUR_SSH_PRIVATE_KEY` is set (see below); manual: copy `PKGBUILD` and `.SRCINFO` into the AUR clone and push |
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

## AUR: one-time owner setup

The `aur` job in `.github/workflows/release.yml` runs after the release is public, regenerates `PKGBUILD` and `.SRCINFO` with `aur/update.sh`, and pushes them to `ssh://aur@aur.archlinux.org/comdtex-bin.git`. Without the secret it only prints a skip message, so it is safe to ship before the account exists. A failure in that job never fails the release. It only handles stable `vX.Y.Z` tags.

1. Create an account at https://aur.archlinux.org/register (the username becomes the package maintainer; the PKGBUILD header names `sadriica`, adjust it if the AUR username differs).
2. Generate a dedicated key pair for CI, with no passphrase: `ssh-keygen -t ed25519 -N "" -C "comdtex-aur-ci" -f comdtex-aur`.
3. In the AUR account page (My Account, SSH Public Key), paste the contents of `comdtex-aur.pub`.
4. Register the package `comdtex-bin`. The first push creates it: clone the empty repo and push the current files once by hand, using that key:
   ```bash
   export GIT_SSH_COMMAND="ssh -i $PWD/comdtex-aur -o IdentitiesOnly=yes"
   git clone ssh://aur@aur.archlinux.org/comdtex-bin.git aur-comdtex-bin   # warns about an empty repo, that is fine
   cp packaging/aur/comdtex-bin/{PKGBUILD,.SRCINFO} aur-comdtex-bin/
   cd aur-comdtex-bin && git add PKGBUILD .SRCINFO && git commit -m "Initial import of comdtex-bin" && git push origin HEAD:master
   ```
   Optionally test the package first on Arch with `makepkg -si` from a copy of `packaging/aur/comdtex-bin/`.
5. In the GitHub repository go to Settings, Secrets and variables, Actions, and add a repository secret named `AUR_SSH_PRIVATE_KEY` containing the full private key file (`comdtex-aur`, including the BEGIN/END lines). Then delete the local private key if you do not need it.

From the next stable tag the job keeps the AUR package in sync. The job pins the AUR ed25519 host key fingerprint (`SHA256:RFzBCUItH9LZS0cKB5UE6ceAYhBD5C8GeOBip8Z11+4`); if the AUR ever rotates it, the job fails safely and the fingerprint in the workflow needs updating.
