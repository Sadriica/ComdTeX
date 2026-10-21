/**
 * Hover cards for ComdTeX syntax in the editor.
 *
 *   [@a; @b, p. 3]   one card per cited key
 *   [[note#h]]       first lines of any vault note (from the vault text cache,
 *                    never a synchronous disk read; unloaded text is read async)
 *   @eq:x            the equation number the preview shows, plus its TeX
 *   @thm:x @fig:x    environment title + number and the first lines of its body
 *   @doc@def:x       the same, resolved in the other file
 *   [^n]             the footnote text
 *
 * Bodies are shown as plain markdown text: Monaco's hover cannot render KaTeX,
 * and the sanctioned HTML path (renderMarkdown + sanitizeRenderedHtml) belongs
 * to DOM sinks, not to a MarkdownString.
 */
import type * as monacoApi from "monaco-editor"
import { envDisplayLabel } from "./environments"
import { getNavHost, getNavSnapshot, type NavModel, type NavSnapshot } from "./navHost"
import {
  constructAt,
  constructsInLine,
  indexFile,
  type FileNav,
  type LineConstruct,
} from "./navScan"

// ── Bibliography entries (fed by App through monacoSetup.updateBibHoverEntries) ─

export interface BibHoverEntry {
  key: string
  type: string
  fields: Record<string, string>
}
let bibEntries = new Map<string, BibHoverEntry>()
export function setBibHoverEntries(entries: BibHoverEntry[]): void {
  bibEntries = new Map(entries.map((e) => [e.key, e]))
}

// ── Card builders (pure) ──────────────────────────────────────────────────────

export function citationCard(key: string, notFound: (what: string) => string): string {
  const entry = bibEntries.get(key)
  if (!entry) return `\`@${key}\`\n\n${notFound(`@${key}`)}`
  const f = entry.fields
  const lines: string[] = []
  if (f.title) lines.push(`**${f.title}**`)
  if (f.author) lines.push(`_${f.author}_`)
  const meta = [f.year, f.journal ?? f.booktitle ?? f.publisher].filter(Boolean).join(", ")
  if (meta) lines.push(meta)
  lines.push(`\`@${entry.type}{${key}}\``)
  return lines.join("\n\n")
}

/** Longest preview line: a hover near the editor's right edge is clipped, so keep cards narrow. */
const MAX_LINE = 72

/**
 * First `max` non-blank lines, each cut to a card-friendly width, joined with
 * hard breaks (a single newline would run them together in markdown), and a
 * trailing ellipsis when there is more.
 */
export function previewLines(text: string, max: number): string {
  const lines = text.split("\n").filter((l) => l.trim() !== "")
  const cut = (l: string) => (l.length > MAX_LINE ? `${l.slice(0, MAX_LINE - 1)}…` : l)
  const body = lines.slice(0, max).map(cut).join("  \n")
  return lines.length > max ? `${body}  \n…` : body
}

function stripFrontmatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  return m ? text.slice(m[0].length) : text
}

/** The section under a heading (until the next heading of the same or higher level). */
export function sectionText(file: FileNav, headingLine: number): string {
  const lines = file.lines()
  const level = file.headings.find((h) => h.line === headingLine)?.level ?? 1
  const next = file.headings.find((h) => h.line > headingLine && h.level <= level)
  return lines.slice(headingLine, next ? next.line - 1 : lines.length).join("\n")
}

function baseName(file: FileNav): string {
  return file.name.replace(/\.(md|tex)$/i, "")
}

async function noteCard(
  snap: NavSnapshot,
  c: Extract<LineConstruct, { type: "wikilink" }>,
): Promise<string[]> {
  const host = getNavHost()
  const strings = host.getStrings()
  const { db } = snap
  const file = db.findNote(c.note, snap.activePath)
  if (!file) return [strings.unresolved(`[[${c.note}]]`)]
  let nav = file
  if (!nav.text.trim()) {
    // The text cache has not reached this note yet: read it, asynchronously.
    const raw = await host.readText(file.path).catch(() => null)
    // Index the text just read: the headings of the stale entry are empty.
    if (raw) nav = indexFile({ path: file.path, name: file.name, content: raw })
  }
  const heading = c.heading ? db.findHeading(nav, c.heading) : null
  const source = heading ? sectionText(nav, heading.line) : stripFrontmatter(nav.text)
  const title = heading ? `${baseName(nav)} › ${heading.text}` : baseName(nav)
  const body = previewLines(source, 12)
  return [`**${title}**`, body || strings.emptyNote]
}

