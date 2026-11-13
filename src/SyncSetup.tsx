import { useCallback, useEffect, useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { useT } from "./i18n"
import { runGit } from "./gitApi"
import { showToast } from "./toastService"
import { useSyncStatus } from "./syncStatusStore"
import { outcomeMessage, type SyncReason } from "./useVaultSync"
import { GIT_SYNC_DELAYS, type Settings } from "./useSettings"
import type { SyncPosture } from "./syncPosture"
import {
  connectRemote,
  readSyncInfo,
  startHistory,
  type SyncInfo,
  type SyncOutcome,
} from "./vaultSync"

interface SyncSetupProps {
  vaultPath: string | null
  posture: SyncPosture
  settings: Settings
  onChange: (partial: Partial<Settings>) => void
  runSync: (reason: SyncReason) => Promise<SyncOutcome | null>
  onOpenGit?: () => void
  /** The vault became a repository or gained a remote: re-read its posture. */
  onRepoChanged?: () => void
}

/**
 * The git part of the Sync settings, in three steps that follow the vault's
 * posture: start a history, connect a shared copy, then sync (by hand or
 * automatically). Each step shows only when the one before it is done.
 */
export default function SyncSetup({
  vaultPath,
  posture,
  settings,
  onChange,
  runSync,
  onOpenGit,
  onRepoChanged,
}: SyncSetupProps) {
  const t = useT()
  const s = t.gitSync
  const status = useSyncStatus()
  const [info, setInfo] = useState<SyncInfo | null>(null)
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const isRepo = posture.startsWith("git")

  const git = useCallback((args: string[]) => runGit(vaultPath ?? "", args), [vaultPath])

  // Re-read after every sync, so the pending counts follow what just happened.
  useEffect(() => {
    if (!vaultPath || !isRepo) return
    let cancelled = false
    readSyncInfo(git)
      .then((i) => !cancelled && setInfo(i))
      .catch(() => !cancelled && setInfo(null))
    return () => {
      cancelled = true
    }
  }, [vaultPath, isRepo, git, status.lastAt])

  // Keep "3 minutes ago" honest while the modal stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const start = async () => {
    setBusy(true)
    const r = await startHistory(git, "Start keeping history").catch((e: unknown) => ({
      ok: false as const,
      message: String(e),
    }))
    setBusy(false)
    if (r.ok) {
      showToast(s.startDone, "success")
      onRepoChanged?.()
    } else showToast(s.startFailed(r.message), "error", 8000)
  }

  const connect = async () => {
    const address = url.trim()
    if (!address) return
    setBusy(true)
    const r = await connectRemote(git, address, info?.branch || "main").catch((e: unknown) => ({
      ok: false as const,
      stage: "remote" as const,
      message: String(e),
    }))
    setBusy(false)
    if (r.ok) {
      setUrl("")
      showToast(s.connected, "success")
      onRepoChanged?.()
      setInfo(await readSyncInfo(git).catch(() => null))
    } else showToast(s.connectFailed(r.message), "error", 8000)
  }

  if (!vaultPath) return null

  const when =
    status.lastAt === null
      ? null
      : now - status.lastAt < 60_000
        ? s.justNow
        : s.minutesAgo(Math.floor((now - status.lastAt) / 60_000))
  const stopped = status.paused || info?.merging || status.outcome?.kind === "conflict"
  const outcomeBad = status.outcome !== null && status.outcome.kind !== "synced"

  return (
    <div className="sync-setup" data-testid="sync-setup">
      <div className="setting-section-title">{s.title}</div>

      {!isRepo && (
        <>
          <p className="setting-hint">{s.startIntro}</p>
          <div className="setting-row">
            <span />
            <button className="setting-btn" disabled={busy} onClick={() => void start()}>
              {s.start}
            </button>
          </div>
        </>
      )}

      {isRepo && info && !info.remoteUrl && (
        <>
          <p className="setting-hint">{s.connectIntro}</p>
          <div className="sync-setup-connect">
            <button
              className="setting-btn"
              onClick={() => void openUrl("https://github.com/new").catch(() => {})}
            >
              {s.createOnGitHub}
            </button>
            <input
              type="text"
              className="sync-setup-url"
              value={url}
              placeholder={s.urlPlaceholder}
              aria-label={s.urlPlaceholder}
              spellCheck={false}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void connect()}
            />
            <button
              className="setting-btn primary"
              disabled={busy || !url.trim()}
              onClick={() => void connect()}
            >
              {s.connect}
            </button>
          </div>
        </>
      )}

      {isRepo && info?.remoteUrl && (
        <>
          <p className="setting-hint sync-setup-where">
            {s.remote(info.remoteUrl)}
            {info.branch && ` · ${s.branch(info.branch)}`}
            <br />
            {s.pending(info.changes, info.ahead, info.behind) || s.level}
          </p>
          <div className="setting-row">
            <span className="sync-setup-last">
              {when ? s.lastSync(when) : s.neverSynced}
              {status.outcome && (
                <span className={outcomeBad ? "sync-setup-outcome bad" : "sync-setup-outcome"}>
                  {" "}
                  {outcomeMessage(status.outcome, s)}
                </span>
              )}
            </span>
            <button
              className="setting-btn"
              disabled={status.running}
              onClick={() => void runSync("manual")}
            >
              {status.running ? s.syncing : s.syncNow}
            </button>
          </div>
          {stopped && (
            <div className="setting-row">
              <span className="setting-warn">{s.autoPaused}</span>
              {onOpenGit && (
                <button className="setting-btn" onClick={onOpenGit}>
                  {s.resolveInGit}
                </button>
              )}
            </div>
          )}

          <label className="setting-row" data-setting="gitAutoSync">
            <span>
              {s.autoSync}
              <span className="setting-help">: {s.autoSyncDesc}</span>
            </span>
            <input
              type="checkbox"
              checked={settings.gitAutoSync}
              onChange={() => onChange({ gitAutoSync: !settings.gitAutoSync })}
            />
          </label>
          <label className="setting-row" data-setting="gitAutoSyncDelay">
            <span>
              {s.autoDelay}
              <span className="setting-help">: {s.autoDelayDesc}</span>
            </span>
            <select
              value={settings.gitAutoSyncDelay}
              disabled={!settings.gitAutoSync}
              onChange={(e) => onChange({ gitAutoSyncDelay: Number(e.target.value) })}
            >
              {GIT_SYNC_DELAYS.map((n) => (
                <option key={n} value={n}>
                  {s.minutes(n)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  )
}
