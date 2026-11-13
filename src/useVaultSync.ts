// Runs git sync for the open vault: on request ("Sync now", closing the app)
// and, when automatic sync is on, by itself. Automatic runs happen when the
// vault opens, when the window comes back into focus, a few minutes after the
// last edit, and every ten minutes as a fallback. A conflict pauses them until
// the person syncs by hand, so an unresolved conflict is reported once, not
// every few minutes.

import { useCallback, useEffect, useRef } from "react"
import { defaultSaveMessage } from "./collabGuide"
import { runGit } from "./gitApi"
import { useT } from "./i18n"
import { getSyncStatus, resetSyncStatus, setSyncStatus } from "./syncStatusStore"
import { showToast } from "./toastService"
import { isPushRejected, syncVault, type SyncOutcome } from "./vaultSync"

export type SyncReason = "manual" | "auto" | "close"

/** A sync never holds the app longer than this, even with git stuck on the network. */
const SYNC_TIMEOUT_MS = 90_000
const FALLBACK_INTERVAL_MS = 10 * 60_000
/** A focus change within this long of the last sync does not start another. */
const FOCUS_THROTTLE_MS = 2 * 60_000
/** Delay after the vault opens, so the first sync does not compete with loading it. */
const OPEN_DELAY_MS = 3_000

interface Options {
  vaultPath: string | null
  /** Automatic sync is on and the vault is a repository with a remote. */
  auto: boolean
  delayMinutes: number
  /** Changes whenever the open document's text changes (starts the edit timer). */
  editSignal: unknown
  /** Writes pending autosaves, so the sync records the latest text. */
  flushPending: () => Promise<void>
  /** Called after changes were brought in: reload clean tabs, refresh the tree. */
  onPulled: () => void
}

export function useVaultSync({
  vaultPath,
  auto,
  delayMinutes,
  editSignal,
  flushPending,
  onPulled,
}: Options) {
  const s = useT().gitSync
  const latest = useRef({ vaultPath, flushPending, onPulled, s })
  useEffect(() => {
    latest.current = { vaultPath, flushPending, onPulled, s }
  })

  useEffect(() => {
    resetSyncStatus()
  }, [vaultPath])

  const runSync = useCallback(async (reason: SyncReason): Promise<SyncOutcome | null> => {
    const { vaultPath: path, flushPending: flush, onPulled: pulledHook, s: str } = latest.current
    const before = getSyncStatus()
    if (!path || before.running) return null
    if (reason === "auto" && before.paused) return null
    setSyncStatus({ running: true })
    let outcome: SyncOutcome
    try {
      await flush().catch(() => {})
      outcome = await Promise.race([
        syncVault((args) => runGit(path, args), { message: defaultSaveMessage(new Date()) }),
        new Promise<SyncOutcome>((resolve) =>
          setTimeout(
            () => resolve({ kind: "error", stage: "fetch", message: str.timedOut }),
            SYNC_TIMEOUT_MS,
          ),
        ),
      ])
    } catch (e) {
      // git could not be spawned at all (not installed, or blocked).
      outcome = {
        kind: "error",
        stage: "fetch",
        message: e instanceof Error ? e.message : String(e),
      }
    }
    // The vault changed while git ran: this result belongs to the old one.
    if (latest.current.vaultPath !== path) return outcome
    setSyncStatus({
      running: false,
      lastAt: Date.now(),
      outcome,
      paused: outcome.kind === "conflict",
    })
    if (outcome.kind === "synced" && outcome.pulled) pulledHook()

    // Tell the person: always when they asked, otherwise only when the
    // situation changes (an outage is said once, not every ten minutes).
    const message = outcomeMessage(outcome, str)
    const changed = !sameKind(before.outcome, outcome)
    if (reason === "manual" || (changed && outcome.kind !== "synced" && outcome.kind !== "skipped"))
      showToast(message, toastKind(outcome), outcome.kind === "synced" ? 2500 : 7000)
    else if (reason === "auto" && outcome.kind === "synced" && outcome.pulled)
      showToast(str.broughtToast, "info", 3000)
    return outcome
  }, [])

  // ── Automatic triggers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!auto || !vaultPath) return
    const first = setTimeout(() => void runSync("auto"), OPEN_DELAY_MS)
    const every = setInterval(() => void runSync("auto"), FALLBACK_INTERVAL_MS)
    const onFocus = () => {
      const last = getSyncStatus().lastAt
      if (last === null || Date.now() - last > FOCUS_THROTTLE_MS) void runSync("auto")
    }
    window.addEventListener("focus", onFocus)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      window.removeEventListener("focus", onFocus)
    }
  }, [auto, vaultPath, runSync])

  // Send edits once the person has stopped writing for `delayMinutes`.
  const editTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const firstEdit = useRef(true)
  useEffect(() => {
    // The first value is the document as it was opened, not an edit.
    if (firstEdit.current) {
      firstEdit.current = false
      return
    }
    if (!auto || !vaultPath) return
    clearTimeout(editTimer.current)
    editTimer.current = setTimeout(() => void runSync("auto"), delayMinutes * 60_000)
  }, [editSignal, auto, vaultPath, delayMinutes, runSync])
  useEffect(() => () => clearTimeout(editTimer.current), [])

  return { runSync }
}

type Strings = ReturnType<typeof useT>["gitSync"]

function sameKind(a: SyncOutcome | null, b: SyncOutcome): boolean {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === "error" && b.kind === "error") return a.stage === b.stage
  return true
}

function toastKind(o: SyncOutcome): "success" | "info" | "error" {
  if (o.kind === "synced") return "success"
  if (o.kind === "error") return o.stage === "push" && isPushRejected(o.message) ? "info" : "error"
  return "info"
}

/** One sentence for an outcome, shared by the toasts and the Sync settings. */
export function outcomeMessage(o: SyncOutcome, s: Strings): string {
  switch (o.kind) {
    case "synced":
      return o.pulled && o.pushed
        ? s.syncedBoth
        : o.pulled
          ? s.syncedBrought
          : o.pushed
            ? s.syncedSent
            : s.syncedLevel
    case "conflict":
      return o.inProgress ? s.conflictInProgress : s.conflict(o.files.length)
    case "skipped":
      return o.reason === "detached" ? s.skippedDetached : s.skippedNoRemote
    case "error":
      if (o.stage === "push" && isPushRejected(o.message)) return s.pushRejected
      return `${s.errorStage[o.stage]} ${o.message}`.trim()
  }
}
