/**
 * Cloud Sync — "Bring Your Own Cloud" (Option A).
 *
 * ComdTeX does not talk to provider APIs. The user's native cloud client
 * (Dropbox / Google Drive / OneDrive) syncs the vault folder transparently;
 * ComdTeX just *detects* the situation and surfaces useful UI:
 *   • a sync indicator in the StatusBar,
 *   • a panel listing conflict files (when the cloud client wrote one),
 *   • a banner inviting the user to move their vault into a synced folder.
 *
 * Pure functions are kept separate from the IO ones so they can be unit-tested
 * without mocking Tauri.
 */
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs"
import { homeDir } from "@tauri-apps/api/path"
import type { FileNode } from "./types"

export type CloudProvider = "dropbox" | "googledrive" | "onedrive"

export interface CloudSyncInfo {
  provider: CloudProvider
  /** Absolute path of the synced root folder reported by the provider. */
  rootPath: string
  /** Optional account label (e.g. "personal", "business", or an email). */
  account?: string
}

export interface ConflictEntry {
  /** Absolute path of the conflict copy file. */
  conflictPath: string
  conflictName: string
  /** Implied original filename (`note.md` for `note (conflicted copy …).md`). */
  baseName: string
  /** Path of the original sibling, if it still exists. */
  basePath: string | null
  provider: CloudProvider
}

const PROVIDER_LABELS: Record<CloudProvider, string> = {
  dropbox: "Dropbox",
  googledrive: "Google Drive",
  onedrive: "OneDrive",
}

export function providerLabel(p: CloudProvider): string {
  return PROVIDER_LABELS[p]
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "")
}

/** True when `child` is `parent` or any descendant. Case-insensitive. */
export function isPathInside(child: string, parent: string): boolean {
  const c = normalizePath(child).toLowerCase()
  const p = normalizePath(parent).toLowerCase()
  return c === p || c.startsWith(p + "/")
}

/**
 * Dropbox conflict pattern, e.g.
 *   "note (conflicted copy 2026-04-29).md"
 *   "note (Alice's conflicted copy 2026-04-29).md"
 *   "note (Alice's conflicted copy 2026-04-29 12345)"
 */
const DROPBOX_RE = /^(.+?) \(([^()]*conflicted copy[^()]*)\)(\.[^.]+)?$/i

/**
 * OneDrive conflict heuristic, e.g. "note-MyPC.md".
 * High false-positive risk → caller must verify a sibling without the suffix
 * exists. Restrict the device-name part to look like a hostname (PascalCase
 * letters/digits/hyphens, not too short).
 */
const ONEDRIVE_RE = /^(.+)-([A-Za-z][A-Za-z0-9-]{2,40})(\.[^.]+)?$/

export interface ConflictMatch {
  isConflict: boolean
  provider?: CloudProvider
  /** Implied original filename, including extension. */
  baseName?: string
}

/**
 * Pure pattern check: does this filename look like a cloud-sync conflict copy?
 * For OneDrive only returns a positive match — caller must still verify a
 * sibling exists, since `paper-Draft.md` would also match.
 *
 * `providerHint` (optional) restricts matching to a single provider's pattern.
 * Useful when the vault is known to live in a specific cloud root: skipping
 * the unrelated regex avoids false-positive scans on every filename.
 */
export function isConflictFile(name: string, providerHint?: CloudProvider): ConflictMatch {
  // Dropbox pattern is cheap to pre-filter via substring.
  if (providerHint !== "onedrive" && providerHint !== "googledrive") {
    if (name.includes("conflicted copy")) {
      const dm = DROPBOX_RE.exec(name)
      if (dm) {
        const stem = dm[1]
        const ext = dm[3] ?? ""
        return { isConflict: true, provider: "dropbox", baseName: stem + ext }
      }
    }
  }
  // OneDrive heuristic is broad — only attempt when explicitly hinted (or
  // when no hint is given, i.e. the legacy "scan everything" entry point).
  if (providerHint === "onedrive" || providerHint === undefined) {
    if (name.includes("-")) {
      const om = ONEDRIVE_RE.exec(name)
      if (om) {
        const stem = om[1]
        const ext = om[3] ?? ""
        return { isConflict: true, provider: "onedrive", baseName: stem + ext }
      }
    }
  }
  return { isConflict: false }
}

function dirOf(node: FileNode): string {
  return node.path.slice(0, node.path.length - node.name.length)
}

/**
 * Walk a FileNode tree and return all conflict files. For OneDrive matches we
 * require a sibling without the device suffix to exist (sharply reduces FPs).
 *
 * `providerHint` narrows the scan to a single provider — when the vault is in
 * a Drive folder we skip the work entirely, when it's Dropbox we don't pay
 * for OneDrive's broad heuristic, and so on. Falls back to "scan everything"
 * when no hint is given.
 */
