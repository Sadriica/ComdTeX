import { describe, expect, it, vi } from "vitest"
import {
  buildCloneArgs,
  cloneEnv,
  cloneVault,
  mapCloneError,
  parseCloneProgress,
  redactCredentials,
  repoNameFromUrl,
  validateCloneUrl,
  type CloneHost,
  type CloneProgress,
} from "./vaultClone"

describe("validateCloneUrl", () => {
  it.each([
    "https://github.com/ada/notes.git",
    "http://example.org/notes",
    "ssh://git@host.example/ada/notes.git",
    "git@github.com:ada/notes.git",
    "git://host/notes.git",
    "file:///srv/git/notes.git",
    "/srv/git/notes.git",
    "C:\\repos\\notes.git",
  ])("accepts %s", (u) => {
    expect(validateCloneUrl(`  ${u} `)).toEqual({ ok: true, url: u })
  })

  it("rejects an address git would read as an option", () => {
    expect(validateCloneUrl("--upload-pack=touch /tmp/x")).toEqual({ ok: false, problem: "option" })
    expect(validateCloneUrl("-oProxyCommand=evil")).toEqual({ ok: false, problem: "option" })
  })

  it("rejects remote helpers, including ext::", () => {
    for (const u of [
      "ext::sh -c 'touch /tmp/x'",
      "ext::sh%20-c%20id",
      "hg::https://x/y",
      "EXT::cmd",
    ]) {
      expect(validateCloneUrl(u), u).toMatchObject({ ok: false })
    }
    expect(validateCloneUrl("ext::sh")).toEqual({ ok: false, problem: "helper" })
  })

  it("rejects empty, spaced and unknown shapes", () => {
    expect(validateCloneUrl("   ")).toEqual({ ok: false, problem: "empty" })
    expect(validateCloneUrl("https://x/a b")).toEqual({ ok: false, problem: "spaces" })
    expect(validateCloneUrl("https://x/a\nb")).toEqual({ ok: false, problem: "spaces" })
    expect(validateCloneUrl("notes")).toEqual({ ok: false, problem: "unsupported" })
    expect(validateCloneUrl("javascript:alert(1)")).toEqual({ ok: false, problem: "unsupported" })
  })
})

describe("validateCloneUrl suggestions", () => {
  it("rejects an address without a scheme, with its own problem", () => {
    for (const u of [
      "github.com/user/repo",
      "www.gitlab.com/ada/notes.git",
      "git.example.org:8080/a/b",
    ])
      expect(validateCloneUrl(u), u).toEqual({ ok: false, problem: "noScheme" })
    expect(validateCloneUrl("notes")).toEqual({ ok: false, problem: "unsupported" })
  })

  it("keeps accepting scp-like and local addresses", () => {
    expect(validateCloneUrl("git@github.com:user/repo.git")).toMatchObject({ ok: true })
    expect(validateCloneUrl("/srv/git/a.git")).toMatchObject({ ok: true })
  })

  it("rejects credentials embedded in an http(s) address", () => {
    for (const u of [
      "https://ada:ghp_secret@github.com/ada/notes.git",
      "https://ghp_secret@github.com/ada/notes.git",
      "http://user:pw@host/x",
    ])
      expect(validateCloneUrl(u), u).toEqual({ ok: false, problem: "credentials" })
    expect(validateCloneUrl("https://github.com/ada/a@b")).toMatchObject({ ok: true })
  })
})

describe("repoNameFromUrl", () => {
  it("takes the last segment without .git", () => {
    expect(repoNameFromUrl("https://github.com/ada/notes.git")).toBe("notes")
    expect(repoNameFromUrl("git@github.com:ada/my-vault")).toBe("my-vault")
    expect(repoNameFromUrl("https://host/ada/notes/")).toBe("notes")
    expect(repoNameFromUrl("C:\\repos\\notes.git")).toBe("notes")
    expect(repoNameFromUrl("https://host/")).toBe("host")
    expect(repoNameFromUrl("...")).toBe("vault")
  })
})

