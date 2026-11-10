// The welcome file (`comdtex.md`) and the example files it links to.
//
// A vault gets them the first time ComdTeX opens it. They live here as plain
// Markdown and data files (imported raw), so they can be read, linted and
// rendered by tests like any other note. Everything is pure: useVault.ts does
// the disk work.
//
// Versioning. Each template carries `<!-- comdtex-welcome: N -->`. Copies
// written before version 2 have no marker and were Spanish only; nobody ever
// received an update, because the file was only created when missing. Now an
// outdated copy is replaced on open: silently when it is an untouched old
// template, and with the old text kept beside it when it was edited. A copy
// that no longer looks like the template at all is left alone.
//
// When bumping WELCOME_VERSION, add the line keys of the version being
// replaced (both languages) to legacyLines.ts, or edited copies of it will be
// read as the owner's own notes and never updated.

import type { Lang } from "../i18n/types"
import { LEGACY_LINE_KEYS } from "./legacyLines"
import welcomeEn from "./comdtex.en.md?raw"
import welcomeEs from "./comdtex.es.md?raw"
import biologyEn from "./biology.en.md?raw"
import biologyEs from "./biology.es.md?raw"
import growthCsv from "./growth.csv?raw"
import statsCsv from "./stats.csv?raw"
import modelJson from "./model.json?raw"
import figureSvg from "./figure.svg?raw"
import noFileEn from "./no-file.en.md?raw"
import noFileEs from "./no-file.es.md?raw"

export const WELCOME_VERSION = 2
export const WELCOME_FILENAME = "comdtex.md"
export const EXAMPLES_DIR = "comdtex-examples"

/** A file to write, relative to the vault root, with "/" separators. */
export interface WelcomeFile {
  path: string
  content: string
}

const WELCOME: Record<Lang, string> = { en: welcomeEn, es: welcomeEs }
const BIOLOGY: Record<Lang, string> = { en: biologyEn, es: biologyEs }

const NO_FILE: Record<Lang, string> = { en: noFileEn, es: noFileEs }

/** What the preview shows while no file is open (not written to disk). */
export function noFileContent(lang: Lang): string {
  return NO_FILE[lang]
}

/** The welcome file alone, in the interface language. */
export function welcomeContent(lang: Lang): string {
  return WELCOME[lang]
}

/** The files the welcome file links to and reads (notes, data, the figure). */
export function exampleFiles(lang: Lang): WelcomeFile[] {
  return [
    { path: `${EXAMPLES_DIR}/comdtex-biology.md`, content: BIOLOGY[lang] },
    { path: `${EXAMPLES_DIR}/growth.csv`, content: growthCsv },
    { path: `${EXAMPLES_DIR}/stats.csv`, content: statsCsv },
    { path: `${EXAMPLES_DIR}/model.json`, content: modelJson },
    { path: `${EXAMPLES_DIR}/figure.svg`, content: figureSvg },
  ]
}

const MARKER_RE = /<!--\s*comdtex-welcome:\s*(\d+)\s*-->/

/** The version a welcome file declares, or 0 for copies from before markers. */
export function welcomeVersion(text: string): number {
  const m = MARKER_RE.exec(text.slice(0, 2000))
  return m ? parseInt(m[1], 10) : 0
}

/** Letters and digits only, lowercased: robust to dashes, spacing and quotes. */
function lineKey(line: string): string {
  return line.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}

let knownKeys: Set<string> | null = null
function known(): Set<string> {
  if (!knownKeys) {
    knownKeys = new Set(LEGACY_LINE_KEYS)
    for (const text of [...Object.values(WELCOME)]) {
      for (const line of text.split("\n")) {
        const k = lineKey(line)
        if (k) knownKeys.add(k)
      }
    }
  }
  return knownKeys
}

/**
 * - `current`: this version or newer, leave it.
 * - `outdated`: an older template. `pristine` when every line comes from a
 *   template we shipped, so replacing it loses nothing.
 * - `custom`: below 90% template lines, the owner's own note now.
 */
export type WelcomeState =
  { kind: "current" } | { kind: "outdated"; pristine: boolean } | { kind: "custom" }

export function classifyWelcome(text: string): WelcomeState {
  if (welcomeVersion(text) >= WELCOME_VERSION) return { kind: "current" }
  const keys = text.split("\n").map(lineKey).filter(Boolean)
  if (keys.length < 20) return { kind: "custom" }
  const set = known()
  const unknown = keys.filter((k) => !set.has(k)).length
  if (unknown / keys.length > 0.1) return { kind: "custom" }
  return { kind: "outdated", pristine: unknown === 0 }
}

/**
 * Where to keep a file before overwriting it: `name-old.ext` beside it for
 * attempt 1, then `name-old-2.ext` and so on. Paths use "/".
 */
export function backupCandidate(path: string, attempt: number): string {
  const slash = path.lastIndexOf("/")
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ""
  const base = path.slice(slash + 1)
  const dot = base.lastIndexOf(".")
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ""
  return `${dir}${stem}-old${attempt === 1 ? "" : `-${attempt}`}${ext}`
}
