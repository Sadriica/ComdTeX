/**
 * Content linter for ComdTeX documents.
 *
 * Produces Monaco editor markers. Every marker carries a stable `code`
 * (`LINT_CODES`) that `codeActions.ts` reads to offer quick fixes, and a
 * message translated through the `lint` section of the i18n tables.
 *
 * Document rules (`lintContent`):
 *  - unclosed `$$` display math, unclosed/stray `:::`, unknown `:::type`
 *  - structural references (`@eq: @fig: @tbl: @sec:` and every environment
 *    kind) against the labels of the document, its transcluded notes and the
 *    vault; cross-file `@path@kind:name` resolves the path and the label
 *  - duplicate labels, undefined/unused footnotes, missing local images
 *  - KaTeX parse errors in `$..$` and `$$..$$`
 *  - broken `[[wikilinks]]` and `[@citation]` keys
 *  - shorthand call issues, ragged tables, `{{?}}` gaps, `@data:` references
 *  - optional: biology typography, dictionary spelling
 *
 * Also provides dedicated linters for:
 *  - BibTeX files (.bib): duplicate keys, missing required fields, unknown types
 *  - macros.md: duplicate \newcommand definitions, unbalanced braces
 *
 * Frontmatter YAML is NOT validated: the project has no YAML parser (the
 * frontmatter reader is hand-rolled and tolerant), and a second opinion about
 * what is valid YAML would disagree with the app's own reader.
 *
 * Pure and Monaco-free at runtime (severity numbers are passed in), so the same
 * code can run in a worker.
 */

import katex from "katex"
import "katex/contrib/mhchem"
import { CITATION_GROUP_RE, parseCitationGroup } from "./bibtex"
import type * as monacoApi from "monaco-editor"
import { checkText, type SpellLang } from "./spellcheck"
import { raggedTableRows } from "./markdownEditing"
import { findGaps } from "./aiGaps"
import { findBioConventions } from "./bioConventions"
import { preprocess } from "./preprocessor"
import { imageCandidates } from "./imagePaths"
import { matchesVaultRelPath } from "./wikilinks"
import { findVaultFile } from "./vaultResolve"
import { slugifyHeading } from "./toc"
import { es } from "./i18n/es"
import type { T } from "./i18n/types"

export type LintMessages = T["lint"]["messages"]

/** Marker `source`: how `codeActions.ts` recognises markers that are ours. */
export const LINTER_SOURCE = "comdtex"

/**
 * Every code a marker can carry. Stable: quick fixes, tests and (later) docs
 * key on these strings, so rename one only together with its consumers.
 */
export const LINT_CODES = [
  "display-math-unclosed",
  "env-unclosed",
  "env-stray-close",
  "env-unknown-type",
  "ref-undefined",
  "ref-other-note",
  "ref-doc-missing",
  "ref-label-missing",
  "wikilink-missing",
  "cite-undefined",
  "shorthand-unclosed",
  "shorthand-arity",
  "table-ragged",
  "gap-pending",
  "footnote-undefined",
  "footnote-unused",
  "label-duplicate",
  "image-missing",
  "math-parse-error",
  "data-duplicate",
  "data-undeclared",
  "spell-unknown",
  "bio-binomial",
  "bio-gene",
  "bib-unclosed",
  "bib-unknown-type",
  "bib-no-key",
  "bib-duplicate-key",
  "bib-missing-field",
  "macros-duplicate",
  "macros-brace-close",
  "macros-brace-open",
  "macros-unknown-line",
] as const
export type LintCode = (typeof LINT_CODES)[number]

/** What the linter knows about another document of the vault. */
export interface LintVaultDoc {
  path: string
  /** File name with extension, as `FileNode.name`. */
  name: string
  /** Literal label ids the document defines (`thm:main`, `eq:energy`, `sec:intro`). */
  labels: ReadonlySet<string>
  /** Targets of its `![[note]]` transclusions. */
  embeds: readonly string[]
}

export interface LintContext {
  /** Base names of vault files, lowercased, without extension. */
  vaultFileNames: Set<string>
  /** Keys defined in references.bib. */
  bibKeys: Set<string>
  /**
   * Dictionary-based spell-checking. When `true`, the content linter emits
   * Hint markers for unknown words using the `spellLang` dictionary. Defaults
   * to off; when disabled, NO dictionary is loaded and no spell work runs.
   */
  spellcheck?: boolean
  /** Active spell-check language (frontmatter `lang:` or `settings.language`). */
  spellLang?: SpellLang
  /** Localised marker message for an unknown word (from i18n `app.spellError`). */
  spellMessage?: (word: string) => string
  /** Localised marker message for a biology typography finding. */
  bioMessage?: (kind: "binomial" | "gene", text: string) => string
  /** Localised message table (`T.lint.messages`). Defaults to Spanish. */
  messages?: LintMessages
  /** Absolute path of the document being linted. */
  docPath?: string
  /** Absolute path of the vault root (image resolution, cross-file suggestions). */
  vaultPath?: string
  /**
   * The vault's documents with their labels. `undefined` while the vault has
   * not loaded: rules that need it (cross-file refs, transcluded labels) stay
   * quiet instead of crying wolf.
   */
  vaultDocs?: readonly LintVaultDoc[]
  /** Every file of the vault, forward slashes: the image existence check. */
  vaultFilePaths?: ReadonlySet<string>
  /** User macros (`macros.md`): without them `\mycmd` would be a KaTeX error. */
  macros?: Record<string, string>
}

export interface LintSummary {
  errors: number
  warnings: number
}

// Numeric severity values matching Monaco's MarkerSeverity enum.
// Used for background linting without importing Monaco at runtime.
const SEV = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const

