// "Open from Git": clone a repository into a new vault folder.
//
// The rules that keep it safe to run on an address someone sent you:
// - git is the external process (never a library), started through the same
//   hardened config as every other call (`safeGitConfig`: hooks and fsmonitor
//   off, the ext:: transport refused).
// - The address is validated first: it cannot start with `-` (git would read
//   it as an option), cannot use a remote helper (`ext::`, `hg::`...), and is
//   passed after `--`.
// - Git never prompts (GIT_TERMINAL_PROMPT=0): a repository that needs a
//   login fails fast with advice to use an SSH key or a credential helper.
//   The app stores no token and asks for no password.
// - Git LFS filters are off (a clone must not run a program from the repo),
//   submodules are not fetched.
// - The clone is made in a scratch folder next to the destination and moved
//   into place only when git exits cleanly, so a failure or a cancel leaves
//   no half vault behind.
//
// Everything outside this file that touches the machine (spawning git, the
// folder moves) comes in through `CloneHost`, so the whole sequence is
// unit-testable and runs against real git in the tests.

import { safeGitConfig } from "./gitApi"

// ── Address validation ──────────────────────────────────────────────────────

export type CloneUrlProblem =
  "empty" | "option" | "helper" | "unsupported" | "spaces" | "noScheme" | "credentials"

/** Schemes git can fetch over and that ComdTeX accepts. */
const URL_SCHEME = /^(https?|ssh|git|file):\/\//i
/** scp-like: `git@github.com:user/repo.git`. */
const SCP_LIKE = /^[\w.-]+@[\w.-]+:[^\s]+$/
/** An absolute local path (a bare repository on disk, a mounted share). */
/** `github.com/user/repo`: a web address typed without its `https://`. */
const BARE_WEB_ADDRESS = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?\/\S+/i
/** `user:token@host` or `token@host` in an http(s) address. */
const EMBEDDED_CREDENTIALS = /^https?:\/\/[^/?#]*@/i
const LOCAL_PATH = /^(\/|[A-Za-z]:[\\/]|\\\\)/

export function validateCloneUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; problem: CloneUrlProblem } {
  const url = raw.trim()
  if (!url) return { ok: false, problem: "empty" }
  // A leading dash would be taken for an option, whatever follows it.
  if (url.startsWith("-")) return { ok: false, problem: "option" }
  // Remote helpers: `ext::sh -c ...` runs a program; `hg::` and friends load one.
  if (/^[\w+.-]+::/.test(url)) return { ok: false, problem: "helper" }
  if (/[\s\u0000-\u001f]/.test(url)) return { ok: false, problem: "spaces" }
  // A token in the address would be written to .git/config by git clone.
  if (EMBEDDED_CREDENTIALS.test(url)) return { ok: false, problem: "credentials" }
  if (BARE_WEB_ADDRESS.test(url) && !URL_SCHEME.test(url) && !SCP_LIKE.test(url))
    return { ok: false, problem: "noScheme" }
  if (URL_SCHEME.test(url) || SCP_LIKE.test(url) || LOCAL_PATH.test(url)) return { ok: true, url }
  return { ok: false, problem: "unsupported" }
}

