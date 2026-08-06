import { openPath } from "@tauri-apps/plugin-opener"
import { useT } from "./i18n"
import { providerLabel, type CloudSyncInfo } from "./cloudSync"
import { showToast } from "./toastService"

interface CloudSyncBannerProps {
  /** First detected provider folder on this machine. */
  provider: CloudSyncInfo
  onDismiss: () => void
}

/**
 * Shown when the user has a cloud-sync client installed but their current
 * vault is NOT inside its folder. Suggests moving the vault there.
 *
 * We do NOT auto-move files: that's risky for large vaults. The banner just
 * opens the provider folder so the user can drag-and-drop or set up a new
 * vault from there.
 */
export default function CloudSyncBanner({ provider, onDismiss }: CloudSyncBannerProps) {
  const t = useT()
  const label = providerLabel(provider.provider)

  const handleOpen = async () => {
    try {
      await openPath(provider.rootPath)
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error")
    }
  }

  return (
    <div className="cloud-sync-banner" role="status">
      <span className="cloud-sync-banner-icon" aria-hidden="true">☁</span>
      <span className="cloud-sync-banner-text">
        <strong>{t.cloudSync.bannerTitle(label)}</strong>: {t.cloudSync.bannerBody}
      </span>
      <button className="cloud-sync-banner-btn" onClick={handleOpen}>
        {t.cloudSync.bannerOpenFolder}
      </button>
      <button className="cloud-sync-banner-dismiss" onClick={onDismiss}>
        {t.cloudSync.bannerDismiss}
      </button>
    </div>
  )
}