type Severities = typeof monacoApi.MarkerSeverity
type Marker = monacoApi.editor.IMarkerData

/** Everything a rule needs to emit markers. */
interface Env {
  lineIdx: number[]
  Severity: Severities
  msg: LintMessages
  ctx: LintContext
}

// ── Position helpers ──────────────────────────────────────────────────────────

/** Array of character offsets where each line starts (index 0 → line 1). */
function buildLineIndex(text: string): number[] {
  const idx = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") idx.push(i + 1)
  }
  return idx
}

/** Binary-search lineIndex for 1-based line + 1-based column. */
function offsetToPos(lineIdx: number[], offset: number): { lineNumber: number; column: number } {
  let lo = 0,
    hi = lineIdx.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineIdx[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return { lineNumber: lo + 1, column: offset - lineIdx[lo] + 1 }
}

function mkMarker(
  lineIdx: number[],
  code: LintCode,
  start: number,
  end: number,
  message: string,
  severity: monacoApi.MarkerSeverity,
): Marker {
  const s = offsetToPos(lineIdx, start)
  const e = offsetToPos(lineIdx, Math.max(start, end - 1))
  return {
    severity,
    message,
    code,
    source: LINTER_SOURCE,
    startLineNumber: s.lineNumber,
    startColumn: s.column,
    endLineNumber: e.lineNumber,
    endColumn: e.column + 1,
  }
}

function emit(
  env: Env,
  code: LintCode,
  start: number,
  end: number,
  message: string,
  severity: monacoApi.MarkerSeverity,
): Marker {
  return mkMarker(env.lineIdx, code, start, end, message, severity)
}

// ── Strip code regions (preserve offsets, replace chars with spaces) ─────────

/**
 * Replace fenced code blocks (``` … ``` and ~~~ … ~~~) and inline code (`…`)
 * with spaces, preserving newlines so all offsets stay valid.
 *
 * The buffer is indexed by UTF-16 code unit (`split("")`), the same unit the
 * regex offsets use. `Array.from(text)` indexes by code point, so one astral
 * character (an emoji) before a fence shifted every later mask by one.
 */
export function stripCode(text: string): string {
  return (
    text
      // Fenced code blocks (multiline). Mirrors the renderer's fence pattern.
      .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, blankRun)
      // Inline code: `...`  (single-line only)
      .replace(/`[^`\n]+`/g, blankRun)
  )
}

/** Same-length run of spaces that keeps newlines (offsets and line numbers survive). */
function blankRun(match: string): string {
  return match.replace(/[^\n]/g, " ")
}

/** Blocks whose body is not prose: no math, images or footnotes live there. */
const OPAQUE_BLOCKS = [
  "csv",
  "data",
  "code",
  "pseudocode",
  "flowchart",
  "truth",
  "graph",
  "plot",
  "commdiag",
  "excalidraw",
]
const OPAQUE_BLOCK_RE = new RegExp(
  `^:::(?:${OPAQUE_BLOCKS.join("|")})\\b[^\\n]*\\n[\\s\\S]*?^:::[ \\t]*$`,
  "gm",
)

/** `stripCode` plus frontmatter and special-block bodies blanked (offset-preserving). */
function maskNonProse(clean: string): string {
  return clean
    .replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, blankRun)
    .replace(OPAQUE_BLOCK_RE, blankRun)
}

// ── Rule: unclosed $$ display-math ───────────────────────────────────────────

function lintDisplayMath(env: Env, text: string): Marker[] {
  const markers: Marker[] = []
  const re = /\$\$/g
  let m: RegExpExecArray | null
  let openAt: number | null = null

  while ((m = re.exec(text)) !== null) {
    openAt = openAt === null ? m.index : null
  }

  if (openAt !== null) {
    markers.push(
      emit(
        env,
        "display-math-unclosed",
        openAt,
        openAt + 2,
        env.msg.displayMathUnclosed(),
        env.Severity.Error,
      ),
    )
  }
  return markers
}

// ── Rule: unclosed / stray / unknown ::: environments ────────────────────────

/** Block types the renderer knows after `:::` (environments + special blocks). */
export const KNOWN_BLOCK_TYPES: readonly string[] = [
  // NUMBERED_ENVS
  "theorem",
  "lemma",
  "corollary",
  "proposition",
  "definition",
  "example",
  "exercise",
  // UNNUMBERED_ENVS
  "proof",
  "remark",
  "note",
  "tip",
  "hint",
  "info",
  "warning",
  "caution",
  "attention",
  "important",
  "danger",
  "error",
  "failure",
  "success",
  "check",
  "done",
  "question",
  "help",
  "faq",
  "quote",
  "cite",
  "abstract",
  // folded and special blocks
  "folded",
  "pseudocode",
  "flowchart",
  "truth",
  "graph",
  "plot",
  "commdiag",
  "code",
  "excalidraw",
  "csv",
  "data",
]
const KNOWN_BLOCK_SET = new Set(KNOWN_BLOCK_TYPES)

function lintEnvironments(env: Env, text: string): Marker[] {
  const markers: Marker[] = []
  const lines = text.split("\n")
  const stack: { name: string; offset: number; end: number }[] = []
  let offset = 0

  for (const line of lines) {
    const trimmed = line.trim()
    const lead = line.length - line.trimStart().length

    // Opening: :::type, :::type[title], :::sm type (size prefix) …
    const openMatch = /^:::(?:(?:sm|lg)\s+)?(\w+)/.exec(trimmed)
    if (openMatch) {
      const name = openMatch[1]
      const start = offset + lead
      const end = start + openMatch[0].length
      stack.push({ name, offset: start, end })
      if (!KNOWN_BLOCK_SET.has(name.toLowerCase())) {
        markers.push(
          emit(
            env,
            "env-unknown-type",
            start,
            end,
            env.msg.envUnknownType(name),
            env.Severity.Warning,
          ),
        )
      }
    } else if (trimmed === ":::") {
      if (stack.length > 0) {
        stack.pop()
      } else {
        markers.push(
          emit(
            env,
            "env-stray-close",
            offset + lead,
            offset + lead + 3,
            env.msg.envStrayClose(),
            env.Severity.Warning,
          ),
        )
      }
    }

    offset += line.length + 1 // +1 for the \n
  }

  for (const open of stack) {
    markers.push(
      emit(
        env,
        "env-unclosed",
        open.offset,
        open.end,
        env.msg.envUnclosed(open.name),
        env.Severity.Error,
      ),
    )
  }

  return markers
}

// ── Labels, references and transclusions ─────────────────────────────────────

const LABEL_DEF_RE = /\{#([\w:.-]+)\}/g

/**
 * Literal label ids a text defines: every `{#kind:name}` plus the ids a heading
 * answers to for `@sec:` (its explicit label with and without the `sec:`
 * prefix, or its slug when it has none). Same acceptance rules as
 * `numberHeadings` in references.ts, so a heading the renderer resolves is
 * never reported.
 */
export function scanLintLabels(text: string): Set<string> {
  const out = new Set<string>()
  let m: RegExpExecArray | null
  LABEL_DEF_RE.lastIndex = 0
  while ((m = LABEL_DEF_RE.exec(text)) !== null) out.add(m[1])

  const headingRe = /^#{1,6}[ \t]+(.+)$/gm
  while ((m = headingRe.exec(text)) !== null) {
    const raw = m[1].trim()
    const explicit = /\{#([\w:.-]+)\}\s*$/.exec(raw)
    if (explicit) {
      out.add(`sec:${explicit[1].replace(/^sec:/, "")}`)
      out.add(`sec:${explicit[1]}`)
    } else {
      const slug = slugifyHeading(raw)
      if (slug) out.add(`sec:${slug}`)
    }
  }
  return out
}

const EMBED_RE = /!\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]/g

/** Targets of the `![[note]]` transclusions in `text`. */
export function scanEmbeds(text: string): string[] {
  const out: string[] = []
  const re = new RegExp(EMBED_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(m[1].trim())
  return out
}

/**
 * Labels a document gains from the notes it transcludes (transitively): the
 * renderer expands `![[note]]` before it resolves references, so `@eq:x`
 * defined in the embedded note is a perfectly good reference.
 */
export function transcludedLabels(
  embeds: readonly string[],
  docs: readonly LintVaultDoc[] | undefined,
  selfPath?: string,
): Set<string> {
  const out = new Set<string>()
  if (!docs || embeds.length === 0) return out
  const seen = new Set<string>(selfPath ? [selfPath] : [])
  const queue = [...embeds]
  while (queue.length > 0) {
    const doc = findVaultFile(docs, queue.pop()!)
    if (!doc || seen.has(doc.path)) continue
    seen.add(doc.path)
    for (const label of doc.labels) out.add(label)
    queue.push(...doc.embeds)
  }
  return out
}

/** Every label id in scope for a document: its own plus its transcluded notes'. */
export function labelsInScope(clean: string, ctx: LintContext): Set<string> {
  const scope = scanLintLabels(clean)
  for (const label of transcludedLabels(scanEmbeds(clean), ctx.vaultDocs, ctx.docPath)) {
    scope.add(label)
  }
  return scope
}

/** Environment reference prefixes (kept equal to `ENV_REF_PREFIXES` by a test). */
export const ENV_REF_KINDS: readonly string[] = [
  "thm",
  "theorem",
  "lem",
  "lemma",
  "cor",
  "prop",
  "def",
  "definition",
  "ex",
  "example",
  "exc",
  "exercise",
]
const ENV_REF_KIND_SET = new Set(ENV_REF_KINDS)
const LOCAL_REF_KINDS = new Set(["eq", "fig", "tbl", "sec", ...ENV_REF_KINDS])

// Same shape as ENV_REF_RE in environments.ts: the cross-file alternatives come
// FIRST so the inner `@eq:x` of `@doc@thm:x` is never read as a local reference.
const REF_RE =
  /@(?:\[([^\]\n]+)\]|([A-Za-z0-9_./-]+))@([a-zA-Z]+):([\w-]+(?:\.\w+)*)|@([a-zA-Z]+):([\w:-]+(?:\.\w+)*)/g

const ownersCache = new WeakMap<readonly LintVaultDoc[], Map<string, LintVaultDoc>>()
function labelOwners(docs: readonly LintVaultDoc[]): Map<string, LintVaultDoc> {
  let owners = ownersCache.get(docs)
  if (!owners) {
    owners = new Map()
    for (const doc of docs)
      for (const label of doc.labels) if (!owners.has(label)) owners.set(label, doc)
    ownersCache.set(docs, owners)
  }
  return owners
}

function lintRefs(env: Env, clean: string): Marker[] {
  const markers: Marker[] = []
  const { ctx, msg, Severity } = env
  const docs = ctx.vaultDocs
  const own = scanLintLabels(clean)
  const embeds = scanEmbeds(clean)
  const transcluded = transcludedLabels(embeds, docs, ctx.docPath)
  // The vault has not loaded but the text embeds a note: its labels are
  // unknown, so an "undefined" verdict would be a guess.
  const vaultPending = docs === undefined && embeds.length > 0

  const re = new RegExp(REF_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(clean)) !== null) {
    const start = m.index
    const end = start + m[0].length

    // ── Cross-file: @path@kind:name / @[path with spaces]@kind:name ──────────
    if (m[3] !== undefined) {
      const kind = m[3]
      // Only environments resolve across files; anything else is left alone,
      // exactly as the renderer leaves it.
      if (!ENV_REF_KIND_SET.has(kind) || !docs || docs.length === 0) continue
      const path = (m[1] ?? m[2] ?? "").trim()
      if (!path) continue
      const label = `${kind}:${m[4]}`
      const doc = docs.find((d) => matchesVaultRelPath(d.path, path))
      if (!doc) {
        markers.push(
          emit(env, "ref-doc-missing", start, end, msg.refDocMissing(m[0], path), Severity.Warning),
        )
        continue
      }
      const labels = doc.path === ctx.docPath ? new Set([...own, ...transcluded]) : doc.labels
      if (!labels.has(label)) {
        markers.push(
          emit(
            env,
            "ref-label-missing",
            start,
            end,
            msg.refLabelMissing(m[0], path),
            Severity.Warning,
          ),
        )
      }
      continue
    }

    // ── Local: @kind:name ────────────────────────────────────────────────────
    const kind = m[5]
    let name = m[6]
    let written = m[0]
    // Environment ids stop at a colon (the renderer's ENV_REF_RE); the other
    // kinds may contain one (`@sec:sec:intro`).
    if (ENV_REF_KIND_SET.has(kind) && name.includes(":")) {
      name = name.slice(0, name.indexOf(":"))
      written = `@${kind}:${name}`
    }
    if (!LOCAL_REF_KINDS.has(kind)) continue
    if (/^\d+$/.test(name)) continue // `@eq:1`, `@fig:2`: direct numeric references
    const id = `${kind}:${name}`
    if (own.has(id) || transcluded.has(id)) continue
    if (vaultPending) continue

    const stop = start + written.length
    const owner = docs ? labelOwners(docs).get(id) : undefined
    if (owner && owner.path !== ctx.docPath) {
      const text = ENV_REF_KIND_SET.has(kind)
        ? msg.refInOtherNoteEnv(written, owner.name)
        : msg.refInOtherNote(written, owner.name)
      markers.push(emit(env, "ref-other-note", start, stop, text, Severity.Warning))
    } else {
      markers.push(
        emit(env, "ref-undefined", start, stop, msg.refUndefined(written), Severity.Warning),
      )
    }
  }
  return markers
}

// ── Rule: duplicate labels within a document ─────────────────────────────────

function lintDuplicateLabels(env: Env, clean: string): Marker[] {
  const markers: Marker[] = []
  const seen = new Set<string>()
  const re = new RegExp(LABEL_DEF_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(clean)) !== null) {
    const id = m[1]
    // `{#data:x}` duplicates are reported by lintDataRefs.
    if (id.startsWith("data:")) continue
    if (seen.has(id)) {
      markers.push(
        emit(
          env,
          "label-duplicate",
          m.index,
          m.index + m[0].length,
          env.msg.labelDuplicate(id),
          env.Severity.Warning,
        ),
      )
    } else seen.add(id)
  }
  return markers
}

// ── Rule: broken [[wikilinks]] ────────────────────────────────────────────────

/**
 * Does `[[target]]` resolve? Exactly the app's rule: `processWikilinks`
 * (wikilinks.ts) and the click handler look the lowercased target up as a whole
 * in the set of file base names, so `[[folder/note]]` does not resolve there
 * either. A parity test pins this to `processWikilinks`.
 */
export function wikilinkResolves(target: string, vaultFileNames: ReadonlySet<string>): boolean {
  return vaultFileNames.has(target.trim().toLowerCase())
}

function lintWikilinks(env: Env, text: string): Marker[] {
  const names = env.ctx.vaultFileNames
  if (names.size === 0) return [] // vault not loaded yet

  const markers: Marker[] = []
  const re = /\[\[([^\]|#\n]+?)(?:#[^\]|]+?)?(?:\|[^\]\n]+?)?\]\]/g
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m[1].trim().toLowerCase() === "toc") continue // `[[toc]]` is the auto-TOC marker
    if (!wikilinkResolves(m[1], names)) {
      markers.push(
        emit(
          env,
          "wikilink-missing",
          m.index,
          m.index + m[0].length,
          env.msg.wikilinkMissing(m[1].trim()),
          env.Severity.Warning,
        ),
      )
    }
  }
  return markers
}

// ── Rule: broken [@citation] references ──────────────────────────────────────

function lintCitations(env: Env, text: string): Marker[] {
  const bibKeys = env.ctx.bibKeys
  if (bibKeys.size === 0) return [] // no bib file loaded

  const markers: Marker[] = []
  const re = new RegExp(CITATION_GROUP_RE.source, "g")
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    let cursor = 0
    for (const { key } of parseCitationGroup(m[1]) ?? []) {
      // One marker per key, on that key's own `@key` token (a group used to put
      // one marker per missing key on the whole bracket, all on the same range).
      const at = m[0].indexOf(`@${key}`, cursor)
      const from = at < 0 ? 0 : at
      cursor = from + key.length + 1
      if (bibKeys.has(key)) continue
      const start = m.index + from
      markers.push(
        emit(
          env,
          "cite-undefined",
          start,
          start + key.length + 1,
          env.msg.citeUndefined(key),
          env.Severity.Warning,
        ),
      )
    }
  }
  return markers
}

// ── Rule: footnotes ──────────────────────────────────────────────────────────

function lintFootnotes(env: Env, prose: string): Marker[] {
  const markers: Marker[] = []
  const defs = new Map<string, { start: number; end: number }>()
  const defRe = /^[ ]{0,3}\[\^([^\]\s]+)\]:/gm
  let m: RegExpExecArray | null
  while ((m = defRe.exec(prose)) !== null) {
    if (!defs.has(m[1])) defs.set(m[1], { start: m.index, end: m.index + m[0].length - 1 })
  }

  const used = new Set<string>()
  const refRe = /\[\^([^\]\s]+)\](?!:)/g
  while ((m = refRe.exec(prose)) !== null) {
    used.add(m[1])
    if (!defs.has(m[1])) {
      markers.push(
        emit(
          env,
          "footnote-undefined",
          m.index,
          m.index + m[0].length,
          env.msg.footnoteUndefined(m[1]),
          env.Severity.Warning,
        ),
      )
    }
  }
  for (const [id, pos] of defs) {
    if (!used.has(id)) {
      markers.push(
        emit(
          env,
          "footnote-unused",
          pos.start,
          pos.end,
          env.msg.footnoteUnused(id),
          env.Severity.Info,
        ),
      )
    }
  }
  return markers
}

