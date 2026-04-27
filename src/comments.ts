/**
 * Per-line comments / annotations.
 *
 * Comments are persisted in a single JSON file at the vault root
 * (`.comdtex-comments.json`). Each comment carries the file path
 * (relative to the vault when possible), a 1-based line number, the
 * line snippet at creation time (so we can detect drift), and a body.
 *
 * The module exposes pure load/save helpers plus convenience
 * mutators that delegate to those helpers, so callers can either
 * batch updates or fire-and-forget single operations.
 */
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { join as pathJoin } from "@tauri-apps/api/path"

export const COMMENTS_FILENAME = ".comdtex-comments.json"
export const COMMENTS_VERSION = 1
export const SNIPPET_MAX = 80

export interface Comment {
  id: string
  /** Path stored relative to the vault when possible, else absolute. */
  filePath: string
  /** 1-based line number in the editor at creation time. */
  line: number
  /** Up to SNIPPET_MAX chars of the source line, used to detect drift. */
  lineSnippet: string
  body: string
  author: string
  /** ISO-8601 timestamp (UTC). */
  createdAt: string
  resolved: boolean
}

interface CommentsFile {
  version: number
  comments: Comment[]
}

// ── Path helpers ─────────────────────────────────────────────────────────────

/** Normalise to forward slashes and strip trailing separators. */
function normalisePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "")
}

/**
 * Compute a vault-relative path. Returns `absolutePath` unchanged if it does
 * not live inside `vaultPath`, so external files are still addressable.
 */
export function toRelativePath(absolutePath: string, vaultPath: string): string {
  const normPath = normalisePath(absolutePath)
  const normVault = normalisePath(vaultPath)
  if (normPath === normVault) return ""
  if (normPath.startsWith(normVault + "/")) {
    return normPath.slice(normVault.length + 1)
  }
  return absolutePath
}

/**
 * Resolve a stored (possibly relative) path back to absolute form, so the
 * Monaco editor can match it against `model.uri.path`.
 */
export function toAbsolutePath(filePath: string, vaultPath: string): string {
  const norm = normalisePath(filePath)
  // Already absolute (Unix `/foo` or Windows `C:\foo` / `C:/foo`).
  if (norm.startsWith("/") || /^[a-zA-Z]:\//.test(norm)) return filePath
  const normVault = normalisePath(vaultPath)
  return `${normVault}/${norm}`
}

// ── ID generation ────────────────────────────────────────────────────────────

/**
 * Lightweight ID generator. We intentionally avoid pulling in a UUID library
 * — single-user vaults make collisions practically impossible.
 */
export function generateCommentId(): string {
  const time = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `cmt-${time}-${rand}`
}

/** Truncate a source line to the snippet bound, stripping CR/LF. */
export function makeLineSnippet(line: string): string {
  return line.replace(/[\r\n]+/g, " ").slice(0, SNIPPET_MAX)
}

// ── JSON parsing ─────────────────────────────────────────────────────────────

function parseCommentsFile(raw: string): Comment[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== "object") return []
  const file = parsed as Partial<CommentsFile>
  if (!Array.isArray(file.comments)) return []
  // Filter to well-formed entries only — tolerate missing optional fields.
  const out: Comment[] = []
  for (const raw of file.comments) {
    if (!raw || typeof raw !== "object") continue
    const c = raw as Partial<Comment>
    if (
      typeof c.id !== "string" ||
      typeof c.filePath !== "string" ||
      typeof c.line !== "number" ||
      typeof c.body !== "string"
    ) continue
    out.push({
      id: c.id,
      filePath: c.filePath,
      line: c.line,
      lineSnippet: typeof c.lineSnippet === "string" ? c.lineSnippet : "",
      body: c.body,
      author: typeof c.author === "string" ? c.author : "user",
      createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString(),
      resolved: c.resolved === true,
    })
  }
  return out
}

function serialiseComments(comments: Comment[]): string {
  const file: CommentsFile = { version: COMMENTS_VERSION, comments }
  return JSON.stringify(file, null, 2) + "\n"
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Read & parse the comments file. Returns [] when missing or malformed. */
export async function loadComments(vaultPath: string): Promise<Comment[]> {
  const path = await pathJoin(vaultPath, COMMENTS_FILENAME)
  try {
    if (!(await exists(path))) return []
    const raw = await readTextFile(path)
    return parseCommentsFile(raw)
  } catch {
    return []
  }
}

/**
 * Atomic write: writes the entire array on every save. Tauri's
 * `writeTextFile` is itself a single syscall, so this is durable enough
 * for our single-user, low-write use case.
 */
export async function saveComments(vaultPath: string, comments: Comment[]): Promise<void> {
  const path = await pathJoin(vaultPath, COMMENTS_FILENAME)
  await writeTextFile(path, serialiseComments(comments))
}

export async function addComment(vaultPath: string, comment: Comment): Promise<void> {
  const current = await loadComments(vaultPath)
  await saveComments(vaultPath, [...current, comment])
}

export async function updateComment(
  vaultPath: string,
  id: string,
  partial: Partial<Omit<Comment, "id">>,
): Promise<void> {
  const current = await loadComments(vaultPath)
  const next = current.map((c) => (c.id === id ? { ...c, ...partial } : c))
  await saveComments(vaultPath, next)
}

export async function deleteComment(vaultPath: string, id: string): Promise<void> {
  const current = await loadComments(vaultPath)
  await saveComments(vaultPath, current.filter((c) => c.id !== id))
}

export async function resolveComment(vaultPath: string, id: string): Promise<void> {
  await updateComment(vaultPath, id, { resolved: true })
}

// ── Drift detection ──────────────────────────────────────────────────────────

/**
 * Returns true when the comment's snippet still matches the source line at
 * the recorded position. Used to surface "out-of-sync" markers in the UI
 * — we deliberately do NOT auto-rewrite the line number; the user re-anchors
 * manually by editing the comment.
 */
export function isCommentInSync(comment: Comment, fileContent: string): boolean {
  if (!comment.lineSnippet) return true
  const lines = fileContent.split("\n")
  const idx = comment.line - 1
  if (idx < 0 || idx >= lines.length) return false
  const current = makeLineSnippet(lines[idx])
  return current === comment.lineSnippet
}
