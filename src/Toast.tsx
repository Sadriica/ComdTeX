import { useEffect, useState } from "react"
import { subscribeToasts } from "./toastService"
import type { Toast } from "./toastService"

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role={t.type === "error" ? "alert" : undefined}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