// ── Rule: missing local images ───────────────────────────────────────────────

const REMOTE_SRC_RE = /^(?:[a-z][a-z0-9+.-]*:(?!\/\/[A-Za-z]:)|\/\/|#)/i

function lintImages(env: Env, prose: string): Marker[] {
  const { ctx } = env
  const known = ctx.vaultFilePaths
  if (!known || known.size === 0 || !ctx.docPath) return []

  const markers: Marker[] = []
  const re = /!\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s\n]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(prose)) !== null) {
    let src = m[1]
    if (src.startsWith("<")) src = src.slice(1, -1)
    // Windows drive paths (`C:\x.png`) look like a scheme; everything else with
    // a scheme (http:, data:, asset:, file:) is not a vault file.
    if (REMOTE_SRC_RE.test(src) && !/^[A-Za-z]:[\\/]/.test(src)) continue
    let clean = src.replace(/[?#].*$/, "")
    try {
      clean = decodeURIComponent(clean)
    } catch {
      /* keep it as written */
    }
    if (!clean) continue
    const candidates = imageCandidates(clean, ctx.docPath, ctx.vaultPath)
    if (candidates.length === 0 || candidates.some((c) => known.has(c.replace(/\\/g, "/"))))
      continue
    markers.push(
      emit(
        env,
        "image-missing",
        m.index,
        m.index + m[0].length,
        env.msg.imageMissing(src),
        env.Severity.Warning,
      ),
    )
  }
  return markers
}

// ── Rule: KaTeX parse errors ─────────────────────────────────────────────────

const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g
const MATH_CACHE_MAX = 20000
const mathCache = new Map<string, string | null>()
let mathCacheKey = ""

type KatexParse = (expr: string, options: Record<string, unknown>) => unknown

/** `null` when the expression parses, otherwise KaTeX's own (cleaned) message. */
function mathErrorFor(
  expr: string,
  display: boolean,
  macros: Record<string, string>,
): string | null {
  const key = (display ? "D\0" : "I\0") + expr
  if (mathCache.has(key)) return mathCache.get(key) ?? null

  let result: string | null = null
  try {
    // Shorthands (`frac(a, b)`) expand before KaTeX in the renderer; parsing the
    // raw text would flag every one of them.
    const delim = display ? "$$" : "$"
    const expanded = preprocess(`${delim}${expr}${delim}`)
    const inner =
      expanded.startsWith(delim) && expanded.endsWith(delim)
        ? expanded.slice(delim.length, expanded.length - delim.length)
        : expr
    // `__parse` builds the parse tree without typesetting: the same errors as
    // `renderToString({throwOnError: true})` for syntax, at a fraction of the cost.
    ;(katex as unknown as { __parse: KatexParse }).__parse(inner.trim(), {
      displayMode: display,
      throwOnError: true,
      strict: "ignore",
      macros: { ...macros },
    })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    result = raw
      .replace(/^KaTeX parse error:\s*/, "")
      .replace(/ at position \d+:[\s\S]*$/, "")
      .trim()
    if (!result) result = "invalid expression"
  }
  if (mathCache.size >= MATH_CACHE_MAX) {
    const oldest = mathCache.keys().next()
    if (!oldest.done) mathCache.delete(oldest.value)
  }
  mathCache.set(key, result)
  return result
}

function lintMath(env: Env, prose: string): Marker[] {
  const macros = env.ctx.macros ?? {}
  const macrosKey = JSON.stringify(macros)
  if (macrosKey !== mathCacheKey) {
    mathCache.clear()
    mathCacheKey = macrosKey
  }

  const markers: Marker[] = []
  const re = new RegExp(MATH_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(prose)) !== null) {
    // `\$` is a literal dollar sign, not a delimiter.
    if (m.index > 0 && prose[m.index - 1] === "\\") {
      re.lastIndex = m.index + 1
      continue
    }
    const display = m[1] !== undefined
    const expr = (display ? m[1] : m[2]).trim()
    if (!expr) continue
    const error = mathErrorFor(expr, display, macros)
    if (error !== null) {
      markers.push(
        emit(
          env,
          "math-parse-error",
          m.index,
          m.index + m[0].length,
          env.msg.mathError(error),
          env.Severity.Error,
        ),
      )
    }
  }
  return markers
}

