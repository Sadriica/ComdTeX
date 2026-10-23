/**
 * Where a new file goes and what it may be called.
 *
 * Pure functions shared by every flow that creates or renames something (the
 * file tree's inline row, the palette's "Create note" row, the quick fix, the
 * template picker), so the destination rule and the validation never differ
 * between them.
 */
import { pathDirname } from "./pathUtils"
import type { T } from "./i18n"

/** Extensions a typed file name may carry; anything else gets `.md` appended. */
export const CREATE_FILE_EXTS = ["md", "tex", "bib", "csv", "typ"] as const

export type NameKind = "file" | "folder"

/** Why a name was refused. The UI maps each code to a translated message. */
export type NameProblem =
  "empty" | "tooLong" | "invalidChars" | "dotOnly" | "edge" | "reserved" | "exists" | "existsCase"

const SEP = /[/\\]/
// Windows refuses < > : " | ? * and both slashes; control characters are never
// sensible in a file name on any system.
const INVALID_CHARS = /[<>:"|?*\\/\u0000-\u001f]/
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i

function isUnder(path: string, dir: string): boolean {
  const d = dir.replace(/[/\\]+$/, "")
  return path === d || path.startsWith(`${d}/`) || path.startsWith(`${d}\\`)
}

/**
 * The folder a new file or folder is created in.
 *
 *   1. the selected folder, if a folder is selected;
 *   2. else the folder of the selected file;
 *   3. else the folder of the active note;
 *   4. else the vault root.
 *
 * Anything outside the vault falls back to the root.
 */
export function targetFolder(opts: {
  vaultRoot: string
  /** The row selected in the file tree (a folder or a file), if any. */
  selectedPath?: string | null
  selectedIsDir?: boolean
  /** The note open in the editor. */
  activePath?: string | null
}): string {
  const { vaultRoot, selectedPath, selectedIsDir, activePath } = opts
  let dir = vaultRoot
  if (selectedPath) dir = selectedIsDir ? selectedPath : pathDirname(selectedPath)
  else if (activePath) dir = pathDirname(activePath)
  if (!dir || !isUnder(dir, vaultRoot)) return vaultRoot
  return dir.replace(/[/\\]+$/, "") || vaultRoot
}

/** `papers/sub` for an absolute folder inside the vault; "" for the root. */
export function relativeFolder(vaultRoot: string, dir: string): string {
  const root = vaultRoot.replace(/[/\\]+$/, "")
  if (dir === root || !isUnder(dir, root)) return ""
  return dir.slice(root.length + 1).replace(/\\/g, "/")
}

/** `papers/draft.md`-style display path of a new item. */
export function displayDestination(folderRel: string, fileName: string): string {
  return folderRel ? `${folderRel}/${fileName}` : fileName
}

/** True when `name` already ends with an extension a new file may keep. */
export function hasCreatableExtension(name: string): boolean {
  const ext = /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase()
  return !!ext && (CREATE_FILE_EXTS as readonly string[]).includes(ext)
}

/**
 * The name a typed file name really becomes: `draft` -> `draft.md`,
 * `refs.bib` stays. Folders are left as typed.
 */
export function finalName(typed: string, kind: NameKind): string {
  if (kind === "folder") return typed
  return hasCreatableExtension(typed) ? typed : `${typed}.md`
}

/**
 * Check a new (or renamed) name against the rules of every supported system
 * and the siblings already in the folder.
 *
 * `typed` is what the user typed, untrimmed: a leading or trailing space or dot
 * is refused rather than silently stripped, because Windows drops them and the
 * file would end up named differently from what the user sees.
 *
 * `siblings` are the names in the destination folder. `selfName`, when
 * renaming, is the item's current name: it never conflicts with itself, and a
 * case-only change of it is allowed.
 */
export function validateName(
  typed: string,
  kind: NameKind,
  siblings: readonly string[],
  selfName?: string,
): NameProblem | null {
  if (typed === "") return "empty"
  if (typed.trim() === "") return "edge"
  const name = finalName(typed, kind)
  if (name.length > 255) return "tooLong"
  if (INVALID_CHARS.test(name)) return "invalidChars"
  if (/^\.+$/.test(typed)) return "dotOnly"
  if (/^[\s.]|[\s.]$/.test(typed)) return "edge"
  if (SEP.test(name)) return "invalidChars"
  if (RESERVED.test(name)) return "reserved"
  const lower = name.toLowerCase()
  for (const sibling of siblings) {
    if (sibling === selfName) continue
    if (sibling === name) return "exists"
    if (sibling.toLowerCase() === lower) {
      // A case-only rename of the very same entry is fine.
      if (selfName !== undefined && selfName.toLowerCase() === lower) continue
      return "existsCase"
    }
  }
  return null
}

/**
 * Cursor position for a freshly created note: where the author starts typing.
 * `{{cursor}}` in a template marks it explicitly (and is removed by the caller
 * with `stripCursorMarker`). Otherwise the line under the first heading, or the
 * end of the document when there is no heading.
 */
export function initialCursorFor(content: string): { line: number; column: number } {
  const marker = content.indexOf("{{cursor}}")
  if (marker >= 0) {
    const before = content.slice(0, marker).split("\n")
    return { line: before.length, column: before[before.length - 1].length + 1 }
  }
  const lines = content.split("\n")
  let i = 0
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === "---")
    i = end >= 0 ? end + 1 : 0
  }
  for (; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      const next = i + 1
      if (next < lines.length) return { line: next + 1, column: 1 }
      return { line: i + 1, column: lines[i].length + 1 }
    }
  }
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 }
}

/** Removes the `{{cursor}}` marker from template content. */
export function stripCursorMarker(content: string): string {
  return content.replace(/\{\{cursor\}\}/g, "")
}

/** The translated message for a problem; `name` is what the user typed or the final name. */
export function nameProblemText(
  messages: T["naming"]["problems"],
  problem: NameProblem,
  name: string,
): string {
  if (problem === "exists" || problem === "existsCase") return messages[problem](name)
  return messages[problem]
}

/** Every ancestor folder of `path` that lies inside `vaultRoot` (outermost first). */
export function ancestorFolders(vaultRoot: string, path: string): string[] {
  const out: string[] = []
  let dir = pathDirname(path)
  const root = vaultRoot.replace(/[/\\]+$/, "")
  while (dir && dir !== root && isUnder(dir, root)) {
    out.unshift(dir)
    dir = pathDirname(dir)
  }
  return out
}
