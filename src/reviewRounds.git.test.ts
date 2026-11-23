// Review rounds against real git. Skipped where git is not installed.
import { execFile, execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { GitResult } from "./gitApi"
import { acceptAll, rejectAll } from "./criticMarkup"
import { compareWithRound, listRounds, startRound } from "./reviewRounds"
import type { GitRunner } from "./vaultSync"

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
  "-c",
  "core.autocrlf=false",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "tag.gpgsign=false",
]

function runner(dir: string): GitRunner {
  return (args) =>
    new Promise<GitResult>((resolve) => {
      execFile(
        "git",
        [...IDENTITY, "-C", dir, ...args],
        (err: (Error & { code?: unknown }) | null, stdout: string, stderr: string) => {
          resolve({
            code: err ? (typeof err.code === "number" ? err.code : 1) : 0,
            stdout: String(stdout),
            stderr: String(stderr),
          })
        },
      )
    })
}

describe.skipIf(!hasGit)("review rounds with real git", { timeout: 60_000 }, () => {
  let root: string
  let git: GitRunner
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "comdtex-rounds-"))
    execFileSync("git", [...IDENTITY, "init", "-q", root])
    mkdirSync(join(root, "notes"))
    writeFileSync(join(root, "notes", "a.md"), "The quick fox. See $x^2$.\n")
    git = runner(root)
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it("start, edit, compare, start again", async () => {
    const msg = { message: (n: number) => `Review round ${n}` }
    const first = await startRound(git, msg)
    expect(first.ok && first.round.tag).toBe("review-1")
    expect(first.ok && first.committed).toBe(true)

    // A second round with nothing new tags the same commit under a new number.
    const idle = await startRound(git, msg)
    expect(idle.ok && idle.committed).toBe(false)
    expect(idle.ok && idle.round.tag).toBe("review-2")

    const current = "The slow fox. See $x^3$. Done.\n"
    writeFileSync(join(root, "notes", "a.md"), current)
    const res = await compareWithRound(git, 1, "notes/a.md", current)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.changed).toBe(true)
      expect(acceptAll(res.markup)).toBe(current)
      expect(rejectAll(res.markup)).toBe("The quick fox. See $x^2$.\n")
      expect(res.markup).toContain("{~~quick~>slow~~}")
    }

    const third = await startRound(git, msg)
    expect(third.ok && third.committed).toBe(true)
    expect((await listRounds(git)).map((r) => r.n)).toEqual([1, 2, 3])

    const gone = await compareWithRound(git, 1, "notes/missing.md", "x")
    expect(gone).toEqual({ ok: false, reason: "no-such-note" })
  })

  it("a round is a lightweight tag", () => {
    const type = execFileSync("git", ["-C", root, "cat-file", "-t", "review-1"]).toString().trim()
    expect(type).toBe("commit")
  })
})