// ── Rule: shorthand call issues ───────────────────────────────────────────────

export function extractBalanced(
  text: string,
  start: number,
): { content: string; end: number } | null {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++
    else if (text[i] === ")") {
      depth--
      if (depth === 0) return { content: text.slice(start + 1, i), end: i + 1 }
    }
  }
  return null
}

export function splitArgs(s: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ""
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
    else if (ch === "," && depth === 0) {
      args.push(current.trim())
      current = ""
      continue
    }
    current += ch
  }
  if (current.trim()) args.push(current.trim())
  return args
}

/** Expected argument count per shorthand. null = variadic (no count check). */
export const EXPECTED_ARGS: Record<string, number | null> = {
  mat: null,
  matf: null,
  table: null,
  frac: 2,
  sqrt: 1,
  root: 2,
  sum: 2,
  int: 2,
  lim: 2,
  vec: 1,
  abs: 1,
  norm: 1,
  ceil: 1,
  floor: 1,
  sup: 2,
  sub: 2,
  hat: 1,
  bar: 1,
  tilde: 1,
  dot: 1,
  ddot: 1,
  bf: 1,
  cal: 1,
  bb: 1,
  pder: 2,
  der: 2,
  inv: 1,
  trans: 1,
}

const SHORTHAND_NAMES = Object.keys(EXPECTED_ARGS).join("|")
// Negative lookbehind for \ avoids matching \frac( etc. (LaTeX commands)
const SHORTHAND_RE = new RegExp(`(?<!\\\\)\\b(${SHORTHAND_NAMES})\\s*\\(`, "g")

