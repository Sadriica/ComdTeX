import type * as monacoApi from "monaco-editor"

/** The slice of Monaco's text model the sources read. A fake satisfies it in tests. */
export type CompletionModel = Pick<
  monacoApi.editor.ITextModel,
  "getLineContent" | "getLineCount" | "getVersionId" | "getWordUntilPosition"
>

export type CompletionList = monacoApi.languages.CompletionList

/** Everything a source needs about one completion request. */
export interface CompletionEnv {
  monaco: typeof monacoApi
  model: CompletionModel
  position: { lineNumber: number; column: number }
  /** Full text of the cursor's line. */
  line: string
  /** Line text before the cursor. */
  before: string
  /** Line text after the cursor. */
  after: string
}

/**
 * One source of suggestions. Returns null when the cursor is not in its
 * context (the next source gets a turn), or a list (possibly empty) when it
 * is, which ends the cascade.
 */
export type CompletionSource = (
  env: CompletionEnv,
) => CompletionList | Promise<CompletionList> | null

/** Re-opens the suggest widget after an item is accepted (e.g. `thm:` then labels). */
export const RETRIGGER_COMMAND: monacoApi.languages.Command = {
  id: "editor.action.triggerSuggest",
  title: "",
}
