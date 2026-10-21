// `@kind:name` reference completion (equations, figures, sections, tables,
// theorem-like environments, datasets), local and cross-file.
//
// Contexts, from the leading `@`:
//   @                    kind keywords and the vault paths that can be referenced
//   @thm:ma              labels of that kind, this file first
//   @gp/calendar@        kinds available in that note (path form)
//   @[my folder/note]@   the same, escaped form for paths with spaces
//   @gp/calendar@def:x   labels of that note only; the inner `@def:` is NOT a
//                        second, local reference (it used to offer local labels
//                        and insert a bare name)
//
// Only environments (`thm`, `lem`, `cor`, `prop`, `def`, `ex`, `exc`) can be
// referenced across files. An equation, figure, table or section of another
// file cannot be cited at all, so those are never offered from other files.

import type * as monacoApi from "monaco-editor"
import { crossFileRefText, refPathTarget } from "../crossFileRef"
import { envTitle, getUiLanguage } from "../docLang"
import {
  completionText,
  getCurrentFile,
  getKatexMacros,
  getLabelEntries,
  getLabelsOfKind,
  getVaultDocs,
  relPathOf,
  type LabelEntry,
} from "./state"
import { showSuggestPreview } from "./katexPreview"
import {
  RETRIGGER_COMMAND,
  type CompletionEnv,
  type CompletionModel,
  type CompletionSource,
} from "./types"
import { cachedByVersion, makeRange, MAX_ITEMS } from "./util"

export const KIND_ORDER = [
  "eq",
  "fig",
  "tbl",
  "sec",
  "thm",
  "lem",
  "cor",
  "prop",
  "def",
  "ex",
  "exc",
  "data",
] as const

/** Kinds an `@path@kind:name` reference can point at. */
export const CROSS_FILE_KINDS: ReadonlySet<string> = new Set([
  "thm",
  "lem",
  "cor",
  "prop",
  "def",
  "ex",
  "exc",
])

const KIND_ALIASES: Record<string, string> = {
  theorem: "thm",
  lemma: "lem",
  corollary: "cor",
  proposition: "prop",
  definition: "def",
  example: "ex",
  exercise: "exc",
  dataset: "data",
}

const KIND_ENV: Record<string, string> = {
  thm: "theorem",
  lem: "lemma",
  cor: "corollary",
  prop: "proposition",
  def: "definition",
  ex: "example",
  exc: "exercise",
}

export function canonicalKind(raw: string): string {
  const lower = raw.toLowerCase()
  return KIND_ALIASES[lower] ?? lower
}

// ── Context ──────────────────────────────────────────────────────────────────

export type RefContext =
  | { type: "starter"; start: number; partial: string }
  | { type: "bracket-path"; start: number; partial: string }
  | { type: "local"; start: number; kind: string; partial: string }
  | { type: "cross-kind"; start: number; path: string; partial: string; innerStart: number }
  | {
      type: "cross-label"
      start: number
      path: string
      kind: string
      partial: string
      innerStart: number
    }

/** Parse the reference being typed at the end of `before` (index = 0-based column). */
export function parseRefContext(before: string): RefContext | null {
  let m = /(?<![\w@])@\[([^\]\n]*)$/.exec(before)
  if (m) return { type: "bracket-path", start: m.index, partial: m[1] }

  m = /(?<![\w@])@(?:\[([^\]\n]*)\]|([\w./-]+))@([A-Za-z]*)(?::([\w.-]*))?$/.exec(before)
  if (m) {
    const path = m[1] ?? m[2]
    // Index of the inner `@` that introduces the kind.
    const tail = 1 + m[3].length + (m[4] !== undefined ? 1 + m[4].length : 0)
    const innerStart = m.index + m[0].length - tail
    if (m[4] !== undefined) {
      return {
        type: "cross-label",
        start: m.index,
        path,
        kind: canonicalKind(m[3]),
        partial: m[4],
        innerStart,
      }
    }
    return { type: "cross-kind", start: m.index, path, partial: m[3], innerStart }
  }

  m = /(?<![\w@])@([A-Za-z]+):([\w.-]*)$/.exec(before)
  if (m) return { type: "local", start: m.index, kind: canonicalKind(m[1]), partial: m[2] }

  m = /(?<![\w@])@([\p{L}\p{N}_./-]*)$/u.exec(before)
  if (m) return { type: "starter", start: m.index, partial: m[1] }
  return null
}

