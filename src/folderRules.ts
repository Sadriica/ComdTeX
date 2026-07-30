/**
 * Per-folder rules — `.comdtex-folder.json`, stored inside the folder it governs.
 *
 * The point is that a folder can carry the conventions of the work that lives in
 * it: "every note here starts from the `clase` template, is named
 * `2026-07-28-titulo`, and carries `materia: Álgebra II`". A file kept next to
 * the notes (rather than a hidden central registry) is visible, diffable and
 * survives moving the folder between vaults.
 *
 * This module is pure — no React, no filesystem. `useVault` reads the files and
 * hands the parsed map in; everything here is a total function over that map, so
 * it is fully unit-testable.
 */
import { extractFrontmatter, serializeFrontmatter, type FrontmatterData } from "./frontmatter"
import { processTemplateVariables } from "./templates"

/** Filename that carries a folder's rules. Hidden from the tree and from search. */
export const FOLDER_RULES_FILENAME = ".comdtex-folder.json"

/** Marker that makes a file safe to overwrite when regenerating. */
export const GENERATED_MARKER = "<!-- comdtex:generated -->"

export type GeneratorType = "tasks" | "calendar" | "index"

export interface GeneratedFileRule {
  /** Filename, relative to the folder that owns the rules. */
  file: string
  type: GeneratorType
  /** "folder" (default) walks only this folder; "vault" walks everything. */
  scope: "folder" | "vault"
}

export interface FolderRules {
  version: number
  /** Template id or name applied to new files in this folder. */
  defaultTemplate?: string
  /** Name pattern for new files, in the `{{date:…}}`/`{{title}}` syntax. */
  filenamePattern?: string
  /** Frontmatter keys merged into new files (existing keys are NOT overwritten). */
  frontmatter?: FrontmatterData
  generated?: GeneratedFileRule[]
}

const GENERATOR_TYPES: readonly GeneratorType[] = ["tasks", "calendar", "index"]

/**
 * Parse a `.comdtex-folder.json` payload. Returns null when it is not usable.
 *
 * Deliberately tolerant: unknown keys are ignored and a malformed individual
 * rule is dropped rather than failing the whole file. A hand-edited config with
 * one typo should still apply everything else, not silently do nothing.
 */
export function parseFolderRules(json: string): FolderRules | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>

  const rules: FolderRules = { version: typeof obj.version === "number" ? obj.version : 1 }

  if (typeof obj.defaultTemplate === "string" && obj.defaultTemplate.trim()) {
    rules.defaultTemplate = obj.defaultTemplate.trim()
  }
  if (typeof obj.filenamePattern === "string" && obj.filenamePattern.trim()) {
    rules.filenamePattern = obj.filenamePattern.trim()
  }
  if (obj.frontmatter && typeof obj.frontmatter === "object" && !Array.isArray(obj.frontmatter)) {
    rules.frontmatter = obj.frontmatter as FrontmatterData
  }
  if (Array.isArray(obj.generated)) {
    const generated = obj.generated.flatMap((entry): GeneratedFileRule[] => {
      if (!entry || typeof entry !== "object") return []
      const e = entry as Record<string, unknown>
      const file = typeof e.file === "string" ? e.file.trim() : ""
      const type = e.type as GeneratorType
      // A generated file must stay inside its own folder — a rule pointing at
      // "../../notes.md" would let a config file write outside the folder the
      // user was looking at.
      if (!file || file.includes("/") || file.includes("\\") || file.includes("..")) return []
      if (!GENERATOR_TYPES.includes(type)) return []
      return [{ file, type, scope: e.scope === "vault" ? "vault" : "folder" }]
    })
    if (generated.length > 0) rules.generated = generated
  }

  return rules
}

/** Serialize rules back to the on-disk shape (stable key order, 2-space indent). */
export function serializeFolderRules(rules: FolderRules): string {
  const out: Record<string, unknown> = { version: rules.version || 1 }
  if (rules.defaultTemplate) out.defaultTemplate = rules.defaultTemplate
  if (rules.filenamePattern) out.filenamePattern = rules.filenamePattern
  if (rules.frontmatter && Object.keys(rules.frontmatter).length > 0) out.frontmatter = rules.frontmatter
  if (rules.generated && rules.generated.length > 0) out.generated = rules.generated
  return `${JSON.stringify(out, null, 2)}\n`
}

