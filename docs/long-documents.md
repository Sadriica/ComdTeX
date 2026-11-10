# Long files: one subject, one file

The case: you write a course class by class in the same `.md`, and two months
later it has 3000 lines. These are the tools that keep it manageable.

---

## Folding by section

Each heading folds from its line to just before the next heading of the same or a
higher level. Folding `## Class 3` hides that class and nothing else.

Use the arrow in the left margin, or Monaco's shortcuts:

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+[` | Fold the section at the cursor |
| `Ctrl+Shift+]` | Unfold |
| `Ctrl+K Ctrl+0` | Fold all |
| `Ctrl+K Ctrl+J` | Unfold all |

Headings inside code blocks are ignored: a `# comment` in a shell script is not
a section.

**Folding is remembered per file**, together with the cursor and the scroll. You
switch tabs and come back, and everything is as you left it. (In earlier
versions it was lost on every tab switch, which is why blocks seemed to unfold
by themselves.)

`:::excalidraw` blocks fold themselves the first time you open a file, because
their scene is a single base64 line that takes up half the screen. This can be
turned off in Settings → Editor.

## The outline as an index

The **Views → Outline** panel lists the headings and now has a **filter**: type
"class 7" and you jump straight there. While the filter is active, drag to
reorder is disabled, because reordering a filtered list would move sections you
cannot see.

## Splitting the file when it gets too heavy

**Ctrl+Shift+P → "Split document into sections (##)"**

It cuts the document at its `##` headings and creates one file per section next
to the original. The original keeps its preamble (frontmatter, introduction) and
a list of transclusions:

```markdown
---
title: Algebra II
---

![[algebra-class-1]]

![[algebra-class-2]]

![[algebra-class-3]]
```

**The preview does not change**: transclusions include the content, so the
rendered document is the same as before. What you gain is that each class is an
independent file, linkable with `[[…]]` and searchable on its own.

Safeguards:

- It asks for confirmation before touching anything.
- If any of the target names already exists, it **splits nothing** and tells
  you. It never overwrites.
- Nothing is lost: the preamble plus the sections rebuild the original.

## Derived views instead of hand-maintained ones

To avoid keeping a task list or a calendar of the subject by hand, declare a
generated file in the folder rules, see [folder-rules.md](folder-rules.md).

## List and table continuation

Pressing Enter keeps the structure: the dash, the number (which increments), the
`- [ ]` checkbox, the `>` quote or a table row with the same number of columns.
On an empty marker, Enter leaves the list instead of adding another empty one;
if it was nested, it goes up one level.

This can be turned off in Settings → Editor.

For ragged tables (rows with fewer columns than the header) there is a warning in
the editor and the **Normalize table** command, which fills in the missing cells
and realigns the `|` in a single undo step.
