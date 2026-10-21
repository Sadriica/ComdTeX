// Quick fixes for the linter's markers (Ctrl+. and the lightbulb).
//
// One global CodeActionProvider reads the `code` of the markers `contentLinter`
// emitted (source "comdtex") and answers with the fix for each. Text fixes are
// workspace edits on the model, so they are one undo step like any typing; the
// fixes that touch other files (create a note, add a BibTeX stub) go through
// commands that call back into the app (`setCodeActionHost`), which owns the
// vault write path. Nothing here writes to disk by itself.

import type * as monacoApi from "monaco-editor"
import {
  EXPECTED_ARGS,
  ENV_REF_KINDS,
  KNOWN_BLOCK_TYPES,
  LINTER_SOURCE,
  extractBalanced,
  labelsInScope,
  splitArgs,
  stripCode,
  type LintContext,
  type LintVaultDoc,
} from "./contentLinter"
import { findTableBlock, normalizeTableBlock } from "./markdownEditing"
import type { T } from "./i18n/types"

type Model = monacoApi.editor.ITextModel
type Range = monacoApi.IRange
type Marker = monacoApi.editor.IMarkerData

/** What the app lends the quick fixes: vault state and the write paths. */
export interface CodeActionHost {
  /** The current lint context (vault docs, bib keys, file names, ...). */
  getContext(): LintContext
  getActions(): T["lint"]["actions"]
  /** Create `name` as a new note; true when it was created (never overwrites). */
  createNote(name: string): Promise<boolean>
  /** Append a BibTeX stub for `key` to references.bib; true on success. */
  addBibStub(key: string): Promise<boolean>
  /** Fill the `{{?}}` gap at the position with the AI. */
  fillGapAt(line: number, column: number): void
  aiEnabled(): boolean
}

let host: CodeActionHost | null = null
export function setCodeActionHost(next: CodeActionHost | null): void {
  host = next
}

export const COMMAND_CREATE_NOTE = "comdtex.lint.createNote"
export const COMMAND_ADD_BIB_STUB = "comdtex.lint.addBibStub"
export const COMMAND_FILL_GAP = "comdtex.lint.fillGap"

// ── Suggestions ───────────────────────────────────────────────────────────────

/** Levenshtein distance, giving up (returning `limit + 1`) once it must exceed `limit`. */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = row[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (row[j] < best) best = row[j]
    }
    if (best > limit) return limit + 1
    prev = row
  }
  return prev[b.length]
}

/**
 * The `max` candidates closest to `wanted`, nearest first. A candidate counts
 * only if it is within a third of the longer word (at least 2 edits), so
 * unrelated names never come back as "did you mean".
 */
export function closestMatches(wanted: string, candidates: Iterable<string>, max = 3): string[] {
  const needle = wanted.toLowerCase()
  const scored: { text: string; distance: number }[] = []
  const seen = new Set<string>()
  for (const text of candidates) {
    if (seen.has(text) || text === wanted) continue
    seen.add(text)
    const lower = text.toLowerCase()
    const limit = Math.max(2, Math.ceil(Math.max(lower.length, needle.length) / 3))
    const distance = editDistance(needle, lower, limit)
    if (distance <= limit) scored.push({ text, distance })
  }
  scored.sort((a, b) => a.distance - b.distance || a.text.localeCompare(b.text))
  return scored.slice(0, max).map((s) => s.text)
}

/** `/home/v/papers/note.md` to `papers/note` given the vault root. */
export function vaultRelativeDocPath(docPath: string, vaultPath: string | undefined): string {
  const norm = docPath.replace(/\\/g, "/")
  const root = (vaultPath ?? "").replace(/\\/g, "/").replace(/\/+$/, "")
  const rel = root && norm.startsWith(`${root}/`) ? norm.slice(root.length + 1) : norm
  return rel.replace(/\.[^./]+$/, "")
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "")
}

// ── Model helpers ─────────────────────────────────────────────────────────────

