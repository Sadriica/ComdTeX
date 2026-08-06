import { openUrl } from "@tauri-apps/plugin-opener"
import type { DepStatus } from "./checkDeps"
import { useT } from "./i18n"

const DOCS_BASE = "https://github.com/sadriica/comdtex/blob/main/docs/installing-deps.md"

export type DepName = "pandoc" | "zip"

interface DepsWarningProps {
  deps: DepStatus
  /** When true, PDF export uses the bundled WASM engine and pandoc is only
   * required for DOCX/Beamer/MD→PDF: the message below reflects that. */
  useWasmTex?: boolean
  /** Names of deps the user has dismissed persistently. */
  dismissed: DepName[]
  /** Called with the dep name to dismiss that specific dep persistently. */
  onDismiss: (name: DepName) => void
}

function getOsHint(tool: DepName): string {
  const ua = navigator.userAgent.toLowerCase()
  if (tool === "pandoc") {
    return "pandoc.org/installing.html"
  }
  // zip
  if (ua.includes("mac")) return "brew install zip"
  return "sudo apt install zip"
}

export default function DepsWarning({ deps, useWasmTex, dismissed, onDismiss }: DepsWarningProps) {
  const t = useT()
  const missing: Array<{ name: DepName; label: string; feature: string; url: string }> = []

  if (!deps.pandoc && !dismissed.includes("pandoc")) {
    missing.push({
      name: "pandoc",
      label: "pandoc",
      feature: useWasmTex ? t.deps.pandocFeatureWasm : t.deps.pandocFeatureNoWasm,
      url: `${DOCS_BASE}#pandoc`,
    })
  }

  if (!deps.zip && !dismissed.includes("zip")) {
    missing.push({
      name: "zip",
      label: "zip",
      feature: t.deps.zipFeature,
      url: `${DOCS_BASE}#zip`,
    })
  }

  if (missing.length === 0) return null

  const handleInstall = async (item: (typeof missing)[number]) => {
    const ua = navigator.userAgent.toLowerCase()
    // For zip on Linux/Mac, also copy the install hint so the user can paste it
    // in a terminal: convenience on top of opening the docs page.
    if (item.name === "zip" && !ua.includes("win")) {
      try {
        await navigator.clipboard.writeText(getOsHint("zip"))
      } catch {}
    }
    try {
      await openUrl(item.url)
    } catch (err) {
      console.error("Failed to open install guide:", err)
    }
  }

  return (
    <div className="deps-warning" role="alert">
      <span className="deps-warning-text">
        {t.deps.intro}{" "}
        {missing.map((item) => (
          <span key={item.name} className="deps-warning-item">
            <strong>{item.label}</strong>: {item.feature}
            {item.name === "zip" && (
              <span style={{ color: "#bb9900", fontSize: 10 }}>
                {" "}({getOsHint("zip")})
              </span>
            )}
            <button
              className="deps-warning-btn"
              onClick={() => handleInstall(item)}
            >
              {t.deps.install}
            </button>
            <button
              className="deps-warning-dismiss"
              onClick={() => onDismiss(item.name)}
              title={t.deps.ignoreTitle(item.label)}
            >
              {t.deps.ignore}
            </button>
          </span>
        ))}
      </span>
    </div>
  )
}
