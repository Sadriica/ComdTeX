import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react"
import { STORAGE_KEYS } from "./storageKeys"

/** A single chat turn shown in the AI panel. */
export interface DisplayMessage {
  role: "user" | "assistant"
  content: string
}

/** One saved conversation. `title` is empty until the first user message, at
 *  which point it's derived from that message (the UI shows a localized
 *  "New conversation" placeholder while empty). */
export interface Conversation {
  id: string
  title: string
  messages: DisplayMessage[]
  updatedAt: number
}

/**
 * Persistent AI-assistant state, lifted into AppContent so it survives the panel
 * unmounting (the user switching to another sidebar panel and back).
 *
 * Conversations are kept in `localStorage` so the **history survives an app
 * restart** — the user can reopen past threads. The draft `input` is mirrored to
 * `sessionStorage` (per-session working text, not worth keeping across restarts);
 * the context toggles are in-memory.
 */
export interface AiSession {
  /** All conversations, most-recently-updated first (for the history list). */
  conversations: Conversation[]
  activeId: string
  /** Active conversation's messages + a setter that targets it. */
  messages: DisplayMessage[]
  setMessages: (action: DisplayMessage[] | ((prev: DisplayMessage[]) => DisplayMessage[])) => void
  /** Like setMessages but targets a specific conversation id (for streaming). */
  setMessagesFor: (convId: string, action: DisplayMessage[] | ((prev: DisplayMessage[]) => DisplayMessage[])) => void
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  includeFile: boolean
  setIncludeFile: React.Dispatch<React.SetStateAction<boolean>>
  includeSelection: boolean
  setIncludeSelection: React.Dispatch<React.SetStateAction<boolean>>
  /** Start a fresh conversation (reuses the active one if it's already empty). */
  newConversation: () => void
  /** Switch the active conversation. */
  switchConversation: (id: string) => void
  /** Delete a conversation; keeps at least one (a fresh empty one if needed). */
  deleteConversation: (id: string) => void
  /** Empty the active conversation and the draft input (the "clear" action). */
  clear: () => void
}

const CONVS_KEY = STORAGE_KEYS.AI_CONVERSATIONS
const ACTIVE_KEY = STORAGE_KEYS.AI_ACTIVE_CONVERSATION
const INPUT_KEY = STORAGE_KEYS.AI_INPUT_DRAFT
const MAX_TITLE = 48
// Cap the stored history so localStorage can't grow unbounded over time.
const MAX_CONVERSATIONS = 50

interface Store {
  conversations: Conversation[]
  activeId: string
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  } catch { /* fall through */ }
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function freshConversation(): Conversation {
  return { id: newId(), title: "", messages: [], updatedAt: Date.now() }
}

function deriveTitle(messages: DisplayMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user")
  if (!firstUser) return ""
  const line = firstUser.content.trim().split("\n")[0] ?? ""
  return line.length > MAX_TITLE ? line.slice(0, MAX_TITLE - 1) + "…" : line
}

function isConversation(c: unknown): c is Conversation {
  if (!c || typeof c !== "object") return false
  const o = c as Record<string, unknown>
  return typeof o.id === "string"
    && typeof o.title === "string"
    && typeof o.updatedAt === "number"
    && Array.isArray(o.messages)
    && o.messages.every((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
}

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(CONVS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      const conversations = parsed.filter(isConversation)
      if (conversations.length > 0) {
        const storedActive = localStorage.getItem(ACTIVE_KEY)
        const activeId = conversations.some((c) => c.id === storedActive) ? storedActive! : conversations[0].id
        return { conversations, activeId }
      }
    }
  } catch { /* corrupt storage — start fresh */ }
  const c = freshConversation()
  return { conversations: [c], activeId: c.id }
}

function loadInput(): string {
  try { return sessionStorage.getItem(INPUT_KEY) ?? "" } catch { return "" }
}

