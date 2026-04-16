import type { UpdateInfo } from "./useUpdater"

interface UpdateCheckerProps {
  updateInfo: UpdateInfo | null
  onInstall: () => void
  onDismiss: () => void
  installing: boolean
}

export default function UpdateChecker({ updateInfo, onInstall, onDismiss, installing }: UpdateCheckerProps) {
  if (!updateInfo?.available) return null

  const notes = updateInfo.body
    ? updateInfo.body.split("\n").slice(0, 3).join("\n")
    : null

  return (
    <div className="update-banner">
      <h4>Nueva versión disponible: v{updateInfo.version}</h4>
      {notes && <p>{notes}</p>}
      <div className="update-banner-actions">
        <button
          className="update-btn-install"
          onClick={onInstall}
          disabled={installing}
        >
          {installing ? "Instalando…" : "Instalar y reiniciar"}
        </button>
        <button
          className="update-btn-later"
          onClick={onDismiss}
          disabled={installing}
        >
          Más tarde
        </button>
      </div>
    </div>
  )
}