/** `https://host/user/notes.git`, `git@host:user/notes` -> `notes`. */
export function repoNameFromUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/[\\/]+$/, "")
    .replace(/\.git$/i, "")
  const last =
    trimmed
      .split(/[\\/:]/)
      .filter(Boolean)
      .pop() ?? ""
  const clean = last.replace(/[<>:"|?*\u0000-\u001f]/g, "").replace(/^\.+/, "")
  return clean || "vault"
}

// ── Arguments and environment ───────────────────────────────────────────────

/** Environment added to the inherited one (the shell plugin merges it in). */
export function cloneEnv(): Record<string, string> {
  return {
    // Never ask on a terminal that does not exist: fail with a clear message.
    GIT_TERMINAL_PROMPT: "0",
    // English messages, so the error mapping below can recognise them.
    LC_ALL: "C",
    LANGUAGE: "C",
  }
}

/** The full argument list for `git clone` into `tempDir`. */
export function buildCloneArgs(url: string, tempDir: string): string[] {
  return [
    ...safeGitConfig(),
    // A cloned repo may name an LFS filter; none may run during the checkout.
    "-c",
    "filter.lfs.process=",
    "-c",
    "filter.lfs.required=false",
    "-c",
    "filter.lfs.smudge=",
    "-c",
    "filter.lfs.clean=",
    "-c",
    "submodule.recurse=false",
    "-c",
    "core.autocrlf=false",
    "clone",
    "--progress",
    "--no-recurse-submodules",
    "--",
    url,
    tempDir,
  ]
}

// ── Progress ────────────────────────────────────────────────────────────────

export type ClonePhase =
  "starting" | "counting" | "compressing" | "receiving" | "resolving" | "checkout"

export interface CloneProgress {
  phase: ClonePhase
  /** 0 to 100, or null when git gave no percentage. */
  percent: number | null
  /** Bytes received so far (only while receiving). */
  bytes: number | null
}

const PHASES: Array<[RegExp, ClonePhase]> = [
  [/Enumerating objects|Counting objects/i, "counting"],
  [/Compressing objects/i, "compressing"],
  [/Receiving objects/i, "receiving"],
  [/Resolving deltas/i, "resolving"],
  [/Updating files|Checking out files/i, "checkout"],
]

const UNITS: Record<string, number> = {
  bytes: 1,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
}

/**
 * Reads the progress out of a chunk of git's stderr. Git redraws one line with
 * carriage returns, so a chunk can hold several states; the last one counts.
 * Returns null when the chunk holds no progress line.
 */
export function parseCloneProgress(chunk: string): CloneProgress | null {
  const parts = chunk.split(/[\r\n]+/)
  for (let i = parts.length - 1; i >= 0; i--) {
    const line = parts[i].replace(/^remote:\s*/i, "")
    const hit = PHASES.find(([re]) => re.test(line))
    if (!hit) continue
    const pct = /(\d{1,3})%/.exec(line)
    const size = /,\s*([\d.]+)\s*(bytes|KiB|MiB|GiB|TiB)\b/i.exec(line)
    return {
      phase: hit[1],
      percent: pct ? Math.min(100, Number(pct[1])) : null,
      bytes:
        size && hit[1] === "receiving"
          ? Math.round(Number(size[1]) * UNITS[size[2].toLowerCase()])
          : null,
    }
  }
  return null
}

// ── Errors in plain language ────────────────────────────────────────────────

export type CloneErrorKind =
  | "badUrl"
  | "gitMissing"
  | "auth"
  | "notFound"
  | "network"
  | "destNotEmpty"
  | "destInvalid"
  | "tooLarge"
  | "stalled"
  | "cancelled"
  | "other"

/** Hides `user:password@` in an address that appears in git's messages. */
export function redactCredentials(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@")
}

/** Maps what git printed (in the C locale) to a kind of failure. */
export function mapCloneError(stderr: string): CloneErrorKind {
  const s = stderr
  if (/already exists and is not an empty directory/i.test(s)) return "destNotEmpty"
  if (
    /terminal prompts disabled|could not read (Username|Password)|Authentication failed|Permission denied \((publickey|password|keyboard)|publickey|HTTP Basic: Access denied|returned error: 40[13]|Host key verification failed|no such identity/i.test(
      s,
    )
  )
    return "auth"
  if (
    /Repository not found|does not appear to be a git repository|returned error: 404|does not exist|not found/i.test(
      s,
    )
  )
    return "notFound"
  if (
    /Could not resolve host|Could not resolve hostname|Connection (refused|timed out|reset)|Network is unreachable|Temporary failure in name resolution|early EOF|RPC failed|unable to access|Failed to connect|SSL|timed out|Operation timed out|transfer closed/i.test(
      s,
    )
  )
    return "network"
  return "other"
}

export interface CloneFailure {
  ok: false
  kind: CloneErrorKind
  /** git's own words, credentials redacted; shown as a detail. */
  detail: string
}

export interface CloneSuccess {
  ok: true
  path: string
}

export type CloneResult = CloneSuccess | CloneFailure

// ── The operation ───────────────────────────────────────────────────────────

export interface CloneProcess {
  kill(): Promise<void>
}

export interface CloneHost {
  /**
   * Starts git. Rejects when git cannot be started (not installed, blocked).
   * Calls `onStderr` for each chunk and `onClose` exactly once at the end.
   */
  spawn(
    args: string[],
    env: Record<string, string>,
    handlers: { onStderr: (chunk: string) => void; onClose: (code: number | null) => void },
  ): Promise<CloneProcess>
  /** Validates the destination and picks the scratch folder; rejects with a code. */
  prepare(parent: string, name: string): Promise<{ temp: string; dest: string }>
  /** Moves the scratch folder into the destination. */
  finish(temp: string, dest: string): Promise<void>
  /** Deletes the scratch folder (idempotent). */
  discard(temp: string): Promise<void>
}

export interface CloneLimits {
  /** Give up when git prints nothing for this long. */
  stallMs: number
  /** Give up after this long in total. */
  totalMs: number
  /** Give up when more than this many bytes were received. */
  maxBytes: number
}

export const DEFAULT_CLONE_LIMITS: CloneLimits = {
  stallMs: 2 * 60_000,
  totalMs: 30 * 60_000,
  maxBytes: 2 * 1024 ** 3,
}

export interface CloneOptions {
  url: string
  /** The folder the vault folder is created in. */
  parent: string
  /** Name of the new vault folder. */
  name: string
  onProgress?: (p: CloneProgress) => void
  signal?: AbortSignal
  limits?: Partial<CloneLimits>
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function mapPrepareError(e: unknown): CloneFailure {
  const msg = errorMessage(e)
  if (/dest-not-empty/.test(msg)) return { ok: false, kind: "destNotEmpty", detail: "" }
  return { ok: false, kind: "destInvalid", detail: msg }
}

export async function cloneVault(host: CloneHost, opts: CloneOptions): Promise<CloneResult> {
  const limits = { ...DEFAULT_CLONE_LIMITS, ...opts.limits }
  const checked = validateCloneUrl(opts.url)
  if (!checked.ok) return { ok: false, kind: "badUrl", detail: checked.problem }
  if (opts.signal?.aborted) return { ok: false, kind: "cancelled", detail: "" }

  let target: { temp: string; dest: string }
  try {
    target = await host.prepare(opts.parent, opts.name)
  } catch (e) {
    return mapPrepareError(e)
  }
  const { temp, dest } = target

  const discard = async () => {
    try {
      await host.discard(temp)
    } catch {
      /* nothing more can be done; the folder is hidden and named after ComdTeX */
    }
  }

  let stderr = ""
  let abortReason: "cancelled" | "stalled" | "tooLarge" | null = null
  let child: CloneProcess | null = null
  let closed!: (code: number | null) => void
  const closedP = new Promise<number | null>((resolve) => (closed = resolve))
  let stallTimer: ReturnType<typeof setTimeout> | undefined

  const stop = (reason: "cancelled" | "stalled" | "tooLarge") => {
    if (abortReason) return
    abortReason = reason
    void child?.kill().catch(() => undefined)
  }
  const armStall = () => {
    clearTimeout(stallTimer)
    stallTimer = setTimeout(() => stop("stalled"), limits.stallMs)
  }
  const totalTimer = setTimeout(() => stop("stalled"), limits.totalMs)
  const onAbort = () => stop("cancelled")
  const cleanup = () => {
    clearTimeout(stallTimer)
    clearTimeout(totalTimer)
    opts.signal?.removeEventListener("abort", onAbort)
  }

  try {
    child = await host.spawn(buildCloneArgs(checked.url, temp), cloneEnv(), {
      onStderr: (chunk) => {
        armStall()
        // Keep the tail only: progress redraws would otherwise grow without bound.
        stderr = (stderr + chunk).slice(-8000)
        const p = parseCloneProgress(chunk)
        if (!p) return
        opts.onProgress?.(p)
        if (p.bytes !== null && p.bytes > limits.maxBytes) stop("tooLarge")
      },
      onClose: (code) => closed(code),
    })
  } catch (e) {
    cleanup()
    await discard()
    return { ok: false, kind: "gitMissing", detail: errorMessage(e) }
  }

  // A limit can trip while spawn() is still resolving; stop() had no child to kill yet.
  if (abortReason) void child.kill().catch(() => undefined)
  armStall()
  opts.signal?.addEventListener("abort", onAbort)
  if (opts.signal?.aborted) onAbort()
  opts.onProgress?.({ phase: "starting", percent: null, bytes: null })

  const code = await closedP
  cleanup()

  if (abortReason) {
    await discard()
    return { ok: false, kind: abortReason, detail: "" }
  }
  if (code !== 0) {
    await discard()
    const detail = redactCredentials(
      stderr
        .split(/[\r\n]+/)
        .filter(
          (l) =>
            /^(fatal|error|remote|ssh|Permission|Host key)/i.test(l.trim()) || /fatal/i.test(l),
        )
        .join("\n")
        .trim() || stderr.trim(),
    )
    return { ok: false, kind: mapCloneError(stderr), detail }
  }
  try {
    await host.finish(temp, dest)
  } catch (e) {
    await discard()
    return mapPrepareError(e)
  }
  return { ok: true, path: dest }
}
