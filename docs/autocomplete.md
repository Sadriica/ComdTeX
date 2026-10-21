# Autocomplete & the Command Palette

ComdTeX has two complementary "type less" systems: **editor autocompletion**
(suggestions and Tab expansion while writing) and the **Command Palette**
(`Ctrl+Shift+P`), which can insert or open practically everything in the app.

## Editor autocompletion

Suggestions do not pop up while you write prose. The widget opens the moment
you type a structural trigger (`[[`, `[@`, `@kind:`, `[^`, `{#`, `\`, `:::`),
inside the frontmatter, inside `:::csv` and `:::data` blocks, inside math, on
demand (`Ctrl+Space`) and inside special blocks (see below). The other
mechanism is **Tab expansion**: type a known name, press `Tab`, and it expands
into a snippet with placeholders (`Tab` again jumps between them).

Closing brackets are never doubled. Typing `[[` makes the editor write `[[]]`;
accepting a suggestion consumes that `]]` and writes the link once.

### Triggers

| You type | You get |
|---|---|
| `:::` | The full list of block types (theorem, lemma, truth, graph, plot, commdiag, pseudocode, flowchart...). Keep typing to filter: `:::tr` + `Tab` gives a truth table. Only block snippets match after `:::`: math shorthands like `table(...)` never expand there. |
| `\` | About 1000 LaTeX commands generated from KaTeX (see below), your `macros.md` macros first, with the glyph and argument placeholders (`\frac{}{}`, `\begin{pmatrix}...`) |
| `[[` | Notes, with their folder. Two notes with the same name are inserted as the shortest unique path (`physics/intro`). `[[note#` lists that note's headings. Notes in the current folder come first. |
| `[@` | Citations from `references.bib`, searchable by key, author, title and year. Each suggestion shows "Levin & Peres 2017", the title and a card with the journal or publisher. Keeps working after `;` and `, @` in `[@a; @b, p. 3]`; the caret stays before the `]` so you can add a locator. |
| `@` | The reference kinds (`eq:`, `thm:`, ...) and the vault notes that hold referenceable environments. |
| `@thm:` `@def:` `@eq:` ... | Labels of that kind. This file first, in document order, then (environments only) other files. Each shows its number and title ("Theorem 2 · Mixing time"). Focus an entry and press `Ctrl+Space` for a preview: the equation drawn with KaTeX, or the environment's first line. |
| `@path@` | Kinds available in that note; `@path@def:` lists only that note's labels. The inner `@def:` is part of the cross-file reference and never offers local labels. |
| `{#` | A label for the heading, environment or figure on the line: `thm:mixing-time` from `:::theorem[Mixing time]`, made unique across the vault. |
| `[^` | The footnotes this document defines (`[^x]:`), footnotes used but not yet defined, and the next free number. |
| `---` header | Frontmatter keys (title, author, date, abstract, tags, lang, `comdtex.texclass`, `comdtex.citestyle`, `comdtex.domain`) and their values. `comdtex.texclass` lists the classes the exporter knows, `comdtex.citestyle` the citation styles. |
| `:::csv` / `:::data` | Vault CSV names (the shortest unique path when two files share a name), then, inside the first parentheses (`data.csv (`), the column headers of that file. |
| `@data:` | Dataset names declared with `:::data{#data:name}` in this file. |

### Cross-file references

Only environments (`thm`, `lem`, `cor`, `prop`, `def`, `ex`, `exc`) can be
referenced from another file, so only they are offered from other files.
Picking one inserts the full form: `@gp/calendario@def:valor`, or
`@[my folder/note]@def:valor` when the path has spaces. An equation, figure,
table or section of another file cannot be cited at all and is not offered.

Labels you typed a second ago are included: the current document's own
`{#...}` labels are read from the editor at completion time, not from the
vault scan, which can lag behind by a moment.

### LaTeX commands

`src/latexCommands.ts` is generated, not written: `npm run gen:latex` reads
KaTeX's own command tables (symbols, functions, macros, environments) and
writes the list, so the editor only ever suggests commands the preview can
render. Commit the regenerated file after a KaTeX upgrade; a unit test fails
while it is stale. The table is a separate chunk, loaded the first time you
type a backslash.

Inside math (`$...$`, `$$...$$`) suggestions also appear as you type a word of
two or more letters (shorthand names such as `frac`), without a backslash.
Prose never pops the widget.

### Shorthand signature help

Typing `frac(a, ` shows `frac(num, den)` with the current argument
highlighted. The argument counts come from the linter's `EXPECTED_ARGS` table
(the one that reports a wrong count), the names from the shorthand catalog.
Inside special blocks (`:::plot` and friends) it stays quiet: `sqrt(x)` there
is the block's own syntax.

### Shorthand names (Tab)

Any shorthand from the [Help panel](../README.md) expands with `Tab`:
`frac` becomes `frac(a, b)`, `sqrt`, `sum`, `mat`, `hat`, `bb`, and the rest of
the ~76-entry catalog, plus your own snippets from `snippets.md`.

### Enter on `:::type`

Pressing `Enter` at the end of an opening `:::type[title]` line writes the
closing `:::` on its own line and leaves the caret on the empty line between
them, unless a later `:::` already closes the block. This is part of the one
Enter handler in `setupEditorCommands`, next to list continuation.

### Inside special blocks: contextual keywords

When the cursor is **inside** a `:::pseudocode`, `:::flowchart`, `:::truth`,
`:::graph`, `:::plot` or `:::commdiag` block, autocompletion switches to that
block's own grammar, and suggestions appear as you type (the quick-suggest
widget is enabled only while you are inside such a block):

| Block | Suggestions |
|---|---|
| `pseudocode` / `flowchart` | `INPUT`, `OUTPUT`, `PRINT`, `IF`/`IFELSE`/`ELSEIF`, `FOR` (full `FOR i ← 1 TO n DO … END FOR` template), `WHILE`, `REPEAT`/`UNTIL`, `SWAP`, `RETURN`, `END` |
| `truth` | `AND` → `∧`, `OR` → `∨`, `NOT` → `¬`, `IMPLIES` → `→`, `IFF` → `↔` |
| `graph` | `edge` (`A -- B`), `arrow` (`A -> B`), `weighted` (`A -- B : 5`) |
| `plot` | `f` (`f(x) = …`), `range` (`range: [-5, 5]`), and the function names (`sin`, `cos`, `sqrt`, `exp`…) |
| `commdiag` | `arrow` (`A -> B [f]`), `iso` (`<->`), `epi` (`->>`), `mono` (`>->`), `double` (`==>`), and `square` (a full commutative square in one go) |

Two guarantees inside these blocks:

- **Global shorthands are suppressed.** `sin` + `Tab` inside a `:::plot` stays
  plain `sin(x)` (what the plotter parses); it never becomes `\sin`.
- **Typing `:::` there is the closing fence**, so no block-type suggestions
  pop up in your way.

Math environments (`theorem`, `proof`…) are intentionally *not* contextual:
their content is normal Markdown + math, so every regular completion keeps
working inside them.

## Command Palette (`Ctrl+Shift+P`)

One fuzzy search box with several modes. `Ctrl+P` opens it on **files**, `Ctrl+Shift+P` on **commands** (~150, with recent and pinned ones first; `Alt+P` pins). Prefixes switch mode: `>` commands, `@` headings, environments and labels of this document, `#` labels across the vault (`Alt+Enter` inserts a reference), `[` citations (Enter inserts `[@key]`, or appends `; @key` inside an existing citation), `:12` go to line, `note#heading` jumps into another note, `?` lists the modes. Commands that only make sense under the cursor (table, math, gap, environment) appear in a **Here** group.

The commands mode searches by name: type any
part of a command's name, its syntax, or a keyword in Spanish or English:
`flowchart`, `:::theorem`, `cita`, `footnote`, `[[`, `frontmatter` all land on
the right entry. Categories:

- **Edición**: save, find, formatting (bold/italic/highlight colors),
  headings, lists.
- **Insertar**: table editor, TOC, code block, math, **wikilink,
  transclusion, footnote, BibTeX citation, numbered figure, YAML frontmatter,
  environment reference, callouts** (`[!NOTE]`/`[!WARNING]`/`[!TIP]`/
  `[!IMPORTANT]`), Excalidraw drawing, and the full snippet catalog under
  *Snippets / autocompletado*.
- **Matemáticas**: symbols, every math operation (fractions to matrices),
  all environments (theorem … exercise, remark, note).
- **Vista / Exportar / IA / Vault / Navegación**: every panel, every export,
  settings, daily note, git-friendly vault actions.

Parent entries (▸) drill into submenus; `Esc` goes back a level.

## Where things are defined (for contributors)

One registered provider (`src/completion/index.ts`) hands the cursor to the
first source that recognises its context; each source is its own module.

| What | Where |
|---|---|
| Provider, cascade order, signature help registration | `src/completion/index.ts` |
| Shorthand & block snippets (`COMPLETIONS`), in-block keyword catalogs (`SPECIAL_BLOCK_COMPLETIONS`), Tab resolution | `src/completion/catalog.ts` |
| `\command` source, generated command table | `src/completion/latex.ts`, `src/latexCommands.ts`, `scripts/gen-latex-commands.mjs` |
| `[[`, `[@`, `@kind:`, `{#`, `[^` | `wikilinks.ts`, `citations.ts`, `labels.ts`, `labelSlot.ts`, `footnotes.ts` in `src/completion/` |
| Frontmatter, `:::csv`/`:::data`, in-block keywords, snippets | `frontmatter.ts`, `csvBlocks.ts`, `inBlock.ts`, `snippets.ts` |
| Shorthand signature help | `src/completion/signature.ts` (uses `EXPECTED_ARGS` from `contentLinter.ts`) |
| Closing `:::` on Enter (decision only; the key handler is in `setupEditorCommands`) | `src/completion/blockCloser.ts` |
| Re-triggering the widget in frontmatter, csv blocks, multi-cites and math | `src/completion/triggers.ts` |
| Data the sources read (vault files, labels, bib entries, macros) | `src/completion/state.ts`, fed by `App.tsx` |
| Label metadata (title, number, preview, headings), computed in the worker | `src/structuralLabels.ts` (`scanFileLabels`) |
| Palette commands | `src/commands.ts` (`buildPaletteCommands`) |
| Render-side shorthand handlers | `src/preprocessor.ts` |
| In-app syntax reference | `src/HelpPanel.tsx` |

Adding a shorthand touches all of: `preprocessor.ts`, `completion/catalog.ts`,
`Toolbar.tsx`, `HelpPanel.tsx`, and both i18n catalogs; see `CLAUDE.md`. Its
argument count belongs in `EXPECTED_ARGS` (`contentLinter.ts`), which also
drives the signature help. When a special block's grammar changes, update its
catalog in `SPECIAL_BLOCK_COMPLETIONS` too.

Provider budget: a completion call stays under 5 ms on a 5k-label vault
(`src/completion/perf.test.ts` measures it). Anything heavier than a filter
over a precomputed array belongs in an update function (`state.ts`) or in
`resolveCompletionItem`, which runs only for the focused entry.
