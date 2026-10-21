/**
 * Go to definition, find usages and link underlines for ComdTeX's own syntax:
 *
 *   [[note]] [[note#heading]] ![[note]]   open the note (at the heading)
 *   @kind:name                            the label definition, this file or another
 *   @path@kind:name  @[path]@kind:name    the label definition in that file
 *   [@a; @b]                              the entry in references.bib
 *   {#kind:name}                          F12 lists its usages
 *
 * Usages (Shift+F12) are every reference to a label across the vault, a
 * citation key across the vault, or every `[[link]]` to a note.
 *
 * Cross-file results need two things Monaco's standalone editor lacks. A
 * result in another note is shown through a "shadow" model built from the
 * vault text (navHost.ts), and activating it goes through the editor opener
 * registered here, which hands the target back to the app's own open-file
 * routine (`NavigationHost.openLocation`). Nothing here reads the disk except
 * references.bib, asynchronously.
 *
 * The providers are plain objects built from a `monaco` argument, so tests can
 * drive them with a fake.
 */
import type * as monacoApi from "monaco-editor"
import { registerEditorHovers } from "./editorHovers"
import {
  NAV_SCHEME,
  beginShadowRequest,
  ensureShadowModel,
  getNavHost,
  getNavSnapshot,
  isLatexModel,
  locateBibEntry,
  pathOfShadowUri,
  readBibText,
  uriForPath,
  disposeShadowModels,
  type NavModel,
  type NavSnapshot,
} from "./navHost"
import { constructAt, constructsInLine, type LineConstruct, type NavTarget } from "./navScan"

export { configureEditorNavigation, type NavigationHost, type EditorNavStrings } from "./navHost"

// ── Resolution ────────────────────────────────────────────────────────────────

/** Where a construct leads. */
export interface NavResolved {
  path: string
  target: NavTarget
  /** Set for references.bib, which is not a vault document. */
  bib?: { text: string }
}

function pointTarget(path: string, line: number, startCol0 = 0, endCol0 = 0): NavTarget {
  return { path, line, endLine: line, selLine: line, selStart: startCol0, selEnd: endCol0 }
}

/** Everything a construct can resolve to without touching the disk. */
export function resolveConstructSync(
  snap: NavSnapshot,
  c: LineConstruct,
  fromPath: string | null,
): NavResolved[] {
  const { db } = snap
  if (c.type === "wikilink") {
    const file = db.findNote(c.note, fromPath)
    if (!file) return []
    const heading = c.heading ? db.findHeading(file, c.heading) : null
    return [{ path: file.path, target: pointTarget(file.path, heading?.line ?? 1) }]
  }
  if (c.type === "ref") {
    return db
      .resolveRef(c, fromPath)
      .map((hit) => ({ path: hit.file.path, target: db.targetOf(hit) }))
  }
  if (c.type === "labelDef") {
    if (!fromPath) return []
    const file = db.file(fromPath)
    if (!file) return []
    return (file.labelsById.get(c.id) ?? []).map((label) => ({
      path: fromPath,
      target: db.targetOf({ file, label }),
    }))
  }
  return []
}

export async function resolveConstruct(
  snap: NavSnapshot,
  c: LineConstruct,
  fromPath: string | null,
): Promise<NavResolved[]> {
  if (c.type !== "cite") return resolveConstructSync(snap, c, fromPath)
  const loc = await locateBibEntry(c.key)
  if (!loc) return []
  return [
    {
      path: loc.path,
      target: pointTarget(loc.path, loc.line, loc.col, loc.col + c.key.length),
      bib: { text: loc.text },
    },
  ]
}

// ── Provider construction ────────────────────────────────────────────────────

type Pos = { lineNumber: number; column: number }

function lineLengthOf(snap: NavSnapshot, model: NavModel, path: string, line: number): number {
  if (path === snap.activePath) {
    return line <= model.getLineCount() ? model.getLineContent(line).length : 0
  }
  return snap.db.file(path)?.lines()[line - 1]?.length ?? 0
}

function uriOfResolved(
  monaco: typeof monacoApi,
  model: NavModel,
  snap: NavSnapshot,
  r: NavResolved,
): monacoApi.Uri {
  if (r.bib) return ensureShadowModel(monaco, r.path, r.bib.text, "plaintext")
  return uriForPath(monaco, model, snap, r.path)
}

function originRange(monaco: typeof monacoApi, line: number, c: LineConstruct) {
  return new monaco.Range(line, c.start + 1, line, c.end + 1)
}

