// Live data the completion sources read. App.tsx pushes updates through the
// `update*` functions (mirrored from monacoSetup.ts); sources only read here.
// Everything expensive is precomputed in the update functions so a provider
// call stays a filter over ready-made arrays.

import { en } from "../i18n/en"
import { es } from "../i18n/es"
import { getUiLanguage } from "../docLang"
import type { StructuralLabel, StructuralLabelIndex } from "../structuralLabels"
import type { Completion } from "./catalog"

export function completionText() {
  return (getUiLanguage() === "en" ? en : es).completion
}

// ── User snippets and macros ─────────────────────────────────────────────────

let userSnippets: Completion[] = []
export function updateUserSnippets(snippets: Completion[]) {
  userSnippets = snippets
}
export const getUserSnippets = () => userSnippets

let macroCompletions: string[] = []
export function updateMacroCompletions(macros: string[]) {
  macroCompletions = macros
}
export const getMacroCompletions = () => macroCompletions

let katexMacros: () => Record<string, string> = () => ({})
/** Where label previews read the document's KaTeX macros (same source as the math hover). */
export function setCompletionKatexMacros(getter: () => Record<string, string>) {
  katexMacros = getter
}
export const getKatexMacros = () => katexMacros()

let currentFile: string | null = null
/** Path of the file the editor shows; label completion ranks its labels first. */
export function setCompletionCurrentFile(path: string | null) {
  currentFile = path
}
export const getCurrentFile = () => currentFile

// ── Vault files ──────────────────────────────────────────────────────────────

export interface VaultFileInput {
  path: string
  name: string
  ext?: string
}

export interface VaultDoc {
  path: string
  /** Vault-relative path with forward slashes and no extension. */
  rel: string
  /** File name without extension, original case. */
  base: string
  baseLc: string
  relLc: string
  /** Folder part of `rel` ("" for the vault root). */
  dir: string
  /** What to write inside `[[ ]]`: the name, or the shortest unique path. */
  wikiTarget: string
}

export interface VaultCsv {
  path: string
  name: string
  /** Shortest unique path with extension, as a `:::csv` block can write it. */
  target: string
  dir: string
}

let vaultRoot = ""
let vaultDocs: VaultDoc[] = []
let vaultCsvs: VaultCsv[] = []

function normalize(path: string): string {
  return path.replace(/\\/g, "/")
}

function relativeTo(root: string, path: string): string {
  const p = normalize(path)
  const r = normalize(root).replace(/\/+$/, "")
  return r && p.startsWith(r + "/") ? p.slice(r.length + 1) : p.replace(/^\/+/, "")
}

/** For each item, the shortest trailing path (by segments) no other item in its group shares. */
function shortestUnique(groups: Map<string, string[][]>): Map<string[], string> {
  const out = new Map<string[], string>()
  for (const items of groups.values()) {
    for (const segs of items) {
      let chosen = segs.join("/")
      for (let n = 1; n <= segs.length; n++) {
        const suffix = segs.slice(-n).join("/").toLowerCase()
        const clash = items.some(
          (other) => other !== segs && other.slice(-n).join("/").toLowerCase() === suffix,
        )
        if (!clash) {
          chosen = segs.slice(-n).join("/")
          break
        }
      }
      out.set(segs, chosen)
    }
  }
  return out
}

