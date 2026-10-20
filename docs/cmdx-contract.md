# CMDX Contract

CMDX is ComdTeX's in-memory editing format. Storage formats (`.md` and `.tex`)
are normalized to CMDX when opened and converted back when saved. Non-document
auxiliary files such as `.bib` are never converted.

## Gateways

- `toEditorContent(path, content)` is the only supported storage-to-editor entry point.
- `toDiskContent(path, content)` is the only supported editor-to-storage entry point.
- `toStorage(text, format)` and `toCmdx(text, format)` are lower-level conversion primitives.
- Export flows may use `exportToTex`, HTML rendering, or Pandoc-specific Markdown; those are not storage saves.

## CMDX Syntax

Supported environment blocks:

```cmdx
:::theorem[Optional title] {#thm:label}
Body in CMDX/Markdown.
:::
```

Supported environment names are the renderer names in `src/environments.ts`, plus
unknown environment names that are preserved when possible.

Supported shorthands include:

- `table(A, B)`
- `mat(1, 2, 3, 4)`, `pmat(...)`, `bmat(...)`
- `frac(a, b)`, `sqrt(x)`, `root(n, x)`
- `sum(i=0, n)`, `int(a, b)`, `lim(x, a)`
- `vec(x)`, `abs(x)`, `norm(x)`
- `bf(x)`, `cal(A)`, `bb(R)`
- `sup(x, n)`, `sub(x, n)`, `pder(f, x)`, `der(f, x)`

Arguments are parsed with balanced parentheses, so nested shorthands are valid.

## Markdown Storage

Markdown storage is Obsidian-compatible:

- Theorem-like CMDX environments become Obsidian callouts.
- The environment type rides on the callout title (`Theorem: Title`) only when the
  callout type alone would reopen as a different environment (`abstract` reopens as
  `lemma`, `note` as `note`). Otherwise the title is written exactly as typed:
  `:::tip[Hi]` is `> [!tip] Hi`, never `> [!tip] Tip: Hi`.
- The environment label is saved on the callout heading, e.g.
  `> [!abstract] Theorem: Pyth {#thm:pyth}`, so `@thm:pyth` references survive a
  save and a reopen. `toStorageMd(text, { envLabels })` controls this: storage keeps
  labels (the default); user-facing exports (Obsidian, Pandoc input) pass
  `envLabels: false` and drop them.
- Open + save of an unchanged file is byte-identical. A callout becomes an
  environment on open only when writing that environment back reproduces the
  original lines exactly (the converter checks this for every callout). Anything
  else stays a callout in the editor and is saved as written: fold markers
  (`[!tip]-`, `[!tip]+`), types with no exact environment (`[!theorem]` without
  a prefix, `[!NOTE]`, `[!my-type]`), and unusual spacing or blank-line style.
  The editor never shows a `<!--cmdx ... -->` marker. Older builds wrote one
  (`<!--cmdx type=... fold=... -->`); it is still read, and stripped, if it
  appears in a draft or old buffer.
- Tables that have body rows are left exactly as written on open. Only a bare header
  plus separator row (no body) becomes `table(A, B)`, and it is written back as that
  header and separator on save.
- Nothing inside a fenced code block or inline code is converted.
- Frontmatter is preserved.
- Plain blockquotes that are not Obsidian callouts are preserved.

### Special blocks are stored verbatim

ComdTeX-only special blocks (`pseudocode`, `flowchart`, `truth`, `graph`, `plot`,
`commdiag`, `code`, `excalidraw`) are **not** converted to callouts. `maskSpecialBlocks()`
(`src/cmdxFormat.ts`) swaps them for placeholders before the storage conversions
run and restores them afterward, so they survive the `.md`/`.tex` round-trip
byte-for-byte. Older builds flattened these to `> [!note]` callouts, silently
corrupting them on autosave; `shouldRecoverSpecial()` auto-recovers such files on
open (unambiguous types always recover; common-word types like `graph`/`plot`/`code`
recover only when the body matches the block's syntax).

## LaTeX Storage

LaTeX storage supports conservative conversion:

- Supported theorem-like environments become CMDX environments.
- Matrix environments become matrix shorthands.
- Common math commands become shorthands when they are simple enough to parse.
- Unknown LaTeX environments, preamble commands, and macro definitions are preserved
  and reported by `analyzeConversion`.

## Lossiness Policy

Conversion must prefer preservation over aggressive rewriting. When a construct
cannot be semantically represented in CMDX, the converter should keep text intact
and add an `analyzeConversion` warning.

Current warning categories:

- `unclosed-cmdx-environment`
- `unbalanced-shorthand`
- `unsupported-latex-environment`
- `latex-preamble-preserved`
- `custom-latex-macro-preserved`
- `size-prefix-dropped`: `:::sm` / `:::lg` size modifiers have no equivalent
  in Obsidian callout syntax. When saving as `.md`, size information is lost.
  The environment is converted normally; only the visual size hint disappears.
  This is a known limitation of the Obsidian storage format. Use `.tex` storage
  to preserve size modifiers.

