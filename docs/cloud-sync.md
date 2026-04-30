# Cloud Sync — Bring Your Own Cloud

ComdTeX does not run its own sync server. Instead, it lets you reuse the cloud-storage client you already have installed — **Dropbox**, **Google Drive**, or **OneDrive** — to keep your vault in sync across devices.

The model is simple: the vault is just a folder, and the cloud client syncs that folder. ComdTeX adds the polish: it detects the situation, shows a sync indicator, and helps you resolve the conflict files those clients sometimes create.

> No login, no OAuth, no provider API. Files stay where you put them.

---

## Quick start

### 1. Install one of the supported clients

| Provider | Where to get it |
|---|---|
| **Dropbox** | <https://www.dropbox.com/install> |
| **Google Drive (Drive for Desktop)** | <https://www.google.com/drive/download/> |
| **OneDrive** | Pre-installed on Windows; macOS at <https://www.microsoft.com/microsoft-365/onedrive/download> |

Sign in and let the client finish its initial sync. You should now have a folder like `~/Dropbox`, `~/Library/CloudStorage/GoogleDrive-you@gmail.com`, or `~/OneDrive`.

### 2. Put your vault inside that folder

You have two options:

**a) Move an existing vault.** Close ComdTeX. In your file manager, drag the vault folder into the cloud-provider folder. Reopen ComdTeX and use **File → Open Vault** to point it at the new location.

**b) Create a new vault inside the cloud folder.** Open ComdTeX → **File → New Vault** and pick a destination inside `~/Dropbox/` (or your provider's equivalent).

### 3. Confirm the sync indicator

If everything is wired up correctly, the bottom **status bar** will show:

```
☁ Sync: Dropbox
```

(or the relevant provider). Hover for the synced root path. Click to open the **Sync** panel.

### 4. (Optional) Enable autosave

Cloud sync triggers on every disk write. ComdTeX's autosave (Settings → *Autoguardado*, default 800 ms) means every keystroke pause flushes to disk and your cloud client picks it up — effectively continuous sync.

---

## What ComdTeX does for you

| Feature | What it shows |
|---|---|
| **StatusBar badge** (`☁ Sync: <Provider>`) | Confirms the vault is inside a synced folder. Turns into `⚠ Sync: <Provider> (n)` when conflicts exist. |
| **Suggestion banner** | If a provider is installed but your vault is **outside** its folder, a banner suggests opening the provider folder so you can move the vault in. ComdTeX never moves files for you. |
| **Conflicts panel** (sidebar → ⋯ → *Sincronización / Sync*) | Lists every conflict copy the cloud client created, paired with its original. |
| **FileTree marker** (⚠) | Both the conflict copy and the original are flagged in the file tree. |

### Resolving a conflict

When two devices edit the same file before sync catches up, the cloud client creates a parallel copy:

- **Dropbox**: `note (conflicted copy 2026-04-29).md`
- **OneDrive**: `note-MyLaptop.md`

Open the **Sync** panel (status-bar badge or the ⋯ menu) and pick one of:

| Action | Effect |
|---|---|
| **Abrir ambos / Open both** | Opens the original and the conflict copy as two tabs so you can diff manually. |
| **Mantener mío / Keep mine** | Deletes the conflict copy. The original stays untouched. |
| **Usar la copia / Use the copy** | Replaces the original with the conflict copy (renames it over the original). |
| **Mostrar en carpeta / Reveal in folder** | Opens the file's directory in your OS file manager. |

Conflict resolution is **last-write-wins by your choice** — there is no automatic merge. For complex differences, "Open both" + manual edit is the safest path.

---

## Per-provider notes

### Dropbox

- Conflict files are detected reliably. The pattern `(conflicted copy YYYY-MM-DD)` is the official format.
- If you want to exclude a subfolder from sync (for example a `build/` directory full of PDFs), use Dropbox's [selective sync](https://help.dropbox.com/sync/selective-sync) or a `.dropboxignore` file at the vault root.

### Google Drive (Drive for Desktop)

- Drive **does not create conflict copy files**. When two devices race, Drive keeps the most recently uploaded version and stores the other in **version history** (right-click → *Manage versions* in the web UI). ComdTeX cannot detect this, so be careful with simultaneous edits.
- On macOS, Drive mounts under `~/Library/CloudStorage/GoogleDrive-<email>/`. On Windows it usually mounts as a drive letter (e.g. `G:`); set your vault on that drive to enable detection.

### OneDrive

- OneDrive's conflict file format is `name-DEVICE.ext`. ComdTeX uses a heuristic that requires both files to exist side-by-side, which keeps false positives low but is not 100% bulletproof — if you have a file genuinely named `paper-Draft.md` next to `paper.md`, it will be flagged.
- OneDrive on Linux is not officially supported by Microsoft; third-party clients like `onedrive` (abraunegg) work but live outside `~/Library/CloudStorage`, so detection may miss them.

---

## What ComdTeX does **not** do

- ❌ Talk to provider APIs. There's no login, no OAuth, no token storage.
- ❌ Encrypt files end-to-end. Anything in your synced folder is readable by the provider in plaintext (subject to their server-side encryption at rest).
- ❌ Automatic conflict merging. You always pick which version wins.
- ❌ Move or copy your vault for you. The "convert to synced" banner just opens the provider folder so you can do it yourself.
- ❌ Selective per-file sync. The cloud client syncs whole folders. Use the provider's own selective-sync feature if you need exclusions.

---

## Troubleshooting

**"I don't see the sync badge."**
The vault is not inside a folder ComdTeX recognizes as a cloud root. Check the path in **File → Open Vault** — it should start with `~/Dropbox/`, `~/Library/CloudStorage/GoogleDrive-…`, `~/Library/CloudStorage/OneDrive…`, `~/OneDrive`, or `~/Google Drive`. On Windows, Drive for Desktop mounts as a drive letter; confirm your vault is on that drive.

**"The badge shows but my changes aren't syncing."**
That's a problem with the cloud client itself, not ComdTeX. Open the provider's tray/menu-bar icon and check whether sync is paused, blocked by a conflict, or out of storage.

**"A file got `(conflicted copy)` and I'm not sure which is newer."**
Use **Open both** in the Sync panel and compare them in two tabs. The "modified" timestamp in your file manager is the most reliable signal.

**"I want stronger guarantees than last-write-wins."**
Initialize a Git repo inside your vault. ComdTeX's Git panel (the bar above the editor) lets you commit, push, and review changes. Cloud sync stays as a fast backup; Git is your real history.
