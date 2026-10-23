import { getCurrentWindow } from "@tauri-apps/api/window"
import { useT } from "./i18n"
import { Icon, Minus, Settings, Square, X } from "./icons"

function currentWindow() {
  try {
    return getCurrentWindow()
  } catch {
    return null
  }
}

interface TitleBarProps {
  filename?: string
  isDirty?: boolean
  onClose?: () => void
  onSettingsClick?: () => void
}

export default function TitleBar({ filename, isDirty, onClose, onSettingsClick }: TitleBarProps) {
  const t = useT()
  const title = filename ? `${isDirty ? "● " : ""}${filename} (ComdTeX)` : "ComdTeX"

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>
        {title}
      </span>
      <div className="titlebar-controls">
        {onSettingsClick && (
          <button
            className="titlebar-btn titlebar-settings-btn"
            title={t.titleBar.settings}
            aria-label={t.titleBar.settings}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onSettingsClick()}
          >
            <Icon icon={Settings} size={14} />
          </button>
        )}
        <button
          className="titlebar-btn titlebar-minimize"
          title={t.titleBar.minimize}
          aria-label={t.titleBar.minimize}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => currentWindow()?.minimize()}
        >
          <Icon icon={Minus} size={14} />
        </button>
        <button
          className="titlebar-btn titlebar-maximize"
          title={t.titleBar.maximize}
          aria-label={t.titleBar.maximize}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => currentWindow()?.toggleMaximize()}
        >
          <Icon icon={Square} size={14} />
        </button>
        <button
          className="titlebar-btn titlebar-close"
          title={t.titleBar.close}
          aria-label={t.titleBar.close}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            const win = currentWindow()
            if (onClose) onClose()
            else win?.destroy()
          }}
        >
          <Icon icon={X} size={14} />
        </button>
      </div>
    </div>
  )
}