export interface NavigationProviders {
  definition: monacoApi.languages.DefinitionProvider
  references: monacoApi.languages.ReferenceProvider
  links: monacoApi.languages.LinkProvider
}

export function createNavigationProviders(monaco: typeof monacoApi): NavigationProviders {
  const strings = () => getNavHost().getStrings()

  const definition: monacoApi.languages.DefinitionProvider = {
    async provideDefinition(m, position: Pos) {
      const model = m as unknown as NavModel
      const c = constructAt(
        m.getLineContent(position.lineNumber),
        position.column - 1,
        isLatexModel(model),
      )
      if (!c) return null
      beginShadowRequest()
      const snap = getNavSnapshot(model)
      const resolved = await resolveConstruct(snap, c, snap.activePath)
      if (resolved.length === 0) return null
      return resolved.map((r) => {
        const t = r.target
        return {
          uri: uriOfResolved(monaco, model, snap, r),
          originSelectionRange: originRange(monaco, position.lineNumber, c),
          range: new monaco.Range(
            t.line,
            1,
            t.endLine,
            lineLengthOf(snap, model, r.path, t.endLine) + 1,
          ),
          targetSelectionRange: new monaco.Range(
            t.selLine,
            t.selStart + 1,
            t.selLine,
            t.selEnd + 1,
          ),
        }
      })
    },
  }

  const references: monacoApi.languages.ReferenceProvider = {
    async provideReferences(m, position: Pos, context) {
      const model = m as unknown as NavModel
      const c = constructAt(
        m.getLineContent(position.lineNumber),
        position.column - 1,
        isLatexModel(model),
      )
      if (!c) return null
      beginShadowRequest()
      const snap = getNavSnapshot(model)
      const { db } = snap
      const out: monacoApi.languages.Location[] = []
      const push = (path: string, line: number, start: number, end: number) => {
        out.push({
          uri: uriForPath(monaco, model, snap, path, false),
          range: new monaco.Range(line, start + 1, line, end + 1),
        })
      }

      if (c.type === "ref" || c.type === "labelDef") {
        const defs = resolveConstructSync(snap, c, snap.activePath)
        const defPath = defs[0]?.path ?? snap.activePath ?? ""
        if (context.includeDeclaration !== false) {
          for (const hit of c.type === "ref"
            ? db.resolveRef(c, snap.activePath)
            : (db.file(defPath)?.labelsById.get(c.id) ?? []).map((label) => ({
                file: db.file(defPath)!,
                label,
              }))) {
            push(hit.file.path, hit.label.line, hit.label.start, hit.label.end)
          }
        }
        for (const u of db.usagesOfLabel(c.id, defPath))
          push(u.file.path, u.ref.line, u.ref.start, u.ref.end)
      } else if (c.type === "cite") {
        for (const u of db.usagesOfCite(c.key))
          push(u.file.path, u.cite.line, u.cite.start, u.cite.end)
      } else {
        const file = db.findNote(c.note, snap.activePath)
        if (file)
          for (const b of db.backlinks(file))
            push(b.file.path, b.link.line, b.link.start, b.link.end)
      }
      return out.length ? dedupeLocations(out) : null
    },
  }

  const links: monacoApi.languages.LinkProvider = {
    async provideLinks(m) {
      const model = m as unknown as NavModel
      const snap = getNavSnapshot(model)
      const out: monacoApi.languages.ILink[] = []
      const total = m.getLineCount()
      let bibReady = false
      for (let line = 1; line <= total; line++) {
        const text = m.getLineContent(line)
        const latex = isLatexModel(model)
        if (!(latex ? text.includes("\\") : text.includes("@") || text.includes("[["))) continue
        for (const c of constructsInLine(text, latex)) {
          if (c.type === "labelDef") continue
          if (c.type === "cite" && !bibReady) {
            await readBibText()
            bibReady = true
          }
          const resolved =
            c.type === "cite"
              ? await resolveConstruct(snap, c, snap.activePath)
              : resolveConstructSync(snap, c, snap.activePath)
          const first = resolved[0]
          if (!first) continue
          out.push({
            range: new monaco.Range(line, c.start + 1, line, c.end + 1),
            url: monaco.Uri.from({
              scheme: NAV_SCHEME,
              path: "/",
              query: new URLSearchParams({
                path: first.path,
                line: String(first.target.selLine),
                col: String(first.target.selStart + 1),
              }).toString(),
            }),
            tooltip: strings().followLink,
          })
        }
      }
      return { links: out }
    },
  }

  return { definition, references, links }
}

