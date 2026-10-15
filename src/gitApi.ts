import { Command } from "@tauri-apps/plugin-shell"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitFile {
  x: string
  y: string
  /** Current path (the new path for renames and copies). */
  path: string
  /** Original path, only present for renames and copies. */
  orig?: string
}

export interface GitStatus {
  branch: string; upstream: string
  ahead: number; behind: number
  staged: GitFile[]; unstaged: GitFile[]; untracked: GitFile[]
}

export interface GitResult { code: number; stdout: string; stderr: string }

// ── Safe invocation ───────────────────────────────────────────────────────────

function nullDevice(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  return /windows/i.test(ua) ? "NUL" : "/dev/null"
}

/**
 * Config prepended to every git call. A cloned repo controls its own
 * .git/config, so core.fsmonitor (run on every `git status`), hooks and the
 * ext:: transport must be neutralised before git reads that file.
 */
export function safeGitConfig(): string[] {
  return [
    "-c", "core.fsmonitor=false",
    "-c", `core.hooksPath=${nullDevice()}`,
    "-c", "protocol.ext.allow=never",
    "-c", "core.quotepath=false",
  ]
}

/**
 * Runs git against a vault. Rejects only when git cannot be spawned (not
 * installed, blocked by the shell scope); a non-zero exit is a normal result.
 */
export async function runGit(vaultPath: string, args: string[]): Promise<GitResult> {
  const r = await Command.create("git", [...safeGitConfig(), "-C", vaultPath, ...args]).execute()
  return { code: r.code ?? 1, stdout: r.stdout, stderr: r.stderr }
}

export function isNotRepo(r: GitResult): boolean {
  return r.code === 128 && /not a git repository/i.test(r.stderr)
}

// ── Status parser ─────────────────────────────────────────────────────────────

/** Parses the output of `git status --porcelain=v1 -z -b`. */
export function parseStatusZ(raw: string): GitStatus {
  const records = raw.split("\0")
  let branch = "", upstream = "", ahead = 0, behind = 0
  const staged: GitFile[] = [], unstaged: GitFile[] = [], untracked: GitFile[] = []

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    if (!rec) continue
    if (rec.startsWith("## ")) {
      const rest = rec.slice(3)
      const parts = rest.split("...")
      branch = parts[0].replace(/^No commits yet on /, "").replace(/^Initial commit on /, "").trim()
      upstream = parts[1]?.split(/\s/)[0] ?? ""
      const am = /ahead (\d+)/.exec(rest);  if (am) ahead  = parseInt(am[1])
      const bm = /behind (\d+)/.exec(rest); if (bm) behind = parseInt(bm[1])
      continue
    }
    if (rec.length < 4) continue
    const x = rec[0], y = rec[1]
    const path = rec.slice(3)
    let orig: string | undefined
    // Renames and copies carry the original path as the next NUL record.
    if (x === "R" || x === "C" || y === "R" || y === "C") orig = records[++i] || undefined
    const file: GitFile = orig ? { x, y, path, orig } : { x, y, path }
    if (x === "?" && y === "?") untracked.push(file)
    else {
      if (x !== " ") staged.push(file)
      if (y !== " " && y !== "?") unstaged.push(file)
    }
  }
  return { branch, upstream, ahead, behind, staged, unstaged, untracked }
}