function lintShorthands(env: Env, text: string): Marker[] {
  const markers: Marker[] = []
  SHORTHAND_RE.lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = SHORTHAND_RE.exec(text)) !== null) {
    const name = m[1]
    const parenStart = m.index + m[0].length - 1
    const balanced = extractBalanced(text, parenStart)

    if (!balanced) {
      markers.push(
        emit(
          env,
          "shorthand-unclosed",
          m.index,
          m.index + m[0].length,
          env.msg.shorthandUnclosed(name),
          env.Severity.Error,
        ),
      )
      continue
    }

    const expected = EXPECTED_ARGS[name]
    if (expected !== null) {
      const args = splitArgs(balanced.content).filter((a) => a.length > 0)
      if (args.length > 0 && args.length !== expected) {
        markers.push(
          emit(
            env,
            "shorthand-arity",
            m.index,
            balanced.end,
            env.msg.shorthandArity(name, expected, args.length),
            env.Severity.Warning,
          ),
        )
      }
    }
  }

  return markers
}

// ── BibTeX linter ─────────────────────────────────────────────────────────────

const BIBTEX_KNOWN_TYPES = new Set([
  "article",
  "book",
  "booklet",
  "conference",
  "inbook",
  "incollection",
  "inproceedings",
  "manual",
  "mastersthesis",
  "misc",
  "phdthesis",
  "proceedings",
  "techreport",
  "unpublished",
])
const BIBTEX_SKIP_TYPES = new Set(["string", "preamble", "comment"])

