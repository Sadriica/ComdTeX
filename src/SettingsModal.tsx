import { useEffect, useRef, useState } from "react"
import { getSecret, setSecret } from "./secretStore"
import { useT } from "./i18n"
import type { Settings } from "./useSettings"
import { useFocusTrap } from "./useFocusTrap"
import { PROVIDER_PRESETS, getPreset, checkConnection, type AiCheck } from "./ai/aiProvider"
import { providerLabel, type CloudProvider } from "./cloudSync"
import { nextStep, type SyncPosture } from "./syncPosture"
import { findSettings, type SettingsSectionId } from "./settingsIndex"
import { showToast } from "./toastService"
import { STORAGE_KEYS } from "./storageKeys"
import { openUrl } from "@tauri-apps/plugin-opener"

interface SettingsModalProps {
  open: boolean
  settings: Settings
  /** Optional section to jump to when opened (e.g. "ai"). */
  initialSection?: string
  /** Provider that owns the current vault, if detected. Read-only display. */
  cloudProvider?: CloudProvider | null
  /** Where this vault actually stands: versioned, shared, or neither. */
  syncPosture?: SyncPosture
  /** Hands the user over to the Git panel. */
  onOpenGit?: () => void
  onClose: () => void
  onChange: (partial: Partial<Settings>) => void
}

type SectionId = "general" | "editor" | "preview" | "dailyNotes" | "pdf" | "ai" | "sync"

