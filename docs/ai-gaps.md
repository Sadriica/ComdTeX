# Gaps `{{?}}`: leave blanks for the AI to fill in

When you take notes in class you know a definition, a statement or an example
belongs somewhere, but you do not want to stop and write it. You leave a gap,
keep going, and fill it in later.

```markdown
:::definition
A function is continuous at $a$ when {{? define continuity with epsilon-delta}}
:::

The fundamental theorem says that {{?}}
```

---

## The syntax

| Form | Use |
|---|---|
| `{{?}}` | A bare gap: the AI infers from the context what belongs there |
| `{{? a hint}}` | With a hint about what you want |

The hint can be any text up to the `}}`.

You can insert one with **Ctrl+Shift+P → "Insert {{?}} gap"**.

Gaps are marked in the editor with an informational notice (not an error: a
pending gap is a deliberate reminder, not a fault). That way you see at a
glance how many are left in a long document.

A `{{?}}` inside a ` ``` ` code block does **not** count as a gap: there it is
documentation about the feature, not a request.

## Filling them

This requires the **AI assistant to be enabled and configured** (Settings →
AI assistant). ComdTeX ships no keys and makes no requests until you turn it
on.

| Command | What it does |
|---|---|
| **Fill gap with AI** | Fills the gap where the cursor is |
| **Fill all gaps with AI** | Goes through the whole document |

Both are available from **Ctrl+Shift+P**. While it works, the status bar shows
*Filling gaps…*.

### What is sent to the model

Only the block around the gap (about 12 lines on each side) plus your hint. The
whole document is not sent: for a local gap it does not improve the result and
it makes every call more expensive.

### How it is applied

Through Monaco's `executeEdits`, like every AI edit in ComdTeX. This means that:

- **A Ctrl+Z undoes the fill**, as if you had typed it yourself.
- **Nothing is ever written directly to disk.** The change goes through the
  editor and the normal autosave.

If the model wraps its answer in a code block, the wrapper is removed; if it
repeats the `{{?}}` marker, the marker is dropped. If it returns nothing, the
gap stays as it was.

---

## Why this is not Copilot-style autocomplete

This is a deliberate decision, not a limitation:

- **You decide where the AI may write.** No text appears that you did not ask for.
- **Nothing is generated until you ask.** No latency or cost while you type.
- **Tab stays free** to expand shorthands (`frac` → `\frac{}{}`), which is
  ComdTeX's central shortcut. A ghost-text autocomplete would compete for that key.
