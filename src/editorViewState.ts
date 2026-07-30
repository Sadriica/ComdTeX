/**
 * Per-file editor view state: cursor, scroll position and collapsed regions.
 *
 * Why this exists: the editor is deliberately uncontrolled and remounted per tab
 * (`key={activeTabPath}` in `App.tsx`), and the external-content sync can reseed
 * the model. Monaco throws away folding, scroll and selection on both, which is
 * what made `:::excalidraw` blocks "unfold on their own" and made a fast Ctrl+Tab
 * land on the wrong line. Monaco's own `saveViewState`/`restoreViewState` carries
 * all three, so it replaces the old cursor-only `comdtex_cursor_positions` map.
 *
 * Writes go to an in-memory map SYNCHRONOUSLY (a tab switch must not race a
 * debounce — that was the old bug); the localStorage mirror is what survives a
 * restart and is written on the same call, since switches are rare.
 */
import type * as monacoApi from "monaco-editor"
import { STORAGE_KEYS } from "./storageKeys"

type ViewState = monacoApi.editor.ICodeEditorViewState

/** Keep the persisted map bounded — view states are small but not free. */
const MAX_ENTRIES = 200

/** Legacy cursor-only entry from `comdtex_cursor_positions`. */
export interface LegacyCursor {
  line: number
  col: number
}

const memory = new Map<string, ViewState>()
let loaded = false

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EDITOR_VIEW_STATES)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, ViewState>
    for (const [path, state] of Object.entries(parsed)) {
      if (state) memory.set(path, state)
    }
  } catch {
    // Corrupt payload: start clean rather than blocking the editor from opening.
  }
}

function persist(): void {
  try {
    // Map iteration is insertion-ordered, so dropping from the front evicts the
    // least recently written entries.
    const entries = [...memory.entries()]
    const kept = entries.slice(Math.max(0, entries.length - MAX_ENTRIES))
    localStorage.setItem(STORAGE_KEYS.EDITOR_VIEW_STATES, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Quota exceeded / storage disabled — the in-memory map still works for
    // this session, which is the case that matters for tab switching.
  }
}

/** Snapshot `editor`'s current view state under `path`. Safe to call repeatedly. */
export function saveViewState(path: string, editor: monacoApi.editor.ICodeEditor): void {
  load()
  let state: ViewState | null = null
  try {
    state = editor.saveViewState()
  } catch {
    return // editor already disposed mid-swap
  }
  if (!state) return
  // Re-insert so this path becomes the most recent entry for eviction purposes.
  memory.delete(path)
  memory.set(path, state)
  persist()
}

/** The stored view state for `path`, or null. */
export function getViewState(path: string): ViewState | null {
  load()
  return memory.get(path) ?? null
}

/**
 * Restore `path`'s view state onto `editor`. Returns true when something was
 * restored, so the caller can decide whether to apply first-open defaults
 * (auto-folding, legacy cursor migration).
 */
export function restoreViewState(path: string, editor: monacoApi.editor.ICodeEditor): boolean {
  const state = getViewState(path)
  if (!state) return false
  try {
    editor.restoreViewState(state)
    return true
  } catch {
    return false
  }
}

export function forgetViewState(path: string): void {
  load()
  if (memory.delete(path)) persist()
}

export function renameViewState(oldPath: string, newPath: string): void {
  load()
  const state = memory.get(oldPath)
  if (!state) return
  memory.delete(oldPath)
  memory.set(newPath, state)
  persist()
}

/** Test seam — drops the in-memory cache so the next call re-reads storage. */
export function resetViewStateCache(): void {
  memory.clear()
  loaded = false
}

/**
 * One-time migration: the cursor-only position saved by builds before view
 * states existed. Read (never written) so upgrading users keep their place.
 */
export function readLegacyCursor(path: string): LegacyCursor | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.CURSOR_POSITIONS) ?? "{}")
    const pos = saved?.[path]
    if (pos && typeof pos.line === "number" && typeof pos.col === "number") return pos
  } catch {
    // ignore
  }
  return null
}
