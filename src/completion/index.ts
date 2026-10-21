// Editor completion: one registered provider that hands the cursor to the
// first source whose context it is in. Each source lives in its own module:
//
//   frontmatter   YAML keys and values inside the leading `---` region
//   csvBlocks     `:::csv` / `:::data` file names and column headers
//   latex         `\command` (generated KaTeX table, lazy chunk) and user macros
//   inBlock       keywords inside pseudocode / truth / graph / plot / commdiag
//   wikilinks     `[[note]]`, `[[note#heading]]`
//   citations     `[@key]`, `[@a; @b, p. 3]`
//   labels        `@kind:name`, `@path@kind:name`, `@path@`
//   labelSlot     `{#kind:slug}` after a heading, environment, equation, figure
//   footnotes     `[^note]`
//   snippets      block snippets, shorthands, the user's snippets.md
//
// Data comes from state.ts, which App.tsx keeps current.

import type * as monacoApi from "monaco-editor"
import { EDITOR_LANGUAGES } from "../comdtexLanguage"
import { citationsSource } from "./citations"
import { csvBlocksSource } from "./csvBlocks"
import { footnotesSource } from "./footnotes"
import { frontmatterSource } from "./frontmatter"
import { inBlockSource } from "./inBlock"
import { labelSlotSource } from "./labelSlot"
import { labelsSource, resolveLabelItem } from "./labels"
import { latexSource } from "./latex"
import { registerSignatureHelp } from "./signature"
import { snippetsSource } from "./snippets"
import type { CompletionEnv, CompletionList, CompletionSource } from "./types"
import { wikilinksSource } from "./wikilinks"

/** Cascade order: the first source that recognises its context answers. */
export const COMPLETION_SOURCES: readonly CompletionSource[] = [
  frontmatterSource,
  csvBlocksSource,
  latexSource,
  inBlockSource,
  wikilinksSource,
  citationsSource,
  labelsSource,
  labelSlotSource,
  footnotesSource,
  snippetsSource,
]

const EMPTY: CompletionList = { suggestions: [] }

/** Pure entry point: used by the registered provider and by the unit tests. */
export function provideCompletion(
  monaco: typeof monacoApi,
  model: CompletionEnv["model"],
  position: monacoApi.Position | { lineNumber: number; column: number },
): CompletionList | Promise<CompletionList> {
  const line = model.getLineContent(position.lineNumber)
  const env: CompletionEnv = {
    monaco,
    model,
    position: { lineNumber: position.lineNumber, column: position.column },
    line,
    before: line.slice(0, position.column - 1),
    after: line.slice(position.column - 1),
  }
  for (const source of COMPLETION_SOURCES) {
    const result = source(env)
    if (result) return result
  }
  return EMPTY
}

const TRIGGER_CHARACTERS = ["[", "@", "\\", "^", ":", "#", "{"]

export function registerCompletion(monaco: typeof monacoApi): monacoApi.IDisposable {
  const disposables: monacoApi.IDisposable[] = []
  for (const language of EDITOR_LANGUAGES) {
    disposables.push(
      monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: TRIGGER_CHARACTERS,
        provideCompletionItems: (model, position) => provideCompletion(monaco, model, position),
        resolveCompletionItem(item) {
          resolveLabelItem(item)
          return item
        },
      }),
      registerSignatureHelp(monaco, language),
    )
  }
  return { dispose: () => disposables.forEach((d) => d.dispose()) }
}

export {
  getSpecialBlockCompletions,
  findEnclosingSpecialBlock,
  resolveSpecialBlockTabCompletion,
  resolveTabCompletion,
  COMPLETIONS,
  SPECIAL_BLOCK_COMPLETIONS,
  type Completion,
  type TabCompletionResolution,
} from "./catalog"
export {
  setCompletionCsvResolver,
  setCompletionCurrentFile,
  setCompletionKatexMacros,
  updateBibSuggestions,
  updateLabelIndex,
  updateMacroCompletions,
  updateUserSnippets,
  updateVaultFiles,
} from "./state"
export { resolveBlockCloserEnter } from "./blockCloser"
export { setupCompletionTriggers } from "./triggers"
