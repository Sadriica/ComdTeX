// ComdTeX: Ctrl/Cmd+K inline AI edit (phase 2, the flagship interaction).
//
// A small floating prompt anchored at the cursor/selection. The user types an
// instruction; the AI returns an edited version of the SELECTED text (or text
// to INSERT at the cursor when there's no selection). The result is shown as a
// proposal with Accept / Reject. Accept applies it through Monaco's
// `executeEdits` so it lands as a single, UNDO-safe change.
//
// Hard rules honoured here:
// - Offline by default: nothing runs unless the user opens the widget AND
//   `settings.aiEnabled` is true (the caller gates the keybinding too).
// - The edit is applied THROUGH the editor (executeEdits); never to disk.
//
// TODO (phase 2b): deferred: external-file-watch sync (apply external CLI
// edits as Monaco diffs so they remain undo-safe) and OS-keychain key storage.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as monaco from "monaco-editor"
import { useT } from "./i18n"
import type { Settings } from "./useSettings"
import { sendInlineEdit, AiError } from "./ai/aiProvider"

/** Live anchor describing where the widget should float and what it edits. */
export interface CmdKAnchor {
  /** The range to replace (selection, or a zero-width range at the cursor). */
  range: monaco.IRange
  /** True when a non-empty selection is being edited; false ⇒ insert mode. */
  hasSelection: boolean
  /** The selected text (empty string in insert mode). */
  selectionText: string
}

interface CmdKEditProps {
  settings: Settings
  editor: monaco.editor.IStandaloneCodeEditor
  anchor: CmdKAnchor
  /** Close the widget (Reject / Esc / after Accept). */
  onClose: () => void
}

function aiErrorMessage(e: unknown, t: ReturnType<typeof useT>): string {
  if (e instanceof AiError) {
    switch (e.message) {
      case "missing-api-key":     return t.ai.errMissingApiKey
      case "missing-base-url":    return t.ai.errMissingBaseUrl
      case "missing-cli-command": return t.ai.errMissingCli
    }
    return t.ai.errGeneric(e.message)
  }
  if (e instanceof DOMException && e.name === "AbortError") return ""
  return t.ai.errGeneric(e instanceof Error ? e.message : String(e))
}

/**
 * Lightweight word-level diff for the "low-risk" case (both texts short and
 * single-paragraph). Returns null when a diff would be noisy/unhelpful, in which
 * case the caller just shows the proposed replacement plainly.
 */
function tinyDiff(oldText: string, newText: string): { removed: string; added: string } | null {
  if (!oldText) return null
  const big = oldText.length > 600 || newText.length > 600
  const multiline = oldText.includes("\n") || newText.includes("\n")
  if (big || multiline) return null
  return { removed: oldText, added: newText }
}