// ── The current file's own labels, read from the model ───────────────────────

const LABEL_RE = /\{#([a-zA-Z]+):([\w:.-]+)\}/g
const ENV_LINE = /^:::(?:sm\s+|lg\s+)?([A-Za-z][\w-]*)(?:\[([^\]]*)\])?/
const HEADING_LINE = /^#{1,6}\s+(.+?)\s*(?:\{#[\w:.-]+\}\s*)?$/

export interface OwnLabel {
  id: string
  kind: string
  name: string
  line: number
  envType?: string
  title?: string
}

/** Labels declared in the open document, straight from the text so a label typed a second ago counts. */
export function ownLabels(model: CompletionModel): OwnLabel[] {
  return cachedByVersion(model, "own-labels", () => {
    const out: OwnLabel[] = []
    const count = model.getLineCount()
    for (let n = 1; n <= count; n++) {
      const line = model.getLineContent(n)
      if (!line.includes("{#")) continue
      LABEL_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = LABEL_RE.exec(line)) !== null) {
        const kind = canonicalKind(m[1])
        const own: OwnLabel = { id: `${kind}:${m[2]}`, kind, name: m[2], line: n }
        const env = ENV_LINE.exec(line)
        if (env) {
          own.envType = env[1].toLowerCase()
          own.title = env[2]?.trim() || undefined
        } else {
          const heading = HEADING_LINE.exec(line)
          if (heading) own.title = heading[1]
        }
        out.push(own)
      }
    }
    return out
  })
}

/** Same-file entries: the live labels, enriched with number/preview from the scan. */
function sameFileEntries(model: CompletionModel, kind: string): LabelEntry[] {
  const current = getCurrentFile()
  const scanned = new Map<string, LabelEntry>()
  if (current) {
    for (const entry of getLabelsOfKind(kind)) {
      if (entry.filePath === current) scanned.set(entry.id, entry)
    }
  }
  const out: LabelEntry[] = []
  for (const own of ownLabels(model)) {
    if (own.kind !== kind) continue
    const base = scanned.get(own.id)
    const title = own.title ?? base?.title
    out.push({
      id: own.id,
      kind: kind as LabelEntry["kind"],
      name: own.name,
      filePath: current ?? "",
      fileName: base?.fileName ?? "",
      line: own.line,
      context: base?.context ?? "",
      envType: own.envType ?? base?.envType,
      title,
      number: base?.number,
      preview: base?.preview,
      nameLc: own.name.toLowerCase(),
      titleLc: (title ?? "").toLowerCase(),
    })
  }
  return out
}

// ── Items ────────────────────────────────────────────────────────────────────

function kindName(entry: Pick<LabelEntry, "kind" | "envType" | "number">): string {
  const t = completionText()
  const envType = entry.envType ?? KIND_ENV[entry.kind]
  const base = envType && KIND_ENV[entry.kind] ? envTitle(envType, getUiLanguage()) : ""
  const name = base || t.kindNames[entry.kind] || entry.kind
  if (!entry.number) return name
  return entry.kind === "eq" ? `${name} (${entry.number})` : `${name} ${entry.number}`
}

function refText(path: string, kind: string, name: string): string {
  return crossFileRefText(path, `${kind}:${name}`)
}

const itemEntry = new WeakMap<object, LabelEntry>()

function makeItem(
  env: CompletionEnv,
  entry: LabelEntry,
  opts: {
    range: monacoApi.IRange
    insertText: string
    filterText: string
    sortText: string
    sameFile: boolean
  },
): monacoApi.languages.CompletionItem {
  const t = completionText()
  const description = [kindName(entry), entry.title].filter(Boolean).join(" · ")
  const item: monacoApi.languages.CompletionItem = {
    label: { label: entry.name, description },
    kind: env.monaco.languages.CompletionItemKind.Reference,
    detail: opts.sameFile
      ? `${t.thisFile}:${entry.line}`
      : t.otherFileLine(relPathOf(entry.filePath), entry.line),
    insertText: opts.insertText,
    range: opts.range,
    sortText: opts.sortText,
    filterText: opts.filterText,
  }
  itemEntry.set(item, entry)
  return item
}

function matches(entry: LabelEntry, partialLc: string): boolean {
  return !partialLc || entry.nameLc.includes(partialLc) || entry.titleLc.includes(partialLc)
}