describe("buildCloneArgs", () => {
  const args = buildCloneArgs("https://x/y.git", "/tmp/.comdtex-clone-1")

  it("puts -- right before the address and ends with the scratch folder", () => {
    expect(args.slice(-3)).toEqual(["--", "https://x/y.git", "/tmp/.comdtex-clone-1"])
    expect(args.indexOf("--")).toBe(args.length - 3)
  })

  it("asks for progress, no submodules, and the hardened config", () => {
    expect(args).toContain("--progress")
    expect(args).toContain("--no-recurse-submodules")
    const joined = args.join(" ")
    for (const c of ["core.fsmonitor=false", "core.hooksPath=", "protocol.ext.allow=never"])
      expect(joined).toContain(c)
  })

  it("turns the LFS filters off", () => {
    for (const c of [
      "filter.lfs.process=",
      "filter.lfs.required=false",
      "filter.lfs.smudge=",
      "filter.lfs.clean=",
    ])
      expect(args).toContain(c)
  })

  it("never lets git prompt", () => {
    expect(cloneEnv().GIT_TERMINAL_PROMPT).toBe("0")
  })

  it("keeps a hostile address after the separator even if it slipped through", () => {
    const a = buildCloneArgs("--upload-pack=x", "/t")
    expect(a.indexOf("--")).toBeLessThan(a.indexOf("--upload-pack=x"))
  })
})

describe("parseCloneProgress", () => {
  it("reads receiving with percent and size", () => {
    expect(
      parseCloneProgress("Receiving objects:  45% (450/1000), 1.50 MiB | 2.00 MiB/s\r"),
    ).toEqual({
      phase: "receiving",
      percent: 45,
      bytes: 1572864,
    })
  })

  it("keeps the last state of a chunk with several redraws", () => {
    const p = parseCloneProgress(
      "Receiving objects:  10% (1/10)\rReceiving objects:  60% (6/10), 3 KiB | 1 KiB/s\r",
    )
    expect(p).toMatchObject({ phase: "receiving", percent: 60, bytes: 3072 })
  })

  it("reads the other phases, with and without the remote: prefix", () => {
    expect(parseCloneProgress("remote: Counting objects: 100% (5/5), done.\n")?.phase).toBe(
      "counting",
    )
    expect(parseCloneProgress("remote: Compressing objects:  50% (1/2)\n")).toMatchObject({
      phase: "compressing",
      percent: 50,
    })
    expect(parseCloneProgress("Resolving deltas: 100% (3/3), done.\n")?.phase).toBe("resolving")
    expect(parseCloneProgress("Updating files:  20% (2/10)\r")).toMatchObject({
      phase: "checkout",
      percent: 20,
    })
  })

  it("ignores lines without progress", () => {
    expect(parseCloneProgress("Cloning into '/tmp/x'...\n")).toBeNull()
    expect(parseCloneProgress("")).toBeNull()
  })
})

describe("mapCloneError", () => {
  it.each([
    ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", "auth"],
    [
      "remote: Invalid username or password.\nfatal: Authentication failed for 'https://x/y.git/'",
      "auth",
    ],
    [
      "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.",
      "auth",
    ],
    ["fatal: unable to access 'https://x/': The requested URL returned error: 403", "auth"],
    ["Host key verification failed.\nfatal: Could not read from remote repository.", "auth"],
    [
      "remote: Repository not found.\nfatal: repository 'https://github.com/a/b/' not found",
      "notFound",
    ],
    ["fatal: '/srv/nope.git' does not appear to be a git repository", "notFound"],
    ["fatal: unable to access 'https://x/': The requested URL returned error: 404", "notFound"],
    ["fatal: unable to access 'https://x/': Could not resolve host: x", "network"],
    ["ssh: connect to host x port 22: Connection timed out", "network"],
    ["error: RPC failed; curl 56 OpenSSL SSL_read\nfatal: early EOF", "network"],
    ["fatal: destination path 'x' already exists and is not an empty directory.", "destNotEmpty"],
    ["fatal: something odd", "other"],
  ])("%s -> %s", (text, kind) => {
    expect(mapCloneError(text)).toBe(kind)
  })
})

describe("redactCredentials", () => {
  it("hides user:password in addresses", () => {
    expect(redactCredentials("fatal: unable to access 'https://ada:s3cret@host/x.git/'")).toBe(
      "fatal: unable to access 'https://***@host/x.git/'",
    )
    expect(redactCredentials("https://host/x")).toBe("https://host/x")
  })
})

// ── The sequence, over a fake host ──────────────────────────────────────────

interface FakeOpts {
  stderr?: string[]
  code?: number | null
  /** Never closes until killed. */
  hang?: boolean
  spawnError?: Error
  prepareError?: Error
  finishError?: Error
}

