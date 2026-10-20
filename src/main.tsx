import React from "react"
import ReactDOM from "react-dom/client"
import "katex/dist/katex.min.css"
import App from "./App"
import "./styles/fixes-harness.css"
import { installGlobalErrorHandlers } from "./globalErrorHandlers"

installGlobalErrorHandlers()

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
