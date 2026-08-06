# Keep marks: invisible highlighting

Highlighting a fragment usually changes how the document looks. Keep marks don't. You mark a fragment as worth keeping, ComdTeX shows it to **you** in the editor, and then it disappears: the preview, the PDF, the `.docx`, the slides all render the plain text as if you had never marked anything.

The **Keep** panel then collects every mark in the vault in one place, grouped by category.

> Like highlighting, but invisible.

---

## Syntax

Wrap a fragment in double carets:

```markdown
Un grupo es ^^abeliano^^ si su operación es conmutativa.
```

Add an optional category with a `word: ` prefix:

```markdown
Un ^^def: grupo abeliano^^ tiene operación conmutativa.
El teorema exige compacidad — ^^duda: revisar la hipótesis^^.
La constante vale ^^dato: 6.022e23^^.
```

Categories are **freeform**: invent your own (`keep`, `def`, `dato`, `duda`, `pendiente`, …). There is no fixed list, and no need to declare one. The panel discovers them from your documents.

---

## Where a mark is visible

| Surface | Shows the mark? |
|---|---|
| **Editor** | **Yes**: faint dotted underline + a `❰` glyph in the gutter |
| **Keep panel** | **Yes**: that's the point |
| Preview | No: renders as plain text |
| PDF / LaTeX / DOCX / Typst / Beamer / Reveal / HTML / Obsidian / Markdown / Anki | No: renders as plain text |

The delimiters and the `cat: ` prefix are removed everywhere except the editor. A marked paragraph is byte-for-byte identical to the same paragraph written without marks.

---

## The Keep panel

Open it from **Vistas → Guardar** in the menu bar, from the command palette (`Ctrl+P` → "Abrir Guardar"), or by clicking the `❰` gutter glyph next to a mark.

The panel lists every mark in the vault, grouped by category, each showing its text and its `file:line`. Click an entry to jump straight to it. Filter by text or narrow to a single category with the dropdown.

The panel reads your documents directly, so it is always in sync; there is no separate glossary file to keep up to date, and ComdTeX never writes one on its own.

### Exporting a glossary

**Export glossary** writes the current marks to a Markdown file of your choosing, grouped by category:

```markdown
# Glosario

## def

- grupo abeliano — `algebra.md:12`
- anillo — `algebra.md:40`

## duda

- revisar la hipótesis — `topologia.md:7`
```

This is a one-off snapshot, on demand. Nothing is auto-written.

---

## Rules and edge cases

**A caret inside the text is fine.** `^^dato: 2^10 = 1024^^` marks the whole fragment; the text may contain a single `^`. And ordinary carets in prose never accidentally become marks: a mark needs two *adjacent* carets on both sides, so `Compara x^2 con y^3` is untouched.

**Marks are never parsed inside math or code:**

```markdown
$x^{2^^3}$               ← math: untouched (`^` is LaTeX superscript)
$x^^2$                   ← math, even as a typo: untouched
`^^x^^`                  ← inline code: untouched
    render(^^name^^)     ← indented code: untouched
```

…as is anything inside a fenced block (``` / ~~~) or a ComdTeX special block (`:::code`, `:::commdiag`, `:::graph`, …). The math exclusion carries real weight here: `^` is LaTeX superscript, so `$x^{2^^3}$` and `$a^{n+1}$` contain carets that must never be read as marks.

**Block ids still work.** `^myid` at the end of a line is ComdTeX block-id syntax, and it does not collide: a line ending in a keep mark is never read as a block id, and `^^a^^ ^blockid` gives you both.

**A mark never spans a line.** An unclosed `^^` is just text; it cannot swallow the rest of the document hunting for a closing `^^`.

**No nesting.** `^^` is symmetric, so pairing runs left to right: in `^^a ^^b^^ c^^` the marks are "a" and "c", and "b" is left as plain text.

**`^^^^` is not a mark**, and neither is an empty body like `^^ ^^`: there is nothing to keep.

**A category needs a space after its colon.** `^^def: texto^^` has the category `def`; `^^def:texto^^` does not (the text is literally `def:texto`). This is what stops `^^https://example.com^^` from picking up a bogus `https` category. So in `^^ver: esto y aquello^^`, yes, `ver` **is** the category.

---

## Why `^^`, and not `{{ }}` or `%%`

Both of the obvious delimiters were already taken.

`{{ }}` is spoken for three times over in ComdTeX:

- **Anki cloze deletions**: `{{X}}` inside a `:::definition` body becomes `{{c1::X}}` on Anki export.
- **Template variables**: `{{title}}`, `{{date}}`, `{{filename}}`.
- **PDF header/footer variables**: `{{author}}`, `{{page}}`.

Definitions are exactly where you would mark things, so sharing the delimiter with cloze would have collided on the most common case: `^^def: …^^` written as `{{def: …}}` would have quietly exported an Anki card whose answer read "def: …".

`%%…%%` is **Obsidian's comment syntax**, which *hides* the text: the exact opposite of a keep mark, which shows it. ComdTeX exports to Obsidian and syncs vaults through the filesystem, so notes really do get opened there; the same delimiter meaning opposite things in two tools you use on the same vault is a trap.

`^^` has no other meaning here. It coexists with the two `^` constructs that do exist: LaTeX superscript (excluded as math) and trailing block ids (`^myid`, which can never contain a doubled caret), so `{{ }}` remains cloze, `%%…%%` remains an Obsidian comment, and `^^…^^` is a keep mark.
