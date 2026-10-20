import { useEffect, useState } from "react"
import { subscribeToasts } from "./toastService"
import type { Toast } from "./toastService"
import { CircleCheck, CircleX, Icon, Info } from "./icons"

const TOAST_ICONS = { success: CircleCheck, error: CircleX, info: Info } as const

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          role={t.type === "error" ? "alert" : undefined}
        >
          <Icon icon={TOAST_ICONS[t.type]} size={16} className="toast-icon" />
          <span className="toast-message">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
