import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Page } from "@playwright/test"

// An in-memory stand-in for the Tauri runtime, enough for ComdTeX to open a
// vault in a plain browser. Only the IPC surface the app touches while loading
// and browsing a vault is faked:
//
//   plugin:fs|read_dir, read_text_file, read_file, stat, lstat, exists,
//   write_text_file, write_file, mkdir, remove, rename, copy_file, watch
//   plugin:path|join, resolve, normalize, dirname, basename, extname,
//   resolve_directory (home dir)
//   allow_vault_dir (the custom scope command), get_secret/set_secret/delete_secret
//   plugin:event|listen / unlisten, plugin:window|* and other plugin:*
//   calls resolve to benign nulls; plugin:shell|* (git, pandoc, ...) reject, so
//   the app takes its "tool not installed" paths.
//
// Writes land in the in-memory map only (nothing touches the real disk), so a
// run can edit freely and the next page load starts from the fixture again.

const HERE = dirname(fileURLToPath(import.meta.url))
export const FIXTURE_VAULT_DIR = resolve(HERE, "../fixtures/vault")
export const VAULT_PATH = "/home/tester/Documents/spectral-vault"
export const DEFAULT_TABS = [
  "papers/spectral-gap.md",
  "notes/mixing-times.md",
  "notes/nota-espanol.md",
]

export interface FakeVaultOptions {
  /** Settings merged over the app defaults (stored in `comdtex_settings`). */
  settings?: Record<string, unknown>
  /** Vault-relative tab paths to open; the first listed with `active` wins. */
  tabs?: string[]
  /** Vault-relative path of the active tab. */
  active?: string
  /** Seed the vault (path, tabs, recents). False leaves localStorage empty (welcome screen). */
  open?: boolean
  /** Extra localStorage entries. */
  storage?: Record<string, string>
  /**
   * Canned git for the Git panel (`plugin:shell|execute` with program `git`).
   * Unset keeps git "not installed". `repo` is a dirty repo with a remote, one
   * commit behind and two ahead; `conflict` is a merge with an unmerged file;
   * `not-repo` answers like a folder that is not a repository.
   */
  git?: "repo" | "conflict" | "not-repo"
  /**
   * Fake a Dropbox install. `banner`: the client exists but the vault is not
   * inside it (the "move your vault" banner). `conflicts`: the vault is inside
   * it and holds three conflicted copies (the Sync panel's list).
   */
  cloud?: "banner" | "conflicts"
  /** Extra vault files (vault-relative path to text). ASCII only; a `.pdf` is served to pdf.js. */
  files?: Record<string, string>
}

function collect(dir: string, base: string, out: Record<string, string>) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collect(full, base, out)
    else out[relative(base, full)] = readFileSync(full, "utf8")
  }
}

export function readFixtureFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  collect(FIXTURE_VAULT_DIR, FIXTURE_VAULT_DIR, files)
  return files
}

