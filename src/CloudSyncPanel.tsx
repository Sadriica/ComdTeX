import { remove, rename } from "@tauri-apps/plugin-fs"
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import { openPath } from "@tauri-apps/plugin-opener"
import { useT } from "./i18n"
import { providerLabel, type ConflictEntry } from "./cloudSync"
import { pathDirname } from "./pathUtils"
import { showToast } from "./toastService"
import { renderEmptyMessage } from "./emptyStateMessage"

interface CloudSyncPanelProps {
  conflicts: ConflictEntry[]
  /** Open a file path in the editor (creates a tab). */
  onOpenFile: (path: string) => void
  /** Called after a destructive action so the host can refresh the tree. */
  onResolved: () => void
}

export default function CloudSyncPanel({ conflicts, onOpenFile, onResolved }: CloudSyncPanelProps) {
  const t = useT()

  const handleOpenBoth = (c: ConflictEntry) => {
    if (c.basePath) onOpenFile(c.basePath)
    onOpenFile(c.conflictPath)
  }

  const handleDeleteCopy = async (c: ConflictEntry) => {
    try {
      const ok = await tauriConfirm(t.cloudSync.confirmDeleteCopy(c.conflictName), { kind: "warning" })
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
    try {
      const ok = await tauriConfirm(t.cloudSync.confirmKeepCopy(c.conflictName), { kind: "warning" })
      if (!ok) return
      // Replace original with the copy: remove original, then rename copy to original.
      await remove(c.basePath)
      await rename(c.conflictPath, c.basePath)
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
    return (
      <div className="cloud-sync-panel">
        <div className="panel-header">{t.cloudSync.panelTitle}</div>
        {renderEmptyMessage(t.cloudSync.panelEmpty)}
      </div>
    )
  }

  return (
    <div className="cloud-sync-panel">
      <div className="panel-header">
        {t.cloudSync.panelTitle} ({conflicts.length})
      </div>
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
              <button onClick={() => handleOpenBoth(c)}>
                {t.cloudSync.actionOpenBoth}
              </button>
              {c.basePath && (
                <button onClick={() => handleDeleteCopy(c)}>
                  {t.cloudSync.actionKeepMine}
                </button>
              )}
              {c.basePath && (
                <button onClick={() => handleKeepCopy(c)}>
                  {t.cloudSync.actionKeepCopy}
                </button>
              )}
              {!c.basePath && (
                <button onClick={() => handleDeleteCopy(c)} className="danger">
                  {t.cloudSync.actionDeleteCopy}
                </button>
              )}
              <button onClick={() => handleReveal(c)}>
                {t.cloudSync.actionRevealInFolder}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
