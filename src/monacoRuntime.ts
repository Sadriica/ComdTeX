import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js"
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution"

self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

// Monaco doesn't ship a built-in LaTeX language. We register it explicitly so
// `.tex` tabs resolve to a stable language id instead of depending on fallback
// behavior from the full bundled distribution.
monaco.languages.register({
  id: "latex",
  extensions: [".tex"],
  aliases: ["LaTeX", "latex", "tex"],
})

loader.config({ monaco })

export { monaco }
