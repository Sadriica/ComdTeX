// cloneVault against real git: a bare repository in a temp dir stands in for
// the remote. Skipped where git is not installed.
import { execFileSync, spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { cloneVault, type CloneHost, type CloneProgress } from "./vaultClone"

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
const GIT_TIMEOUT = 60_000
const git = (dir: string, ...args: string[]) =>
  execFileSync("git", [...IDENTITY, "-C", dir, ...args], { stdio: "pipe" }).toString()

/** The same rules as the Rust commands in src-tauri/src/lib.rs, in node. */
function nodeHost(): CloneHost & { spawned: string[][] } {
  const spawned: string[][] = []
  return {
    spawned,
    async spawn(args, env, h) {
      spawned.push(args)
      const child = spawn("git", args, { env: { ...process.env, ...env } })
      child.stderr.on("data", (d: Buffer) => h.onStderr(d.toString()))
      child.on("error", (e) => {
        h.onStderr(String(e))
        h.onClose(null)
      })
      child.on("close", (code) => h.onClose(code))
      return { kill: async () => void child.kill() }
    },
    async prepare(parent, name) {
      const dest = join(parent, name)
      if (existsSync(dest) && readdirSync(dest).length > 0) throw new Error("dest-not-empty")
      return { temp: join(parent, `.comdtex-clone-${process.pid}-${Date.now()}`), dest }
    },
    async finish(temp, dest) {
      if (!basename(temp).startsWith(".comdtex-clone-") || dirname(temp) !== dirname(dest))
        throw new Error("bad-temp")
      if (existsSync(dest)) {
        if (readdirSync(dest).length > 0) throw new Error("dest-not-empty")
        rmdirSync(dest)
      }
      renameSync(temp, dest)
    },
    async discard(temp) {
      if (basename(temp).startsWith(".comdtex-clone-"))
        rmSync(temp, { recursive: true, force: true })
    },
  }
}

describe.skipIf(!hasGit)("cloneVault with real git", { timeout: GIT_TIMEOUT }, () => {
  let root: string
  let remote: string
  let out: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "comdtex-clone-"))
    remote = join(root, "remote.git")
    execFileSync("git", [...IDENTITY, "init", "--bare", remote], { stdio: "pipe" })
    const seed = join(root, "seed")
    execFileSync("git", [...IDENTITY, "init", seed], { stdio: "pipe" })
    writeFileSync(join(seed, "notes.md"), "# Notes\n\nline two\n")
    mkdirSync(join(seed, "chapters"))
    writeFileSync(join(seed, "chapters", "one.md"), "one\n")
    git(seed, "add", "-A")
    git(seed, "commit", "-m", "First")
    git(seed, "remote", "add", "origin", remote)
    git(seed, "push", "-u", "origin", "main")
    out = join(root, "out")
    mkdirSync(out)
  }, GIT_TIMEOUT)

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it("clones a repository and leaves only the destination behind", async () => {
    const host = nodeHost()
    const seen: CloneProgress[] = []
    const r = await cloneVault(host, {
      url: remote,
      parent: out,
      name: "notes",
      onProgress: (p) => seen.push(p),
    })
    expect(r).toEqual({ ok: true, path: join(out, "notes") })
    expect(readFileSync(join(out, "notes", "notes.md"), "utf8")).toBe("# Notes\n\nline two\n")
    expect(existsSync(join(out, "notes", "chapters", "one.md"))).toBe(true)
    expect(existsSync(join(out, "notes", ".git"))).toBe(true)
    expect(readdirSync(out)).toEqual(["notes"])
    expect(seen[0].phase).toBe("starting")
    // The call carried the hardening and the separator.
    const args = host.spawned[0]
    expect(args.some((a) => a.startsWith("core.hooksPath="))).toBe(true)
    expect(args).toContain("protocol.ext.allow=never")
    expect(args[args.length - 3]).toBe("--")
  })

  it("fills an existing empty destination folder", async () => {
    mkdirSync(join(out, "empty"))
    const r = await cloneVault(nodeHost(), { url: remote, parent: out, name: "empty" })
    expect(r).toMatchObject({ ok: true })
    expect(existsSync(join(out, "empty", "notes.md"))).toBe(true)
  })

  it("refuses a destination that already has files, without running git", async () => {
    mkdirSync(join(out, "busy"))
    writeFileSync(join(out, "busy", "mine.md"), "mine")
    const host = nodeHost()
    const r = await cloneVault(host, { url: remote, parent: out, name: "busy" })
    expect(r).toMatchObject({ ok: false, kind: "destNotEmpty" })
    expect(host.spawned).toHaveLength(0)
    expect(readFileSync(join(out, "busy", "mine.md"), "utf8")).toBe("mine")
  })

  it("leaves nothing behind when the repository does not exist", async () => {
    const r = await cloneVault(nodeHost(), {
      url: join(root, "missing.git"),
      parent: out,
      name: "ghost",
    })
    expect(r).toMatchObject({ ok: false, kind: "notFound" })
    expect(existsSync(join(out, "ghost"))).toBe(false)
    expect(readdirSync(out).filter((n) => n.startsWith(".comdtex-clone-"))).toEqual([])
  })

  it("leaves nothing behind when cancelled", async () => {
    const ctl = new AbortController()
    ctl.abort()
    const r = await cloneVault(nodeHost(), {
      url: remote,
      parent: out,
      name: "cancelled",
      signal: ctl.signal,
    })
    expect(r).toMatchObject({ ok: false, kind: "cancelled" })
    expect(existsSync(join(out, "cancelled"))).toBe(false)
    expect(readdirSync(out).filter((n) => n.startsWith(".comdtex-clone-"))).toEqual([])
  })

  it("does not run hooks or an LFS filter from the cloned repository", async () => {
    // A repository whose .gitattributes asks for an LFS filter that would fail
    // loudly (git-lfs is "required") if the app had not switched it off.
    const lfs = join(root, "lfs-seed")
    execFileSync("git", [...IDENTITY, "init", lfs], { stdio: "pipe" })
    writeFileSync(join(lfs, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n")
    writeFileSync(join(lfs, "big.bin"), "not a real pointer\n")
    // Seed with the LFS filter off, so a machine with git-lfs installed does not
    // turn the file into a real pointer before the clone runs.
    const noLfs = [
      "-c",
      "filter.lfs.clean=",
      "-c",
      "filter.lfs.process=",
      "-c",
      "filter.lfs.required=false",
    ]
    git(lfs, ...noLfs, "add", "-A")
    git(lfs, ...noLfs, "commit", "-m", "lfs")
    const r = await cloneVault(nodeHost(), { url: lfs, parent: out, name: "lfs" })
    expect(r).toMatchObject({ ok: true })
    expect(readFileSync(join(out, "lfs", "big.bin"), "utf8")).toBe("not a real pointer\n")
  })
})