export function useAiSession(): AiSession {
  const [store, setStore] = useState<Store>(loadStore)
  const [input, setInput] = useState<string>(loadInput)
  const [includeFile, setIncludeFile] = useState(true)
  const [includeSelection, setIncludeSelection] = useState(false)

  // Persist the history, but DEBOUNCED. `store` changes on every streamed token,
  // and a synchronous `JSON.stringify(all conversations)` + `localStorage.setItem`
  // per token blocks the main thread and makes streaming feel janky/slow. Rapid
  // changes collapse into a single write ~600ms after they settle.
  // Latest store for the synchronous flush-on-close path below.
  const storeRef = useRef(store)
  useEffect(() => { storeRef.current = store }, [store])

  const flushStore = useCallback(() => {
    try {
      localStorage.setItem(CONVS_KEY, JSON.stringify(storeRef.current.conversations))
      localStorage.setItem(ACTIVE_KEY, storeRef.current.activeId)
    } catch { /* storage unavailable */ }
  }, [])

  useEffect(() => {
    const id = setTimeout(flushStore, 600)
    return () => clearTimeout(id)
  }, [store, flushStore])

  // Flush synchronously when the window is hidden/unloaded so a close (or reload)
  // within the 600ms debounce window doesn't drop the last chat.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushStore() }
    window.addEventListener("beforeunload", flushStore)
    document.addEventListener("visibilitychange", onHide)
    return () => {
      window.removeEventListener("beforeunload", flushStore)
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [flushStore])

  useEffect(() => {
    try {
      if (input === "") sessionStorage.removeItem(INPUT_KEY)
      else sessionStorage.setItem(INPUT_KEY, input)
    } catch { /* storage unavailable */ }
  }, [input])

  // Target a SPECIFIC conversation by id. The streaming loop captures its
  // conversation id when the request starts and writes tokens through this, so
  // switching/deleting conversations mid-stream can't redirect tokens into the
  // wrong thread.
  const setMessagesFor = useCallback<AiSession["setMessagesFor"]>((convId, action) => {
    setStore((s) => ({
      ...s,
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c
        const next = typeof action === "function" ? action(c.messages) : action
        return { ...c, messages: next, title: c.title || deriveTitle(next), updatedAt: Date.now() }
      }),
    }))
  }, [])

  // Target the currently-active conversation (used for non-streaming edits like
  // clear). Reads the active id at update time via the functional setStore.
  const setMessages = useCallback<AiSession["setMessages"]>((action) => {
    setStore((s) => ({
      ...s,
      conversations: s.conversations.map((c) => {
        if (c.id !== s.activeId) return c
        const next = typeof action === "function" ? action(c.messages) : action
        return { ...c, messages: next, title: c.title || deriveTitle(next), updatedAt: Date.now() }
      }),
    }))
  }, [])

  const newConversation = useCallback(() => {
    setStore((s) => {
      const activeEmpty = s.conversations.find((c) => c.id === s.activeId)?.messages.length === 0
      if (activeEmpty) return s // already on an empty conversation — nothing to do
      const c = freshConversation()
      return { conversations: [c, ...s.conversations].slice(0, MAX_CONVERSATIONS), activeId: c.id }
    })
  }, [])

  const switchConversation = useCallback((id: string) => {
    setStore((s) => (s.conversations.some((c) => c.id === id) ? { ...s, activeId: id } : s))
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setStore((s) => {
      const remaining = s.conversations.filter((c) => c.id !== id)
      if (remaining.length === 0) {
        const c = freshConversation()
        return { conversations: [c], activeId: c.id }
      }
      const activeId = s.activeId === id ? remaining[0].id : s.activeId
      return { conversations: remaining, activeId }
    })
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setInput("")
  }, [setMessages])

  const active = store.conversations.find((c) => c.id === store.activeId) ?? store.conversations[0]
  const ordered = [...store.conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  return {
    conversations: ordered,
    activeId: store.activeId,
    messages: active.messages,
    setMessages,
    setMessagesFor,
    input,
    setInput,
    includeFile,
    setIncludeFile,
    includeSelection,
    setIncludeSelection,
    newConversation,
    switchConversation,
    deleteConversation,
    clear,
  }
}

// ── Context isolation ────────────────────────────────────────────────────────
// The AI session is provided via context (the provider owns the state and only
// renders `{children}`), so a streamed token re-renders ONLY the context
// consumers (AiPanel) — NOT the whole `AppContent` tree. Keeping the state
// directly in AppContent made every token re-render that large component, which
// felt sluggish during generation.
const AiSessionContext = createContext<AiSession | null>(null)

export function AiSessionProvider({ children }: { children: React.ReactNode }) {
  const session = useAiSession()
  return createElement(AiSessionContext.Provider, { value: session }, children)
}

export function useAiSessionContext(): AiSession {
  const ctx = useContext(AiSessionContext)
  if (!ctx) throw new Error("useAiSessionContext must be used within an AiSessionProvider")
  return ctx
}
