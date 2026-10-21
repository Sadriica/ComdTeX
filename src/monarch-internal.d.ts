// Monaco's Monarch compiler and lexer are internal modules without type
// declarations. Only the grammar tests import them (comdtexLanguage.test.ts),
// to run the real tokenizer without a browser.
declare module "monaco-editor/esm/vs/editor/standalone/common/monarch/monarchCompile.js" {
  export function compile(languageId: string, json: unknown): unknown
}
declare module "monaco-editor/esm/vs/editor/standalone/common/monarch/monarchLexer.js" {
  export class MonarchTokenizer {
    constructor(
      languageService: unknown,
      themeService: unknown,
      languageId: string,
      lexer: unknown,
      configurationService: unknown,
    )
    getInitialState(): unknown
    tokenize(
      line: string,
      hasEOL: boolean,
      state: unknown,
    ): { tokens: { offset: number; type: string }[]; endState: unknown }
  }
}
