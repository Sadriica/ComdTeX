# ComdTeX — Codex Context

## Product Direction

ComdTeX is a local-first academic writing IDE for Markdown + LaTeX, built with Tauri v2, React, TypeScript, Monaco, and KaTeX.

The target is not to be a generic clone of LaTeX, Overleaf, or Obsidian. The niche is:

- Write with Obsidian-like speed and local files.
- Reason, reference, validate, and export with LaTeX-like rigor.
- Make academic documents safer before export through diagnostics and compatibility reports.

The product phrase currently guiding decisions:

> Write like Obsidian. Reason and export like LaTeX.

## Current Standards

Every meaningful feature should update the right documentation layer:

- `README.md`: product features, architecture, workflows, compatibility, developer-facing structure.
- `src/HelpPanel.tsx`: in-app syntax/workflow documentation.
- `src/HelpModal.tsx`: keyboard shortcuts and quick commands.
- `src/i18n.ts`: every visible UI string in both Spanish and English.
- Tests: reusable logic should have Vitest coverage.

Default verification after changes:

```bash
git diff --check
npm test
npm run build
```

Known acceptable build warning:

- Vite chunk-size warnings from Monaco/Mermaid are expected.

Do not accept TypeScript, ESLint, CSS minifier, or failing test errors as normal.

## Important Implementation Notes

- Use `apply_patch` for manual edits.
- Preserve user/offline changes. Do not revert unrelated dirty files.
- Prefer pure modules with tests over adding more logic to `App.tsx`.
- UI controls that are clickable should generally be `button`, not clickable `div`.
- UI strings should not be hardcoded if they are part of a visible reusable flow; add to `i18n.ts`.
- `sanitizeRenderedHtml()` must wrap rendered preview HTML before `dangerouslySetInnerHTML`.
- Monaco snippets from toolbar should use `snippetController2.insert()`, not `editor.trigger()`.
- Tauri v2 shell config should stay simple: `tauri.conf.json` uses `plugins.shell.open = true`; permissions live in `src-tauri/capabilities/default.json`.

## Core Features Implemented

### Structural Labels

Structural labels are the internal reference system, not user-facing "tags".

Supported examples:

```md
# Intro {#sec:intro}

$$
E = mc^2
$$ {#eq:energy}

![Diagram](diagram.png){#fig:diagram}

| A | B |
|---|---|
| 1 | 2 |
{#tbl:data}

:::theorem[Main]{#thm:main}
Statement.
:::
```

References use `@...`:

```md
See @sec:intro, @eq:energy, @fig:diagram, @tbl:data, @thm:main.
```

Main files/modules:

- `src/structuralLabels.ts`
- `src/LabelsPanel.tsx`
- `src/references.ts`
- `src/tables.ts`
- `src/equations.ts`
- `src/figures.ts`
- `src/environments.ts`
- `src/monacoSetup.ts`

### Quality Layer

The Quality panel is the main pre-export workflow.

Implemented modules:

- `src/documentDiagnostics.ts`: broken refs, duplicate labels, unused labels, missing citations, missing images, malformed math, table shape warnings, export risks, academic structure warnings.
- `src/exportCompatibility.ts`: scores Overleaf/LaTeX and Obsidian Markdown compatibility.
- `src/projectExport.ts`: detects a main document and composes transclusion-aware project markdown.
- `src/mathBacklinks.ts`: groups structural references by label.
- `src/DocumentLabPanel.tsx`: UI panel combining diagnostics, compatibility, project plan, academic structure, and math backlinks.

The sidebar mode is `quality`.

### Project Export

Long documents can mark a main file with frontmatter:

```yaml
---
comdtex.main: true
---
```

Project export resolves `![[transclusions]]` into a single markdown stream and exports one Overleaf-ready `.tex`.

Commands/menu entries currently include:

- `Exportar proyecto .tex`
- `Compilar PDF con LaTeX local`

Local LaTeX compile attempts:

1. `tectonic`
2. `xelatex`
3. `pdflatex`

### Export Compatibility

LaTeX export should remain Overleaf-friendly:

