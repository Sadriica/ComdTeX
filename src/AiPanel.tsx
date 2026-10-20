// ComdTeX: AI assistant sidebar panel (MVP).
//
// Hard rules honoured here:
// - Fully offline by default: when `settings.aiEnabled` is false this panel
//   renders a disabled state and never touches the network.
// - Edits are applied THROUGH the Monaco editor (executeEdits / snippet insert)
//   so they land in Monaco's native undo/redo stack. We never write to disk.
//
// TODO (phase 2): Cmd+K inline-diff editing and external-file-watch sync are
// intentionally out of scope for the MVP.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type * as monaco from "monaco-editor"
import { useT } from "./i18n"
import { Icon, MessageSquare, Plus, Settings as SettingsIcon, Sparkles, Trash2, X } from "./icons"
import type { Settings } from "./useSettings"
import {
  sendMessage,
  getPreset,
  AiError,
  warmUp,
  isAiReady,
  classifyAiFailure,
  type ChatMessage,
} from "./ai/aiProvider"
import { showToast } from "./toastService"
import { useAiSessionContext } from "./useAiSession"

interface AiPanelProps {
  settings: Settings
  /** Live Monaco editor instance (null when no file is open). */
  editor: monaco.editor.IStandaloneCodeEditor | null
  /** Current file's full text (for "Current file" context). */
  fileContent: string | null
  /** Current file basename, for context labelling. */
  fileName: string | null
  /** Renders assistant Markdown+math reusing the preview pipeline (already sanitized). */
  renderHtml: (md: string) => string
  /** Opens the Settings modal on the AI section. */
  onOpenSettings: () => void
}

const SYSTEM_PROMPT =
  "You are an assistant embedded in ComdTeX, a Markdown + LaTeX editor for " +
  "mathematicians and scientists. Keep math in LaTeX ($...$ or $$...$$). Be precise and concise."

function aiErrorMessage(e: unknown, t: ReturnType<typeof useT>): string {
  if (e instanceof AiError) {
    switch (e.message) {
      case "missing-api-key":
        return t.ai.errMissingApiKey
      case "missing-base-url":
        return t.ai.errMissingBaseUrl
      case "missing-cli-command":
        return t.ai.errMissingCli
    }
    return namedFailure(e.message, t)
  }
  if (e instanceof DOMException && e.name === "AbortError") return ""
  return namedFailure(e instanceof Error ? e.message : String(e), t)
}

/**
 * Say which of the four things is wrong instead of forwarding the provider's
 * raw text. A rejected key, a model that is not there and an endpoint that
 * never answered need three different fixes, and the same settings screen
 * fixes all three, so the message names the cause and still carries the
 * provider's own words for anyone who wants them.
 */
function namedFailure(raw: string, t: ReturnType<typeof useT>): string {
  switch (classifyAiFailure(raw)) {
    case "unauthorized":
      return `${t.aiSettings.testUnauthorized} (${raw})`
    case "no-model":
      return `${t.aiSettings.testNoModel} (${raw})`
    case "unreachable":
      return `${t.aiSettings.testUnreachable} (${raw})`
    case "bad-url":
      return t.aiSettings.testBadUrl
    case "incomplete":
      return t.ai.errMissingApiKey
    default:
      return t.ai.errGeneric(raw)
  }
}

// Warm-up fires at most once per provider configuration per app session: the
// connection / CLI process only needs priming once; re-warming on every panel
// open would waste tokens or spawn redundant processes. Reset when the config
// signature changes (different provider / model / base URL / CLI command).
let warmedSignature: string | null = null

// Rendered assistant message (full Markdown+math). Memoized + the markdown render
// is `useMemo`'d on `content`, so a completed message is NOT re-rendered through
// the (expensive) KaTeX pipeline every time a later message streams a token.
// Relies on `renderHtml` being a stable reference (a useCallback in AppContent).
const AssistantContent = memo(function AssistantContent({
  content,
  renderHtml,
}: {
  content: string
  renderHtml: (md: string) => string
}) {
  const html = useMemo(() => renderHtml(content), [content, renderHtml])
  return <div className="ai-bubble-body markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
})

