import { Component, Suspense, type ReactNode } from "react"
import { useT, type T } from "./i18n"

interface Props {
  children: ReactNode
  /**
   * Label of the part of the UI this boundary guards (e.g. "preview"). When set
   * the fallback is a compact inline notice with a retry button instead of the
   * full-screen one, so one crashing region does not blank the whole app.
   */
  region?: string
  /** Strings. Injected by the wrapper below; the class itself cannot use hooks. */
  strings: T["errorBoundary"]
}
interface State {
  error: Error | null
}

class Boundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    const where = this.props.region ? ` in "${this.props.region}"` : ""
    console.error(`[ComdTeX] Unhandled render error${where}:`, error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  override render() {
    const { error } = this.state
    const { region, strings } = this.props
    if (!error) return this.props.children

    if (region) {
      return (
        <div
          role="alert"
          data-error-region={region}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            margin: 8,
            padding: "8px 12px",
            boxSizing: "border-box",
            background: "rgba(244,71,71,0.08)",
            border: "1px solid rgba(244,71,71,0.4)",
            borderRadius: 4,
            fontSize: 12,
            color: "inherit",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {strings.regionFailed(
              strings.regions[region as keyof T["errorBoundary"]["regions"]] ?? region,
            )}
          </span>
          <span
            style={{
              opacity: 0.7,
              flex: "1 1 120px",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {error.message}
          </span>
          <button
            onClick={this.reset}
            style={{
              padding: "3px 12px",
              background: "#0e639c",
              border: "none",
              borderRadius: 3,
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {strings.retry}
          </button>
        </div>
      )
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
          fontFamily: "monospace",
          background: "#1e1e1e",
          color: "#d4d4d4",
          padding: 32,
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ color: "#f44747", margin: 0 }}>{strings.title}</h2>
        <pre
          style={{
            maxWidth: 600,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            background: "#252526",
            padding: 16,
            borderRadius: 4,
            fontSize: 13,
            color: "#ce9178",
            border: "1px solid #3c3c3c",
          }}
        >
          {error.message}
        </pre>
        <button
          onClick={this.reset}
          style={{
            padding: "6px 18px",
            background: "#0e639c",
            border: "none",
            borderRadius: 3,
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {strings.retry}
        </button>
      </div>
    )
  }
}

/**
 * Catches render-time errors in the component tree and displays a fallback
 * instead of crashing the app to a blank screen. Without `region` it is the
 * full-screen last resort; with `region` it is a compact inline notice.
 *
 * Strings come from LanguageContext. If a boundary is ever mounted outside the
 * provider the context holds its Spanish default, which is acceptable.
 */
export default function ErrorBoundary({
  children,
  region,
}: {
  children: ReactNode
  region?: string
}) {
  const t = useT()
  return (
    <Boundary region={region} strings={t.errorBoundary}>
      {children}
    </Boundary>
  )
}

/**
 * A lazy region: an error boundary around a Suspense. Use for lazy-loaded
 * panels and modals so a failed chunk or a render crash stays local.
 */
export function LazyRegion({
  region,
  fallback = null,
  children,
}: {
  region: string
  fallback?: ReactNode
  children: ReactNode
}) {
  return (
    <ErrorBoundary region={region}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  )
}
