import { getCurrentWindow } from "@tauri-apps/api/window"
import { useT } from "./i18n"

const win = getCurrentWindow()

interface TitleBarProps {
  filename?: string
  isDirty?: boolean
  onClose?: () => void
}

export default function TitleBar({ filename, isDirty, onClose }: TitleBarProps) {
  const t = useT()
  const title = filename
    ? `${isDirty ? "● " : ""}${filename} — ComdTeX`
    : "ComdTeX"

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>{title}</span>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn titlebar-minimize"
          title={t.titleBar.minimize}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => win.minimize()}
        >─</button>
        <button
          className="titlebar-btn titlebar-maximize"
          title={t.titleBar.maximize}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => win.toggleMaximize()}
        >□</button>
        <button
          className="titlebar-btn titlebar-close"
          title={t.titleBar.close}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onClose ? onClose() : win.destroy()}
        >✕</button>
      </div>
    </div>
  )
}
