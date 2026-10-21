/**
 * A tiny stand-in for the parts of Monaco the navigation and hover providers
 * touch: Uri, Range, text models, the provider registries and the openers.
 * Providers take `monaco` as an argument precisely so they can run on this.
 */
import type * as monacoApi from "monaco-editor"

export class FakeRange {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number,
  ) {}
}

export class FakeUri {
  constructor(
    public scheme: string,
    public path: string,
    public query = "",
  ) {}
  toString() {
    return `${this.scheme}://${this.path}${this.query ? `?${this.query}` : ""}`
  }
  get fsPath() {
    return this.path
  }
}

export class FakeModel {
  private version = 1
  disposed = false
  constructor(
    public text: string,
    public uri: FakeUri,
    public language = "markdown",
  ) {}
  get id() {
    return this.uri.toString()
  }
  getValue() {
    return this.text
  }
  setValue(next: string) {
    this.text = next
    this.version++
  }
  getVersionId() {
    return this.version
  }
  getLineCount() {
    return this.text.split("\n").length
  }
  getLineContent(line: number) {
    return this.text.split("\n")[line - 1] ?? ""
  }
  dispose() {
    this.disposed = true
  }
}

export interface FakeMonaco {
  api: typeof monacoApi
  models: Map<string, FakeModel>
  providers: { kind: string; language: string; provider: unknown }[]
  editorOpeners: monacoApi.editor.ICodeEditorOpener[]
  linkOpeners: monacoApi.editor.ILinkOpener[]
  disposed: string[]
  /** Listeners of `editor.onDidCreateEditor`; call them with an editor to simulate one appearing. */
  createListeners: ((editor: unknown) => void)[]
}

export function createFakeMonaco(): FakeMonaco {
  const models = new Map<string, FakeModel>()
  const providers: FakeMonaco["providers"] = []
  const editorOpeners: monacoApi.editor.ICodeEditorOpener[] = []
  const linkOpeners: monacoApi.editor.ILinkOpener[] = []
  const disposed: string[] = []
  const createListeners: ((editor: unknown) => void)[] = []

  const register = (kind: string) => (language: string, provider: unknown) => {
    const entry = { kind, language, provider }
    providers.push(entry)
    return {
      dispose: () => {
        disposed.push(kind)
        providers.splice(providers.indexOf(entry), 1)
      },
    }
  }

  const api = {
    Range: FakeRange,
    Uri: {
      file: (p: string) => new FakeUri("file", p),
      from: (c: { scheme: string; path?: string; query?: string }) =>
        new FakeUri(c.scheme, c.path ?? "", c.query ?? ""),
    },
    languages: {
      registerDefinitionProvider: register("definition"),
      registerReferenceProvider: register("references"),
      registerLinkProvider: register("links"),
      registerHoverProvider: register("hover"),
    },
    editor: {
      getModel: (uri: FakeUri) => models.get(uri.toString()) ?? null,
      createModel: (text: string, language: string, uri: FakeUri) => {
        const model = new FakeModel(text, uri, language)
        models.set(uri.toString(), model)
        return model
      },
      onDidCreateEditor: (listener: (editor: unknown) => void) => {
        createListeners.push(listener)
        return { dispose: () => createListeners.splice(createListeners.indexOf(listener), 1) }
      },
      registerEditorOpener: (opener: monacoApi.editor.ICodeEditorOpener) => {
        editorOpeners.push(opener)
        return { dispose: () => editorOpeners.splice(editorOpeners.indexOf(opener), 1) }
      },
      registerLinkOpener: (opener: monacoApi.editor.ILinkOpener) => {
        linkOpeners.push(opener)
        return { dispose: () => linkOpeners.splice(linkOpeners.indexOf(opener), 1) }
      },
    },
  } as unknown as typeof monacoApi

  return { api, models, providers, editorOpeners, linkOpeners, disposed, createListeners }
}

/** The model the editor shows (anonymous in-memory URI, as in the app). */
export function editorModel(text: string, n = 1): FakeModel {
  return new FakeModel(text, new FakeUri("inmemory", `/model/${n}`))
}

export const cancelToken = { isCancellationRequested: false } as monacoApi.CancellationToken