/**
 * The rules in effect for `dirPath`, merging every `.comdtex-folder.json` from
 * the vault root down. The NEAREST folder wins per field, so a subfolder can
 * override the naming pattern while still inheriting the parent's template.
 *
 * `rulesByDir` is keyed by absolute directory path. Returns null when no folder
 * on the path defines anything.
 */
export function resolveRulesForDir(
  rulesByDir: ReadonlyMap<string, FolderRules>,
  dirPath: string,
  vaultPath: string,
): FolderRules | null {
  if (rulesByDir.size === 0) return null
  const chain = ancestorChain(dirPath, vaultPath)
  // Root first, so each nearer folder overwrites the fields it defines.
  const applicable = chain
    .map((dir) => rulesByDir.get(dir))
    .filter((rules): rules is FolderRules => rules !== undefined)
  if (applicable.length === 0) return null

  const merged = applicable.reduce<FolderRules>((inherited, rules) => ({
    version: rules.version,
    defaultTemplate: rules.defaultTemplate ?? inherited.defaultTemplate,
    filenamePattern: rules.filenamePattern ?? inherited.filenamePattern,
    frontmatter: (rules.frontmatter || inherited.frontmatter)
      ? { ...inherited.frontmatter, ...rules.frontmatter }
      : undefined,
    generated: rules.generated,
  }), { version: 1 })
  // Generated files are NOT inherited: they name a concrete file inside the
  // folder that declared them, so inheriting would recreate a parent's index in
  // every subfolder. Only the target folder's own declaration survives — the
  // merge loop above would otherwise carry an ancestor's list down whenever the
  // target defines no rules of its own.
  const own = rulesByDir.get(chain[chain.length - 1])
  return { ...merged, generated: own?.generated }
}

/**
 * Absolute paths from `vaultPath` down to `dirPath`, inclusive, root first.
 * Returns just `[vaultPath]` when `dirPath` is outside the vault.
 */
export function ancestorChain(dirPath: string, vaultPath: string): string[] {
  const root = vaultPath.replace(/[/\\]+$/, "")
  const target = dirPath.replace(/[/\\]+$/, "")
  if (target === root) return [root]
  if (!target.startsWith(`${root}/`) && !target.startsWith(`${root}\\`)) return [root]

  const sep = target.includes("\\") && !target.includes("/") ? "\\" : "/"
  const relative = target.slice(root.length + 1)
  const chain = [root]
  let current = root
  for (const segment of relative.split(/[/\\]/)) {
    if (!segment) continue
    current = `${current}${sep}${segment}`
    chain.push(current)
  }
  return chain
}

/**
 * Filename for a new note, applying the folder's `filenamePattern`.
 *
 * `title` is whatever the user typed. When there is no pattern the name is
 * returned untouched — patterns are opt-in per folder.
 */
export function applyFilenamePattern(rules: FolderRules | null, title: string): string {
  const trimmed = title.trim()
  if (!rules?.filenamePattern) return trimmed
  const ext = /\.(md|tex|bib)$/i.exec(trimmed)?.[0] ?? ""
  const stem = ext ? trimmed.slice(0, -ext.length) : trimmed
  // `{{title}}` in processTemplateVariables resolves from the FILENAME argument,
  // so pass the stem as the filename to make the pattern's {{title}} the stem.
  const applied = processTemplateVariables(rules.filenamePattern, stem).trim()
  return `${applied || stem}${ext}`
}

/**
 * Merge the folder's default frontmatter into `content`.
 *
 * Keys the document already defines always win — the rules supply defaults for
 * a new note, they must never rewrite what the author wrote.
 */
export function applyFolderFrontmatter(rules: FolderRules | null, content: string): string {
  const defaults = rules?.frontmatter
  if (!defaults || Object.keys(defaults).length === 0) return content

  const existing = extractFrontmatter(content)
  if (!existing) {
    return `${serializeFrontmatter({ ...defaults })}\n\n${content}`
  }
  const merged: FrontmatterData = { ...defaults, ...existing.data }
  return `${serializeFrontmatter(merged)}\n\n${existing.content}`
}

/**
 * True when `content` may be overwritten by a generator.
 *
 * Regeneration must never destroy something a person wrote, so a target file is
 * only rewritten when it is empty or carries the generated marker.
 */
export function isGeneratedFile(content: string): boolean {
  return content.trim() === "" || content.includes(GENERATED_MARKER)
}
