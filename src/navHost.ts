/**
 * Shared plumbing for the navigation and hover providers: the host the app
 * plugs in (vault files, open-at-line, strings), a per-model snapshot of the
 * vault database, shadow models for files that are not open in the editor, and
 * the lazy reference-file lookup for `[@key]`.
 *
 * Monaco's standalone editor can only show a model that already exists, and it
 * cannot open another file by itself. So a result in another note is a
 * "shadow" model created on demand from the vault's text, and the editor opener
 * (editorNavigation.ts) routes a click on one back to the app.
 */
import type * as monacoApi from "monaco-editor"
import type { DocLang } from "./docLang"
import { NavDb, type NavFile } from "./navScan"

export interface EditorNavStrings {
  followLink: string
  goToDefinition: string
  findUsages: string
  unresolved: (what: string) => string
  equation: (n: number) => string
  inFile: (file: string, line: number) => string
  footnote: string
  emptyNote: string
}

export const DEFAULT_NAV_STRINGS: EditorNavStrings = {
  followLink: "Follow link",
  goToDefinition: "Go to definition",
  findUsages: "Find usages",
  unresolved: (what) => `Not found: ${what}`,
  equation: (n) => `Equation (${n})`,
  inFile: (file, line) => `${file}, line ${line}`,
  footnote: "Footnote",
  emptyNote: "(empty note)",
}

export interface NavigationHost {
  /** Vault path of the note in the editor, or null. */
  getActivePath(): string | null
  /** Every vault document (editor-format text; open tabs overlaid, never read from disk here). */
  getFiles(): NavFile[]
  /** Freshest text of an open tab, if the app has one. */
  getLiveText?(path: string): string | undefined
  /** Absolute path of references.bib, or null without a vault. */
  getBibPath(): string | null
  /** Raw text of a vault file (asynchronous; used for references.bib only). */
  readText(path: string): Promise<string | null>
  /** Open a file (or just move the caret when it is the current one) at a position. */
  openLocation(path: string, line: number, column: number): void
  getStrings(): EditorNavStrings
  getLang(): DocLang
}

const noopHost: NavigationHost = {
  getActivePath: () => null,
  getFiles: () => [],
  getBibPath: () => null,
  readText: async () => null,
  openLocation: () => {},
  getStrings: () => DEFAULT_NAV_STRINGS,
  getLang: () => "en",
}

let host: NavigationHost = noopHost

export function configureEditorNavigation(next: Partial<NavigationHost>): void {
  host = { ...host, ...next }
}

export function resetEditorNavigation(): void {
  host = noopHost
  snapshotCache = null
  bibCache = null
}

export function getNavHost(): NavigationHost {
  return host
}

// ── Models ────────────────────────────────────────────────────────────────────

/** The part of a Monaco text model the providers read. */
export interface NavModel {
  readonly uri: monacoApi.Uri
  readonly id?: string
  getValue(): string
  getLineContent(line: number): string
  getLineCount(): number
  getVersionId(): number
}

export const NAV_SCHEME = "comdtex-nav"
const MAX_SHADOW_MODELS = 40

interface Shadow {
  path: string
  model: monacoApi.editor.ITextModel
  used: number
}
const shadows = new Map<string, Shadow>()
let useClock = 0
// Clock value at the start of the current request. Anything used since belongs
// to the latest result set and is never evicted while that set may be on screen.
let requestStart = 0

/** The vault path a shadow model stands for, or null for any other URI. */
export function pathOfShadowUri(uri: { toString(): string }): string | null {
  return shadows.get(uri.toString())?.path ?? null
}

/**
 * Start of a navigation request that may create shadow models. Trims the cache
 * back to its cap here, between requests, and only models the previous request
 * did not hand out: the references peek still shows (and navigates through) the
 * models of its latest result list, however long it is. Within a request
 * nothing is ever evicted, so a list of 100 notes keeps all 100 models.
 */
export function beginShadowRequest(): void {
  const previousStart = requestStart
  requestStart = ++useClock
  if (shadows.size <= MAX_SHADOW_MODELS) return
  const evictable = [...shadows.entries()]
    .filter(([, s]) => s.used < previousStart)
    .sort((a, b) => a[1].used - b[1].used)
  for (const [key, s] of evictable) {
    if (shadows.size <= MAX_SHADOW_MODELS) break
    s.model.dispose()
    shadows.delete(key)
  }
}