// Each inner array is an OR group; at least one field from the group must be present.
const BIBTEX_REQUIRED: Record<string, string[][]> = {
  article: [["author"], ["title"], ["journal"], ["year"]],
  book: [["author", "editor"], ["title"], ["publisher"], ["year"]],
  booklet: [["title"]],
  conference: [["author"], ["title"], ["booktitle"], ["year"]],
  inbook: [["author", "editor"], ["title"], ["chapter", "pages"], ["publisher"], ["year"]],
  incollection: [["author"], ["title"], ["booktitle"], ["publisher"], ["year"]],
  inproceedings: [["author"], ["title"], ["booktitle"], ["year"]],
  manual: [["title"]],
  mastersthesis: [["author"], ["title"], ["school"], ["year"]],
  phdthesis: [["author"], ["title"], ["school"], ["year"]],
  proceedings: [["title"], ["year"]],
  techreport: [["author"], ["title"], ["institution"], ["year"]],
  unpublished: [["author"], ["title"], ["note"]],
}

function lintBibtex(env: Env, text: string): Marker[] {
  const markers: Marker[] = []
  const seenKeys = new Map<string, number>() // key → offset of first occurrence

  // Find each @type{ or @type( anchor
  const entryRe = /@(\w+)\s*[{(]/g
  let m: RegExpExecArray | null

  while ((m = entryRe.exec(text)) !== null) {
    const type = m[1].toLowerCase()
    if (BIBTEX_SKIP_TYPES.has(type)) continue

    const entryStart = m.index
    const braceStart = entryStart + m[0].length - 1
    const closeChar = text[braceStart] === "{" ? "}" : ")"

    // Walk forward counting braces to find the end of this entry
    let depth = 1
    let i = braceStart + 1
    while (i < text.length && depth > 0) {
      const ch = text[i]
      if (ch === "{" || ch === "(") depth++
      else if (ch === "}" || ch === ")") depth--
      i++
    }

    if (depth !== 0) {
      markers.push(
        emit(
          env,
          "bib-unclosed",
          entryStart,
          entryStart + m[0].length,
          env.msg.bibUnclosed(type, closeChar),
          env.Severity.Error,
        ),
      )
      continue
    }

    const entryBody = text.slice(braceStart + 1, i - 1)

    // Unknown entry type
    if (!BIBTEX_KNOWN_TYPES.has(type)) {
      markers.push(
        emit(
          env,
          "bib-unknown-type",
          entryStart,
          entryStart + m[0].length,
          env.msg.bibUnknownType(type),
          env.Severity.Warning,
        ),
      )
      continue
    }

    // Extract citation key (first identifier before the first comma)
    const keyMatch = /^\s*([\w:._-]+)/.exec(entryBody)
    if (!keyMatch) {
      markers.push(
        emit(
          env,
          "bib-no-key",
          entryStart,
          entryStart + m[0].length,
          env.msg.bibNoKey(type),
          env.Severity.Error,
        ),
      )
      continue
    }
    const key = keyMatch[1]
    const keyLower = key.toLowerCase()

    // Duplicate key check
    if (seenKeys.has(keyLower)) {
      markers.push(
        emit(
          env,
          "bib-duplicate-key",
          entryStart,
          entryStart + m[0].length,
          env.msg.bibDuplicateKey(key),
          env.Severity.Error,
        ),
      )
    } else {
      seenKeys.set(keyLower, entryStart)
    }

    // Collect field names defined in this entry.
    // Fields follow the key: fieldname = {value} or fieldname = "value" or fieldname = number
    // We scan for `word =` patterns, skipping content inside braces.
    const presentFields = new Set<string>()
    const fieldsText = entryBody.slice(keyMatch[0].length)
    let fi = 0
    while (fi < fieldsText.length) {
      // Skip whitespace and commas
      if (
        fieldsText[fi] === "," ||
        fieldsText[fi] === " " ||
        fieldsText[fi] === "\n" ||
        fieldsText[fi] === "\r" ||
        fieldsText[fi] === "\t"
      ) {
        fi++
        continue
      }
      // Try to match a field name followed by =
      const fieldMatch = /^(\w+)\s*=/.exec(fieldsText.slice(fi))
      if (fieldMatch) {
        presentFields.add(fieldMatch[1].toLowerCase())
        fi += fieldMatch[0].length
        // Skip the value (could be {}, "", or a number)
        while (
          fi < fieldsText.length &&
          fieldsText[fi] !== "{" &&
          fieldsText[fi] !== '"' &&
          !/\d/.test(fieldsText[fi]) &&
          fieldsText[fi] !== ","
        )
          fi++
        if (fi < fieldsText.length && fieldsText[fi] === "{") {
          let bd = 0
          while (fi < fieldsText.length) {
            if (fieldsText[fi] === "{") bd++
            else if (fieldsText[fi] === "}") {
              bd--
              if (bd === 0) {
                fi++
                break
              }
            }
            fi++
          }
        } else if (fi < fieldsText.length && fieldsText[fi] === '"') {
          fi++ // skip opening "
          while (fi < fieldsText.length && fieldsText[fi] !== '"') fi++
          fi++ // skip closing "
        } else {
          // numeric value
          while (fi < fieldsText.length && /[\d]/.test(fieldsText[fi])) fi++
        }
      } else {
        fi++
      }
    }

    // Check required fields
    const required = BIBTEX_REQUIRED[type]
    if (required) {
      for (const group of required) {
        if (!group.some((f) => presentFields.has(f))) {
          markers.push(
            emit(
              env,
              "bib-missing-field",
              entryStart,
              entryStart + m[0].length,
              env.msg.bibMissingField(type, key, group),
              env.Severity.Warning,
            ),
          )
        }
      }
    }
  }

  return markers
}

// ── Macros linter (macros.md) ─────────────────────────────────────────────────

function lintMacros(env: Env, text: string): Marker[] {
  const markers: Marker[] = []
  const seenCommands = new Map<string, number>() // command name → first offset

  // Find all \newcommand{\name} occurrences to detect duplicates
  const ncRe = /\\newcommand\{(\\[a-zA-Z]+)\}/g
  let m: RegExpExecArray | null
  while ((m = ncRe.exec(text)) !== null) {
    const name = m[1]
    if (seenCommands.has(name)) {
      markers.push(
        emit(
          env,
          "macros-duplicate",
          m.index,
          m.index + m[0].length,
          env.msg.macroDuplicate(name),
          env.Severity.Error,
        ),
      )
    } else {
      seenCommands.set(name, m.index)
    }
  }

  // Check global brace balance
  let depth = 0
  let lastUnmatched = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      depth++
      lastUnmatched = i
    } else if (text[i] === "}") {
      if (depth === 0) {
        markers.push(
          emit(env, "macros-brace-close", i, i + 1, env.msg.macroBraceClose(), env.Severity.Error),
        )
      } else {
        depth--
        if (depth === 0) lastUnmatched = -1
      }
    }
  }
  if (depth > 0 && lastUnmatched >= 0) {
    markers.push(
      emit(
        env,
        "macros-brace-open",
        lastUnmatched,
        lastUnmatched + 1,
        env.msg.macroBraceOpen(),
        env.Severity.Error,
      ),
    )
  }

  // Warn about lines that are neither blank, comments, nor \newcommand
  const lines = text.split("\n")
  let offset = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed !== "" && !trimmed.startsWith("%") && !trimmed.startsWith("\\")) {
      markers.push(
        emit(
          env,
          "macros-unknown-line",
          offset,
          offset + line.length,
          env.msg.macroUnknownLine(),
          env.Severity.Warning,
        ),
      )
    }
    offset += line.length + 1
  }

  return markers
}

