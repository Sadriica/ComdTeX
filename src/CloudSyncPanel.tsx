import { remove, rename, exists } from "@tauri-apps/plugin-fs"
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import { openPath } from "@tauri-apps/plugin-opener"
import { useT } from "./i18n"
import { providerLabel, type CloudProvider, type ConflictEntry } from "./cloudSync"
import { postureCopy, type SyncPosture } from "./syncPosture"
import PanelHeader from "./PanelHeader"
import { Cloud, Icon } from "./icons"
import { pathDirname } from "./pathUtils"
import { showToast } from "./toastService"
import { renderEmptyMessage } from "./emptyStateMessage"

interface CloudSyncPanelProps {
  conflicts: ConflictEntry[]
  /** Open a file path in the editor (creates a tab). */
  onOpenFile: (path: string) => void
  /** Called after a destructive action so the host can refresh the tree. */
  onResolved: () => void
  /** The cloud client whose folder holds the vault, or null when it is in none. */
  provider: CloudProvider | null
  /** The "Detect sync conflicts" setting. */
  detectEnabled: boolean
  /** Where the vault stands, so an empty panel can say how it does sync. */
  posture: SyncPosture
  onOpenGit: () => void
  onOpenSettings: () => void
}

export default function CloudSyncPanel({
  conflicts,
  onOpenFile,
  onResolved,
  provider,
  detectEnabled,
  posture,
  onOpenGit,
  onOpenSettings,
}: CloudSyncPanelProps) {
  const t = useT()

  const handleOpenBoth = (c: ConflictEntry) => {
    if (c.basePath) onOpenFile(c.basePath)
    onOpenFile(c.conflictPath)
  }

  const handleDeleteCopy = async (c: ConflictEntry) => {
    try {
      const ok = await tauriConfirm(t.cloudSync.confirmDeleteCopy(c.conflictName), {
        kind: "warning",
      })
      if (!ok) return
      await remove(c.conflictPath)
      showToast(t.cloudSync.deletedToast(c.conflictName), "success")
      onResolved()
    } catch (err) {
      showToast(t.cloudSync.errorAction(err instanceof Error ? err.message : String(err)), "error")
    }
  }

  const handleKeepCopy = async (c: ConflictEntry) => {
    if (!c.basePath) return
    const basePath = c.basePath
    try {
      const ok = await tauriConfirm(t.cloudSync.confirmKeepCopy(c.conflictName), {
        kind: "warning",
      })
      if (!ok) return
      // Crash-safe replace: never delete the original before the copy is in
      // place. Move the original aside to a temp backup, promote the copy, then
      // drop the backup. If promotion fails, restore the original so a failed
      // rename can't lose BOTH versions of the user's file.
      // Pick a backup name that doesn't already exist, so we never silently
      // clobber a stray `.comdtex-bak` left by a prior interrupted run.
      let backupPath = `${basePath}.comdtex-bak`
      for (let i = 2; await exists(backupPath); i++) {
        backupPath = `${basePath}.comdtex-bak-${i}`
      }
      await rename(basePath, backupPath)
      try {
        await rename(c.conflictPath, basePath)
      } catch (promoteErr) {
        // Promotion failed: put the original back and surface the error.
        await rename(backupPath, basePath)
        throw promoteErr
      }
      // Replacement succeeded; removing the backup is best-effort (a leftover
      // backup is harmless, and not worth failing the whole action over).
      try {
        await remove(backupPath)
      } catch {
        /* leave stray backup */
      }
      showToast(t.cloudSync.keptCopyToast(c.baseName), "success")
      onResolved()
    } catch (err) {
      showToast(t.cloudSync.errorAction(err instanceof Error ? err.message : String(err)), "error")
    }
  }

  const handleReveal = async (c: ConflictEntry) => {
    try {
      await openPath(pathDirname(c.conflictPath))
    } catch (err) {
      showToast(t.cloudSync.errorAction(err instanceof Error ? err.message : String(err)), "error")
    }
  }

  if (conflicts.length === 0) {
    // "No conflicts" alone reads as an all-clear even for a vault no cloud
    // client touches, so say why the list is empty and how this vault does
    // travel, with the step that would make it safer.
    const message = !detectEnabled
      ? t.cloudSync.panelDetectOff
      : provider
        ? t.cloudSync.panelEmptyIn(providerLabel(provider))
        : t.cloudSync.panelNotInCloud
    const copy = postureCopy(posture, t.cloudSync.settings)
    return (
      <div className="cloud-sync-panel">
        <PanelHeader title={t.cloudSync.panelTitle} />
        <div className="panel-empty-rich">
          <div className="panel-empty-icon" aria-hidden="true">
            <Icon icon={Cloud} size={16} />
          </div>
          <p className="panel-empty-message">{renderEmptyMessage(message)}</p>
          <p className={`cloud-sync-posture${copy.alarming ? " alarming" : ""}`}>{copy.text}</p>
          {copy.step && <p className="cloud-sync-posture">{copy.step}</p>}
          <div className="cloud-sync-empty-actions">
            <button onClick={onOpenGit}>{t.cloudSync.settings.openGit}</button>
            <button onClick={onOpenSettings}>{t.cloudSync.panelOpenSettings}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cloud-sync-panel">
      <PanelHeader title={t.cloudSync.panelTitle} count={conflicts.length} />
      <div className="panel-help">{t.cloudSync.panelHelp}</div>
      <ul className="cloud-sync-list">
        {conflicts.map((c) => (
          <li key={c.conflictPath} className="cloud-sync-item">
            <div className="cloud-sync-item-header">
              <strong className="cloud-sync-name">{c.baseName}</strong>
              <span className="cloud-sync-provider" data-provider={c.provider}>
                {t.cloudSync.conflictWith(providerLabel(c.provider))}
              </span>
            </div>
            <div className="cloud-sync-conflict-name" title={c.conflictPath}>
              {c.conflictName}
            </div>
            {!c.basePath && (
              <div className="cloud-sync-warning">{t.cloudSync.conflictMissingOriginal}</div>
            )}
            <div className="cloud-sync-actions">
              <button onClick={() => handleOpenBoth(c)}>{t.cloudSync.actionOpenBoth}</button>
              {c.basePath && (
                <button onClick={() => handleDeleteCopy(c)}>{t.cloudSync.actionKeepMine}</button>
              )}
              {c.basePath && (
                <button onClick={() => handleKeepCopy(c)}>{t.cloudSync.actionKeepCopy}</button>
              )}
              {!c.basePath && (
                <button onClick={() => handleDeleteCopy(c)} className="danger">
                  {t.cloudSync.actionDeleteCopy}
                </button>
              )}
              <button onClick={() => handleReveal(c)}>{t.cloudSync.actionRevealInFolder}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
