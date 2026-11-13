// The state of git sync for the open vault, shared by the automatic sync, the
// Sync settings and the status bar. One small external store instead of
// props threaded through App, because the three never render together.

import { useSyncExternalStore } from "react"
import type { SyncOutcome } from "./vaultSync"

export interface SyncStatus {
  running: boolean
  /** When the last sync finished (ms), or null before the first one. */
  lastAt: number | null
  outcome: SyncOutcome | null
  /** Automatic sync waits after a conflict until a sync the person starts. */
  paused: boolean
}

const INITIAL: SyncStatus = { running: false, lastAt: null, outcome: null, paused: false }

let state: SyncStatus = INITIAL
const listeners = new Set<() => void>()

export function getSyncStatus(): SyncStatus {
  return state
}

export function setSyncStatus(patch: Partial<SyncStatus>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function resetSyncStatus(): void {
  setSyncStatus(INITIAL)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSyncStatus, getSyncStatus)
}
