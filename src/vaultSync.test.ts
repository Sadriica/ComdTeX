import { describe, expect, it } from "vitest"
import type { GitResult } from "./gitApi"
import {
  connectRemote,
  isPushRejected,
  readSyncInfo,
  startHistory,
  syncVault,
  type GitRunner,
} from "./vaultSync"

const ok = (stdout = ""): GitResult => ({ code: 0, stdout, stderr: "" })
const fail = (stderr: string, code = 1): GitResult => ({ code, stdout: "", stderr })

interface Repo {
  remotes?: string
  branch?: string
  merging?: boolean
  dirty?: boolean
  upstream?: string
  /** "ahead behind" before the merge, then after it. */
  counts?: string[]
  remoteHasBranch?: boolean
  fetch?: GitResult
  merge?: GitResult
  push?: GitResult
  commit?: GitResult
  conflicts?: string
}

/** A fake git that answers from `repo` and records every call. */
function fakeGit(repo: Repo): { git: GitRunner; calls: string[] } {
  const calls: string[] = []
  const counts = [...(repo.counts ?? ["0\t0"])]
  const git: GitRunner = async (args) => {
    const cmd = args.join(" ")
    calls.push(cmd)
    if (cmd === "rev-parse --is-inside-work-tree") return ok("true\n")
    if (cmd === "remote") return ok(repo.remotes ?? "origin\n")
    if (cmd.startsWith("remote get-url")) return ok("git@github.com:ada/notes.git\n")
    if (cmd === "symbolic-ref -q --short HEAD")
      return repo.branch === "" ? fail("", 1) : ok(`${repo.branch ?? "main"}\n`)
    if (cmd === "rev-parse -q --verify MERGE_HEAD")
      return repo.merging ? ok("abc123\n") : fail("", 1)
    if (cmd === "status --porcelain") return ok(repo.dirty ? " M notes.md\n" : "")
    if (cmd === "commit -m Sync") return repo.commit ?? ok()
    if (cmd.startsWith("fetch")) return repo.fetch ?? ok()
    if (cmd === "rev-parse --abbrev-ref --symbolic-full-name @{u}")
      return repo.upstream === undefined
        ? ok("origin/main\n")
        : repo.upstream
          ? ok(repo.upstream)
          : fail("no upstream", 128)
    if (cmd.startsWith("rev-parse -q --verify origin/"))
      return repo.remoteHasBranch ? ok("def456\n") : fail("", 1)
    if (cmd === "rev-list --left-right --count HEAD...@{u}") return ok(counts.shift() ?? "0\t0")
    if (cmd === "merge --no-edit @{u}") return repo.merge ?? ok()
    if (cmd === "diff --name-only --diff-filter=U") return ok(repo.conflicts ?? "")
    if (cmd.startsWith("push")) return repo.push ?? ok()
    return ok()
  }
  return { git, calls }
}