export function findConflicts(tree: FileNode[], providerHint?: CloudProvider): ConflictEntry[] {
  // Google Drive doesn't generate conflict files locally — skip the walk.
  if (providerHint === "googledrive") return []

  // Cheap pre-pass: only build the directory index if at least one filename
  // contains a substring that could match a known pattern. Most vaults have
  // zero conflict files, so this short-circuits the whole O(n) walk.
  let likely = false
  const walkProbe = (nodes: FileNode[]): void => {
    for (const n of nodes) {
      if (likely) return
      if (n.type === "file") {
        const name = n.name
        if (
          (providerHint !== "onedrive" && name.includes("conflicted copy")) ||
          (providerHint !== "dropbox" && name.includes("-"))
        ) {
          likely = true
          return
        }
      }
      if (n.children) walkProbe(n.children)
    }
  }
  walkProbe(tree)
  if (!likely) return []

  const allFiles: FileNode[] = []
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === "file") allFiles.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(tree)

  const byDir = new Map<string, Map<string, FileNode>>()
  for (const f of allFiles) {
    const d = dirOf(f)
    if (!byDir.has(d)) byDir.set(d, new Map())
    byDir.get(d)!.set(f.name, f)
  }

  const out: ConflictEntry[] = []
  for (const f of allFiles) {
    const m = isConflictFile(f.name, providerHint)
    if (!m.isConflict || !m.provider || !m.baseName) continue
    const d = dirOf(f)
    const sibling = byDir.get(d)?.get(m.baseName) ?? null
    // OneDrive: skip if no sibling — too noisy without one.
    if (m.provider === "onedrive" && !sibling) continue
    out.push({
      conflictPath: f.path,
      conflictName: f.name,
      baseName: m.baseName,
      basePath: sibling?.path ?? null,
      provider: m.provider,
    })
  }
  return out
}

// ─── Provider detection (IO) ──────────────────────────────────────────────────

async function safeExists(path: string): Promise<boolean> {
  try { return await exists(path) } catch { return false }
}

async function readDropboxInfo(home: string): Promise<CloudSyncInfo[]> {
  // info.json lives at one of these paths depending on platform.
  const candidates = [
    `${home}/.dropbox/info.json`,
    `${home}/AppData/Local/Dropbox/info.json`,
    `${home}/AppData/Roaming/Dropbox/info.json`,
  ]
  for (const path of candidates) {
    if (!(await safeExists(path))) continue
    try {
      const raw = await readTextFile(path)
      const data = JSON.parse(raw) as Record<string, { path?: string }>
      const out: CloudSyncInfo[] = []
      if (data.personal?.path) out.push({ provider: "dropbox", rootPath: data.personal.path, account: "personal" })
      if (data.business?.path) out.push({ provider: "dropbox", rootPath: data.business.path, account: "business" })
      if (out.length) return out
    } catch { /* fall through to fallback */ }
  }
  const fallback = `${home}/Dropbox`
  if (await safeExists(fallback)) return [{ provider: "dropbox", rootPath: fallback }]
  return []
}

async function findCloudStorageMatches(home: string, prefix: string): Promise<Array<{ name: string; path: string }>> {
  const cloudStorage = `${home}/Library/CloudStorage`
  if (!(await safeExists(cloudStorage))) return []
  try {
    const entries = await readDir(cloudStorage)
    return entries
      .filter((e) => e.isDirectory && e.name && e.name.startsWith(prefix))
      .map((e) => ({ name: e.name!, path: `${cloudStorage}/${e.name}` }))
  } catch {
    return []
  }
}

async function findGoogleDrive(home: string): Promise<CloudSyncInfo[]> {
  const out: CloudSyncInfo[] = []
  // macOS modern: ~/Library/CloudStorage/GoogleDrive-<email>
  for (const m of await findCloudStorageMatches(home, "GoogleDrive-")) {
    out.push({ provider: "googledrive", rootPath: m.path, account: m.name.slice("GoogleDrive-".length) })
  }
  // Windows / Linux fallbacks. Drive for Desktop typically mounts a drive
  // letter on Windows; the home-folder check is for legacy "Backup & Sync"
  // and third-party Linux clients (insync, rclone mount).
  for (const candidate of [`${home}/Google Drive`, `${home}/My Drive`, `${home}/GoogleDrive`]) {
    if (await safeExists(candidate)) out.push({ provider: "googledrive", rootPath: candidate })
  }
  return out
}

async function findOneDrive(home: string): Promise<CloudSyncInfo[]> {
  const out: CloudSyncInfo[] = []
  // macOS modern: ~/Library/CloudStorage/OneDrive-<account>
  for (const m of await findCloudStorageMatches(home, "OneDrive")) {
    out.push({ provider: "onedrive", rootPath: m.path, account: m.name })
  }
  // Windows: %OneDrive% / %OneDriveCommercial% / %OneDriveConsumer% — JS can't
  // read env, so we probe common paths under the home directory.
  for (const candidate of [`${home}/OneDrive`, `${home}/OneDrive - Personal`]) {
    if (await safeExists(candidate)) out.push({ provider: "onedrive", rootPath: candidate })
  }
  return out
}

/** All cloud-sync folders we can find on the current machine. */
export async function findCloudFolders(): Promise<CloudSyncInfo[]> {
  const home = await homeDir()
  const [dbox, gd, od] = await Promise.all([
    readDropboxInfo(home),
    findGoogleDrive(home),
    findOneDrive(home),
  ])
  // Deduplicate by rootPath (some clients are reachable via multiple paths).
  const seen = new Set<string>()
  return [...dbox, ...gd, ...od].filter((info) => {
    const key = normalizePath(info.rootPath).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The provider that owns this vault path, if any. */
export async function detectVaultProvider(vaultPath: string): Promise<CloudSyncInfo | null> {
  if (!vaultPath) return null
  const folders = await findCloudFolders()
  for (const f of folders) {
    if (isPathInside(vaultPath, f.rootPath)) return f
  }
  return null
}