function markerRange(marker: Marker): Range {
  return {
    startLineNumber: marker.startLineNumber,
    startColumn: marker.startColumn,
    endLineNumber: marker.endLineNumber,
    endColumn: marker.endColumn,
  }
}

function textEdit(
  model: Model,
  range: Range,
  text: string,
): monacoApi.languages.IWorkspaceTextEdit {
  return {
    resource: model.uri,
    versionId: model.getVersionId(),
    textEdit: { range, text },
  }
}

function quickFix(
  title: string,
  marker: Marker,
  fields: {
    edits?: monacoApi.languages.IWorkspaceTextEdit[]
    command?: monacoApi.languages.Command
    preferred?: boolean
  },
): monacoApi.languages.CodeAction {
  return {
    title,
    kind: "quickfix",
    diagnostics: [marker],
    isPreferred: fields.preferred ?? false,
    ...(fields.edits ? { edit: { edits: fields.edits } } : {}),
    ...(fields.command ? { command: fields.command } : {}),
  }
}

/** Range of `[from, to)` columns on the marker's first line. */
function subRange(marker: Marker, from: number, to: number): Range {
  return {
    startLineNumber: marker.startLineNumber,
    endLineNumber: marker.startLineNumber,
    startColumn: marker.startColumn + from,
    endColumn: marker.startColumn + to,
  }
}

function endOfLine(model: Model, line: number): { lineNumber: number; column: number } {
  return { lineNumber: line, column: model.getLineMaxColumn(line) }
}

// ── The fixes ─────────────────────────────────────────────────────────────────

interface FixInput {
  model: Model
  marker: Marker
  /** Text under the marker. */
  covered: string
  actions: T["lint"]["actions"]
  ctx: LintContext
  aiEnabled: boolean
}

function replaceFixes(input: FixInput, from: number, to: number, options: string[]) {
  const { model, marker, actions } = input
  return options.map((option, i) =>
    quickFix(actions.replaceWith(option), marker, {
      edits: [textEdit(model, subRange(marker, from, to), option)],
      preferred: i === 0 && options.length === 1,
    }),
  )
}

function fixDisplayMath({ model, marker, actions }: FixInput) {
  // Close the block at the end of the paragraph it opens: the first blank line,
  // or the end of the document.
  let last = marker.startLineNumber
  for (let line = marker.startLineNumber + 1; line <= model.getLineCount(); line++) {
    if (model.getLineContent(line).trim() === "") break
    last = line
  }
  const at = endOfLine(model, last)
  const range = {
    startLineNumber: at.lineNumber,
    startColumn: at.column,
    endLineNumber: at.lineNumber,
    endColumn: at.column,
  }
  return [
    quickFix(actions.closeMath, marker, {
      edits: [textEdit(model, range, "\n$$")],
      preferred: true,
    }),
  ]
}

function fixEnvUnclosed({ model, marker, covered, actions }: FixInput) {
  const name = /^:::(?:(?:sm|lg)\s+)?(\w+)/.exec(covered)?.[1] ?? ""
  // Close it before the next heading, or at the end of the document.
  let last = model.getLineCount()
  for (let line = marker.startLineNumber + 1; line <= model.getLineCount(); line++) {
    if (/^#{1,6}\s/.test(model.getLineContent(line))) {
      last = line - 1
      break
    }
  }
  while (last > marker.startLineNumber && model.getLineContent(last).trim() === "") last--
  const at = endOfLine(model, last)
  const range = {
    startLineNumber: at.lineNumber,
    startColumn: at.column,
    endLineNumber: at.lineNumber,
    endColumn: at.column,
  }
  return [
    quickFix(actions.closeEnv(name), marker, {
      edits: [textEdit(model, range, "\n:::")],
      preferred: true,
    }),
  ]
}

function fixStrayClose({ model, marker, actions }: FixInput) {
  const line = marker.startLineNumber
  // Take the line break with it: from the end of the previous line when there
  // is one, otherwise up to the start of the next.
  const range: Range =
    line > 1
      ? {
          startLineNumber: line - 1,
          startColumn: model.getLineMaxColumn(line - 1),
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
        }
      : { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 }
  return [quickFix(actions.removeStrayClose, marker, { edits: [textEdit(model, range, "")] })]
}