export function updateVaultFiles(files: VaultFileInput[], root: string) {
  vaultRoot = root
  const docs: { file: VaultFileInput; segs: string[] }[] = []
  const csvs: { file: VaultFileInput; segs: string[] }[] = []
  for (const file of files) {
    const rel = relativeTo(root, file.path)
    const ext = (file.ext ?? file.name.split(".").pop() ?? "").toLowerCase()
    if (ext === "md" || ext === "tex")
      docs.push({ file, segs: rel.replace(/\.[^./]+$/, "").split("/") })
    else if (ext === "csv") csvs.push({ file, segs: rel.split("/") })
  }

  const docGroups = new Map<string, string[][]>()
  for (const d of docs) {
    const key = d.segs[d.segs.length - 1].toLowerCase()
    const list = docGroups.get(key) ?? []
    list.push(d.segs)
    docGroups.set(key, list)
  }
  const docTargets = shortestUnique(docGroups)
  vaultDocs = docs
    .map(({ file, segs }) => ({
      path: file.path,
      rel: segs.join("/"),
      base: segs[segs.length - 1],
      baseLc: segs[segs.length - 1].toLowerCase(),
      relLc: segs.join("/").toLowerCase(),
      dir: segs.slice(0, -1).join("/"),
      wikiTarget: docTargets.get(segs) ?? segs.join("/"),
    }))
    .sort((a, b) => a.rel.localeCompare(b.rel))

  const csvGroups = new Map<string, string[][]>()
  for (const c of csvs) {
    const key = c.segs[c.segs.length - 1].toLowerCase()
    const list = csvGroups.get(key) ?? []
    list.push(c.segs)
    csvGroups.set(key, list)
  }
  const csvTargets = shortestUnique(csvGroups)
  vaultCsvs = csvs
    .map(({ file, segs }) => ({
      path: file.path,
      name: file.name,
      target: csvTargets.get(segs) ?? segs.join("/"),
      dir: segs.slice(0, -1).join("/"),
    }))
    .sort((a, b) => a.target.localeCompare(b.target))
  relCache.clear()
}

export const getVaultDocs = () => vaultDocs
export const getVaultCsvs = () => vaultCsvs

const relCache = new Map<string, string>()
/** Vault-relative path without extension, as a cross-file env reference writes it. */
export function relPathOf(path: string): string {
  const hit = relCache.get(path)
  if (hit !== undefined) return hit
  const rel = relativeTo(vaultRoot, path).replace(/\.[^./]+$/, "")
  relCache.set(path, rel)
  return rel
}

let csvResolver: (target: string) => string | null = () => null
/** Reads a vault CSV by the name a `:::csv` block writes (same resolver as the renderer). */
export function setCompletionCsvResolver(resolver: (target: string) => string | null) {
  csvResolver = resolver
}
export const resolveCsv = (target: string) => csvResolver(target)

// ── Citations ────────────────────────────────────────────────────────────────

export interface BibInput {
  key: string
  author?: string
  title?: string
  year?: string
  type?: string
  fields?: Record<string, string>
}

export interface BibEntry {
  key: string
  keyLc: string
  author: string
  title: string
  year: string
  type: string
  fields: Record<string, string>
  /** Lowercased "key author title year": what the pre-filter and Monaco's filterText search. */
  haystack: string
}

let bibEntries: BibEntry[] = []
export function updateBibSuggestions(entries: BibInput[]) {
  bibEntries = entries
    .map((e) => {
      const fields = e.fields ?? {}
      const author = e.author ?? fields.author ?? ""
      const title = e.title ?? fields.title ?? ""
      const year = e.year ?? fields.year ?? ""
      return {
        key: e.key,
        keyLc: e.key.toLowerCase(),
        author,
        title,
        year,
        type: e.type ?? "",
        fields,
        haystack: `${e.key} ${author} ${title} ${year}`.toLowerCase(),
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
}
export const getBibEntries = () => bibEntries

// ── Labels ───────────────────────────────────────────────────────────────────

export interface LabelEntry extends StructuralLabel {
  nameLc: string
  titleLc: string
}

let labelEntries: LabelEntry[] = []
let labelsByKind = new Map<string, LabelEntry[]>()
let headingsByPath = new Map<string, string[]>()
let knownIds = new Set<string>()

export function updateLabelIndex(index: Pick<StructuralLabelIndex, "labels" | "headings">) {
  labelEntries = index.labels.map((label) => ({
    ...label,
    nameLc: label.name.toLowerCase(),
    titleLc: (label.title ?? "").toLowerCase(),
  }))
  labelsByKind = new Map()
  knownIds = new Set()
  for (const entry of labelEntries) {
    const bucket = labelsByKind.get(entry.kind) ?? []
    bucket.push(entry)
    labelsByKind.set(entry.kind, bucket)
    knownIds.add(entry.id)
  }
  headingsByPath = index.headings
}
export const getLabelEntries = () => labelEntries
export const getLabelsOfKind = (kind: string) => labelsByKind.get(kind) ?? []
export const getHeadings = (path: string) => headingsByPath.get(path) ?? []
export const isKnownLabelId = (id: string) => knownIds.has(id)
