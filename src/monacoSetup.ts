import type * as monacoApi from "monaco-editor"
import type { VimAdapterInstance } from "monaco-vim"

interface Completion {
  label: string
  detail: string
  snippet: string
}

export const COMPLETIONS: Completion[] = [
  // ── Environments ─────────────────────────────────────────────────────────
  { label: "theorem",     detail: ":::theorem → Teorema numerado",     snippet: ":::theorem[${1:título}]\n${2:enunciado}\n:::" },
  { label: "lemma",       detail: ":::lemma → Lema numerado",          snippet: ":::lemma[${1:título}]\n${2:enunciado}\n:::" },
  { label: "corollary",   detail: ":::corollary → Corolario",          snippet: ":::corollary\n${1:enunciado}\n:::" },
  { label: "proposition", detail: ":::proposition → Proposición",      snippet: ":::proposition\n${1:enunciado}\n:::" },
  { label: "definition",  detail: ":::definition → Definición",        snippet: ":::definition\n${1:definición}\n:::" },
  { label: "example",     detail: ":::example → Ejemplo",              snippet: ":::example\n${1:ejemplo}\n:::" },
  { label: "exercise",    detail: ":::exercise → Ejercicio",           snippet: ":::exercise\n${1:ejercicio}\n:::" },
  { label: "proof",       detail: ":::proof → Demostración (con □)",   snippet: ":::proof\n${1:demostración}\n:::" },
  { label: "remark",      detail: ":::remark → Observación",           snippet: ":::remark\n${1:observación}\n:::" },
  { label: "note",        detail: ":::note → Nota",                    snippet: ":::note\n${1:nota}\n:::" },
  // ── Math shorthands ───────────────────────────────────────────────────────
  { label: "table", detail: "table(Col1, Col2, ...) → tabla markdown",            snippet: "table(${1:Col1}, ${2:Col2}, ${3:Col3})" },
  { label: "mat",   detail: "mat(v1, v2, ...) → tamaño auto-detectado",          snippet: "mat(${1:1}, ${2:2}, ${3:3}, ${4:4})" },
  { label: "matf",  detail: "matf(filas, cols, v1, ...) → tamaño explícito",     snippet: "matf(${1:2}, ${2:2})" },
  { label: "frac",  detail: "frac(numerador, denominador) → a/b",                snippet: "frac(${1:a}, ${2:b})" },
  { label: "sqrt",  detail: "sqrt(x) → √x",                                      snippet: "sqrt(${1:x})" },
  { label: "root",  detail: "root(n, x) → ⁿ√x",                                 snippet: "root(${1:n}, ${2:x})" },
  { label: "sum",   detail: "sum(inicio, fin) → Σ",                              snippet: "sum(${1:i=0}, ${2:n})" },
  { label: "int",   detail: "int(a, b) → ∫",                                     snippet: "int(${1:a}, ${2:b})" },
  { label: "lim",   detail: "lim(var, valor) → lím",                             snippet: "lim(${1:x}, ${2:0})" },
  { label: "vec",   detail: "vec(v) → v⃗",                                       snippet: "vec(${1:v})" },
  { label: "abs",   detail: "abs(x) → |x|",                                      snippet: "abs(${1:x})" },
  { label: "norm",  detail: "norm(v) → ‖v‖",                                     snippet: "norm(${1:v})" },
  { label: "ceil",  detail: "ceil(x) → ⌈x⌉",                                    snippet: "ceil(${1:x})" },
  { label: "floor", detail: "floor(x) → ⌊x⌋",                                   snippet: "floor(${1:x})" },
  // Superscript / subscript
  { label: "sup",   detail: "sup(x, n) → x^{n}",                                snippet: "sup(${1:x}, ${2:n})" },
  { label: "sub",   detail: "sub(x, n) → x_{n}",                                snippet: "sub(${1:x}, ${2:n})" },
  // Decorators
  { label: "hat",   detail: "hat(x) → x̂",                                       snippet: "hat(${1:x})" },
  { label: "bar",   detail: "bar(x) → x̄",                                       snippet: "bar(${1:x})" },
  { label: "tilde", detail: "tilde(x) → x̃",                                     snippet: "tilde(${1:x})" },
  { label: "dot",   detail: "dot(x) → ẋ",                                        snippet: "dot(${1:x})" },
  { label: "ddot",  detail: "ddot(x) → ẍ",                                       snippet: "ddot(${1:x})" },
  // Math fonts
  { label: "bf",    detail: "bf(x) → 𝐱 (mathbf)",                               snippet: "bf(${1:x})" },
  { label: "cal",   detail: "cal(A) → 𝒜 (mathcal)",                             snippet: "cal(${1:A})" },
  { label: "bb",    detail: "bb(R) → ℝ (mathbb)",                                snippet: "bb(${1:R})" },
  // Derivatives
  { label: "pder",  detail: "pder(f, x) → ∂f/∂x",                               snippet: "pder(${1:f}, ${2:x})" },
  { label: "der",   detail: "der(f, x) → df/dx",                                 snippet: "der(${1:f}, ${2:x})" },
  // Linear algebra
  { label: "inv",   detail: "inv(A) → A⁻¹",                                      snippet: "inv(${1:A})" },
  { label: "trans", detail: "trans(A) → Aᵀ",                                     snippet: "trans(${1:A})" },
]

