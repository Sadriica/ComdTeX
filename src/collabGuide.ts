// Pure logic behind the guided collaboration section of the Git panel.
//
// The Git panel speaks git; this section speaks to a coauthor who has never
// used it: "share this vault", "bring changes", "send changes", "your
// version / their version". The state machine below decides which of those
// screens to show from plain `git status --porcelain -b` data, so it stays
// unit-testable without a repo.

export interface CollabFile { x: string; y: string; path: string }

export interface CollabStatusInput {
  branch: string
  upstream: string
  ahead: number
  behind: number
  staged: CollabFile[]
  unstaged: CollabFile[]
  untracked: CollabFile[]
}

export type CollabState =
  | "no-remote"   // repo exists but has nowhere shared to sync with
  | "conflicted"  // a merge stopped on conflicts; they must be resolved
  | "dirty"       // local edits not yet recorded in history
  | "behind"      // clean, but the coauthor sent changes we do not have
  | "ahead"       // clean, with recorded changes not yet sent
  | "synced"      // clean and level with the shared copy

/** Files stopped in a merge conflict (either side unmerged). */
export function unmergedFiles(status: CollabStatusInput): CollabFile[] {
  const seen = new Set<string>()
  const out: CollabFile[] = []
  for (const f of [...status.staged, ...status.unstaged]) {
    const conflicted =
      f.x === "U" || f.y === "U" || (f.x === "A" && f.y === "A") || (f.x === "D" && f.y === "D")
    if (conflicted && !seen.has(f.path)) {
      seen.add(f.path)
      out.push(f)
    }
  }
  return out
}

export function collabState(status: CollabStatusInput, hasRemote: boolean): CollabState {
  if (!hasRemote) return "no-remote"
  if (unmergedFiles(status).length > 0) return "conflicted"
  if (status.staged.length + status.unstaged.length + status.untracked.length > 0) return "dirty"
  if (status.behind > 0) return "behind"
  if (status.ahead > 0) return "ahead"
  return "synced"
}

/**
 * A default commit message for the guided "save and send" action: the point
 * is coauthoring documents, not crafting commit messages, so an empty input
 * still produces an honest, dated record.
 */
export function defaultSaveMessage(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `Writing session ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}
