// Editor side of tracked changes (CriticMarkup): the commands behind the
// palette and the context menu, and the decorations that make marks visible.
// All parsing and editing decisions live in criticMarkup.ts; this file only
// translates between Monaco positions and text offsets.

import type * as monacoApi from "monaco-editor"
import {
  hasCriticMarks,
  markAt,
  parseCriticMarks,
  resolveMark,
  suggestEdit,
  type CriticAction,
  type CriticMark,
  type SuggestKind,
} from "./criticMarkup"
import { showToast } from "./toastService"
import type { T } from "./i18n"

type Editor = monacoApi.editor.IStandaloneCodeEditor

/** Wrap the selection (or the caret) in a mark of `kind`. Returns true when applied. */
export function applySuggestion(editor: Editor, kind: SuggestKind, t: T): boolean {
  const model = editor.getModel()
  const sel = editor.getSelection()
  if (!model || !sel) return false
  const text = model.getValue()
  const res = suggestEdit(
    text,
    model.getOffsetAt(sel.getStartPosition()),
    model.getOffsetAt(sel.getEndPosition()),
    kind,
  )
  if (!res.ok) {
    showToast(res.reason === "overlap" ? t.tracked.overlap : t.tracked.delimiter, "info")
    return false
  }
  const from = model.getPositionAt(res.edit.start)
  const to = model.getPositionAt(res.edit.end)
  editor.pushUndoStop()
  editor.executeEdits("critic-markup", [
    {
      range: {
        startLineNumber: from.lineNumber,
        startColumn: from.column,
        endLineNumber: to.lineNumber,
        endColumn: to.column,
      },
      text: res.edit.text,
      forceMoveMarkers: true,
    },
  ])
  const a = model.getPositionAt(res.selection.start)
  const b = model.getPositionAt(res.selection.end)
  editor.setSelection({
    startLineNumber: a.lineNumber,
    startColumn: a.column,
    endLineNumber: b.lineNumber,
    endColumn: b.column,
  })
  editor.pushUndoStop()
  editor.focus()
  return true
}

/** Accept or reject the change under the caret. Returns true when one was resolved. */
export function resolveAtCursor(editor: Editor, action: CriticAction, t: T): boolean {
  const model = editor.getModel()
  const pos = editor.getPosition()
  if (!model || !pos) return false
  const text = model.getValue()
  const mark = markAt(text, model.getOffsetAt(pos))
  if (!mark) {
    showToast(t.tracked.noneHere, "info")
    return false
  }
  applyMarks(editor, [mark], action)
  editor.focus()
  return true
}

/** Accept or reject every change in the open file (one undo step). */
export function resolveEverything(editor: Editor, action: CriticAction, t: T): number {
  const model = editor.getModel()
  if (!model) return 0
  const marks = parseCriticMarks(model.getValue())
  if (marks.length === 0) {
    showToast(t.tracked.none, "info")
    return 0
  }
  applyMarks(editor, marks, action)
  showToast(
    action === "accept" ? t.tracked.acceptedN(marks.length) : t.tracked.rejectedN(marks.length),
    "success",
  )
  editor.focus()
  return marks.length
}

function applyMarks(editor: Editor, marks: CriticMark[], action: CriticAction): void {
  const model = editor.getModel()
  if (!model) return
  const edits = marks.map((m) => {
    const a = model.getPositionAt(m.start)
    const b = model.getPositionAt(m.end)
    return {
      range: {
        startLineNumber: a.lineNumber,
        startColumn: a.column,
        endLineNumber: b.lineNumber,
        endColumn: b.column,
      },
      text: resolveMark(m, action),
    }
  })
  editor.pushUndoStop()
  editor.executeEdits("critic-markup", edits)
  editor.pushUndoStop()
}

const REFRESH_MS = 150
const CLASS_BY_KIND: Record<CriticMark["kind"], string> = {
  add: "critic-ed-add",
  del: "critic-ed-del",
  sub: "critic-ed-sub",
  comment: "critic-ed-comment",
  highlight: "critic-ed-highlight",
}

export interface CriticDecorationsHandle {
  refresh: () => void
  dispose: () => void
}

/**
 * Decorate every mark in the editor and keep the `comdtexInCriticMark` context
 * key true while the caret is on one (it gates Accept/Reject in the menu).
 */
export function setupCriticDecorations(
  editor: Editor,
  monaco: typeof monacoApi,
  t: () => T,
): CriticDecorationsHandle {
  const collection = editor.createDecorationsCollection([])
  const inMark = editor.createContextKey<boolean>("comdtexInCriticMark", false)
  let cache: CriticMark[] = []

  const updateKey = () => {
    const model = editor.getModel()
    const pos = editor.getPosition()
    if (!model || !pos || cache.length === 0) return inMark.set(false)
    const o = model.getOffsetAt(pos)
    inMark.set(cache.some((m) => o >= m.start && o <= m.end))
  }

  const refresh = () => {
    const model = editor.getModel()
    if (!model) return
    const text = model.getValue()
    cache = hasCriticMarks(text) ? parseCriticMarks(text) : []
    const labels = t().tracked
    collection.set(
      cache.map((m) => {
        const a = model.getPositionAt(m.start)
        const b = model.getPositionAt(m.end)
        const note = m.kind === "comment" ? m.text : m.kind === "highlight" ? m.comment : undefined
        const kindLabel = {
          add: labels.added,
          del: labels.deleted,
          sub: labels.replaced,
          comment: labels.comment,
          highlight: labels.highlight,
        }[m.kind]
        return {
          range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column),
          options: {
            inlineClassName: CLASS_BY_KIND[m.kind],
            hoverMessage: { value: note ? `${kindLabel}: ${note}` : kindLabel },
          },
        }
      }),
    )
    updateKey()
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(refresh, REFRESH_MS)
  }
  const subs = [
    editor.onDidChangeModelContent(schedule),
    editor.onDidChangeModel(schedule),
    editor.onDidChangeCursorPosition(updateKey),
  ]
  refresh()
  return {
    refresh,
    dispose() {
      if (timer) clearTimeout(timer)
      for (const s of subs) s.dispose()
      collection.clear()
    },
  }
}

/** Context-menu entries (group "Tracked changes"). Returns a disposer. */
export function registerCriticActions(editor: Editor, t: T): () => void {
  const run = (id: string, label: string, order: number, fn: () => void, precondition?: string) =>
    editor.addAction({
      id,
      label,
      precondition,
      contextMenuGroupId: "9_critic",
      contextMenuOrder: order,
      run: fn,
    })
  const subs = [
    run("comdtex.critic.add", t.tracked.insertAddition, 1, () => applySuggestion(editor, "add", t)),
    run("comdtex.critic.del", t.tracked.insertDeletion, 2, () => applySuggestion(editor, "del", t)),
    run("comdtex.critic.sub", t.tracked.insertReplacement, 3, () =>
      applySuggestion(editor, "sub", t),
    ),
    run("comdtex.critic.comment", t.tracked.insertComment, 4, () =>
      applySuggestion(editor, "comment", t),
    ),
    run(
      "comdtex.critic.accept",
      t.tracked.acceptChange,
      5,
      () => resolveAtCursor(editor, "accept", t),
      "comdtexInCriticMark",
    ),
    run(
      "comdtex.critic.reject",
      t.tracked.rejectChange,
      6,
      () => resolveAtCursor(editor, "reject", t),
      "comdtexInCriticMark",
    ),
  ]
  return () => subs.forEach((s) => s.dispose())
}
