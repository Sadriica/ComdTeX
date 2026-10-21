import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js"
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
// Fenced code in the editor embeds these lazily (comdtexLanguage.ts); each
// contribution is a few lines that register the id and a dynamic import.
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution"
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution"
import "monaco-editor/esm/vs/basic-languages/python/python.contribution"
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution"
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution"

self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

// "markdown" is registered here instead of through Monaco's own markdown
// contribution. That contribution lazily loads the built-in tokenizer AND
// language configuration the first time a markdown model appears, and the
// configuration it sets then silently replaced the one monacoSetup.ts sets in
// beforeMount (auto-closing `$` and backticks, surrounding pairs). With the
// language registered here, the grammar (comdtexLanguage.ts) and the
// configuration (monacoSetup.ts) are the only ones there are.
monaco.languages.register({
  id: "markdown",
  extensions: [".md", ".markdown", ".mdown", ".mkdn", ".mkd", ".mdwn", ".mdtxt", ".mdtext"],
  aliases: ["Markdown", "markdown"],
})

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
