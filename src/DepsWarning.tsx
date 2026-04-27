import { openPath } from "@tauri-apps/plugin-opener"
import type { DepStatus } from "./checkDeps"

interface DepsWarningProps {
  deps: DepStatus
  /** When true, PDF export uses the bundled WASM engine and pandoc is only
   * required for DOCX/Beamer/MD→PDF — the message below reflects that. */
  useWasmTex?: boolean
  onDismiss: () => void
}

function getOsHint(tool: "pandoc" | "zip"): string {
  const ua = navigator.userAgent.toLowerCase()
  if (tool === "pandoc") {
    return "pandoc.org/installing.html"
  }
  // zip
  if (ua.includes("mac")) return "brew install zip"
  return "sudo apt install zip"
}

export default function DepsWarning({ deps, useWasmTex, onDismiss }: DepsWarningProps) {
  const missing: Array<{ name: "pandoc" | "zip"; label: string; feature: string; url: string }> = []

  if (!deps.pandoc) {
    missing.push({
      name: "pandoc",
      label: "pandoc",
      feature: useWasmTex
        ? "necesario para exportar DOCX, Beamer y Markdown→PDF (no para PDF normal)"
        : "necesario para exportar PDF, DOCX, Beamer",
      url: "https://pandoc.org/installing.html",
    })
  }

  if (!deps.zip) {
    missing.push({
      name: "zip",
      label: "zip",
      feature: "necesario para backup del vault",
      url: (() => {
        const ua = navigator.userAgent.toLowerCase()
        if (ua.includes("mac")) return "https://brew.sh"
        return "https://packages.ubuntu.com/zip"
      })(),
    })
  }

  if (missing.length === 0) return null

  const handleInstall = async (item: (typeof missing)[number]) => {
    const ua = navigator.userAgent.toLowerCase()
    // For zip on Linux/Mac, show the hint as a toast-style note rather than opening a terminal URL
    if (item.name === "zip" && !ua.includes("win")) {
      // Copy install hint to clipboard as a convenience
      try {
        await navigator.clipboard.writeText(getOsHint("zip"))
      } catch {}
    }
    await openPath(item.url).catch(() => {})
  }

  return (
    <div className="deps-warning" role="alert">
      <span className="deps-warning-text">
        ⚠ Algunas funciones requieren herramientas externas:{" "}
        {missing.map((item) => (
          <span key={item.name} className="deps-warning-item">
            <strong>{item.label}</strong> — {item.feature}
            {item.name === "zip" && (
              <span style={{ color: "#bb9900", fontSize: 10 }}>
                {" "}({getOsHint("zip")})
              </span>
            )}
            <button
              className="deps-warning-btn"
              onClick={() => handleInstall(item)}
            >
              Instalar
            </button>
          </span>
        ))}
      </span>
      <button className="deps-warning-dismiss" onClick={onDismiss}>
        Ignorar
      </button>
    </div>
  )
}