/**
 * How much of `after` (the text past the caret) is the rest of the label being
 * completed. A label is word characters with internal dots or hyphens, so a
 * trailing "." or "-" is punctuation of the sentence and stays: "see @thm:|."
 * keeps its period and "@lem:|-style" its "-style".
 */
export function labelTail(after: string, partial: string): number {
  const continues = partial === "" || !/\w$/.test(partial)
  const re = continues ? /^\w+(?:[.-]\w+)*/ : /^\w*(?:[.-]\w+)*/
  return re.exec(after)?.[0].length ?? 0
}

function pad(n: number): string {
  return String(n).padStart(6, "0")
}

function provideLocal(
  env: CompletionEnv,
  ctx: Extract<RefContext, { type: "local" }>,
): monacoApi.languages.CompletionList {
  const partialLc = ctx.partial.toLowerCase()
  const startCol = ctx.start + 1
  const range = makeRange(env, startCol, env.position.column + labelTail(env.after, ctx.partial))
  const suggestions: monacoApi.languages.CompletionItem[] = []

  const same = sameFileEntries(env.model, ctx.kind).filter((e) => matches(e, partialLc))
  for (const entry of same) {
    suggestions.push(
      makeItem(env, entry, {
        range,
        insertText: `@${ctx.kind}:${entry.name}`,
        filterText: `@${ctx.kind}:${entry.name} ${entry.title ?? ""}`,
        sortText: "0" + pad(entry.line),
        sameFile: true,
      }),
    )
  }

  let truncated = false
  // An equation, figure, table or section of another file cannot be cited, so
  // only environments and the like continue past this point.
  if (CROSS_FILE_KINDS.has(ctx.kind)) {
    const current = getCurrentFile()
    const others = getLabelsOfKind(ctx.kind)
    const names = new Set(same.map((e) => e.name))
    for (const entry of others) {
      if (entry.filePath === current) continue
      if (!matches(entry, partialLc)) continue
      if (suggestions.length >= MAX_ITEMS) {
        truncated = true
        break
      }
      const rel = relPathOf(entry.filePath)
      suggestions.push(
        makeItem(env, entry, {
          range,
          insertText: refText(rel, ctx.kind, entry.name),
          filterText: `@${ctx.kind}:${entry.name} ${entry.title ?? ""} ${rel}`,
          // Same file first, then other files grouped by file, in line order.
          sortText: "1" + rel.toLowerCase() + pad(entry.line) + (names.has(entry.name) ? "b" : "a"),
          sameFile: false,
        }),
      )
    }
  }
  return { suggestions, incomplete: truncated }
}

