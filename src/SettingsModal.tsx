import { useRef, useState } from "react"
import { useT } from "./i18n"
import type { Settings } from "./useSettings"
import { useFocusTrap } from "./useFocusTrap"

interface SettingsModalProps {
  open: boolean
  settings: Settings
  onClose: () => void
  onChange: (partial: Partial<Settings>) => void
}

type SectionId = "general" | "editor" | "preview" | "dailyNotes" | "pdf"

export default function SettingsModal({ open, settings, onClose, onChange }: SettingsModalProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  const [section, setSection] = useState<SectionId>("general")
  useFocusTrap(modalRef, open, onClose)
  if (!open) return null

  const tabs: { id: SectionId; label: string }[] = [
    { id: "general", label: t.settings.sections.general },
    { id: "editor", label: t.settings.sections.editor },
    { id: "preview", label: t.settings.sections.preview },
    { id: "dailyNotes", label: t.settings.sections.dailyNotes },
    { id: "pdf", label: t.settings.sections.pdf },
  ]

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal settings-modal" ref={modalRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.settings.title}</span>
          <button className="modal-close" onClick={onClose} aria-label={t.settings.closeAriaLabel}>✕</button>
        </div>

        <div className="settings-body">
          <div className="settings-tabs" role="tablist" aria-orientation="vertical">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={section === tab.id}
                className={`settings-tab ${section === tab.id ? "active" : ""}`}
                onClick={() => setSection(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-content" role="tabpanel">
            {section === "general" && (
              <>
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
                  <span>{t.settings.touchpadGestures}</span>
                  <input
                    type="checkbox"
                    checked={settings.touchpadGestures}
                    onChange={() => onChange({ touchpadGestures: !settings.touchpadGestures })}
                  />
                </label>
              </>
            )}

            {section === "editor" && (
              <>
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

                <label className="setting-row">
                  <span>{t.settings.wordWrap}</span>
                  <input
                    type="checkbox"
                    checked={settings.wordWrap}
                    onChange={() => onChange({ wordWrap: !settings.wordWrap })}
                  />
                </label>

                <label className="setting-row">
                  <span>{t.settings.minimap}</span>
                  <input
                    type="checkbox"
                    checked={settings.minimapEnabled}
                    onChange={() => onChange({ minimapEnabled: !settings.minimapEnabled })}
                  />
                </label>

                <label className="setting-row">
                  <span>{t.settings.spellcheck}</span>
                  <input
                    type="checkbox"
                    checked={settings.spellcheck}
                    onChange={() => onChange({ spellcheck: !settings.spellcheck })}
                  />
                </label>
              </>
            )}

            {section === "preview" && (
              <>
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
                  <span>{t.settings.previewVisible}</span>
                  <input
                    type="checkbox"
                    checked={settings.previewVisible}
                    onChange={() => onChange({ previewVisible: !settings.previewVisible })}
                  />
                </label>

                <label className="setting-row">
                  <span>{t.settings.syncScroll}</span>
                  <input
                    type="checkbox"
                    checked={settings.syncScroll}
                    onChange={() => onChange({ syncScroll: !settings.syncScroll })}
                  />
                </label>

                <label className="setting-row">
                  <span>{t.settings.mathPreview}</span>
                  <input
                    type="checkbox"
                    checked={settings.mathPreview ?? true}
                    onChange={() => onChange({ mathPreview: !(settings.mathPreview ?? true) })}
                  />
                </label>

                <label className="setting-row">
                  <span>{t.settings.previewTheme}</span>
                  <select
                    value={settings.previewTheme}
                    onChange={(e) => onChange({ previewTheme: e.target.value as "dark" | "light" | "same" })}
                  >
                    <option value="same">{t.settings.previewThemeSame}</option>
                    <option value="dark">{t.settings.dark}</option>
                    <option value="light">{t.settings.light}</option>
                  </select>
                </label>
              </>
            )}

            {section === "dailyNotes" && (
              <>
                <label className="setting-row">
                  <span>{t.settings.dailyNotesEnabled}</span>
                  <input
                    type="checkbox"
                    checked={settings.dailyNotesEnabled}
                    onChange={() => onChange({ dailyNotesEnabled: !settings.dailyNotesEnabled })}
                  />
                </label>

                <label className="setting-row">
                  <span>{t.settings.dailyNotesFolder}</span>
                  <input
                    type="text"
                    value={settings.dailyNotesFolder}
                    placeholder={t.settings.dailyNotesFolderPlaceholder}
                    onChange={(e) => onChange({ dailyNotesFolder: e.target.value })}
                    disabled={!settings.dailyNotesEnabled}
                  />
                </label>

                <label className="setting-row setting-row-stack">
                  <span>{t.settings.dailyNotesTemplate}</span>
                  <textarea
                    className="setting-textarea"
                    rows={6}
                    value={settings.dailyNotesTemplate}
                    onChange={(e) => onChange({ dailyNotesTemplate: e.target.value })}
                    disabled={!settings.dailyNotesEnabled}
                  />
                </label>
                <div className="setting-hint">{t.settings.dailyNotesTemplateHint}</div>
              </>
            )}

            {section === "pdf" && (
              <>
                <label className="setting-row">
                  <span>
                    {t.settings.useWasmTex}
                    <span className="setting-help"> — {t.settings.useWasmTexDesc}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.useWasmTex}
                    onChange={() => onChange({ useWasmTex: !settings.useWasmTex })}
                  />
                </label>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
