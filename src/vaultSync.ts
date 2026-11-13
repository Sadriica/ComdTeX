// Git sync for a vault, as one operation: record local work, bring the other
// copy's changes, send ours. It backs the Sync settings ("Sync now", the
// guided setup) and automatic sync.
//
// The rules that keep it safe to run unattended:
// - It never leaves a half-finished merge behind. If the two copies changed
//   the same lines, the merge is aborted and the result is "conflict": the
//   local work stays recorded, nothing on disk changes, and the person
//   resolves it in the Git panel ("Bring changes", then mine or theirs).
// - It never touches a merge the person already has in progress.
// - It does nothing on a detached HEAD or without a remote.
//
// Every git call goes through the injected runner, so the whole sequence is
// unit-testable without a repository.

import type { GitResult } from "./gitApi"

export type GitRunner = (args: string[]) => Promise<GitResult>

export type SyncOutcome =
  | { kind: "synced"; committed: boolean; pulled: boolean; pushed: boolean }
  /** Both copies changed the same lines; `inProgress` when the person is mid-merge. */
  | { kind: "conflict"; files: string[]; inProgress: boolean }
  | { kind: "skipped"; reason: "not-repo" | "no-remote" | "detached" }
  | { kind: "error"; stage: "commit" | "fetch" | "merge" | "push"; message: string }

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

const errorText = (r: GitResult) => (r.stderr || r.stdout).trim()

/** "origin/main" -> ["origin", "main"]; a remote name has no slash. */
function splitUpstream(upstream: string): [string, string] {
  const i = upstream.indexOf("/")
  return i < 0 ? [upstream, ""] : [upstream.slice(0, i), upstream.slice(i + 1)]
}

async function aheadBehind(git: GitRunner): Promise<{ ahead: number; behind: number }> {
  const r = await git(["rev-list", "--left-right", "--count", "HEAD...@{u}"])
  const [a, b] = r.stdout.trim().split(/\s+/).map(Number)
  return { ahead: a || 0, behind: b || 0 }
}

async function unmerged(git: GitRunner): Promise<string[]> {
  return lines((await git(["diff", "--name-only", "--diff-filter=U"])).stdout)
}

/** The remote to sync with: `origin` when there is one, else the first. */
async function pickRemote(git: GitRunner): Promise<string | null> {
  const names = lines((await git(["remote"])).stdout)
  if (names.length === 0) return null
  return names.includes("origin") ? "origin" : names[0]
}

export async function syncVault(git: GitRunner, opts: { message: string }): Promise<SyncOutcome> {
  const inside = await git(["rev-parse", "--is-inside-work-tree"])
  if (inside.code !== 0 || inside.stdout.trim() === "false")
    return { kind: "skipped", reason: "not-repo" }
  const remote = await pickRemote(git)
  if (!remote) return { kind: "skipped", reason: "no-remote" }
  const head = await git(["symbolic-ref", "-q", "--short", "HEAD"])
  const branch = head.stdout.trim()
  if (head.code !== 0 || !branch) return { kind: "skipped", reason: "detached" }

  // A merge the person started (or a conflicted "Bring changes") is theirs to
  // finish; committing or merging on top of it would make a mess.
  const merging = await git(["rev-parse", "-q", "--verify", "MERGE_HEAD"])
  if (merging.code === 0 && merging.stdout.trim())
    return { kind: "conflict", files: await unmerged(git), inProgress: true }

  // 1. Record local work.
  let committed = false
  const status = await git(["status", "--porcelain"])
  if (status.stdout.trim()) {
    const add = await git(["add", "-A"])
    if (add.code !== 0) return { kind: "error", stage: "commit", message: errorText(add) }
    const commit = await git(["commit", "-m", opts.message])
    if (commit.code !== 0) return { kind: "error", stage: "commit", message: errorText(commit) }
    committed = true
  }

  // 2. Learn what the other copy has.
  const fetch = await git(["fetch", "--quiet", remote])
  if (fetch.code !== 0) return { kind: "error", stage: "fetch", message: errorText(fetch) }

  let upstream = (await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])).stdout
    .trim()
    .replace(/^refs\/remotes\//, "")
  if (!upstream || upstream === "@{u}") {
    const remoteBranch = await git(["rev-parse", "-q", "--verify", `${remote}/${branch}`])
    if (remoteBranch.code !== 0 || !remoteBranch.stdout.trim()) {
      // The remote has never seen this branch: publish it and track it.
      const push = await git(["push", "-u", remote, branch])
      if (push.code !== 0) return { kind: "error", stage: "push", message: errorText(push) }
      return { kind: "synced", committed, pulled: false, pushed: true }
    }
    await git(["branch", `--set-upstream-to=${remote}/${branch}`])
    upstream = `${remote}/${branch}`
  }

  // 3. Bring their changes.
  let pulled = false
  const counts = await aheadBehind(git)
  let ahead = counts.ahead
  if (counts.behind > 0) {
    const merge = await git(["merge", "--no-edit", "@{u}"])
    if (merge.code !== 0) {
      const files = await unmerged(git)
      if (files.length > 0) {
        await git(["merge", "--abort"])
        return { kind: "conflict", files, inProgress: false }
      }
      return { kind: "error", stage: "merge", message: errorText(merge) }
    }
    pulled = true
    ;({ ahead } = await aheadBehind(git))
  }

  // 4. Send ours.
  let pushed = false
  if (ahead > 0) {
    const [pushRemote, pushBranch] = splitUpstream(upstream)
    const push = await git(["push", pushRemote, `HEAD:${pushBranch || branch}`])
    if (push.code !== 0) return { kind: "error", stage: "push", message: errorText(push) }
    pushed = true
  }
  return { kind: "synced", committed, pulled, pushed }
}

