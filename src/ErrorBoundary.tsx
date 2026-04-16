import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Catches render-time errors in the component tree and displays a fallback
 * instead of crashing the entire app to a blank screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ComdTeX] Unhandled render error:", error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", gap: 16,
          fontFamily: "monospace", background: "#1e1e1e", color: "#d4d4d4",
          padding: 32, boxSizing: "border-box",
        }}>
          <h2 style={{ color: "#f44747", margin: 0 }}>Error inesperado / Unexpected error</h2>
          <pre style={{
            maxWidth: 600, overflowX: "auto", whiteSpace: "pre-wrap",
            background: "#252526", padding: 16, borderRadius: 4,
            fontSize: 13, color: "#ce9178", border: "1px solid #3c3c3c",
          }}>
            {error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "6px 18px", background: "#0e639c", border: "none",
              borderRadius: 3, color: "#fff", cursor: "pointer", fontSize: 13,
            }}
          >
            Reintentar / Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