/** A model for a file that is not the one in the editor, kept in step with `text`. */
export function ensureShadowModel(
  monaco: typeof monacoApi,
  path: string,
  text: string,
  language = "markdown",
): monacoApi.Uri {
  const uri = monaco.Uri.file(path)
  const key = uri.toString()
  let entry = shadows.get(key)
  if (!entry) {
    const existing = monaco.editor.getModel(uri)
    const model = existing ?? monaco.editor.createModel(text, language, uri)
    entry = { path, model, used: ++useClock }
    shadows.set(key, entry)
  }
  entry.used = ++useClock
  if (entry.model.getValue() !== text) entry.model.setValue(text)
  return uri
}

export function disposeShadowModels(): void {
  for (const s of shadows.values()) s.model.dispose()
  shadows.clear()
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface NavSnapshot {
  db: NavDb
  /** Vault path of the document the model shows, or null. */
  activePath: string | null
}

let snapshotCache: {
  files: NavFile[]
  activePath: string | null
  modelKey: string
  version: number
  snap: NavSnapshot
} | null = null

let modelCounter = 0
const modelKeys = new WeakMap<object, string>()
function keyOf(model: NavModel): string {
  if (model.id) return model.id
  let k = modelKeys.get(model)
  if (!k) {
    k = `m${++modelCounter}`
    modelKeys.set(model, k)
  }
  return k
}

/**
 * The vault database as seen from `model`: the vault files with the model's
 * own live text substituted for its file. Memoized on the files array, the
 * model and its version, so repeated hovers cost nothing and the first one
 * after an edit re-indexes only the edited file.
 */
export function getNavSnapshot(model: NavModel): NavSnapshot {
  const files = host.getFiles()
  const modelPath = pathOfShadowUri(model.uri)
  const activePath = modelPath ?? host.getActivePath()
  const modelKey = keyOf(model)
  const version = model.getVersionId()
  const c = snapshotCache
  if (
    c &&
    c.files === files &&
    c.activePath === activePath &&
    c.modelKey === modelKey &&
    c.version === version
  )
    return c.snap
  const live = modelPath ? undefined : model.getValue()
  const withLive = files.map((f) => {
    if (activePath && f.path === activePath && live !== undefined)
      return live === f.content ? f : { ...f, content: live }
    const fresh = host.getLiveText?.(f.path)
    return fresh !== undefined && fresh !== f.content ? { ...f, content: fresh } : f
  })
  // The active file may be missing from the vault list (untitled, outside the vault).
  if (activePath && live !== undefined && !withLive.some((f) => f.path === activePath)) {
    withLive.push({
      path: activePath,
      name: activePath.split("/").pop() ?? activePath,
      content: live,
    })
  }
  const snap = { db: new NavDb(withLive), activePath }
  snapshotCache = { files, activePath, modelKey, version, snap }
  return snap
}

/**
 * Monaco Uri for a vault path. By default the editor's own model stands for the
 * active file (a jump inside it is native: selection and reveal). A references
 * list passes `useEditorModel: false`: the editor's model URI is an anonymous
 * `inmemory://` one, and the peek would group the active file's hits under it
 * instead of under the note's name.
 */
export function uriForPath(
  monaco: typeof monacoApi,
  model: NavModel,
  snap: NavSnapshot,
  path: string,
  useEditorModel = true,
): monacoApi.Uri {
  if (useEditorModel && path === snap.activePath) return model.uri
  const file = snap.db.file(path)
  return ensureShadowModel(monaco, path, file?.text ?? "")
}

// ── references.bib ────────────────────────────────────────────────────────────

let bibCache: { at: number; path: string; text: string } | null = null
const BIB_TTL_MS = 3000

export async function readBibText(force = false): Promise<{ path: string; text: string } | null> {
  const path = host.getBibPath()
  if (!path) return null
  const now = Date.now()
  if (!force && bibCache && bibCache.path === path && now - bibCache.at < BIB_TTL_MS)
    return bibCache
  const text = await host.readText(path).catch(() => null)
  if (text === null) return null
  bibCache = { at: now, path, text }
  return bibCache
}

export interface BibLocation {
  path: string
  text: string
  line: number
  /** 0-based column of the key. */
  col: number
}

/** Where `@type{key,` starts in references.bib. */
export function findBibEntry(text: string, key: string): { line: number; col: number } | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`^\\s*@\\w+\\s*[{(]\\s*(${escaped})\\s*,`, "i")
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i])
    if (m) return { line: i + 1, col: m[0].indexOf(m[1], m[0].search(/[{(]/) + 1) }
  }
  return null
}

export async function locateBibEntry(key: string): Promise<BibLocation | null> {
  const bib = await readBibText()
  if (!bib) return null
  const at = findBibEntry(bib.text, key)
  return at ? { ...bib, ...at } : null
}
