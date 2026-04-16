import { useT } from "./i18n"
import type { Settings } from "./useSettings"

interface SettingsModalProps {
  open: boolean
  settings: Settings
  onClose: () => void
  onChange: (partial: Partial<Settings>) => void
}

export default function SettingsModal({ open, settings, onClose, onChange }: SettingsModalProps) {
  const t = useT()
  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.settings.title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <label className="setting-row">
            <span>{t.settings.language}</span>
            <select
              value={settings.language}
              onChange={(e) => onChange({ language: e.target.value as Settings["language"] })}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="setting-row">
            <span>{t.settings.editorFont}</span>
            <div className="setting-control">
              <input
                type="range" min={11} max={24} step={1}
                value={settings.fontSize}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              />
              <span className="setting-value">{settings.fontSize}px</span>
            </div>
          </label>

          <label className="setting-row">
            <span>{t.settings.previewFont}</span>
            <div className="setting-control">
              <input
                type="range" min={11} max={24} step={1}
                value={settings.previewFontSize}
                onChange={(e) => onChange({ previewFontSize: Number(e.target.value) })}
              />
              <span className="setting-value">{settings.previewFontSize}px</span>
            </div>
          </label>

          <label className="setting-row">
            <span>{t.settings.autosave}</span>
            <select
              value={settings.autoSaveMs}
              onChange={(e) => onChange({ autoSaveMs: Number(e.target.value) })}
            >
              <option value={300}>300 ms</option>
              <option value={800}>800 ms</option>
              <option value={1500}>1.5 s</option>
              <option value={3000}>3 s</option>
            </select>
          </label>

          <div className="setting-row">
            <span>{t.settings.wordGoal}</span>
            <input
              type="number"
              min="0"
              max="100000"
              step="100"
              value={settings.wordGoal}
              onChange={(e) => onChange({ wordGoal: Math.max(0, parseInt(e.target.value) || 0) })}
              className="setting-input-num"
            />
            <span className="setting-value">{settings.wordGoal === 0 ? t.settings.wordGoalOff : `${settings.wordGoal} ${t.settings.words}`}</span>
          </div>

          <label className="setting-row">
            <span>{t.settings.theme}</span>
            <select
              value={settings.theme}
              onChange={(e) => onChange({ theme: e.target.value as Settings["theme"] })}
            >
              <option value="vs-dark">{t.settings.dark}</option>
              <option value="vs">{t.settings.light}</option>
              <option value="hc-black">{t.settings.highContrast}</option>
            </select>
          </label>

          <label className="setting-row">
            <span>{t.settings.vimMode}</span>
            <input
              type="checkbox"
              checked={settings.vimMode}
              onChange={(e) => onChange({ vimMode: e.target.checked })}
            />
          </label>

          <label className="setting-row">
            <span>{t.settings.typewriterMode}</span>
            <input
              type="checkbox"
              checked={settings.typewriterMode}
              onChange={() => onChange({ typewriterMode: !settings.typewriterMode })}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
