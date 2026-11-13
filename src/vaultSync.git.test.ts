// syncVault against real git: a bare "shared copy" and two clones standing in
// for two machines. Skipped where git is not installed.
import { execFileSync, execFile } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { GitResult } from "./gitApi"
import { readSyncInfo, syncVault, type GitRunner } from "./vaultSync"

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"])
    return true
  } catch {
    return false
  }
})()

const IDENTITY = [
  "-c",
  "user.name=Ada",
  "-c",
  "user.email=ada@example.org",
  "-c",
  "init.defaultBranch=main",
  // Windows runners default to autocrlf, which would rewrite the notes on checkout.
  "-c",
  "core.autocrlf=false",
]

// Git is slow to start on Windows; each test runs a dozen commands.
const GIT_TIMEOUT = 60_000

function runner(dir: string): GitRunner {
  return (args) =>
    new Promise<GitResult>((resolve) => {
      execFile(
        "git",
        [...IDENTITY, "-C", dir, ...args],
        (err: (Error & { code?: unknown }) | null, stdout: string, stderr: string) => {
          const code = err ? (typeof err.code === "number" ? err.code : 1) : 0
          resolve({ code, stdout: String(stdout), stderr: String(stderr) })
        },
      )
    })
}

const sh = (dir: string, ...args: string[]) =>
  execFileSync("git", [...IDENTITY, "-C", dir, ...args], { stdio: "pipe" }).toString()

describe.skipIf(!hasGit)("syncVault with real git", { timeout: GIT_TIMEOUT }, () => {
  let root: string
  let a: string
  let b: string
  const opts = { message: "Writing session" }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "comdtex-sync-"))
    const shared = join(root, "shared.git")
    execFileSync("git", [...IDENTITY, "init", "--bare", shared], { stdio: "pipe" })
    a = join(root, "a")
    execFileSync("git", [...IDENTITY, "init", a], { stdio: "pipe" })
    writeFileSync(join(a, "notes.md"), "line 1\nline 2\nline 3\n")
    sh(a, "add", "-A")
    sh(a, "commit", "-m", "First")
    sh(a, "remote", "add", "origin", shared)
    sh(a, "push", "-u", "origin", "main")
    b = join(root, "b")
    execFileSync("git", [...IDENTITY, "clone", shared, b], { stdio: "pipe" })
  }, GIT_TIMEOUT)

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it("carries an edit from one machine to the other", async () => {
    writeFileSync(join(a, "notes.md"), "line 1 from A\nline 2\nline 3\n")
    writeFileSync(join(a, "new.md"), "a new note\n")
    expect(await syncVault(runner(a), opts)).toEqual({
      kind: "synced",
      committed: true,
      pulled: false,
      pushed: true,
    })
    expect(await syncVault(runner(b), opts)).toMatchObject({ kind: "synced", pulled: true })
    expect(readFileSync(join(b, "notes.md"), "utf8")).toBe("line 1 from A\nline 2\nline 3\n")
    expect(existsSync(join(b, "new.md"))).toBe(true)
  })

  it("merges edits to different parts of a note made on both machines", async () => {
    const base = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`)
    writeFileSync(join(a, "notes.md"), base.join("\n") + "\n")
    await syncVault(runner(a), opts)
    await syncVault(runner(b), opts)
    const fromA = [...base]
    fromA[0] = "line 1 from A"
    const fromB = [...base]
    fromB[8] = "line 9 from B"
    writeFileSync(join(a, "notes.md"), fromA.join("\n") + "\n")
    writeFileSync(join(b, "notes.md"), fromB.join("\n") + "\n")
    await syncVault(runner(a), opts)
    expect(await syncVault(runner(b), opts)).toMatchObject({
      kind: "synced",
      pulled: true,
      pushed: true,
    })
    await syncVault(runner(a), opts)
    const merged = [...base]
    merged[0] = "line 1 from A"
    merged[8] = "line 9 from B"
    expect(readFileSync(join(a, "notes.md"), "utf8")).toBe(merged.join("\n") + "\n")
    expect(readFileSync(join(b, "notes.md"), "utf8")).toBe(merged.join("\n") + "\n")
  })

  it("stops on a real conflict without leaving a merge or touching the files", async () => {
    writeFileSync(join(a, "notes.md"), "A wrote this\n")
    await syncVault(runner(a), opts)
    writeFileSync(join(b, "notes.md"), "B wrote this\n")
    expect(await syncVault(runner(b), opts)).toEqual({
      kind: "conflict",
      files: ["notes.md"],
      inProgress: false,
    })
    // B's text is intact, recorded, and no merge is pending.
    expect(readFileSync(join(b, "notes.md"), "utf8")).toBe("B wrote this\n")
    expect(sh(b, "status", "--porcelain").trim()).toBe("")
    const info = await readSyncInfo(runner(b))
    expect(info.merging).toBe(false)
    expect(info.ahead).toBe(1)
    expect(info.behind).toBe(1)
  })

  it("syncs again once the person resolves the conflict", async () => {
    // What "Bring changes" + "Keep mine" in the Git panel do.
    expect(() => sh(b, "merge", "--no-edit", "@{u}")).toThrow() // stops on the conflict
    sh(b, "checkout", "--ours", "--", "notes.md")
    sh(b, "add", "--", "notes.md")
    sh(b, "commit", "--no-edit")
    expect(await syncVault(runner(b), opts)).toMatchObject({ kind: "synced", pushed: true })
    await syncVault(runner(a), opts)
    expect(readFileSync(join(a, "notes.md"), "utf8")).toBe("B wrote this\n")
  })
})
