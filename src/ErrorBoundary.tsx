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
        <div role="alert" data-error-region={region} className="error-region">
          <span className="error-region-title">
            {strings.regionFailed(
              strings.regions[region as keyof T["errorBoundary"]["regions"]] ?? region,
            )}
          </span>
          <span className="error-region-message">{error.message}</span>
          <button className="btn-create" onClick={this.reset}>
            {strings.retry}
          </button>
        </div>
      )
    }

    return (
      <div className="error-screen">
        <h2 className="error-screen-title">{strings.title}</h2>
        <pre className="error-screen-message">{error.message}</pre>
        <button className="btn-create" onClick={this.reset}>
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
