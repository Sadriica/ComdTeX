import { useT } from "./i18n"
import { Cpu, Folder, Icon, Library, ScrollText, Sigma, Upload } from "./icons"

interface WelcomeScreenProps {
  onOpenVault: () => void
  onCreateVault: () => void
  recentVaults: string[]
  onOpenRecent: (path: string) => void
}

export default function WelcomeScreen({
  onOpenVault,
  onCreateVault,
  recentVaults,
  onOpenRecent,
}: WelcomeScreenProps) {
  const t = useT()
  const features = [
    {
      icon: <Icon icon={Sigma} size={16} />,
      name: t.welcome.featureMath,
      desc: t.welcome.featureMathDesc,
    },
    {
      icon: <Icon icon={Library} size={16} />,
      name: t.welcome.featureBib,
      desc: t.welcome.featureBibDesc,
    },
    {
      icon: <Icon icon={ScrollText} size={16} />,
      name: t.welcome.featureEnv,
      desc: t.welcome.featureEnvDesc,
    },
    {
      icon: <Icon icon={Upload} size={16} />,
      name: t.welcome.featureExport,
      desc: t.welcome.featureExportDesc,
    },
    {
      icon: <Icon icon={Cpu} size={16} />,
      name: t.welcome.featureWasmTex,
      desc: t.welcome.featureWasmTexDesc,
    },
  ]

  return (
    <div className="welcome-screen">
      <div className="welcome-logo" aria-hidden="true">
        Comd<span>TeX</span>
      </div>
      <p className="welcome-tagline">{t.welcome.tagline}</p>

      <div className="welcome-actions">
        <button className="welcome-btn welcome-btn-primary" onClick={onOpenVault}>
          {t.welcome.openExisting}
        </button>
        <button className="welcome-btn welcome-btn-secondary" onClick={onCreateVault}>
          {t.welcome.createNew}
        </button>
      </div>

      <div className="welcome-features">
        {features.map((f) => (
          <div className="welcome-feature-card" key={f.name}>
            <div className="feature-icon">{f.icon}</div>
            <div className="feature-name">{f.name}</div>
            <div className="feature-desc">{f.desc}</div>
          </div>
        ))}
      </div>

      {recentVaults.length > 0 && (
        <div className="welcome-recents">
          <h3>{t.welcome.recents}</h3>
          {recentVaults.map((path) => {
            const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path
            return (
              <div
                key={path}
                className="welcome-recent-item"
                onClick={() => onOpenRecent(path)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpenRecent(path)}
                role="button"
                tabIndex={0}
                title={path}
              >
                <span className="welcome-recent-icon" aria-hidden="true">
                  <Icon icon={Folder} size={16} />
                </span>
                <span className="welcome-recent-info">
                  <span className="welcome-recent-name">{name}</span>
                  <span className="welcome-recent-path">{path}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p className="welcome-hint">{t.welcome.hint}</p>

      <span className="welcome-version">v{__APP_VERSION__}</span>
    </div>
  )
}
