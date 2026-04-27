import { getCurrentWindow } from "@tauri-apps/api/window"
import { useT } from "./i18n"

function currentWindow() {
  try { return getCurrentWindow() }
  catch { return null }
}

interface TitleBarProps {
  filename?: string
  isDirty?: boolean
  onClose?: () => void
  onSettingsClick?: () => void
}

export default function TitleBar({ filename, isDirty, onClose, onSettingsClick }: TitleBarProps) {
  const t = useT()
  const title = filename
    ? `${isDirty ? "● " : ""}${filename} — ComdTeX`
    : "ComdTeX"

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>{title}</span>
      <div className="titlebar-controls">
        {onSettingsClick && (
          <button
            className="titlebar-btn titlebar-settings-btn"
            title={t.titleBar.settings}
            aria-label={t.titleBar.settings}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onSettingsClick()}
          >⚙</button>
        )}
        <button
          className="titlebar-btn titlebar-minimize"
          title={t.titleBar.minimize}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => currentWindow()?.minimize()}
        >─</button>
        <button
          className="titlebar-btn titlebar-maximize"
          title={t.titleBar.maximize}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => currentWindow()?.toggleMaximize()}
        >□</button>
        <button
          className="titlebar-btn titlebar-close"
          title={t.titleBar.close}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            const win = currentWindow()
            if (onClose) onClose()
            else win?.destroy()
          }}
        >✕</button>
      </div>
    </div>
  )
}