- `\label`
- `\ref`
- `\eqref`
- figures
- tables
- theorem-like environments
- section labels

Obsidian export should remain readable Markdown:

- Converts theorem-like environments to callouts.
- Removes visible structural label syntax.
- Preserves wikilinks/callouts when practical.
- Degrades structural references into readable code/text.

Main files:

- `src/exporter.ts`
- `src/obsidianExport.ts`
- `src/exportCompatibility.ts`

### Templates

Built-in templates now include advanced academic flows:

- Blank
- Article
- Class notes
- Problem set
- Theorem sheet
- Research note
- Overleaf-ready paper
- Thesis / long document
- Lecture notes book

Custom templates are supported through `TemplateModal` and persisted in localStorage key:

```text
comdtex.customTemplates
```

Supported variables include:

- `{{title}}`
- `{{filename}}`
- `{{date}}`
- `{{date:formatted}}`
- `{{datetime}}`
- `{{year}}`
- `{{time}}`
- `{{author}}`

### Navigation And Editing

Relevant additions:

- `QuickSwitcher.tsx`: `Ctrl+;`, recent/vault file switcher.
- `ClosedTabsPopup.tsx`: reopen closed tabs.
- `BookmarksPopup.tsx`: bookmark popup.
- `appShortcuts.ts`: central shortcut dispatcher.
- `useTouchpadGestures.ts`: touchpad gesture handling.

Be careful: `App.tsx` is large and has accumulated many states. If adding new state-heavy UI, prefer isolating it in a component/module.

## Documentation To Keep In Sync

When adding syntax or document behavior:

- Update `README.md`.
- Update `HelpPanel.tsx`.
- Update `i18n.ts`.
- Add or update module tests.

When adding a shortcut:

- Update `HelpModal.tsx`.
- Update `i18n.ts`.
- Update `appShortcuts.test.ts`.

When adding export behavior:

- Update `README.md`.
- Update `exportCompatibility.ts` if compatibility changes.
- Add exporter/Obsidian tests where possible.

## Current Verification Baseline

Latest successful verification after the Quality layer implementation:

```text
git diff --check: passed
npm test: 22 files, 193 tests passed
npm run build: passed
```

Expected non-blocking warning:

```text
Some chunks are larger than 500 kB after minification.
```

## Files Recently Added Or Important

Quality/document flow:

- `src/DocumentLabPanel.tsx`
- `src/documentDiagnostics.ts`
- `src/documentDiagnostics.test.ts`
- `src/exportCompatibility.ts`
- `src/exportCompatibility.test.ts`
- `src/projectExport.ts`
- `src/projectExport.test.ts`
- `src/mathBacklinks.ts`
- `src/mathBacklinks.test.ts`

Reference/export:

- `src/structuralLabels.ts`
- `src/structuralLabels.test.ts`
- `src/references.ts`
- `src/references.test.ts`
- `src/tables.ts`
- `src/tables.test.ts`
- `src/obsidianExport.ts`
- `src/obsidianExport.test.ts`
- `src/transclusion.ts`
- `src/transclusion.test.ts`
- `src/toc.ts`
- `src/toc.test.ts`

Navigation/UX:

- `src/QuickSwitcher.tsx`
- `src/ClosedTabsPopup.tsx`
- `src/BookmarksPopup.tsx`
- `src/appShortcuts.ts`
- `src/appShortcuts.test.ts`
- `src/useTouchpadGestures.ts`
- `src/monacoRuntime.ts`

## Known Risks / Next Improvements

High-value next steps:

- Reduce `App.tsx` by extracting export actions, sidebar composition, and command palette construction.
- Add Playwright/e2e coverage for sidebar panel navigation and export flows.
- Improve local LaTeX compile by parsing `.log` into line-level diagnostics.
- Add a real compatibility report export/copy button.
- Add command labels for Quality/project/local compile to `i18n.ts` instead of keeping temporary hardcoded Spanish labels in `App.tsx`.
- Add manualChunks/build tuning for Monaco/Mermaid if bundle warnings become a release concern.