// ── Vault file names for wikilink autocomplete ────────────────────────────────

let vaultFileNames: string[] = []
export function updateVaultFileNames(names: string[]) { vaultFileNames = names }

// ── Completion provider (dropdown visual) ────────────────────────────────────

let providerDisposable: monacoApi.IDisposable | null = null

export function setupMonaco(monaco: typeof monacoApi) {
  providerDisposable?.dispose()
  providerDisposable = monaco.languages.registerCompletionItemProvider("markdown", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      if (word.word.length < 2) return { suggestions: [] }
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      // Check if we're inside [[ for wikilink autocomplete
      const lineText = model.getLineContent(position.lineNumber)
      const beforeCursor = lineText.slice(0, position.column - 1)
      const wikiMatch = /\[\[([^\]|]*)$/.exec(beforeCursor)

      if (wikiMatch) {
        const partial = wikiMatch[1].toLowerCase()
        const wikiRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - partial.length,
          endColumn: position.column,
        }
        return {
          suggestions: vaultFileNames
            .filter((n) => n.toLowerCase().startsWith(partial))
            .map((n) => ({
              label: n,
              kind: monaco.languages.CompletionItemKind.File,
              insertText: n + "]]",
              range: wikiRange,
              sortText: "0" + n,
            })),
        }
      }

      return {
        suggestions: COMPLETIONS
          .filter((c) => c.label.startsWith(word.word.toLowerCase()))
          .map((c) => ({
            label: { label: c.label, description: c.detail },
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: c.snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: "0" + c.label,
          })),
      }
    },
  })
}

// ── Vim mode ─────────────────────────────────────────────────────────────────

export async function enableVimMode(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  statusEl: HTMLElement
): Promise<VimAdapterInstance> {
  const { initVimMode } = await import("monaco-vim")
  return initVimMode(editor, statusEl)
}

// ── Tab expansion via onKeyDown ───────────────────────────────────────────────

export function setupEditorCommands(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snippetCtrl = () => editor.getContribution<any>("snippetController2")

  editor.onKeyDown((e) => {
    if (e.keyCode !== monaco.KeyCode.Tab) return

    const ctrl = snippetCtrl()

    // Active snippet → advance to next placeholder (Monaco handles it internally)
    if (ctrl?.isInSnippet?.()) return

    const position = editor.getPosition()
    const model = editor.getModel()
    if (!position || !model) return

    const word = model.getWordUntilPosition(position)
    if (!word.word || word.word.length < 1) return

    const typed = word.word.toLowerCase()
    const matches = COMPLETIONS.filter((c) => c.label.startsWith(typed))
    const match =
      matches.length === 1
        ? matches[0]
        : matches.find((c) => c.label === typed)

    if (!match) return

    // Take control of Tab: prevent any other handler
    e.preventDefault()
    e.stopPropagation()

    // Close the suggestion widget if open
    editor.trigger("keyboard", "hideSuggestWidget", null)

    // Insert the snippet using snippetController2
    ctrl?.insert(match.snippet, {
      overwriteBefore: word.endColumn - word.startColumn,
      overwriteAfter: 0,
    })
  })
}
