// Block snippets (`:::theorem`), shorthands (`frac` -> `frac(a, b)`) and the
// user's own snippets from snippets.md. The fall-through source: it answers
// whenever no structural context claimed the cursor.

import type * as monacoApi from "monaco-editor"
import { COMPLETIONS, COMPLETIONS_LC } from "./catalog"
import { BLOCK_PREFIX_RE } from "./inBlock"
import { loadLatexCommands } from "./latex"
import { foldText, LATEX_SPANISH, SPANISH_ALIASES } from "./match"
import { getUserSnippets } from "./state"
import { isInMath } from "./triggers"
import type { CompletionSource } from "./types"
import { makeRange } from "./util"

export const snippetsSource: CompletionSource = (env) => {
  const word = env.model.getWordUntilPosition(env.position)
  // Bare `:::` (no letters yet) also triggers, listing every block type.
  const blockPrefix = BLOCK_PREFIX_RE.exec(env.before)

  if (!blockPrefix && word.word.length < 2) return { suggestions: [] }
  const query = foldText(blockPrefix ? (blockPrefix[1] ?? "") : word.word)
  const range = blockPrefix
    ? makeRange(env, env.position.column - blockPrefix[0].length)
    : makeRange(env, word.startColumn, word.endColumn)

  const kinds = env.monaco.languages.CompletionItemKind
  const asSnippet = env.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  const suggestions: monacoApi.languages.CompletionItem[] = []

  const userSnippets = getUserSnippets()
  for (let i = 0; i < userSnippets.length; i++) {
    const c = userSnippets[i]
    // In ::: block context only offer block snippets (never `frac`, `table`...).
    if (blockPrefix && !c.snippet.startsWith(":::")) continue
    const label = foldText(c.label)
    const normalized = label.startsWith(":::") ? label.slice(3) : label
    if (!label.startsWith(query) && !normalized.startsWith(query)) continue
    suggestions.push({
      label: { label: c.label, description: c.detail },
      kind: kinds.Snippet,
      insertText: c.snippet,
      insertTextRules: asSnippet,
      range,
      sortText: "00" + c.label,
      // The range swallows the ::: prefix, so Monaco's own filter must match
      // against a :::-prefixed term or it hides unprefixed labels.
      ...(blockPrefix ? { filterText: ":::" + normalized } : {}),
    })
  }

  for (let i = 0; i < COMPLETIONS.length; i++) {
    const c = COMPLETIONS[i]
    if (blockPrefix && !c.snippet.startsWith(":::")) continue
    const label = COMPLETIONS_LC[i]
    const normalized = label.startsWith(":::") ? label.slice(3) : label
    // A Spanish name ("teorema", "matriz", "raiz") finds the English entry.
    const aliases = (SPANISH_ALIASES[c.label] ?? []).map(foldText)
    const aliased = aliases.some((a) => a.startsWith(query))
    if (!aliased && !label.startsWith(query) && !normalized.startsWith(query)) continue
    suggestions.push({
      label: { label: c.label, description: c.detail },
      kind: kinds.Snippet,
      insertText: c.snippet,
      insertTextRules: asSnippet,
      range,
      sortText:
        (aliased && !label.startsWith(query) && !normalized.startsWith(query) ? "1" : "0") +
        c.label,
      ...(blockPrefix
        ? { filterText: [":::" + normalized, ...aliases.map((a) => ":::" + a)].join(" ") }
        : aliased
          ? { filterText: [c.label, ...aliases].join(" ") }
          : {}),
    })
  }
  // Inside math, a bare word also finds LaTeX symbols by name, in English or
  // Spanish (`alp` -> \alpha, `alfa` -> \alpha), without typing the backslash.
  if (
    !blockPrefix &&
    query.length >= 2 &&
    isInMath(env.model, env.position.lineNumber, env.before)
  ) {
    return loadLatexCommands().then((table) => {
      const taken = new Set(COMPLETIONS_LC)
      let count = 0
      for (const [name, glyph, snippet, group] of table) {
        if (group !== "s" || !glyph || taken.has(name.toLowerCase())) continue
        const aliases = (LATEX_SPANISH[name] ?? []).map(foldText)
        const nameFold = foldText(name)
        if (!nameFold.startsWith(query) && !aliases.some((a) => a.startsWith(query))) continue
        suggestions.push({
          label: { label: "\\" + name, description: glyph },
          kind: kinds.Constant,
          detail: glyph,
          insertText: snippet || "\\" + name,
          insertTextRules: snippet.includes("$") ? asSnippet : undefined,
          range,
          sortText: "2" + name,
          filterText: [name, ...aliases].join(" "),
        })
        if (++count >= 12) break
      }
      return { suggestions }
    })
  }
  return { suggestions }
}
