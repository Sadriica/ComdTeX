# Changelog

All notable changes to ComdTeX will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.1] - 2026-04-17

### Fixed
- **Windows build (TS1149/TS1192):** Renamed `src/toast.ts` → `src/toastService.ts` to eliminate a filename case collision with `src/Toast.tsx` that caused TypeScript errors on Windows (case-insensitive filesystem)
- **Arch Linux CI:** Removed `arch-check` and `arch-release` CI jobs entirely — Tauri v2 does not support `pacman` as a bundle target (valid Linux targets: `deb`, `rpm`, `appimage`); Arch Linux users are directed to use the `.AppImage` build instead
- **Copy error toast:** `handleCopyHtml` and `handleCopyLatex` now show the correct error message on clipboard failure instead of the success message
- **Hardcoded i18n strings in HelpPanel:** `"Inline:"` and `":::theorem[Título]"` were not translated; now use `hp.inlineExample` and `hp.exampleTitle` respectively
- **Duplicate keyboard shortcut:** `Ctrl+Shift+F` was bound to both Focus mode and Search vault simultaneously; Focus mode binding removed (only `F11` now)
- **Menu entry not translated:** "Backlinks" menu item was hardcoded in English regardless of language setting
- **Focus mode menu inconsistency:** Toggling Focus mode from the View menu now shows a toast notification, consistent with the palette and keyboard shortcut
- **`onCreateVault` did nothing different:** "Create new folder" on the welcome screen now actually creates a new folder via a save dialog instead of reusing the open-folder dialog
- **`BacklinksPanel` unhandled rejection:** Added `.catch()` to the `Promise.all` that reads vault files

---

## [1.0.0] - 2026-04-15

### Added

**Editor**
- Monaco Editor with full syntax highlighting for Markdown and LaTeX
- Vim mode (via monaco-vim) toggleable from settings
- Word wrap, minimap, and typewriter mode
- Spellcheck support
- Tab-based shorthand expansion with snippet placeholders
- Autocomplete for shorthands and BibTeX citation keys

**Math**
- KaTeX rendering for inline (`$...$`) and display (`$$...$$`) math
- Shorthand system: `frac(a,b)`, `sqrt(x)`, `sum(i,n)`, `int(a,b)`, `mat(...)`, and more
- Preprocessor expands shorthands before KaTeX, with nesting support
- Auto-numbered display equations with label/reference resolution (`{#eq:label}` / `@eq:label`)
- Math environments via `:::type[title]` blocks: `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `exercise` (auto-numbered), `proof`, `remark`, `note`
- Size-prefixed environments (`sm`, `lg`)
- User-defined `\newcommand` macros loaded from `macros.md`

**References**
- BibTeX parser reading `references.bib` from vault root
- `[@key]` citation syntax with automatic bibliography rendering
- Citation autocomplete in the editor
- Citation Manager GUI for browsing and managing references

**Navigation**
- Wikilinks (`[[note-name]]`) with in-preview navigation
- Backlinks panel showing all incoming links to the active file
- File graph visualization
- Navigation history with back/forward buttons

**Export**
- PDF export via Pandoc with fallback to `window.print()`
- LaTeX (`.tex`) export with compilable output
- DOCX export via Pandoc
- Beamer presentation export
- Reveal.js presentation export
- HTML export

**Vault**
- File tree with drag-and-drop reordering
- Vault-wide full-text search and replace
- Outline panel showing heading hierarchy of the active file
- Tags support via YAML frontmatter
- File properties panel
- Autosave with 800 ms debounce
- Crash recovery via localStorage drafts
- Vault backup utility
- Recent vaults list on the welcome screen

**UI**
- Focus mode for distraction-free writing
- Custom preview CSS support
- Word count goal with progress indicator
- Estimated reading time display
- Dark, light, and high-contrast themes
- Custom window titlebar (minimize, maximize, close)
- Command palette (Ctrl+P) for fuzzy file and command search
- Status bar with cursor position, word/character count, and macro count
- Toast notifications
- Keyboard shortcuts reference modal
- New-file-from-template picker (7 academic templates)
- Settings modal for language, fonts, theme, and vim mode

**Internationalization**
- Full Spanish and English UI translations
- Runtime language switching without restart

**Desktop**
- Tauri v2 desktop application for Linux, macOS, and Windows
- Auto-updater via GitHub Releases
- AppImage packaging for Linux