/** What the Sync settings show about a repository. */
export interface SyncInfo {
  branch: string
  remoteUrl: string
  /** Files changed and not yet recorded. */
  changes: number
  ahead: number
  behind: number
  merging: boolean
}

export async function readSyncInfo(git: GitRunner): Promise<SyncInfo> {
  const branch = (await git(["symbolic-ref", "-q", "--short", "HEAD"])).stdout.trim()
  const remote = await pickRemote(git)
  const remoteUrl = remote ? (await git(["remote", "get-url", remote])).stdout.trim() : ""
  const changes = lines((await git(["status", "--porcelain"])).stdout).length
  const counts = remote ? await aheadBehind(git) : { ahead: 0, behind: 0 }
  const merging = await git(["rev-parse", "-q", "--verify", "MERGE_HEAD"])
  return {
    branch,
    remoteUrl,
    changes,
    ...counts,
    merging: merging.code === 0 && merging.stdout.trim().length > 0,
  }
}

/** Turn a plain folder into a repository with its first record. */
export async function startHistory(
  git: GitRunner,
  message: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const init = await git(["init"])
  if (init.code !== 0) return { ok: false, message: errorText(init) }
  // Name the first branch main whatever git's own default is.
  await git(["symbolic-ref", "HEAD", "refs/heads/main"])
  const add = await git(["add", "-A"])
  if (add.code !== 0) return { ok: false, message: errorText(add) }
  const commit = await git(["commit", "--allow-empty", "-m", message])
  if (commit.code !== 0) return { ok: false, message: errorText(commit) }
  return { ok: true }
}

/**
 * Connect a repository to an empty shared one and send everything. Reuses
 * `origin` if it already exists (pointing it at the new address).
 */
export async function connectRemote(
  git: GitRunner,
  url: string,
  branch: string,
): Promise<{ ok: true } | { ok: false; stage: "remote" | "push"; message: string }> {
  const existing = lines((await git(["remote"])).stdout)
  const set = existing.includes("origin")
    ? await git(["remote", "set-url", "origin", url])
    : await git(["remote", "add", "origin", url])
  if (set.code !== 0) return { ok: false, stage: "remote", message: errorText(set) }
  const push = await git(["push", "-u", "origin", branch || "main"])
  if (push.code !== 0) return { ok: false, stage: "push", message: errorText(push) }
  return { ok: true }
}

/** True when a push failed only because the other copy moved first. */
export function isPushRejected(message: string): boolean {
  return /rejected|non-fast-forward|fetch first/i.test(message)
}