function fixUnknownEnv(input: FixInput) {
  const { covered } = input
  const name = /(\w+)$/.exec(covered)?.[1] ?? ""
  if (!name) return []
  const at = covered.length - name.length
  return replaceFixes(input, at, covered.length, closestMatches(name, KNOWN_BLOCK_TYPES))
}

/** Pieces of a reference as written, with column offsets inside the match. */
interface ParsedRef {
  path?: string
  pathFrom: number
  pathTo: number
  kind: string
  name: string
  idFrom: number
  idTo: number
}

const PARSE_REF_RE =
  /^@(?:\[([^\]\n]+)\]|([A-Za-z0-9_./-]+))@([a-zA-Z]+):([\w-]+(?:\.\w+)*)$|^@([a-zA-Z]+):([\w-]+(?:\.\w+)*)$/

export function parseRef(text: string): ParsedRef | null {
  const m = PARSE_REF_RE.exec(text)
  if (!m) return null
  if (m[3] !== undefined) {
    const path = m[1] ?? m[2]
    const bracket = m[1] !== undefined
    const pathFrom = bracket ? 2 : 1
    const pathTo = pathFrom + path.length
    const idFrom = pathTo + (bracket ? 2 : 1)
    return { path, pathFrom, pathTo, kind: m[3], name: m[4], idFrom, idTo: text.length }
  }
  return { pathFrom: 0, pathTo: 0, kind: m[5], name: m[6], idFrom: 1, idTo: text.length }
}

function relPathOf(doc: LintVaultDoc, ctx: LintContext): string {
  return vaultRelativeDocPath(doc.path, ctx.vaultPath)
}

function crossFileRef(rel: string, id: string): string {
  return /\s/.test(rel) ? `@[${rel}]@${id}` : `@${rel}@${id}`
}

function fixRef(input: FixInput, code: string) {
  const { model, marker, covered, actions, ctx } = input
  const ref = parseRef(covered)
  if (!ref) return []
  const out: monacoApi.languages.CodeAction[] = []
  const wantedId = `${ref.kind}:${ref.name}`

  if (code === "ref-doc-missing" && ref.path !== undefined) {
    const paths = (ctx.vaultDocs ?? []).map((d) => relPathOf(d, ctx))
    return replaceFixes(input, ref.pathFrom, ref.pathTo, closestMatches(ref.path, paths))
  }

  if (code === "ref-label-missing" && ref.path !== undefined) {
    const doc = ctx.vaultDocs?.find((d) =>
      relPathOf(d, ctx).toLowerCase().endsWith(ref.path!.toLowerCase()),
    )
    const ids = doc ? [...doc.labels].filter((id) => ENV_REF_KINDS.includes(id.split(":")[0])) : []
    return replaceFixes(input, ref.idFrom, ref.idTo, closestMatches(wantedId, ids))
  }

  // Local reference.
  if (code === "ref-other-note" && ENV_REF_KINDS.includes(ref.kind) && ctx.vaultDocs) {
    const owner = ctx.vaultDocs.find((d) => d.path !== ctx.docPath && d.labels.has(wantedId))
    if (owner) {
      const text = crossFileRef(relPathOf(owner, ctx), wantedId)
      out.push(
        quickFix(actions.useCrossFileRef(text), marker, {
          edits: [textEdit(model, markerRange(marker), text)],
          preferred: true,
        }),
      )
    }
  }
  const scope = labelsInScope(stripCode(model.getValue()), ctx)
  const candidates = [...scope].filter((id) => !id.startsWith("sec:sec:"))
  out.push(...replaceFixes(input, ref.idFrom, ref.idTo, closestMatches(wantedId, candidates)))
  return out
}

/** `[[target#heading|alias]]` to its target and the columns it occupies. */
function wikiTarget(covered: string): { target: string; from: number; to: number } | null {
  const m = /^\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]$/.exec(covered.replace(/^!/, ""))
  if (!m) return null
  const offset = covered.startsWith("!") ? 1 : 0
  return { target: m[1].trim(), from: offset + 2, to: offset + 2 + m[1].length }
}