describe("syncVault", () => {
  it("records local work, brings theirs and sends ours", async () => {
    const { git, calls } = fakeGit({ dirty: true, counts: ["1\t2", "2\t0"] })
    expect(await syncVault(git, { message: "Sync" })).toEqual({
      kind: "synced",
      committed: true,
      pulled: true,
      pushed: true,
    })
    expect(calls).toContain("add -A")
    expect(calls).toContain("commit -m Sync")
    expect(calls).toContain("merge --no-edit @{u}")
    expect(calls).toContain("push origin HEAD:main")
  })

  it("does nothing beyond a fetch when both copies are level", async () => {
    const { git, calls } = fakeGit({})
    expect(await syncVault(git, { message: "Sync" })).toEqual({
      kind: "synced",
      committed: false,
      pulled: false,
      pushed: false,
    })
    expect(
      calls.some((c) => c.startsWith("commit") || c.startsWith("merge") || c.startsWith("push")),
    ).toBe(false)
  })

  it("aborts a conflicting merge and reports the files, keeping local work recorded", async () => {
    const { git, calls } = fakeGit({
      dirty: true,
      counts: ["1\t1"],
      merge: fail("CONFLICT (content): Merge conflict in notes.md"),
      conflicts: "notes.md\n",
    })
    expect(await syncVault(git, { message: "Sync" })).toEqual({
      kind: "conflict",
      files: ["notes.md"],
      inProgress: false,
    })
    expect(calls).toContain("commit -m Sync")
    expect(calls).toContain("merge --abort")
    expect(calls.some((c) => c.startsWith("push"))).toBe(false)
  })

  it("leaves a merge the person is resolving alone", async () => {
    const { git, calls } = fakeGit({ merging: true, conflicts: "a.md\n" })
    expect(await syncVault(git, { message: "Sync" })).toEqual({
      kind: "conflict",
      files: ["a.md"],
      inProgress: true,
    })
    expect(calls.some((c) => c.startsWith("add") || c.startsWith("fetch"))).toBe(false)
  })

  it("skips a folder without a remote or on a detached HEAD", async () => {
    expect(await syncVault(fakeGit({ remotes: "" }).git, { message: "Sync" })).toEqual({
      kind: "skipped",
      reason: "no-remote",
    })
    expect(await syncVault(fakeGit({ branch: "" }).git, { message: "Sync" })).toEqual({
      kind: "skipped",
      reason: "detached",
    })
  })

  it("stops at a failed fetch (offline) after recording local work", async () => {
    const { git } = fakeGit({ dirty: true, fetch: fail("Could not resolve host: github.com", 128) })
    expect(await syncVault(git, { message: "Sync" })).toEqual({
      kind: "error",
      stage: "fetch",
      message: "Could not resolve host: github.com",
    })
  })

  it("publishes a branch the remote has never seen", async () => {
    const { git, calls } = fakeGit({ upstream: "", remoteHasBranch: false })
    expect(await syncVault(git, { message: "Sync" })).toMatchObject({
      kind: "synced",
      pushed: true,
    })
    expect(calls).toContain("push -u origin main")
  })

  it("starts tracking the remote branch when it exists but is not tracked", async () => {
    const { git, calls } = fakeGit({ upstream: "", remoteHasBranch: true, counts: ["1\t0"] })
    expect(await syncVault(git, { message: "Sync" })).toMatchObject({
      kind: "synced",
      pushed: true,
    })
    expect(calls).toContain("branch --set-upstream-to=origin/main")
    expect(calls).toContain("push origin HEAD:main")
  })

  it("reports a rejected push so the next run can bring the new changes first", async () => {
    const { git } = fakeGit({
      counts: ["1\t0"],
      push: fail("! [rejected] main -> main (fetch first)"),
    })
    const out = await syncVault(git, { message: "Sync" })
    expect(out).toMatchObject({ kind: "error", stage: "push" })
    expect(isPushRejected((out as { message: string }).message)).toBe(true)
  })
})

describe("readSyncInfo", () => {
  it("summarises branch, address and pending work", async () => {
    const { git } = fakeGit({ dirty: true, counts: ["2\t1"] })
    expect(await readSyncInfo(git)).toEqual({
      branch: "main",
      remoteUrl: "git@github.com:ada/notes.git",
      changes: 1,
      ahead: 2,
      behind: 1,
      merging: false,
    })
  })
})

describe("startHistory and connectRemote", () => {
  it("creates the repository on main with a first record", async () => {
    const { git, calls } = fakeGit({})
    expect(await startHistory(git, "Start")).toEqual({ ok: true })
    expect(calls).toEqual([
      "init",
      "symbolic-ref HEAD refs/heads/main",
      "add -A",
      "commit --allow-empty -m Start",
    ])
  })

  it("adds origin, or repoints an existing one, then sends the branch", async () => {
    const fresh = fakeGit({ remotes: "" })
    expect(await connectRemote(fresh.git, "git@h:a/b.git", "main")).toEqual({ ok: true })
    expect(fresh.calls).toContain("remote add origin git@h:a/b.git")
    expect(fresh.calls).toContain("push -u origin main")

    const existing = fakeGit({})
    await connectRemote(existing.git, "git@h:a/c.git", "main")
    expect(existing.calls).toContain("remote set-url origin git@h:a/c.git")
  })

  it("says which step failed", async () => {
    const { git } = fakeGit({ remotes: "", push: fail("Permission denied (publickey).") })
    expect(await connectRemote(git, "git@h:a/b.git", "main")).toEqual({
      ok: false,
      stage: "push",
      message: "Permission denied (publickey).",
    })
  })
})