function fakeHost(o: FakeOpts = {}) {
  const calls: string[] = []
  let onClose: (c: number | null) => void = () => undefined
  const killed = vi.fn()
  const host: CloneHost = {
    async spawn(_args, _env, h) {
      calls.push("spawn")
      if (o.spawnError) throw o.spawnError
      onClose = h.onClose
      for (const c of o.stderr ?? []) h.onStderr(c)
      if (!o.hang) queueMicrotask(() => h.onClose(o.code ?? 0))
      return {
        kill: async () => {
          killed()
          queueMicrotask(() => onClose(null))
        },
      }
    },
    async prepare(parent, name) {
      calls.push("prepare")
      if (o.prepareError) throw o.prepareError
      return { temp: `${parent}/.comdtex-clone-1`, dest: `${parent}/${name}` }
    },
    async finish() {
      calls.push("finish")
      if (o.finishError) throw o.finishError
    },
    async discard() {
      calls.push("discard")
    },
  }
  return { host, calls, killed }
}

const base = { url: "https://x/notes.git", parent: "/data", name: "notes" }

describe("cloneVault", () => {
  it("moves the scratch folder into place after a clean exit", async () => {
    const { host, calls } = fakeHost({
      stderr: ["Receiving objects: 100% (3/3), 1 KiB | 1 KiB/s, done.\n"],
    })
    const seen: CloneProgress[] = []
    const r = await cloneVault(host, { ...base, onProgress: (p) => seen.push(p) })
    expect(r).toEqual({ ok: true, path: "/data/notes" })
    expect(calls).toEqual(["prepare", "spawn", "finish"])
    expect(seen.map((p) => p.phase)).toContain("receiving")
  })

  it("refuses a bad address before touching anything", async () => {
    const { host, calls } = fakeHost()
    const r = await cloneVault(host, { ...base, url: "ext::sh -c id" })
    expect(r).toMatchObject({ ok: false, kind: "badUrl" })
    expect(calls).toEqual([])
  })

  it("reports a busy destination before downloading", async () => {
    const { host, calls } = fakeHost({ prepareError: new Error("dest-not-empty") })
    expect(await cloneVault(host, base)).toMatchObject({ ok: false, kind: "destNotEmpty" })
    expect(calls).toEqual(["prepare"])
  })

  it("discards the scratch folder and maps the error when git fails", async () => {
    const { host, calls } = fakeHost({
      code: 128,
      stderr: [
        "Cloning into '/data/.comdtex-clone-1'...\n",
        "fatal: could not read Username for 'https://x': terminal prompts disabled\n",
      ],
    })
    const r = await cloneVault(host, base)
    expect(r).toMatchObject({ ok: false, kind: "auth" })
    expect(calls).toEqual(["prepare", "spawn", "discard"])
  })

  it("says git is missing when it cannot be spawned", async () => {
    const { host, calls } = fakeHost({ spawnError: new Error("program not found") })
    expect(await cloneVault(host, base)).toMatchObject({ ok: false, kind: "gitMissing" })
    expect(calls).toEqual(["prepare", "spawn", "discard"])
  })

  it("cancels: kills git, discards, finishes nothing", async () => {
    const { host, calls, killed } = fakeHost({ hang: true })
    const ctl = new AbortController()
    const p = cloneVault(host, { ...base, signal: ctl.signal })
    await vi.waitFor(() => expect(calls).toContain("spawn"))
    ctl.abort()
    expect(await p).toMatchObject({ ok: false, kind: "cancelled" })
    expect(killed).toHaveBeenCalled()
    expect(calls).toEqual(["prepare", "spawn", "discard"])
  })

  it("stops a clone that goes silent", async () => {
    const { host, calls } = fakeHost({ hang: true })
    const r = await cloneVault(host, { ...base, limits: { stallMs: 20 } })
    expect(r).toMatchObject({ ok: false, kind: "stalled" })
    expect(calls).toEqual(["prepare", "spawn", "discard"])
  })

  it("stops a clone that grows past the size limit", async () => {
    const { host } = fakeHost({
      hang: true,
      stderr: ["Receiving objects:  5% (5/100), 3.00 MiB | 1 MiB/s\r"],
    })
    const r = await cloneVault(host, { ...base, limits: { maxBytes: 1024 * 1024 } })
    expect(r).toMatchObject({ ok: false, kind: "tooLarge" })
  })

  it("discards when the final move fails", async () => {
    const { host, calls } = fakeHost({ finishError: new Error("dest-not-empty") })
    expect(await cloneVault(host, base)).toMatchObject({ ok: false, kind: "destNotEmpty" })
    expect(calls).toEqual(["prepare", "spawn", "finish", "discard"])
  })
})
