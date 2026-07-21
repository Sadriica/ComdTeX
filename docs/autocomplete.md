# Autocomplete & the Command Palette

ComdTeX has two complementary "type less" systems: **editor autocompletion**
(suggestions and Tab expansion while writing) and the **Command Palette**
(`Ctrl+P`), which can insert or open practically everything in the app.

## Editor autocompletion

Suggestions do not pop up while you write prose — the widget only appears on
trigger characters, on demand (`Ctrl+Space`), or inside special blocks (see
below). The primary mechanism is **Tab expansion**: type a known name, press
`Tab`, and it expands into a snippet with placeholders (`Tab` again jumps
between them).

### Trigger characters

| You type | You get |
|---|---|
| `:::` | The full list of block types (theorem, lemma, truth, graph, plot, commdiag, pseudocode, flowchart…). Keep typing to filter: `:::tr` + `Tab` → truth table. Only block snippets match after `:::` — math shorthands like `table(...)` never expand there. |
| `\` | LaTeX commands with their glyph (`\alpha` → α, `\mathbb{R}` → ℝ…) |
| `[[` | Wikilink target — vault file names |
| `[@` | BibTeX citation keys from `references.bib` |
| `@eq:` `@fig:` `@tbl:` `@sec:` `@thm:` `@def:` … | Structural labels defined across the document/vault |
| `[^` | Footnote labels |

### Shorthand names (Tab)

Any shorthand from the [Help panel](../README.md) expands with `Tab`:
`frac` → `frac(a, b)`, `sqrt`, `sum`, `mat`, `hat`, `bb`, and the rest of the
~76-entry catalog, plus your own snippets from `snippets.md`.

### Inside special blocks: contextual keywords

When the cursor is **inside** a `:::pseudocode`, `:::flowchart`, `:::truth`,
`:::graph`, `:::plot` or `:::commdiag` block, autocompletion switches to that
block's own grammar — and suggestions appear as you type (the quick-suggest
widget is enabled only while you are inside such a block):

| Block | Suggestions |
|---|---|
| `pseudocode` / `flowchart` | `INPUT`, `OUTPUT`, `PRINT`, `IF`/`IFELSE`/`ELSEIF`, `FOR` (full `FOR i ← 1 TO n DO … END FOR` template), `WHILE`, `REPEAT`/`UNTIL`, `SWAP`, `RETURN`, `END` |
| `truth` | `AND` → `∧`, `OR` → `∨`, `NOT` → `¬`, `IMPLIES` → `→`, `IFF` → `↔` |
| `graph` | `edge` (`A -- B`), `arrow` (`A -> B`), `weighted` (`A -- B : 5`) |
| `plot` | `f` (`f(x) = …`), `range` (`range: [-5, 5]`), and the function names (`sin`, `cos`, `sqrt`, `exp`…) |
| `commdiag` | `arrow` (`A -> B [f]`), `iso` (`<->`), `epi` (`->>`), `mono` (`>->`), `double` (`==>`), and `square` — a full commutative square in one go |

Two guarantees inside these blocks:

- **Global shorthands are suppressed.** `sin` + `Tab` inside a `:::plot` stays
  plain `sin(x)` (what the plotter parses) — it never becomes `\sin`.
- **Typing `:::` there is the closing fence**, so no block-type suggestions
  pop up in your way.

Math environments (`theorem`, `proof`…) are intentionally *not* contextual:
their content is normal Markdown + math, so every regular completion keeps
working inside them.

## Command Palette (`Ctrl+P`)

One fuzzy search box over **files, recent files, and ~150 commands**. Type any
part of a command's name, its syntax, or a keyword in Spanish or English —
`flowchart`, `:::theorem`, `cita`, `footnote`, `[[`, `frontmatter` all land on
the right entry. Categories:

- **Edición** — save, find, formatting (bold/italic/highlight colors),
  headings, lists.
- **Insertar** — table editor, TOC, code block, math, **wikilink,
  transclusion, footnote, BibTeX citation, numbered figure, YAML frontmatter,
  environment reference, callouts** (`[!NOTE]`/`[!WARNING]`/`[!TIP]`/
  `[!IMPORTANT]`), Excalidraw drawing, and the full snippet catalog under
  *Snippets / autocompletado*.
- **Matemáticas** — symbols, every math operation (fractions to matrices),
  all environments (theorem … exercise, remark, note).
- **Vista / Exportar / IA / Vault / Navegación** — every panel, every export,
  settings, daily note, git-friendly vault actions.

Parent entries (▸) drill into submenus; `Esc` goes back a level.

## Where things are defined (for contributors)

| What | Where |
|---|---|
| Shorthand & block snippets (`COMPLETIONS`) | `src/monacoSetup.ts` |
| In-block keyword catalogs (`SPECIAL_BLOCK_COMPLETIONS`) | `src/monacoSetup.ts` |
| Palette commands | `src/commands.ts` (`buildPaletteCommands`) |
| Render-side shorthand handlers | `src/preprocessor.ts` |
| In-app syntax reference | `src/HelpPanel.tsx` |

Adding a shorthand touches all of: `preprocessor.ts`, `monacoSetup.ts`,
`Toolbar.tsx`, `HelpPanel.tsx`, and both i18n catalogs — see `CLAUDE.md`.
When a special block's grammar changes, update its catalog in
`SPECIAL_BLOCK_COMPLETIONS` too.