function dedupeLocations(list: monacoApi.languages.Location[]): monacoApi.languages.Location[] {
  const seen = new Set<string>()
  return list.filter((l) => {
    const r = l.range as { startLineNumber: number; startColumn: number }
    const key = `${l.uri.toString()}#${r.startLineNumber}:${r.startColumn}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Registration ──────────────────────────────────────────────────────────────

let registered: monacoApi.IDisposable[] = []

/**
 * Registers the providers for `languages`, plus the editor/link openers that
 * send cross-file targets back to the app. Safe to call again (the editor
 * remounts per tab): the previous registration is disposed first.
 */
export function registerEditorNavigation(
  monaco: typeof monacoApi,
  languages: readonly string[] = ["markdown"],
): monacoApi.IDisposable {
  disposeEditorNavigation()
  const p = createNavigationProviders(monaco)
  for (const lang of languages) {
    registered.push(
      monaco.languages.registerDefinitionProvider(lang, p.definition),
      monaco.languages.registerReferenceProvider(lang, p.references),
      monaco.languages.registerLinkProvider(lang, p.links),
    )
  }
  registered.push(registerEditorHovers(monaco, languages))
  registered.push(lockShadowEditors(monaco))

  registered.push(
    monaco.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        const path = pathOfShadowUri(resource)
        if (!path) return false
        const pos = selectionOrPosition as
          | { startLineNumber?: number; startColumn?: number; lineNumber?: number; column?: number }
          | undefined
        const line = pos?.startLineNumber ?? pos?.lineNumber ?? 1
        const col = pos?.startColumn ?? pos?.column ?? 1
        getNavHost().openLocation(path, line, col)
        return true
      },
    }),
    monaco.editor.registerLinkOpener({
      open(resource) {
        if (resource.scheme !== NAV_SCHEME) return false
        const q = new URLSearchParams(resource.query)
        const path = q.get("path")
        if (!path) return false
        getNavHost().openLocation(path, Number(q.get("line")) || 1, Number(q.get("col")) || 1)
        return true
      },
    }),
  )
  return { dispose: disposeEditorNavigation }
}

/**
 * A shadow model is a throwaway copy of a note for the references peek; nothing
 * ever saves it, so typing into its embedded editor would silently lose the
 * text. Any editor that shows one is made read-only (the peek editors are
 * created by Monaco, hence the global hook) and gets its flag back when it
 * moves to a real model.
 */
function lockShadowEditors(monaco: typeof monacoApi): monacoApi.IDisposable {
  const locked = new WeakSet<object>()
  const apply = (editor: monacoApi.editor.ICodeEditor) => {
    const model = editor.getModel()
    const shadow = model !== null && pathOfShadowUri(model.uri) !== null
    if (shadow) {
      locked.add(editor)
      editor.updateOptions({ readOnly: true })
    } else if (locked.has(editor)) {
      locked.delete(editor)
      editor.updateOptions({ readOnly: false })
    }
  }
  const created = monaco.editor.onDidCreateEditor((editor) => {
    apply(editor)
    editor.onDidChangeModel(() => apply(editor))
  })
  return { dispose: () => created.dispose() }
}

export function disposeEditorNavigation(): void {
  for (const d of registered) d.dispose()
  registered = []
  disposeShadowModels()
}

// ── Commands (palette-facing) ────────────────────────────────────────────────

type EditorLike = Pick<monacoApi.editor.IStandaloneCodeEditor, "getAction" | "trigger">

/** F12: jump to the definition under the caret (opens the usages peek when already on it). */
export async function goToDefinition(editor: EditorLike): Promise<void> {
  const action = editor.getAction("editor.action.revealDefinition")
  if (action) await action.run()
  else editor.trigger("comdtex", "editor.action.revealDefinition", null)
}

/** Shift+F12: every usage of the label, citation key or note under the caret, in Monaco's peek. */
export async function findUsages(editor: EditorLike): Promise<void> {
  const action = editor.getAction("editor.action.goToReferences")
  if (action) await action.run()
  else editor.trigger("comdtex", "editor.action.goToReferences", null)
}

/** True when the caret sits on something that navigation understands. */
export function canNavigateAt(
  model: Pick<NavModel, "getLineContent" | "getLanguageId">,
  position: Pos,
): boolean {
  return (
    constructAt(
      model.getLineContent(position.lineNumber),
      position.column - 1,
      isLatexModel(model),
    ) !== null
  )
}