/** Entries of the note an `@path@` prefix names (suffix match, like the renderer). */
function entriesOfPath(path: string): LabelEntry[] {
  const p = path
    .trim()
    .toLowerCase()
    .replace(/^\.?\//, "")
  if (!p) return []
  return getLabelEntries().filter((e) => {
    const rel = relPathOf(e.filePath).toLowerCase()
    return rel === p || rel.endsWith("/" + p)
  })
}

function kindItems(
  env: CompletionEnv,
  kinds: string[],
  range: monacoApi.IRange,
  partialLc: string,
  counts?: Map<string, number>,
): monacoApi.languages.CompletionItem[] {
  const t = completionText()
  const out: monacoApi.languages.CompletionItem[] = []
  for (const kind of kinds) {
    if (partialLc && !kind.startsWith(partialLc)) continue
    const count = counts?.get(kind)
    const envType = KIND_ENV[kind]
    out.push({
      label: {
        label: `${kind}:`,
        description: envType ? envTitle(envType, getUiLanguage()) : t.kindNames[kind],
      },
      kind: env.monaco.languages.CompletionItemKind.Keyword,
      detail: count ? String(count) : undefined,
      insertText: `${kind}:`,
      range,
      sortText:
        (count ? "0" : "1") +
        String(KIND_ORDER.indexOf(kind as (typeof KIND_ORDER)[number])).padStart(2, "0"),
      command: RETRIGGER_COMMAND,
    })
  }
  return out
}

function provideStarter(
  env: CompletionEnv,
  ctx: Extract<RefContext, { type: "starter" }>,
): monacoApi.languages.CompletionList {
  const partialLc = ctx.partial.toLowerCase()
  const range = makeRange(env, ctx.start + 2)
  const counts = new Map<string, number>()
  for (const own of ownLabels(env.model)) counts.set(own.kind, (counts.get(own.kind) ?? 0) + 1)
  const suggestions = kindItems(env, [...KIND_ORDER], range, partialLc, counts)

  if (partialLc.length > 0) {
    suggestions.push(...pathItems(env, range, partialLc, false))
  }
  return { suggestions }
}

/** Notes that hold environments another file can reference. */
function referencablePaths(): Map<string, string> {
  const out = new Map<string, string>()
  const current = getCurrentFile()
  for (const entry of getLabelEntries()) {
    if (!CROSS_FILE_KINDS.has(entry.kind) || entry.filePath === current) continue
    if (!out.has(entry.filePath)) out.set(entry.filePath, relPathOf(entry.filePath))
  }
  return out
}

function pathItems(
  env: CompletionEnv,
  range: monacoApi.IRange,
  partialLc: string,
  inBracket: boolean,
): monacoApi.languages.CompletionItem[] {
  const out: monacoApi.languages.CompletionItem[] = []
  const known = new Set(getVaultDocs().map((d) => d.path))
  for (const [path, rel] of referencablePaths()) {
    if (known.size > 0 && !known.has(path)) continue
    if (partialLc && !rel.toLowerCase().includes(partialLc)) continue
    const bracketed = refPathTarget(rel) !== rel
    out.push({
      label: { label: rel, description: "@" },
      kind: env.monaco.languages.CompletionItemKind.File,
      insertText: inBracket ? `${rel}]@` : bracketed ? `[${rel}]@` : `${rel}@`,
      range,
      sortText: "2" + rel.toLowerCase(),
      filterText: (inBracket ? "" : "@") + rel,
      command: RETRIGGER_COMMAND,
    })
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

function provideCross(
  env: CompletionEnv,
  ctx: Extract<RefContext, { type: "cross-kind" | "cross-label" }>,
): monacoApi.languages.CompletionList {
  const entries = entriesOfPath(ctx.path).filter((e) => CROSS_FILE_KINDS.has(e.kind))
  if (ctx.type === "cross-kind") {
    const counts = new Map<string, number>()
    for (const e of entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1)
    const range = makeRange(env, ctx.innerStart + 2)
    return {
      suggestions: kindItems(env, [...counts.keys()], range, ctx.partial.toLowerCase(), counts),
    }
  }
  const partialLc = ctx.partial.toLowerCase()
  const range = makeRange(
    env,
    env.position.column - ctx.partial.length,
    env.position.column + labelTail(env.after, ctx.partial),
  )
  const suggestions = entries
    .filter((e) => e.kind === ctx.kind && matches(e, partialLc))
    .map((entry) =>
      makeItem(env, entry, {
        range,
        insertText: entry.name,
        filterText: `${entry.name} ${entry.title ?? ""}`,
        sortText: pad(entry.line),
        sameFile: false,
      }),
    )
  return { suggestions }
}

export const labelsSource: CompletionSource = (env) => {
  const ctx = parseRefContext(env.before)
  if (!ctx) return null
  switch (ctx.type) {
    case "local":
      return provideLocal(env, ctx)
    case "starter":
      return provideStarter(env, ctx)
    case "bracket-path": {
      const range = makeRange(env, env.position.column - ctx.partial.length)
      return { suggestions: pathItems(env, range, ctx.partial.toLowerCase(), true) }
    }
    default:
      return provideCross(env, ctx)
  }
}

// ── Lazy preview ─────────────────────────────────────────────────────────────

/**
 * Fills in the documentation of the focused label: a KaTeX-rendered equation
 * (through the same cache as the math hover) or the environment's title and
 * first line. Runs only for the item the user is looking at.
 */
export function resolveLabelItem(item: monacoApi.languages.CompletionItem): void {
  const entry = itemEntry.get(item)
  if (!entry || item.documentation) return
  const heading = [kindName(entry), entry.title].filter(Boolean).join(" · ")
  const parts = [`**${heading}**`]
  if (entry.kind === "eq" && entry.preview) {
    showSuggestPreview(entry.preview, getKatexMacros)
    parts.push("```latex\n" + entry.preview + "\n```")
  } else if (entry.preview) {
    parts.push(entry.preview)
  } else if (entry.context) {
    parts.push(entry.context)
  }
  item.documentation = { value: parts.join("\n\n") }
}