function fixWikilink(input: FixInput) {
  const { marker, covered, actions, ctx } = input
  const parsed = wikiTarget(covered)
  if (!parsed) return []
  const out: monacoApi.languages.CodeAction[] = []
  out.push(
    quickFix(actions.createNote(parsed.target), marker, {
      command: {
        id: COMMAND_CREATE_NOTE,
        title: actions.createNote(parsed.target),
        arguments: [parsed.target],
      },
    }),
  )
  const names = ctx.vaultDocs?.length
    ? ctx.vaultDocs.map((d) => stem(d.name))
    : [...ctx.vaultFileNames]
  out.push(...replaceFixes(input, parsed.from, parsed.to, closestMatches(parsed.target, names)))
  return out
}

function fixCitation(input: FixInput) {
  const { marker, covered, actions, ctx } = input
  const key = covered.replace(/^@/, "")
  if (!key) return []
  const out: monacoApi.languages.CodeAction[] = [
    quickFix(actions.addBibStub(key), marker, {
      command: { id: COMMAND_ADD_BIB_STUB, title: actions.addBibStub(key), arguments: [key] },
    }),
  ]
  out.push(...replaceFixes(input, 1, covered.length, closestMatches(key, ctx.bibKeys)))
  return out
}

function fixTable({ model, marker, actions }: FixInput) {
  const lines = model.getLinesContent()
  const block = findTableBlock(lines, marker.startLineNumber - 1)
  if (!block) return []
  const original = lines.slice(block.start, block.end + 1)
  const fixed = normalizeTableBlock(original)
  if (fixed.join("\n") === original.join("\n")) return []
  const range: Range = {
    startLineNumber: block.start + 1,
    startColumn: 1,
    endLineNumber: block.end + 1,
    endColumn: model.getLineMaxColumn(block.end + 1),
  }
  return [
    quickFix(actions.normalizeTable, marker, {
      edits: [textEdit(model, range, fixed.join("\n"))],
      preferred: true,
    }),
  ]
}

function fixGap({ marker, actions, aiEnabled }: FixInput) {
  if (!aiEnabled) return []
  return [
    quickFix(actions.fillGap, marker, {
      command: {
        id: COMMAND_FILL_GAP,
        title: actions.fillGap,
        // Inside the gap, so the fill finds it under the cursor.
        arguments: [marker.startLineNumber, marker.startColumn + 1],
      },
    }),
  ]
}

function fixArity({ model, marker, covered, actions }: FixInput) {
  const m = /^(\w+)\s*\(/.exec(covered)
  if (!m) return []
  const name = m[1]
  const expected = EXPECTED_ARGS[name]
  if (expected === null || expected === undefined) return []
  const open = covered.indexOf("(")
  const balanced = extractBalanced(covered, open)
  if (!balanced) return []
  const args = splitArgs(balanced.content).filter((a) => a.length > 0)
  const range = markerRange(marker)
  if (args.length < expected) {
    const text = `${covered.slice(0, balanced.end - 1)}${", ".repeat(expected - args.length)}${covered.slice(balanced.end - 1)}`
    return [
      quickFix(actions.addMissingArgs(name), marker, { edits: [textEdit(model, range, text)] }),
    ]
  }
  if (args.length > expected) {
    const text = `${covered.slice(0, open + 1)}${args.slice(0, expected).join(", ")})`
    return [
      quickFix(actions.trimExtraArgs(name, expected), marker, {
        edits: [textEdit(model, range, text)],
      }),
    ]
  }
  return []
}

function fixFootnote({ model, marker, covered, actions }: FixInput) {
  const id = /^\[\^([^\]\s]+)\]$/.exec(covered)?.[1]
  if (!id) return []
  const lastLine = model.getLineCount()
  const at = endOfLine(model, lastLine)
  const endsBlank = model.getLineContent(lastLine).trim() === ""
  const range = {
    startLineNumber: at.lineNumber,
    startColumn: at.column,
    endLineNumber: at.lineNumber,
    endColumn: at.column,
  }
  const text = `${endsBlank ? "" : "\n\n"}[^${id}]: `
  return [quickFix(actions.addFootnoteDef(id), marker, { edits: [textEdit(model, range, text)] })]
}

