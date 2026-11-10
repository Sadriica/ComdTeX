# Folder rules and generated files

A folder can carry its own conventions: the template its notes start from, how
they are named, which frontmatter they get by default, and which views (tasks,
calendar, index) are generated from them.

It is designed for the "one folder per subject" case: you open the folder,
create a note, and it already comes with the template, the dated name and the
`subject:` key filled in.

---

## Where the rules live

In a **`.comdtex-folder.json` file inside the folder itself**. It starts with a
dot, so ComdTeX hides it from the file tree and from vault search; you can see
it from the system file manager, and it travels with the folder if you move it
or push it to git.

```
my-vault/
  algebra/
    .comdtex-folder.json      ← this folder's rules
    2026-03-04-derivatives.md
    2026-03-11-integrals.md
    _tasks.md                 ← generated
```

## How to create them

Right-click the folder → **Folder rules…**

The dialog has four parts. None is required: you can use just the filename
pattern, or just the generated files.

### Default template

The content a new note created in this folder starts with. The list includes the
built-in templates and your own (see *Create a template from a file*).

> If you create the note with **New from template…** and pick a template by
> hand, your choice wins: the folder's template only applies when you do not
> say otherwise.

### Filename pattern

How the file is named from what you type. With the pattern
`{{date:YYYY-MM-DD}}-{{title}}`, typing `derivatives` creates
`2026-03-04-derivatives.md`.

Available variables:

| Variable | Result |
|---|---|
| `{{title}}` | what you typed |
| `{{date}}` | `2026-03-04` |
| `{{date:YYYY-MM-DD}}` | date with a custom format (`YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`) |
| `{{year}}` | `2026` |
| `{{time}}` | `15:42` |

If you type the extension (`derivatives.md`), it is respected.

### Default frontmatter (YAML)

Keys added to the frontmatter of new notes:

```yaml
subject: Algebra II
tags: ["algebra"]
```

**Only keys the document does not already define are added.** If the template
already has `title:`, the folder's value does not override it.

### Generated files

See the next section.

## Inheritance

Subfolders inherit **field by field**, and the nearest folder wins:

```
math/            defaultTemplate: "lecture"     frontmatter: {professor: Ruiz}
math/algebra/    filenamePattern: "{{date}}-{{title}}"
```

A note created in `math/algebra/` uses the `lecture` template (inherited), the
filename pattern from `algebra`, and `professor: Ruiz` (inherited).

**Generated files are NOT inherited.** They name a concrete file inside the
folder that declared them; if they were inherited, every subfolder would end up
with a copy of its parent's index.

---

## Generated files

These are views built from the surrounding notes. They are declared in the rules
dialog with three fields: **file name**, **type** and **scope**.

| Type | What it produces |
|---|---|
| **Tasks** | Every `- [ ]` grouped by file, with a `[[note]]` link, pending ones first and a count at the top |
| **Calendar** | Notes grouped by month and date, newest to oldest |
| **Index** | Alphabetical list of the notes with their title |

The **scope** is `This folder only` (the default) or `Whole vault`.

A note's date for the calendar comes from its `date:` frontmatter or from the
filename prefix (`2026-03-04-lecture.md`). Notes without a date are grouped at
the end under an undated heading; they are not discarded.

### How they are regenerated

It is not automatic. It runs when you ask for it:

- **Vault menu → Regenerate folder files**
- **Ctrl+Shift+P → "Regenerate folder files"**

It regenerates the rules of the folder that holds the file you have open.

### Overwrite protection

Every generated file starts like this (the second line is a warning comment):

```markdown
<!-- comdtex:generated -->
<!-- This file is regenerated automatically. Manual changes will be lost. -->
```

The text of the generated files (titles such as "Tasks"/"Tareas", "No tasks",
"pending", "No date", and that warning comment) follows the interface
language. A Spanish interface writes "Tareas", "Calendario", "Índice" and the
Spanish comment. The `comdtex:generated` marker is always the same.

**ComdTeX only overwrites a file if it is empty or carries that marker.** If you
delete the marker and write there, regeneration skips that file and tells you,
instead of destroying what you wrote. That is the way to "adopt" a generated
file and make it yours.

---

## Create a template from a file

Right-click a file → **Save as template…**

It takes the current content and replaces with variables whatever is specific to
*that* particular note:

- the frontmatter `title:` → `{{title}}`
- ISO dates in the frontmatter → `{{date}}`
- the `# H1`, **only if it repeats the title or the file name** → `{{title}}`

The body is left alone. A date mentioned inside a paragraph is content, not a
field, and rewriting it would silently corrupt the template.

The template becomes available in the templates dialog and in the default
template list of the folder rules.

---

## File format, for editing by hand

```json
{
  "version": 1,
  "defaultTemplate": "lecture",
  "filenamePattern": "{{date:YYYY-MM-DD}}-{{title}}",
  "frontmatter": {
    "subject": "Algebra II",
    "tags": ["algebra"]
  },
  "generated": [
    { "file": "_tasks.md", "type": "tasks", "scope": "folder" },
    { "file": "_calendar.md", "type": "calendar", "scope": "folder" }
  ]
}
```

The parser is tolerant: a malformed entry is discarded and the rest is applied
anyway. A `file` containing `/`, `\` or `..` is rejected: a generated file
cannot write outside its own folder.
