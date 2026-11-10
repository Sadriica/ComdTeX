// Disk side of the welcome files: seed a new vault, update an outdated copy,
// restore on request. The filesystem comes in as a small interface so the
// rules can be tested without Tauri; useVault.ts passes the real one.
//
// Data safety: nothing the owner wrote is ever lost. A file is overwritten
// only when it is an untouched template; otherwise its text is first written
// to `name-old.ext` beside it.

import type { Lang } from "../i18n/types"
import {
  WELCOME_FILENAME,
  backupCandidate,
  classifyWelcome,
  exampleFiles,
  welcomeContent,
  type WelcomeFile,
} from "./index"

export interface WelcomeFs {
  /** File text, or null when it does not exist (or cannot be read). */
  read(path: string): Promise<string | null>
  /** Atomic write of a new or existing file. */
  write(path: string, content: string): Promise<void>
  /** Recursive mkdir. */
  mkdir(path: string): Promise<void>
}

export type EnsureOutcome =
  /** First time in this vault: the welcome and example files were written. */
  | { kind: "created" }
  /** An older template was replaced. `backup` holds the old text when it had changes. */
  | { kind: "updated"; backup: string | null }
  /** Current, or the owner's own note now: left as it is. */
  | { kind: "kept" }
  /** The owner deleted it after it was seeded: not recreated. */
  | { kind: "absent" }

const join = (vault: string, rel: string) => `${vault.replace(/[\\/]+$/, "")}/${rel}`
const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"))

async function writeFile(fs: WelcomeFs, vault: string, file: WelcomeFile): Promise<void> {
  const path = join(vault, file.path)
  if (file.path.includes("/")) await fs.mkdir(dirOf(path))
  await fs.write(path, file.content)
}

/** Keep `text` beside `path` under the first free `-old` name; returns that path. */
async function keepCopy(fs: WelcomeFs, path: string, text: string): Promise<string> {
  for (let attempt = 1; attempt < 1000; attempt++) {
    const candidate = backupCandidate(path, attempt)
    if ((await fs.read(candidate)) === null) {
      await fs.write(candidate, text)
      return candidate
    }
  }
  throw new Error(`no free backup name for ${path}`)
}

/** Example files that are missing; existing ones are never touched here. */
async function writeMissingExamples(fs: WelcomeFs, vault: string, lang: Lang): Promise<void> {
  for (const file of exampleFiles(lang)) {
    if ((await fs.read(join(vault, file.path))) === null) await writeFile(fs, vault, file)
  }
}

/**
 * Runs on every vault open, before tabs are restored (so an open tab reads
 * the new text). `seededBefore` says whether this vault already received the
 * welcome file once, which is how a deletion is told apart from a new vault.
 */
export async function ensureWelcome(
  fs: WelcomeFs,
  vault: string,
  lang: Lang,
  seededBefore: boolean,
): Promise<EnsureOutcome> {
  const path = join(vault, WELCOME_FILENAME)
  const existing = await fs.read(path)

  if (existing === null) {
    if (seededBefore) return { kind: "absent" }
    await fs.write(path, welcomeContent(lang))
    await writeMissingExamples(fs, vault, lang)
    return { kind: "created" }
  }

  const state = classifyWelcome(existing)
  if (state.kind !== "outdated") return { kind: "kept" }

  const backup = state.pristine ? null : await keepCopy(fs, path, existing)
  await fs.write(path, welcomeContent(lang))
  await writeMissingExamples(fs, vault, lang)
  return { kind: "updated", backup }
}

/**
 * The palette command: write every welcome and example file fresh. A file
 * that already matches is skipped, an untouched old welcome is replaced, and
 * anything else is kept as `-old` first. Returns the files written and the
 * backups made, as full paths.
 */
export async function restoreWelcome(
  fs: WelcomeFs,
  vault: string,
  lang: Lang,
): Promise<{ written: string[]; backups: string[] }> {
  const written: string[] = []
  const backups: string[] = []
  const files: WelcomeFile[] = [
    { path: WELCOME_FILENAME, content: welcomeContent(lang) },
    ...exampleFiles(lang),
  ]
  for (const file of files) {
    const path = join(vault, file.path)
    const existing = await fs.read(path)
    if (existing === file.content) continue
    if (existing !== null) {
      const state = file.path === WELCOME_FILENAME ? classifyWelcome(existing) : null
      const untouched = state?.kind === "outdated" && state.pristine
      if (!untouched) backups.push(await keepCopy(fs, path, existing))
    }
    await writeFile(fs, vault, file)
    written.push(path)
  }
  return { written, backups }
}