function fixDuplicateLabel({ model, marker, covered, actions, ctx }: FixInput) {
  const id = /^\{#([\w:.-]+)\}$/.exec(covered)?.[1]
  if (!id) return []
  const taken = labelsInScope(stripCode(model.getValue()), ctx)
  let n = 2
  while (taken.has(`${id}-${n}`)) n++
  const next = `${id}-${n}`
  return [
    quickFix(actions.renameLabel(next), marker, {
      edits: [textEdit(model, markerRange(marker), `{#${next}}`)],
    }),
  ]
}

// ── Provider ──────────────────────────────────────────────────────────────────

/** All fixes for one marker (exported for tests). */
export function fixesForMarker(
  model: Model,
  marker: Marker,
  h: Pick<CodeActionHost, "getContext" | "getActions" | "aiEnabled">,
): monacoApi.languages.CodeAction[] {
  const code = typeof marker.code === "string" ? marker.code : marker.code?.value
  if (!code) return []
  const input: FixInput = {
    model,
    marker,
    covered: model.getValueInRange(markerRange(marker)),
    actions: h.getActions(),
    ctx: h.getContext(),
    aiEnabled: h.aiEnabled(),
  }
  switch (code) {
    case "display-math-unclosed":
      return fixDisplayMath(input)
    case "env-unclosed":
      return fixEnvUnclosed(input)
    case "env-stray-close":
      return fixStrayClose(input)
    case "env-unknown-type":
      return fixUnknownEnv(input)
    case "ref-undefined":
    case "ref-other-note":
    case "ref-doc-missing":
    case "ref-label-missing":
      return fixRef(input, code)
    case "wikilink-missing":
      return fixWikilink(input)
    case "cite-undefined":
      return fixCitation(input)
    case "table-ragged":
      return fixTable(input)
    case "gap-pending":
      return fixGap(input)
    case "shorthand-arity":
      return fixArity(input)
    case "footnote-undefined":
      return fixFootnote(input)
    case "label-duplicate":
      return fixDuplicateLabel(input)
    default:
      return []
  }
}

/**
 * Register the provider and the commands the non-text fixes run. One call from
 * `setupMonaco`; returns a disposable that removes both.
 */
export function registerCodeActions(monaco: typeof monacoApi): monacoApi.IDisposable {
  const provider: monacoApi.languages.CodeActionProvider = {
    provideCodeActions(model, _range, context) {
      const current = host
      if (!current) return { actions: [], dispose() {} }
      const actions: monacoApi.languages.CodeAction[] = []
      for (const marker of context.markers) {
        if (marker.source !== LINTER_SOURCE) continue
        actions.push(...fixesForMarker(model, marker, current))
      }
      return { actions, dispose() {} }
    },
  }

  const disposables: monacoApi.IDisposable[] = [
    monaco.languages.registerCodeActionProvider("*", provider, {
      providedCodeActionKinds: ["quickfix"],
    }),
    monaco.editor.registerCommand(COMMAND_CREATE_NOTE, (_accessor, name: string) => {
      void host?.createNote(name)
    }),
    monaco.editor.registerCommand(COMMAND_ADD_BIB_STUB, (_accessor, key: string) => {
      void host?.addBibStub(key)
    }),
    monaco.editor.registerCommand(COMMAND_FILL_GAP, (_accessor, line: number, column: number) => {
      host?.fillGapAt(line, column)
    }),
  ]
  return { dispose: () => disposables.forEach((d) => d.dispose()) }
}

/** A minimal BibTeX entry for a key the document cites but references.bib lacks. */
export function bibStubFor(key: string): string {
  return `@misc{${key},\n  author = {},\n  title  = {},\n  year   = {},\n  note   = {TODO: complete this entry},\n}`
}
