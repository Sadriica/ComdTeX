interface BreadcrumbProps {
  vaultPath: string | null
  filePath: string | null
  onNavigate?: (path: string) => void
  currentHeading?: string
  canGoBack?: boolean
  canGoForward?: boolean
  onGoBack?: () => void
  onGoForward?: () => void
}

export default function Breadcrumb({ vaultPath, filePath, onNavigate, currentHeading, canGoBack, canGoForward, onGoBack, onGoForward }: BreadcrumbProps) {
  if (!vaultPath || !filePath) return null

  // Build segments relative to vault root
  const vaultName = vaultPath.split("/").filter(Boolean).pop() ?? vaultPath
  const relative = filePath.startsWith(vaultPath)
    ? filePath.slice(vaultPath.length).replace(/^\//, "")
    : filePath

  const parts = relative.split("/").filter(Boolean)
  if (parts.length === 0) return null

  // Build cumulative paths for each segment
  const segments: { label: string; path: string }[] = [
    { label: vaultName, path: vaultPath },
  ]
  let cumPath = vaultPath
  for (const part of parts) {
    cumPath = `${cumPath}/${part}`
    segments.push({ label: part, path: cumPath })
  }

  return (
    <nav className="breadcrumb" aria-label="Ubicación">
      <button
        className="breadcrumb-nav-btn"
        onClick={onGoBack}
        disabled={!canGoBack}
        title="Atrás (Alt+←)"
        aria-label="Atrás"
      >‹</button>
      <button
        className="breadcrumb-nav-btn"
        onClick={onGoForward}
        disabled={!canGoForward}
        title="Adelante (Alt+→)"
        aria-label="Adelante"
      >›</button>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        return (
          <span key={seg.path} className="breadcrumb-segment">
            {i > 0 && <span className="breadcrumb-sep">›</span>}
            {isLast ? (
              <span className="breadcrumb-current">{seg.label}</span>
            ) : (
              <button
                className="breadcrumb-link"
                onClick={() => onNavigate?.(seg.path)}
                title={seg.path}
              >
                {seg.label}
              </button>
            )}
          </span>
        )
      })}
      {currentHeading && (
        <>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-heading">{currentHeading}</span>
        </>
      )}
    </nav>
  )
}
