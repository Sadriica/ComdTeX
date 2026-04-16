interface WelcomeScreenProps {
  onOpenVault: () => void
  onCreateVault: () => void
  recentVaults: string[]
  onOpenRecent: (path: string) => void
  lang?: "es" | "en"
}

const TEXT = {
  es: {
    tagline: "Editor académico para Markdown + LaTeX",
    openExisting: "Abrir carpeta existente",
    createNew: "Crear nueva carpeta",
    features: "Funciones",
    recents: "Recientes",
    hint: "Ctrl+O para abrir vault",
    featureList: [
      { icon: "∑", name: "Matemáticas KaTeX", desc: "Ecuaciones, entornos, shorthands" },
      { icon: "📚", name: "BibTeX", desc: "Citas y bibliografía automática" },
      { icon: "∀", name: "Entornos", desc: "theorem, proof, definition…" },
      { icon: "⎘", name: "Exportar", desc: "PDF, LaTeX, HTML, DOCX" },
    ],
  },
  en: {
    tagline: "Academic editor for Markdown + LaTeX",
    openExisting: "Open existing folder",
    createNew: "Create new folder",
    features: "Features",
    recents: "Recent",
    hint: "Ctrl+O to open vault",
    featureList: [
      { icon: "∑", name: "KaTeX Math", desc: "Equations, environments, shorthands" },
      { icon: "📚", name: "BibTeX", desc: "Citations and bibliography" },
      { icon: "∀", name: "Environments", desc: "theorem, proof, definition…" },
      { icon: "⎘", name: "Export", desc: "PDF, LaTeX, HTML, DOCX" },
    ],
  },
}

export default function WelcomeScreen({
  onOpenVault,
  onCreateVault,
  recentVaults,
  onOpenRecent,
  lang = "es",
}: WelcomeScreenProps) {
  const tx = TEXT[lang] ?? TEXT.es

  return (
    <div className="welcome-screen">
      <div className="welcome-logo" aria-hidden="true">
        Comd<span>TeX</span>
      </div>
      <p className="welcome-tagline">{tx.tagline}</p>

      <div className="welcome-actions">
        <button className="welcome-btn welcome-btn-primary" onClick={onOpenVault}>
          {tx.openExisting}
        </button>
        <button className="welcome-btn welcome-btn-secondary" onClick={onCreateVault}>
          {tx.createNew}
        </button>
      </div>

      <div className="welcome-features">
        {tx.featureList.map((f) => (
          <div className="welcome-feature-card" key={f.name}>
            <div className="feature-icon">{f.icon}</div>
            <div className="feature-name">{f.name}</div>
            <div className="feature-desc">{f.desc}</div>
          </div>
        ))}
      </div>

      {recentVaults.length > 0 && (
        <div className="welcome-recents">
          <h3>{tx.recents}</h3>
          {recentVaults.map((path) => (
            <div
              key={path}
              className="welcome-recent-item"
              onClick={() => onOpenRecent(path)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpenRecent(path)}
              role="button"
              tabIndex={0}
              title={path}
            >
              {path}
            </div>
          ))}
        </div>
      )}

      <p className="welcome-hint">{tx.hint}</p>

      <span className="welcome-version">v1.0.0</span>
    </div>
  )
}