export default function AiPanel({
  settings,
  editor,
  fileContent,
  fileName,
  renderHtml,
  onOpenSettings,
}: AiPanelProps) {
  const t = useT()
  // Chat state comes from context (owned by AiSessionProvider above AppContent),
  // so it persists across this panel unmounting AND a streamed token re-renders
  // only this panel, not the whole AppContent tree.
  const session = useAiSessionContext()
  const {
    messages,
    setMessages,
    setMessagesFor,
    input,
    setInput,
    includeFile,
    setIncludeFile,
    includeSelection,
    setIncludeSelection,
    conversations,
    activeId,
    newConversation,
    switchConversation,
    deleteConversation,
  } = session
  const [streaming, setStreaming] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const preset = getPreset(settings.aiProviderId)

  // Number of lines currently selected (for the context chip). Tracked via a
  // selection-change listener so the chip stays live as the user selects text.
  const [trackedSelectionLines, setSelectionLines] = useState(0)
  const selectionLines = editor ? trackedSelectionLines : 0
  useEffect(() => {
    if (!editor) return
    const compute = () => {
      const sel = editor.getSelection()
      setSelectionLines(!sel || sel.isEmpty() ? 0 : sel.endLineNumber - sel.startLineNumber + 1)
    }
    compute()
    const sub = editor.onDidChangeCursorSelection(compute)
    return () => sub.dispose()
  }, [editor])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streaming])

  // Auto-grow the input textarea with its content (capped), so multi-line
  // prompts are visible without an inner scrollbar.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  // Warm-up preflight: when the chat opens (and AI is enabled, configured and
  // warm-up is on), prime the connection / CLI process so the first real message
  // responds faster. Guarded to fire at most once per provider configuration.
  useEffect(() => {
    if (!settings.aiWarmupEnabled || !isAiReady(settings)) return
    const sig = `${settings.aiProviderId}|${settings.aiModel}|${settings.aiBaseUrl}|${settings.aiCliCommand}`
    if (warmedSignature === sig) return
    warmedSignature = sig
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    void warmUp(settings, ctrl.signal).finally(() => clearTimeout(timer))
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.aiWarmupEnabled,
    settings.aiEnabled,
    settings.aiProviderId,
    settings.aiModel,
    settings.aiBaseUrl,
    settings.aiCliCommand,
  ])

  // Abort any in-flight request when the panel unmounts so a streaming fetch
  // doesn't keep running (and calling setState) after the component is gone.
  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  // Context flags can be passed explicitly (`override`) to avoid reading stale
  // `includeFile`/`includeSelection` state immediately after a `setState` call
  // (e.g. from a quick action), where the closure hasn't re-rendered yet.
  const buildContext = useCallback(
    (override?: { file: boolean; selection: boolean }): string => {
      const wantFile = override ? override.file : includeFile
      const wantSelection = override ? override.selection : includeSelection
      const parts: string[] = []
      if (wantSelection) {
        const sel = editor?.getSelection()
        const model = editor?.getModel()
        if (sel && model && !sel.isEmpty()) {
          parts.push("Selected text:\n```\n" + model.getValueInRange(sel) + "\n```")
        }
      }
      if (wantFile && fileContent) {
        parts.push(`Current file (${fileName ?? "untitled"}):\n` + "```\n" + fileContent + "\n```")
      }
      return parts.join("\n\n")
    },
    [includeFile, includeSelection, editor, fileContent, fileName],
  )

  const run = useCallback(
    async (userText: string, ctxOverride?: { file: boolean; selection: boolean }) => {
      if (!settings.aiEnabled || streaming || !userText.trim()) return
      if (preset.id === "openai-compatible" && !settings.aiBaseUrl.trim()) {
        showToast(t.ai.errMissingBaseUrl, "error")
        return
      }
      if (preset.id === "cli" ? !settings.aiCliCommand.trim() : !settings.aiModel.trim()) {
        showToast(preset.id === "cli" ? t.ai.errMissingCli : t.ai.errMissingModel, "error")
        return
      }

      const context = buildContext(ctxOverride)
      const composed = context ? `${userText}\n\n---\n${context}` : userText

      const history: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
        { role: "user", content: composed },
      ]

      // Pin this run to the conversation it started in, so switching/deleting
      // conversations mid-stream can't redirect tokens into the wrong thread.
      const convId = activeId
      setMessagesFor(convId, (prev) => [
        ...prev,
        { role: "user", content: userText },
        { role: "assistant", content: "" },
      ])
      setInput("")
      setStreaming(true)
      const ctrl = new AbortController()
      abortRef.current = ctrl

      try {
        await sendMessage(settings, history, {
          signal: ctrl.signal,
          onToken: (chunk) => {
            setMessagesFor(convId, (prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.role === "assistant")
                next[next.length - 1] = { ...last, content: last.content + chunk }
              return next
            })
          },
        })
      } catch (e) {
        const msg = aiErrorMessage(e, t)
        if (msg) {
          showToast(msg, "error")
          setMessagesFor(convId, (prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === "assistant" && !last.content) next.pop()
            return next
          })
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [settings, streaming, preset, buildContext, messages, t, activeId, setMessagesFor, setInput],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clearThread = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
  }, [setMessages])

  // ── Editor edit helpers: both go through Monaco's undo stack. ──────────────
  const insertAtCursor = useCallback(
    (text: string) => {
      if (!editor) {
        showToast(t.ai.noEditor, "error")
        return
      }
      editor.focus()
      const pos = editor.getPosition()
      const range = pos
        ? {
            startLineNumber: pos.lineNumber,
            startColumn: pos.column,
            endLineNumber: pos.lineNumber,
            endColumn: pos.column,
          }
        : editor.getSelection()
      if (!range) return
      editor.executeEdits("ai-insert", [{ range, text, forceMoveMarkers: true }])
    },
    [editor, t],
  )

  const replaceSelection = useCallback(
    (text: string) => {
      if (!editor) {
        showToast(t.ai.noEditor, "error")
        return
      }
      const sel = editor.getSelection()
      if (!sel || sel.isEmpty()) {
        showToast(t.ai.noSelection, "error")
        return
      }
      editor.focus()
      editor.executeEdits("ai-replace", [{ range: sel, text, forceMoveMarkers: true }])
    },
    [editor, t],
  )

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        showToast(t.ai.copied, "info", 1500)
      } catch {
        /* ignore */
      }
    },
    [t],
  )

  const runQuickAction = useCallback(
    (instruction: string) => {
      setShowActions(false)
      // Quick actions operate over the selection if present, else the whole file.
      const sel = editor?.getSelection()
      const useSelection = !!(sel && !sel.isEmpty())
      // Reflect the choice in the chips, but pass the intended context EXPLICITLY
      // into run(): setState is async, so run() would otherwise read stale flags.
      if (useSelection) setIncludeSelection(true)
      else setIncludeFile(true)
      void run(
        instruction,
        useSelection
          ? { file: includeFile, selection: true }
          : { file: true, selection: includeSelection },
      )
    },
    [editor, run, includeFile, includeSelection, setIncludeFile, setIncludeSelection],
  )

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter inserts a newline. Ignore Enter while an IME
      // composition is active so it only commits the candidate.
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        void run(input)
      } else if (e.key === "/" && input === "") {
        setShowActions(true)
      }
    },
    [run, input],
  )

  const QUICK_ACTIONS = useMemo(() => {
    const a = t.ai.actions
    return [
      { label: a.proofread, instr: a.proofreadInstr },
      { label: a.shorten, instr: a.shortenInstr },
      { label: a.latexify, instr: a.latexifyInstr },
      { label: a.explain, instr: a.explainInstr },
      { label: a.counterexample, instr: a.counterexampleInstr },
      { label: a.translate, instr: a.translateInstr },
      { label: a.summarize, instr: a.summarizeInstr },
    ]
  }, [t])

  // ── Disabled state ──────────────────────────────────────────────────────────
  if (!settings.aiEnabled) {
    return (
      <div className="ai-panel">
        <div className="panel-header">
          <span className="panel-header-title">{t.ai.title}</span>
        </div>
        <div className="panel-empty-rich">
          <div className="panel-empty-icon">
            <Icon icon={Sparkles} size={16} />
          </div>
          <div className="panel-empty-message">
            <strong>{t.ai.disabledTitle}</strong>
            <p>{t.ai.disabledBody}</p>
            <button className="ai-btn ai-btn-primary" onClick={onOpenSettings}>
              {t.ai.openSettings}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-panel">
      <div className="panel-header">
        <span
          className="panel-header-title"
          title={`${preset.label} · ${settings.aiModel || preset.id}`}
        >
          <Icon icon={Sparkles} size={14} />
          {preset.label}
          {settings.aiModel ? ` · ${settings.aiModel}` : ""}
        </span>
        <div className="panel-header-actions">
          <button
            className="panel-header-btn"
            title={t.ai.newConversation}
            aria-label={t.ai.newConversation}
            onClick={() => {
              newConversation()
              setShowHistory(false)
            }}
          >
            <Icon icon={Plus} size={14} />
          </button>
          <button
            className={`panel-header-btn${showHistory ? " active" : ""}`}
            title={t.ai.conversations}
            aria-label={t.ai.conversations}
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            <Icon icon={MessageSquare} size={14} />
          </button>
          <button
            className="panel-header-btn"
            title={t.ai.clearThread}
            aria-label={t.ai.clearThread}
            onClick={clearThread}
          >
            <Icon icon={Trash2} size={14} />
          </button>
          <button
            className="panel-header-btn"
            title={t.ai.settingsShortcut}
            aria-label={t.ai.settingsShortcut}
            onClick={onOpenSettings}
          >
            <Icon icon={SettingsIcon} size={14} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="ai-history" role="listbox" aria-label={t.ai.conversations}>
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`ai-history-item${c.id === activeId ? " active" : ""}`}
              role="option"
              aria-selected={c.id === activeId}
            >
              <button
                type="button"
                className="ai-history-title"
                onClick={() => {
                  switchConversation(c.id)
                  setShowHistory(false)
                }}
              >
                {c.title || t.ai.newConversation}
              </button>
              <button
                type="button"
                className="ai-history-del"
                title={t.ai.deleteConversation}
                aria-label={t.ai.deleteConversation}
                onClick={() => deleteConversation(c.id)}
              >
                <Icon icon={X} size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ai-messages" ref={listRef}>
        {messages.length === 0 && <div className="panel-empty">{t.ai.emptyThread}</div>}
        {messages.map((m, i) => {
          // The message currently being streamed: render it as cheap plain text
          // with a blinking caret instead of running the Markdown+KaTeX pipeline
          // on every token; full Markdown render happens once it completes.
          const isStreamingMsg = streaming && m.role === "assistant" && i === messages.length - 1
          return (
            <div key={i} className={`ai-bubble ai-bubble-${m.role}`}>
              <div className="ai-bubble-role">{m.role === "user" ? t.ai.you : t.ai.assistant}</div>
              {m.role === "user" ? (
                <div className="ai-bubble-body ai-bubble-user-text">{m.content}</div>
              ) : isStreamingMsg ? (
                m.content ? (
                  <div className="ai-bubble-body ai-streaming-text">
                    {m.content}
                    <span className="ai-cursor" />
                  </div>
                ) : (
                  <div className="ai-bubble-body ai-typing-wrap">
                    <span className="ai-typing">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                )
              ) : (
                <AssistantContent content={m.content} renderHtml={renderHtml} />
              )}
              {m.role === "assistant" && m.content && !isStreamingMsg && (
                <div className="ai-bubble-actions">
                  <button className="ai-btn" onClick={() => insertAtCursor(m.content)}>
                    {t.ai.insertAtCursor}
                  </button>
                  <button className="ai-btn" onClick={() => replaceSelection(m.content)}>
                    {t.ai.replaceSelection}
                  </button>
                  <button className="ai-btn" onClick={() => void copy(m.content)}>
                    {t.ai.copy}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="ai-context-chips">
        <button
          className={`ai-chip ${includeFile ? "active" : ""}`}
          onClick={() => setIncludeFile((v) => !v)}
        >
          {t.ai.ctxCurrentFile}
        </button>
        <button
          className={`ai-chip ${includeSelection ? "active" : ""}`}
          onClick={() => setIncludeSelection((v) => !v)}
          disabled={selectionLines === 0}
        >
          {t.ai.ctxSelection(selectionLines)}
        </button>
      </div>

      {showActions && (
        <div className="ai-actions-menu" role="menu">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              className="ai-action-item"
              role="menuitem"
              onClick={() => runQuickAction(a.instr)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className="ai-input-row">
        <textarea
          ref={inputRef}
          className="ai-input"
          rows={3}
          value={input}
          placeholder={t.ai.inputPlaceholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <div className="ai-input-actions">
          <button
            className="ai-btn"
            title={t.ai.quickActions}
            onClick={() => setShowActions((v) => !v)}
          >
            /
          </button>
          {streaming ? (
            <button className="ai-btn ai-btn-stop" onClick={stop}>
              {t.ai.stop}
            </button>
          ) : (
            <button
              className="ai-btn ai-btn-primary"
              title={t.ai.sendHint}
              onClick={() => void run(input)}
              disabled={!input.trim()}
            >
              {t.ai.send}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