function refCard(snap: NavSnapshot, c: Extract<LineConstruct, { type: "ref" }>): string[] {
  const host = getNavHost()
  const strings = host.getStrings()
  const lang = host.getLang()
  const { db } = snap

  // `@eq:3` points at the third numbered equation.
  if (c.kind === "eq" && /^\d+$/.test(c.name)) {
    const own = snap.activePath ? db.file(snap.activePath) : null
    const block = own?.math().find((b) => b.n === Number(c.name))
    if (block) return [`**${strings.equation(block.n)}**`, "```tex\n" + block.body + "\n```"]
  }

  const hits = db.resolveRef(c, snap.activePath)
  if (hits.length === 0) return [strings.unresolved(c.id)]
  const { file, label } = hits[0]
  const where = `\`${strings.inFile(file.name, label.line)}\``

  if (label.kind === "eq") {
    const block = file.math().find((b) => b.label === c.id)
    if (block) {
      return [`**${strings.equation(block.n)}**`, "```tex\n" + block.body + "\n```", where]
    }
  }
  const env = file.envs().find((e) => e.label === c.id)
  if (env) {
    const head = envDisplayLabel(env.type, env.number, env.title, lang)
    const body = previewLines(env.body, 6)
    return [`**${head}**`, ...(body ? [body] : []), where]
  }
  const context = (file.lines()[label.line - 1] ?? "")
    .replace(/\{#[^}]*\}/g, "")
    .replace(/^#{1,6}\s+/, "")
    .trim()
  return [`**${c.id}**`, ...(context ? [context] : []), where]
}

// ── Provider ──────────────────────────────────────────────────────────────────

type Pos = { lineNumber: number; column: number }

export function createHoverProvider(monaco: typeof monacoApi): monacoApi.languages.HoverProvider {
  const md = (value: string): monacoApi.IMarkdownString => ({ value, isTrusted: false })

  return {
    async provideHover(m, position: Pos) {
      const model = m as unknown as NavModel
      const lineText = m.getLineContent(position.lineNumber)
      const col0 = position.column - 1
      const range = (a: number, b: number) =>
        new monaco.Range(position.lineNumber, a + 1, position.lineNumber, b + 1)

      const footnote = footnoteAt(lineText, col0)
      if (footnote) {
        const def = new RegExp(`^\\[\\^${footnote.label}\\]:\\s*(.+)$`, "m").exec(m.getValue())
        if (!def) return null
        const strings = getNavHost().getStrings()
        return {
          range: range(footnote.start, footnote.end),
          contents: [md(`**${strings.footnote}:** ${def[1]}`)],
        }
      }

      const c = constructAt(lineText, col0)
      if (!c || c.type === "labelDef") return null
      const strings = getNavHost().getStrings()

      if (c.type === "cite") {
        // Every key of the group, so `[@a; @b]` shows both whichever is hovered.
        const keys = constructsInLine(lineText)
          .filter((x) => x.type === "cite" && x.groupStart === c.groupStart)
          .map((x) => (x as Extract<LineConstruct, { type: "cite" }>).key)
        return {
          range: range(c.groupStart, c.groupEnd),
          contents: keys.map((k) => md(citationCard(k, strings.unresolved))),
        }
      }

      const snap = getNavSnapshot(model)
      if (c.type === "wikilink") {
        const parts = await noteCard(snap, c)
        return { range: range(c.start, c.end), contents: parts.map(md) }
      }
      return { range: range(c.start, c.end), contents: refCard(snap, c).map(md) }
    },
  }
}

function footnoteAt(
  line: string,
  col0: number,
): { label: string; start: number; end: number } | null {
  if (!line.includes("[^")) return null
  const re = /\[\^([\w-]+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (col0 >= m.index && col0 <= m.index + m[0].length) {
      // A definition line `[^n]: text` is not a reference.
      if (m.index === 0 && line[m[0].length] === ":") return null
      return { label: m[1], start: m.index, end: m.index + m[0].length }
    }
  }
  return null
}

export function registerEditorHovers(
  monaco: typeof monacoApi,
  languages: readonly string[],
): monacoApi.IDisposable {
  const provider = createHoverProvider(monaco)
  const disposables = languages.map((lang) =>
    monaco.languages.registerHoverProvider(lang, provider),
  )
  return { dispose: () => disposables.forEach((d) => d.dispose()) }
}