export async function installFakeVault(page: Page, options: FakeVaultOptions = {}) {
  const open = options.open ?? true
  const tabs = (options.tabs ?? DEFAULT_TABS).map((p) => `${VAULT_PATH}/${p}`)
  const active = `${VAULT_PATH}/${options.active ?? options.tabs?.[0] ?? DEFAULT_TABS[0]}`
  const storage: Record<string, string> = { comdtex_onboarding_seen: "true", ...options.storage }
  if (open) {
    storage.comdtex_vault = VAULT_PATH
    storage.comdtex_recent_vaults = JSON.stringify([VAULT_PATH])
    storage.comdtex_tabs = JSON.stringify(tabs)
    storage.comdtex_active = active
  } else {
    storage.comdtex_recent_vaults = JSON.stringify([VAULT_PATH])
  }
  storage.comdtex_settings = JSON.stringify({ language: "en", ...options.settings })
  const files = readFixtureFiles()
  const home = "/home/tester"
  const extra: Record<string, string> = {}
  if (options.cloud === "banner") {
    extra[`${home}/.dropbox/info.json`] = JSON.stringify({ personal: { path: `${home}/Dropbox` } })
    extra[`${home}/Dropbox/.keep`] = ""
  }
  if (options.cloud === "conflicts") {
    extra[`${home}/.dropbox/info.json`] = JSON.stringify({
      personal: { path: `${home}/Documents` },
    })
    extra["notes/mixing-times (conflicted copy 2026-10-18).md"] = "# Mixing times\n\nOlder edit.\n"
    extra["papers/spectral-gap (Ada's conflicted copy 2026-10-17).md"] =
      "# Spectral gap\n\nEdit from the laptop.\n"
    extra["notes/lost-idea (conflicted copy 2026-10-12).md"] = "# Lost idea\n"
  }
  Object.assign(files, extra, options.files)

  await page.addInitScript(
    ({ files, vaultPath, storage, git }) => {
      const w = window as unknown as Record<string, unknown>
      const HOME = "/home/tester"
      const MTIME = Date.UTC(2026, 9, 18, 10, 0, 0)
      const enc = new TextEncoder()
      const dec = new TextDecoder()

      type Entry = { dir: boolean; text: string; mtime: number }
      const fs = new Map<string, Entry>()
      const addDirs = (p: string) => {
        const parts = p.split("/").filter(Boolean)
        let cur = ""
        for (const part of parts) {
          cur += `/${part}`
          if (!fs.has(cur)) fs.set(cur, { dir: true, text: "", mtime: MTIME })
        }
      }
      addDirs(vaultPath)
      for (const [rel, text] of Object.entries(files)) {
        const full = rel.startsWith("/") ? rel : `${vaultPath}/${rel}`
        addDirs(full.slice(0, full.lastIndexOf("/")))
        fs.set(full, { dir: false, text, mtime: MTIME })
      }

      const norm = (p: string) => {
        const out: string[] = []
        for (const part of p.split("/")) {
          if (!part || part === ".") continue
          if (part === "..") out.pop()
          else out.push(part)
        }
        return `/${out.join("/")}`
      }
      const bytes = (s: string) => enc.encode(s).buffer
      const info = (e: Entry) => ({
        isFile: !e.dir,
        isDirectory: e.dir,
        isSymlink: false,
        size: enc.encode(e.text).length,
        mtime: e.mtime,
        atime: e.mtime,
        birthtime: e.mtime,
        readonly: false,
        fileAttributes: null,
        dev: 1,
        ino: 1,
        mode: 0o644,
        nlink: 1,
        uid: 1000,
        gid: 1000,
        rdev: 0,
        blksize: 4096,
        blocks: 8,
      })
      const missing = (p: string) => new Error(`No such file or directory (os error 2): ${p}`)
      const get = (p: string) => {
        const e = fs.get(norm(p))
        if (!e) throw missing(p)
        return e
      }

      // Canned git output, keyed on the subcommand after `-C <vault>`.
      const fakeGit = (all: string[]) => {
        const at = all.indexOf("-C")
        const [sub, ...rest] = at >= 0 ? all.slice(at + 2) : all
        const ok = (stdout = "") => ({ code: 0, signal: null, stdout, stderr: "" })
        if (git === "not-repo")
          return {
            code: 128,
            signal: null,
            stdout: "",
            stderr: "fatal: not a git repository (or any of the parent directories): .git",
          }
        const conflict = git === "conflict"
        switch (sub) {
          case "status": {
            const head = conflict
              ? "## main...origin/main [ahead 1, behind 1]"
              : "## main...origin/main [ahead 2, behind 1]"
            const rows = conflict
              ? ["UU notes/mixing-times.md", "M  papers/spectral-gap.md", "?? scratch/todo.md"]
              : [
                  "M  papers/spectral-gap.md",
                  "A  notes/new-idea.md",
                  "R  notes/cheeger-inequality.md",
                  "notes/cheeger.md",
                  " M notes/mixing-times.md",
                  " M references.bib",
                  " D notes/old-draft.md",
                  "?? scratch/todo.md",
                  "?? figures/expander.svg",
                ]
            return ok([head, ...rows].join("\0") + "\0")
          }
          case "remote":
            return rest[0] === "-v"
              ? ok(
                  "origin\thttps://github.com/ada-tester/spectral-vault.git (fetch)\n" +
                    "origin\thttps://github.com/ada-tester/spectral-vault.git (push)\n",
                )
              : ok("origin\n")
          case "branch":
            return ok("main\nfeature/cheeger-bounds\nreview/referee-2\n")
          case "log":
            return ok(
              [
                "9f3c2ab Tighten the Cheeger bound in section 3",
                "4be71d0 Add expander figure and caption",
                "c08a5e6 Rewrite abstract for the resubmission",
                "71d9f42 Fix broken @eq reference in the proof",
                "2ae0b13 Import references from Zotero",
              ].join("\n") + "\n",
            )
          case "config":
            return ok(rest[0] === "user.email" ? "ada@example.org\n" : "Ada Tester\n")
          case "stash":
            return ok("stash@{0}: WIP on main: 9f3c2ab Tighten the Cheeger bound\n")
          case "diff":
            return ok(
              [
                "diff --git a/notes/mixing-times.md b/notes/mixing-times.md",
                "index 3b1c2d4..8e7f9a0 100644",
                "--- a/notes/mixing-times.md",
                "+++ b/notes/mixing-times.md",
                "@@ -12,3 +12,4 @@ Mixing times",
                " The spectral gap controls the mixing time.",
                "-It is at most the inverse gap.",
                "+It is at most the inverse gap times a log factor.",
                "+See also the Cheeger inequality.",
              ].join("\n") + "\n",
            )
          default:
            return ok()
        }
      }

      // Calls are recorded so a spec can assert on them if it wants to.
      const calls: string[] = []
      w.__FAKE_CALLS__ = calls
      w.__FAKE_FS__ = fs

      const invoke = async (
        cmd: string,
        args: Record<string, unknown> | Uint8Array = {},
        options?: { headers?: Record<string, string> },
      ) => {
        calls.push(cmd)
        const a = (args ?? {}) as Record<string, unknown>
        const p = typeof a.path === "string" ? (a.path as string) : ""
        switch (cmd) {
          case "allow_vault_dir":
            return null
          case "get_secret":
            return null
          case "set_secret":
          case "delete_secret":
            return null
          case "plugin:fs|read_dir": {
            const dir = norm(p)
            get(dir)
            const prefix = dir === "/" ? "/" : `${dir}/`
            const out: unknown[] = []
            for (const [path, e] of fs) {
              if (!path.startsWith(prefix)) continue
              const rest = path.slice(prefix.length)
              if (!rest || rest.includes("/")) continue
              out.push({ name: rest, isDirectory: e.dir, isFile: !e.dir, isSymlink: false })
            }
            return out
          }
          case "plugin:fs|read_text_file":
          case "plugin:fs|read_file": {
            const e = get(p)
            if (e.dir) throw new Error(`Is a directory (os error 21): ${p}`)
            return bytes(e.text)
          }
          case "plugin:fs|stat":
          case "plugin:fs|lstat":
            return info(get(p))
          case "plugin:fs|exists":
            return fs.has(norm(p))
          case "plugin:fs|size":
            return enc.encode(get(p).text).length
          case "plugin:fs|write_text_file":
          case "plugin:fs|write_file": {
            const target = decodeURIComponent(options?.headers?.path ?? "")
            const data = args instanceof Uint8Array ? args : new Uint8Array(0)
            const full = norm(target)
            addDirs(full.slice(0, full.lastIndexOf("/")))
            fs.set(full, { dir: false, text: dec.decode(data), mtime: Date.now() })
            return null
          }
          case "plugin:fs|mkdir":
            addDirs(norm(p))
            return null
          case "plugin:fs|remove": {
            const full = norm(p)
            for (const k of [...fs.keys()]) if (k === full || k.startsWith(`${full}/`)) fs.delete(k)
            return null
          }
          case "plugin:fs|rename": {
            const from = norm(a.oldPath as string)
            const to = norm(a.newPath as string)
            for (const k of [...fs.keys()]) {
              if (k === from || k.startsWith(`${from}/`)) {
                fs.set(to + k.slice(from.length), fs.get(k)!)
                fs.delete(k)
              }
            }
            return null
          }
          case "plugin:fs|copy_file": {
            const e = get(a.fromPath as string)
            fs.set(norm(a.toPath as string), { ...e, mtime: Date.now() })
            return null
          }
          case "plugin:fs|watch":
            return 1
          case "plugin:path|join":
          case "plugin:path|resolve":
            return norm((a.paths as string[]).join("/"))
          case "plugin:path|normalize":
            return norm(p)
          case "plugin:path|dirname": {
            const n = norm(p)
            return n.slice(0, n.lastIndexOf("/")) || "/"
          }
          case "plugin:path|basename": {
            let b = norm(p).split("/").pop() ?? ""
            if (typeof a.ext === "string" && b.endsWith(a.ext)) b = b.slice(0, -a.ext.length)
            return b
          }
          case "plugin:path|extname": {
            const b = norm(p).split("/").pop() ?? ""
            const i = b.lastIndexOf(".")
            return i > 0 ? b.slice(i + 1) : ""
          }
          case "plugin:path|resolve_directory":
            return HOME
          case "plugin:event|listen":
            return 1
          case "plugin:event|unlisten":
          case "plugin:event|emit":
            return null
          case "plugin:dialog|open":
          case "plugin:dialog|save":
            return null
          default:
            if (cmd === "plugin:shell|execute" && a.program === "git" && git) {
              return fakeGit((a.args as string[]) ?? [])
            }
            if (cmd.startsWith("plugin:shell|")) {
              // pandoc, zip, git, typst, latex engines: "not installed".
              throw new Error(`program not found: ${cmd}`)
            }
            return null
        }
      }

      const blobUrls = new Map<string, string>()
      w.__TAURI_INTERNALS__ = {
        invoke,
        transformCallback: () => 0,
        unregisterCallback: () => {},
        // Local images: serve vault SVGs inline so figures render in the preview.
        convertFileSrc: (path: string) => {
          const e = fs.get(norm(decodeURIComponent(path)))
          // The sanitizer rejects data:image/svg+xml on purpose (inline SVG can
          // carry script); a blob: URL is on its media allowlist, like Tauri's asset: URLs.
          if (e && !e.dir && path.endsWith(".svg")) {
            let url = blobUrls.get(path)
            if (!url) {
              url = URL.createObjectURL(new Blob([e.text], { type: "image/svg+xml" }))
              blobUrls.set(path, url)
            }
            return url
          }
          if (e && !e.dir && path.endsWith(".pdf"))
            return `data:application/pdf;base64,${btoa(e.text)}`
          return ""
        },
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
      }

      try {
        for (const [k, v] of Object.entries(storage)) {
          if (
            localStorage.getItem(k) === null ||
            sessionStorage.getItem("__fake_seeded__") === null
          )
            localStorage.setItem(k, v)
        }
        sessionStorage.setItem("__fake_seeded__", "1")
      } catch {
        /* storage unavailable */
      }
    },
    { files, vaultPath: VAULT_PATH, storage, git: options.git ?? null },
  )
}