export default function SettingsModal({ open, settings, initialSection, cloudProvider, syncPosture, onOpenGit, onClose, onChange }: SettingsModalProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  // Initialize from the requested section. The parent passes a `key` derived
  // from `initialSection` so this component remounts (and re-runs this lazy
  // initializer) whenever it should jump to a different section.
  const [section, setSection] = useState<SectionId>(() => (initialSection as SectionId) ?? "general")
  // The ADS token is a credential: it lives in the OS keychain via
  // secretStore, never in the settings JSON alongside preferences.
  const [adsToken, setAdsToken] = useState("")
  // Result of the last connection test. A settings form that never proves it
  // works leaves the user guessing between a wrong key, a wrong model name and
  // an endpoint that is simply not running.
  const [query, setQuery] = useState("")
  const [aiCheck, setAiCheck] = useState<AiCheck | null>(null)
  const [aiChecking, setAiChecking] = useState(false)
  useEffect(() => {
    let alive = true
    getSecret("ads_token").then((v) => { if (alive && v) setAdsToken(v) }).catch(() => {})
    return () => { alive = false }
  }, [])
  const aiCheckMessage = (check: AiCheck): string => {
    switch (check.code) {
      case "ok": return t.aiSettings.testOk
      case "incomplete": return t.aiSettings.testIncomplete
      case "bad-url": return t.aiSettings.testBadUrl
      case "unauthorized": return t.aiSettings.testUnauthorized
      case "no-model": return t.aiSettings.testNoModel
      case "unreachable": return t.aiSettings.testUnreachable
      default: return t.aiSettings.testFailed
    }
  }

  const cs = t.cloudSync.settings
  const postureText =
    syncPosture === "git-shared" ? cs.postureGitShared
    : syncPosture === "git-local" ? cs.postureGitLocal
    : syncPosture === "git-in-cloud" ? cs.postureGitInCloud
    : syncPosture === "cloud-only" ? cs.postureCloudOnly
    : cs.postureLocalOnly
  const postureAlarming = syncPosture === "git-in-cloud"
  const step = syncPosture ? nextStep(syncPosture) : null
  const postureStep =
    step === "move-out-of-cloud" ? cs.stepMoveOutOfCloud
    : step === "add-remote" ? cs.stepAddRemote
    : step === "start-git" ? cs.stepStartGit
    : null

  useFocusTrap(modalRef, open, onClose)
  if (!open) return null

  const tabs: { id: SectionId; label: string }[] = [
    { id: "general", label: t.settings.sections.general },
    { id: "editor", label: t.settings.sections.editor },
    { id: "preview", label: t.settings.sections.preview },
    { id: "dailyNotes", label: t.settings.sections.dailyNotes },
    { id: "pdf", label: t.settings.sections.pdf },
    { id: "sync", label: t.settings.sections.sync },
    { id: "ai", label: t.aiSettings.section },
  ]

  const aiPreset = getPreset(settings.aiProviderId)

  // Jump to an option found by search: switch to its tab, then bring the row
  // into view and mark it, because landing on the right tab is only half the
  // answer when the tab is longer than the window.
  const goToSetting = (id: string, target: SettingsSectionId) => {
    setSection(target)
    setQuery("")
    requestAnimationFrame(() => {
      const row = modalRef.current?.querySelector(`[data-setting="${id}"]`)
      if (!row) return
      row.scrollIntoView({ block: "center" })
      row.classList.add("setting-row-found")
      setTimeout(() => row.classList.remove("setting-row-found"), 1600)
    })
  }

  // Each tab has a page on the site that says more than a line under a
  // control can. Nothing in the app linked to the documentation before this,
  // so the short text and the long text had no way to reach each other.
  const DOCS_BASE = "https://comdtex.witara.site"
  const docsPageFor: Record<SectionId, string> = {
    general: "settings", editor: "settings", preview: "settings",
    dailyNotes: "daily-notes", pdf: "compile-pdf", sync: "collaboration", ai: "ai",
  }
  const docsUrl = `${DOCS_BASE}/${settings.language}/${docsPageFor[section]}`

  const results = findSettings(query, t)
  const sectionLabel = (id: SettingsSectionId) =>
    tabs.find((tab) => tab.id === id)?.label ?? id

  const handleResetCloudHints = () => {
    try { localStorage.removeItem(STORAGE_KEYS.CLOUD_BANNER_DISMISSED) } catch { /* ignore */ }
    showToast(t.cloudSync.settings.resetDismissedDone, "success")
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal settings-modal" ref={modalRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.settings.title}</span>
          <button className="modal-close" onClick={onClose} aria-label={t.settings.closeAriaLabel}>✕</button>
        </div>

        <div className="settings-search">
          <input
            type="text"
            value={query}
            placeholder={t.settings.searchPlaceholder}
            aria-label={t.settings.searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() !== "" && (
            <div className="settings-results">
              {results.length === 0 ? (
                <div className="settings-result-empty">{t.settings.searchNoResults}</div>
              ) : (
                results.map((entry) => (
                  <button
                    key={entry.id}
                    className="settings-result"
                    onClick={() => goToSetting(entry.id, entry.section)}
                  >
                    <span>{entry.label(t)}</span>
                    <span className="settings-result-section">{sectionLabel(entry.section)}</span>
                  </button>
                ))
              )}
            </div>
          )}
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
                <label className="setting-row" data-setting="language">
                  <span>{t.settings.language}</span>
                  <select
                    value={settings.language}
                    onChange={(e) => onChange({ language: e.target.value as Settings["language"] })}
                  >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <p className="setting-hint">{t.settings.hints.language}</p>

                <label className="setting-row" data-setting="wordGoal">
                  <span>{t.settings.adsToken}</span>
                  <input
                    type="password"
                    value={adsToken}
                    placeholder={t.settings.adsTokenPlaceholder}
                    onChange={(e) => { setAdsToken(e.target.value); void setSecret("ads_token", e.target.value.trim()) }}
                  />
                </label>
                <p className="setting-hint">{t.settings.adsTokenNote}</p>

                <label className="setting-row" data-setting="theme">
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
                <p className="setting-hint">{t.settings.hints.theme}</p>

                <label className="setting-row" data-setting="touchpadGestures">
                  <span>{t.settings.touchpadGestures}</span>
                  <input
                    type="checkbox"
                    checked={settings.touchpadGestures}
                    onChange={() => onChange({ touchpadGestures: !settings.touchpadGestures })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.touchpadGestures}</p>
              </>
            )}

            {section === "editor" && (
              <>
                <label className="setting-row" data-setting="fontSize">
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
                <p className="setting-hint">{t.settings.hints.fontSize}</p>

                <label className="setting-row" data-setting="autoSaveMs">
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
                <p className="setting-hint">{t.settings.hints.autoSaveMs}</p>

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

                <label className="setting-row" data-setting="vimMode">
                  <span>{t.settings.vimMode}</span>
                  <input
                    type="checkbox"
                    checked={settings.vimMode}
                    onChange={(e) => onChange({ vimMode: e.target.checked })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.wordGoal}</p>

                <label className="setting-row" data-setting="typewriterMode">
                  <span>{t.settings.typewriterMode}</span>
                  <input
                    type="checkbox"
                    checked={settings.typewriterMode}
                    onChange={() => onChange({ typewriterMode: !settings.typewriterMode })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.typewriterMode}</p>

                <label className="setting-row" data-setting="wordWrap">
                  <span>{t.settings.wordWrap}</span>
                  <input
                    type="checkbox"
                    checked={settings.wordWrap}
                    onChange={() => onChange({ wordWrap: !settings.wordWrap })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.wordWrap}</p>

                <label className="setting-row" data-setting="minimapEnabled">
                  <span>{t.settings.minimap}</span>
                  <input
                    type="checkbox"
                    checked={settings.minimapEnabled}
                    onChange={() => onChange({ minimapEnabled: !settings.minimapEnabled })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.minimapEnabled}</p>

                <label className="setting-row" data-setting="spellcheck">
                  <span>{t.settings.spellcheck}</span>
                  <input
                    type="checkbox"
                    checked={settings.spellcheck}
                    onChange={() => onChange({ spellcheck: !settings.spellcheck })}
                  />
                </label>

                <label className="setting-row" data-setting="listContinuation">
                  <span>{t.settings.listContinuation}</span>
                  <input
                    type="checkbox"
                    checked={settings.listContinuation}
                    onChange={() => onChange({ listContinuation: !settings.listContinuation })}
                  />
                </label>
                <p className="setting-hint">{t.settings.listContinuationDesc}</p>

                <label className="setting-row" data-setting="autoFoldExcalidraw">
                  <span>{t.settings.autoFoldExcalidraw}</span>
                  <input
                    type="checkbox"
                    checked={settings.autoFoldExcalidraw}
                    onChange={() => onChange({ autoFoldExcalidraw: !settings.autoFoldExcalidraw })}
                  />
                </label>
                <p className="setting-hint">{t.settings.autoFoldExcalidrawDesc}</p>

                <label className="setting-row" data-setting="readingWpm">
                  <span>{t.settings.readingWpm}</span>
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    step={10}
                    value={settings.readingWpm}
                    onChange={(e) => {
                      // Clamp rather than trust the spinner: typing into a number
                      // field bypasses min/max, and 0 would make the estimate NaN.
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) onChange({ readingWpm: Math.min(1000, Math.max(50, Math.round(n))) })
                    }}
                  />
                </label>
                <p className="setting-hint">{t.settings.readingWpmDesc}</p>
              </>
            )}

            {section === "preview" && (
              <>
                <label className="setting-row" data-setting="previewFontSize">
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
                <p className="setting-hint">{t.settings.hints.previewFontSize}</p>

                <label className="setting-row" data-setting="previewVisible">
                  <span>{t.settings.previewVisible}</span>
                  <input
                    type="checkbox"
                    checked={settings.previewVisible}
                    onChange={() => onChange({ previewVisible: !settings.previewVisible })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.previewVisible}</p>

                <label className="setting-row" data-setting="syncScroll">
                  <span>{t.settings.syncScroll}</span>
                  <input
                    type="checkbox"
                    checked={settings.syncScroll}
                    onChange={() => onChange({ syncScroll: !settings.syncScroll })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.syncScroll}</p>

                <label className="setting-row" data-setting="mathPreview">
                  <span>{t.settings.mathPreview}</span>
                  <input
                    type="checkbox"
                    checked={settings.mathPreview ?? true}
                    onChange={() => onChange({ mathPreview: !(settings.mathPreview ?? true) })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.mathPreview}</p>

                <label className="setting-row" data-setting="previewTheme">
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
                <p className="setting-hint">{t.settings.hints.previewTheme}</p>
              </>
            )}

            {section === "dailyNotes" && (
              <>
                <label className="setting-row" data-setting="dailyNotesEnabled">
                  <span>{t.settings.dailyNotesEnabled}</span>
                  <input
                    type="checkbox"
                    checked={settings.dailyNotesEnabled}
                    onChange={() => onChange({ dailyNotesEnabled: !settings.dailyNotesEnabled })}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.dailyNotesEnabled}</p>

                <label className="setting-row" data-setting="dailyNotesFolder">
                  <span>{t.settings.dailyNotesFolder}</span>
                  <input
                    type="text"
                    value={settings.dailyNotesFolder}
                    placeholder={t.settings.dailyNotesFolderPlaceholder}
                    onChange={(e) => onChange({ dailyNotesFolder: e.target.value })}
                    disabled={!settings.dailyNotesEnabled}
                  />
                </label>
                <p className="setting-hint">{t.settings.hints.dailyNotesFolder}</p>

                <label className="setting-row setting-row-stack" data-setting="dailyNotesTemplate">
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
                <label className="setting-row" data-setting="useWasmTex">
                  <span>
                    {t.settings.useWasmTex}
                    <span className="setting-help">: {t.settings.useWasmTexDesc}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.useWasmTex}
                    onChange={() => onChange({ useWasmTex: !settings.useWasmTex })}
                  />
                </label>
                {settings.useWasmTex && (
                  <label className="setting-row" data-setting="texliveUrl">
                    <span>
                      {t.settings.texliveUrl}
                      <span className="setting-help">: {t.settings.texliveUrlDesc}</span>
                    </span>
                    <input
                      type="text"
                      value={settings.texliveUrl}
                      placeholder="https://texlive2.swiftlatex.com/"
                      onChange={(e) => onChange({ texliveUrl: e.target.value })}
                    />
                  </label>
                )}
                <label className="setting-row" data-setting="autoRebuildPdf">
                  <span>
                    {t.settings.autoRebuildPdf}
                    <span className="setting-help">: {t.settings.autoRebuildPdfDesc}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.autoRebuildPdf}
                    onChange={() => onChange({ autoRebuildPdf: !settings.autoRebuildPdf })}
                  />
                </label>
              </>
            )}

            {section === "sync" && (
              <>
                {/* Git is the mechanism and the cloud folder is the safety
                    net, so the section says where this vault stands before it
                    offers any switch to flip. */}
                <div className="setting-section-title">{cs.posture}</div>
                <p className={postureAlarming ? "setting-warn" : "setting-hint"}>{postureText}</p>
                {postureStep && (
                  <div className="setting-row">
                    <span>{postureStep}</span>
                    {onOpenGit && (
                      <button className="setting-btn" onClick={onOpenGit}>{cs.openGit}</button>
                    )}
                  </div>
                )}

                <div className="setting-section-title">{t.settings.sections.sync}</div>
                <p className="setting-hint">{cs.safetyNet}</p>

                <label className="setting-row" data-setting="cloudSyncBannerEnabled">
                  <span>
                    {t.cloudSync.settings.bannerEnabled}
                    <span className="setting-help">: {t.cloudSync.settings.bannerEnabledDesc}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.cloudSyncBannerEnabled}
                    onChange={() => onChange({ cloudSyncBannerEnabled: !settings.cloudSyncBannerEnabled })}
                  />
                </label>

                <label className="setting-row" data-setting="cloudSyncDetectEnabled">
                  <span>
                    {t.cloudSync.settings.detectEnabled}
                    <span className="setting-help">: {t.cloudSync.settings.detectEnabledDesc}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.cloudSyncDetectEnabled}
                    onChange={() => onChange({ cloudSyncDetectEnabled: !settings.cloudSyncDetectEnabled })}
                  />
                </label>

                <div className="setting-row">
                  <span>
                    {cloudProvider
                      ? t.cloudSync.settings.providerDetected(providerLabel(cloudProvider))
                      : t.cloudSync.settings.providerNone}
                  </span>
                </div>

                <label className="setting-row">
                  <span>
                    {t.cloudSync.settings.resetDismissed}
                    <span className="setting-help">: {t.cloudSync.settings.resetDismissedDesc}</span>
                  </span>
                  <button className="setting-btn" onClick={handleResetCloudHints}>
                    {t.cloudSync.settings.resetDismissed}
                  </button>
                </label>
              </>
            )}

            {section === "ai" && (
              <>
                <label className="setting-row" data-setting="aiEnabled">
                  <span>{t.aiSettings.enabled}</span>
                  <input
                    type="checkbox"
                    checked={settings.aiEnabled}
                    onChange={() => onChange({ aiEnabled: !settings.aiEnabled })}
                  />
                </label>
                <p className="setting-hint">{t.aiSettings.enabledDesc}</p>

                <label className="setting-row" data-setting="aiProviderId">
                  <span>{t.aiSettings.provider}</span>
                  <select
                    value={settings.aiProviderId}
                    onChange={(e) => onChange({ aiProviderId: e.target.value })}
                  >
                    {PROVIDER_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </label>
                <p className="setting-hint">{t.settings.hints.aiProviderId}</p>

                {aiPreset.needsBaseUrl && (
                  <label className="setting-row" data-setting="aiBaseUrl">
                    <span>{t.aiSettings.baseUrl}</span>
                    <input
                      type="text"
                      value={settings.aiBaseUrl}
                      placeholder={t.aiSettings.baseUrlPlaceholder}
                      onChange={(e) => onChange({ aiBaseUrl: e.target.value })}
                    />
                  </label>
                )}
                {aiPreset.needsBaseUrl && (
                  <p className="setting-hint">{t.settings.hints.aiBaseUrl}</p>
                )}

                {aiPreset.isCli ? (
                  <>
                    <label className="setting-row" data-setting="aiCliCommand">
                      <span>{t.aiSettings.cliCommand}</span>
                      <input
                        type="text"
                        value={settings.aiCliCommand}
                        placeholder={t.aiSettings.cliCommandPlaceholder}
                        onChange={(e) => onChange({ aiCliCommand: e.target.value })}
                      />
                    </label>
                    <p className="setting-hint">{t.aiSettings.cliNote}</p>
                  </>
                ) : (
                  <>
                    <label className="setting-row" data-setting="aiModel">
                      <span>{t.aiSettings.model}</span>
                      <input
                        type="text"
                        value={settings.aiModel}
                        placeholder={t.aiSettings.modelPlaceholder}
                        onChange={(e) => onChange({ aiModel: e.target.value })}
                      />
                    </label>

                    <label className="setting-row" data-setting="aiApiKey">
                      <span>{t.aiSettings.apiKey}</span>
                      <input
                        type="password"
                        value={settings.aiApiKey}
                        placeholder={t.aiSettings.apiKeyPlaceholder}
                        onChange={(e) => onChange({ aiApiKey: e.target.value })}
                      />
                    </label>
                    <p className="setting-hint">{t.aiSettings.apiKeyNote}</p>
                  </>
                )}

                <p className="setting-hint">{t.aiSettings.hostNote}</p>

                <div className="setting-row">
                  <span>
                    {aiCheck && (
                      <span className={aiCheck.code === "ok" ? "setting-ok" : "setting-warn"}>
                        {aiCheckMessage(aiCheck)}
                        {aiCheck.detail && aiCheck.code !== "ok" ? `: ${aiCheck.detail}` : ""}
                      </span>
                    )}
                  </span>
                  <button
                    className="setting-btn"
                    disabled={aiChecking}
                    onClick={() => {
                      setAiChecking(true)
                      setAiCheck(null)
                      void checkConnection(settings)
                        .then(setAiCheck)
                        .finally(() => setAiChecking(false))
                    }}
                  >
                    {aiChecking ? t.aiSettings.testing : t.aiSettings.test}
                  </button>
                </div>

                {settings.aiEnabled && (
                  <>
                    <label className="setting-row" data-setting="aiWarmupEnabled">
                      <span>{t.aiSettings.warmup}</span>
                      <input
                        type="checkbox"
                        checked={settings.aiWarmupEnabled}
                        onChange={() => onChange({ aiWarmupEnabled: !settings.aiWarmupEnabled })}
                      />
                    </label>
                    <p className="setting-hint">{t.aiSettings.warmupDesc}</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <button
            className="settings-docs-link"
            onClick={() => { void openUrl(docsUrl).catch(() => {}) }}
          >
            {t.settings.docsLink} ↗
          </button>
        </div>
      </div>
    </div>
  )
}