// ── Rule: dictionary spell-check (opt-in) ─────────────────────────────────────

/**
 * Emit Hint markers for unknown words. Runs ONLY when `context.spellcheck` is
 * true; when off, this is never called, so no dictionary is loaded and no
 * tokenising happens (fully offline, zero overhead when disabled).
 *
 * Operates on the ORIGINAL text (not the code-stripped `clean`), because
 * `checkText` applies its own non-prose masking and needs accurate offsets.
 */
function lintSpelling(env: Env, text: string): Marker[] {
  const lang = env.ctx.spellLang ?? "es"
  const issues = checkText(text, lang)
  const message = env.ctx.spellMessage ?? env.msg.spellUnknown
  return issues.map((issue) =>
    emit(env, "spell-unknown", issue.start, issue.end, message(issue.word), env.Severity.Hint),
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pipe-table rows whose column count differs from their header's.
 *
 * markdown-it follows GFM here: extra cells are dropped and missing ones are
 * rendered empty, so the preview quietly disagrees with the source and the
 * author never finds out. A warning (not an error) plus the "Normalize table"
 * quick fix is the remedy; the document still renders.
 */
function lintTables(env: Env, text: string): Marker[] {
  const lines = text.split("\n")
  return raggedTableRows(lines).map(({ line, expected, actual }) => {
    const start = env.lineIdx[line] ?? 0
    return emit(
      env,
      "table-ragged",
      start,
      start + lines[line].length,
      env.msg.tableRagged(actual, expected),
      env.Severity.Warning,
    )
  })
}

/**
 * `{{?}}` gaps waiting to be filled.
 *
 * Info severity, not a warning: an unfilled gap is a deliberate to-do, not a
 * defect. The marker makes them visible in the overview ruler so a long document
 * does not quietly accumulate holes.
 */
function lintGaps(env: Env, text: string): Marker[] {
  return findGaps(text).map((gap) =>
    emit(
      env,
      "gap-pending",
      gap.start,
      gap.end,
      env.msg.gapPending(gap.hint || null),
      env.Severity.Info,
    ),
  )
}

/**
 * Taxonomic binomials and gene symbols that should be italic. Warnings only:
 * `Bacillus` may be a genus or a surname, and only the author knows.
 */
function lintBioConventions(env: Env, text: string): Marker[] {
  return findBioConventions(text).map((f) =>
    emit(
      env,
      f.kind === "gene" ? "bio-gene" : "bio-binomial",
      f.start,
      f.end,
      env.ctx.bioMessage
        ? env.ctx.bioMessage(f.kind, f.text)
        : env.msg.bioItalic(f.text, f.suggestion),
      env.Severity.Warning,
    ),
  )
}

/**
 * Datasets are declared with `{#data:x}` and used with `@data:x`. A typo in
 * either direction renders an honest note in the document, but the marker
 * catches it while writing, which is where it costs least.
 */
function lintDataRefs(env: Env, text: string): Marker[] {
  const markers: Marker[] = []
  const declared = new Map<string, number>()

  const declRe = /\{#(data:[\w:.-]+)\}/g
  let m: RegExpExecArray | null
  while ((m = declRe.exec(text)) !== null) {
    const id = m[1]
    if (declared.has(id)) {
      markers.push(
        emit(
          env,
          "data-duplicate",
          m.index,
          m.index + m[0].length,
          env.msg.dataDuplicate(id),
          env.Severity.Warning,
        ),
      )
    } else {
      declared.set(id, m.index)
    }
  }

  const refRe = /@(data:[\w-]+(?:\.[\w-]+)*)/g
  while ((m = refRe.exec(text)) !== null) {
    if (!declared.has(m[1])) {
      markers.push(
        emit(
          env,
          "data-undeclared",
          m.index,
          m.index + m[0].length,
          env.msg.dataUndeclared(m[1]),
          env.Severity.Warning,
        ),
      )
    }
  }
  return markers
}

function makeEnv(text: string, context: LintContext, Severity: Severities): Env {
  return {
    lineIdx: buildLineIndex(text),
    Severity,
    msg: context.messages ?? es.lint.messages,
    ctx: context,
  }
}

/**
 * Lint a Markdown/LaTeX document (the main editor format).
 */
export function lintContent(
  text: string,
  context: LintContext,
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  const clean = stripCode(text)
  const prose = maskNonProse(clean)
  const env = makeEnv(text, context, Severity)

  const markers = [
    ...lintDisplayMath(env, clean),
    ...lintEnvironments(env, clean),
    ...lintRefs(env, clean),
    ...lintDuplicateLabels(env, clean),
    ...lintWikilinks(env, clean),
    ...lintCitations(env, clean),
    ...lintShorthands(env, clean),
    ...lintTables(env, clean),
    ...lintGaps(env, text),
    ...lintFootnotes(env, prose),
    ...lintImages(env, prose),
    ...lintMath(env, prose),
    // Opt-in per document (frontmatter `comdtex.domain: biology`): journals
    // return manuscripts over un-italicized binomials and gene symbols.
    ...lintBioConventions(env, text),
    ...lintDataRefs(env, clean),
  ]

  if (context.spellcheck) {
    markers.push(...lintSpelling(env, text))
  }

  return markers
}

/**
 * Dispatch to the correct linter based on file name.
 *  - *.bib        → BibTeX linter
 *  - macros.md    → Macros linter
 *  - everything else → Markdown/LaTeX content linter
 */
export function lintFile(
  text: string,
  filename: string,
  context: LintContext,
  Severity: typeof monacoApi.MarkerSeverity,
): monacoApi.editor.IMarkerData[] {
  if (filename.endsWith(".bib")) return lintBibtex(makeEnv(text, context, Severity), text)
  if (filename === "macros.md") return lintMacros(makeEnv(text, context, Severity), text)
  return lintContent(text, context, Severity)
}

/**
 * Lightweight summary for background linting: does NOT require Monaco at runtime.
 * Uses numeric severity constants that match Monaco's MarkerSeverity enum values.
 */
export function lintFileSummary(text: string, filename: string, context: LintContext): LintSummary {
  const markers = lintFile(
    text,
    filename,
    context,
    SEV as unknown as typeof monacoApi.MarkerSeverity,
  )
  return {
    errors: markers.filter((m) => m.severity === SEV.Error).length,
    warnings: markers.filter((m) => m.severity === SEV.Warning).length,
  }
}
