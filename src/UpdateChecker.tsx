import type { UpdateInfo } from "./useUpdater"
import { useT } from "./i18n"

interface UpdateCheckerProps {
  updateInfo: UpdateInfo | null
  onInstall: () => void
  onDismiss: () => void
  installing: boolean
}

export default function UpdateChecker({ updateInfo, onInstall, onDismiss, installing }: UpdateCheckerProps) {
  const t = useT()
  if (!updateInfo?.available) return null

  const notes = updateInfo.body
    ? updateInfo.body.split("\n").slice(0, 3).join("\n")
    : null

  return (
    <div className="update-banner">
      <h4>{t.updateBanner.available(updateInfo.version)}</h4>
      {notes && <p>{notes}</p>}
      <div className="update-banner-actions">
        <button
          className="update-btn-install"
          onClick={onInstall}
          disabled={installing}
        >
          {installing ? t.updateBanner.installing : t.updateBanner.installRestart}
        </button>
        <button
          className="update-btn-later"
          onClick={onDismiss}
          disabled={installing}
        >
          {t.updateBanner.later}
        </button>
      </div>
    </div>
  )
}