export default function CmdKEdit({ settings, editor, anchor, onClose }: CmdKEditProps) {
  const t = useT()
  const [instruction, setInstruction] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Compute the floating position from the editor's pixel coordinate API. We
  // anchor below the END of the selection (or the cursor). Recomputed on scroll
  // so the widget tracks the line while open.
  const computePosition = useCallback(() => {
    const r = anchor.range
    const visible = editor.getScrolledVisiblePosition({
      lineNumber: r.endLineNumber,
      column: r.endColumn,
    })
    const node = editor.getDomNode()
    if (!visible || !node) { setPos(null); return }
    const rect = node.getBoundingClientRect()
    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight)
    // Viewport-absolute coordinates (the widget uses position:fixed) so we don't
    // depend on the offset of whichever ancestor it renders into. `visible` is
    // relative to the editor DOM node, so add the node's page rect.
    setPos({
      top: rect.top + visible.top + lineHeight + 4,
      left: rect.left + Math.max(8, visible.left),
    })
  }, [editor, anchor])

  useEffect(() => {
    computePosition()
    const subs = [
      editor.onDidScrollChange(computePosition),
      editor.onDidLayoutChange(computePosition),
    ]
    return () => subs.forEach((s) => s.dispose())
  }, [editor, computePosition])

  // Focus the input on open.
  useEffect(() => { inputRef.current?.focus() }, [])

  // Abort any in-flight request if the widget unmounts.
  useEffect(() => () => { abortRef.current?.abort() }, [])

  const close = useCallback(() => {
    abortRef.current?.abort()
    onClose()
  }, [onClose])

  const run = useCallback(async () => {
    const instr = instruction.trim()
    if (!instr || streaming) return
    setError(null)
    setResult("")
    setStreaming(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Provide a bounded window of surrounding text as context (cheap + keeps the
    // request small). We slice around the anchor line.
    const model = editor.getModel()
    let documentContext = ""
    if (model) {
      const total = model.getLineCount()
      const from = Math.max(1, anchor.range.startLineNumber - 30)
      const to = Math.min(total, anchor.range.endLineNumber + 30)
      documentContext = model.getValueInRange({
        startLineNumber: from, startColumn: 1,
        endLineNumber: to, endColumn: model.getLineMaxColumn(to),
      })
    }

    try {
      const text = await sendInlineEdit(
        settings,
        {
          instruction: instr,
          selection: anchor.selectionText,
          hasSelection: anchor.hasSelection,
          documentContext,
        },
        {
          signal: ctrl.signal,
          onToken: (chunk) => setResult((prev) => (prev ?? "") + chunk),
        },
      )
      setResult(text)
    } catch (e) {
      const msg = aiErrorMessage(e, t)
      if (msg) { setError(msg); setResult(null) }
      else { setResult(null) } // silent abort
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [instruction, streaming, editor, anchor, settings, t])

  // Accept → single undo-safe edit via executeEdits, then focus the editor.
  const accept = useCallback(() => {
    if (result == null) return
    editor.focus()
    editor.executeEdits("cmdk-edit", [{ range: anchor.range, text: result, forceMoveMarkers: true }])
    onClose()
  }, [editor, anchor, result, onClose])

  const onInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void run()
    }
  }, [run, close])

  const onContainerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); close() }
  }, [close])

  const diff = useMemo(
    () => (result && !streaming && anchor.hasSelection ? tinyDiff(anchor.selectionText, result) : null),
    [result, streaming, anchor],
  )

  if (!pos) return null

  const placeholder = anchor.hasSelection ? t.ai.cmdk.placeholderEdit : t.ai.cmdk.placeholderInsert

  return (
    <div
      className="cmdk-edit"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label="Ctrl+K"
      onKeyDown={onContainerKeyDown}
    >
      <div className="cmdk-edit-row">
        <textarea
          ref={inputRef}
          className="cmdk-edit-input"
          rows={1}
          value={instruction}
          placeholder={placeholder}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={onInputKeyDown}
          disabled={streaming}
        />
        {!streaming && result == null && (
          <button className="cmdk-edit-btn cmdk-edit-btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={() => void run()} disabled={!instruction.trim()}>
            {t.ai.cmdk.submit}
          </button>
        )}
        <button className="cmdk-edit-btn" onMouseDown={(e) => e.preventDefault()} onClick={close} title={t.ai.cmdk.cancel}>✕</button>
      </div>

      {streaming && (
        <div className="cmdk-edit-status">
          <span className="cmdk-edit-spinner" /> {t.ai.cmdk.generating}
        </div>
      )}

      {error && <div className="cmdk-edit-error">{error}</div>}

      {result != null && (
        <div className="cmdk-edit-proposal">
          {diff ? (
            <div className="cmdk-edit-diff">
              <div className="cmdk-edit-diff-old"><span className="cmdk-edit-diff-label">{t.ai.cmdk.original}</span><del>{diff.removed}</del></div>
              <div className="cmdk-edit-diff-new"><span className="cmdk-edit-diff-label">{t.ai.cmdk.proposed}</span><ins>{diff.added}</ins></div>
            </div>
          ) : (
            <pre className="cmdk-edit-preview">{result || (streaming ? "" : t.ai.cmdk.emptyResult)}</pre>
          )}
          {!streaming && (
            <div className="cmdk-edit-actions">
              <button className="cmdk-edit-btn cmdk-edit-btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={accept} disabled={!result}>
                {t.ai.cmdk.accept}
              </button>
              <button className="cmdk-edit-btn" onMouseDown={(e) => e.preventDefault()} onClick={close}>
                {t.ai.cmdk.reject}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
