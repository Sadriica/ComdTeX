# Changelog

All notable changes to ComdTeX will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
