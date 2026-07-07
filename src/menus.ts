// Extracted from App.tsx: the classic MenuBar entries factory. Declarative
// data built from handlers + translations — moved verbatim (no behavior
// change) to keep App.tsx smaller. See CLAUDE.md — App.tsx is a documented
// refactor target.
import type { MenuDef, MenuEntry } from "./MenuBar"
import type { SidebarMode } from "./App"
import type { T } from "./i18n"
import type { DepStatus } from "./checkDeps"
import type { useExportActions } from "./useExportActions"
import { showToast } from "./toastService"

export interface BuildMenusCtx {
  t: T
  hasFile: boolean
  hasVault: boolean
  deps: DepStatus | null
  exportActions: ReturnType<typeof useExportActions>
  selectVault: () => void
  setTemplateOpen: (open: boolean) => void
  handleSave: () => void
  handleSaveAs: () => void
  handleFind: () => void
  openPanel: (m: SidebarMode) => void
  setPaletteOpen: (open: boolean) => void
  setFocusMode: (fn: (f: boolean) => boolean) => void
  handleOpenMacros: () => void
  handleOpenBib: () => void
  setSettingsOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  recentEntries: MenuEntry[]
}

export function buildMenus(ctx: BuildMenusCtx): MenuDef[] {
  const {
    t, hasFile, hasVault, deps, exportActions, selectVault, setTemplateOpen,
    handleSave, handleSaveAs, handleFind, openPanel, setPaletteOpen, setFocusMode,
    handleOpenMacros, handleOpenBib, setSettingsOpen, setHelpOpen, recentEntries,
  } = ctx

  return [
    {
      label: t.menus.file,
      entries: [
        { label: t.menus.openVault,        action: selectVault },
        { separator: true },
        { label: t.menus.newFromTemplate,  disabled: !hasVault, action: () => setTemplateOpen(true) },
        { separator: true },
        { label: t.menus.save,             shortcut: "Ctrl+S",       disabled: !hasFile, action: handleSave },
        { label: t.menus.saveAs,           shortcut: "Ctrl+Shift+S", disabled: !hasFile, action: handleSaveAs },
        { separator: true },
        { label: t.menus.exportMd,         disabled: !hasFile, action: exportActions.handleExportMd },
        { label: t.menus.exportTex,        disabled: !hasFile, action: exportActions.handleExportTex },
        { label: t.palette.exportProjectTex, disabled: !hasVault, action: exportActions.handleExportProjectTex },
        { label: t.palette.compileLatexPdf, disabled: !hasFile, action: () => exportActions.handleCompileLatexPdf() },
        { label: t.menus.exportPdf,        disabled: !hasFile, action: exportActions.handleExportPdf },
        { label: t.menus.exportDocx,       disabled: !hasFile, action: exportActions.handleExportDocx },
        { label: t.menus.exportBeamer,     disabled: !hasFile, action: exportActions.handleExportBeamer },
        { label: t.menus.exportReveal,     disabled: !hasFile, action: exportActions.handleExportReveal },
        { label: t.menus.exportTypst,      disabled: !hasFile, action: exportActions.handleExportTypst },
        // The Typst→PDF entry is offered only when the optional `typst` binary is present.
        ...(deps?.typst ? [{ label: t.menus.exportTypstPdf, disabled: !hasFile, action: exportActions.handleExportTypstPdf } as MenuEntry] : []),
        { separator: true },
        { label: t.menus.importDoc,        disabled: !hasVault, action: exportActions.handleImportDocument },
        ...recentEntries,
      ],
    },
    {
      label: t.menus.edit,
      entries: [
        { label: t.menus.findInFile,      shortcut: "Ctrl+F",       disabled: !hasFile, action: handleFind },
        { label: t.menus.searchVault,     shortcut: "Ctrl+Shift+F",                     action: () => openPanel("search") },
        { separator: true },
        { label: t.menus.commandPalette,  shortcut: "Ctrl+P",                           action: () => setPaletteOpen(true) },
      ],
    },
    {
      label: t.menus.view,
      entries: [
        { label: t.menus.focusMode,       shortcut: "F11", action: () => setFocusMode((f) => { const next = !f; showToast(next ? t.app.focusModeOn : t.app.focusModeOff, "info"); return next }) },
        { separator: true },
        { label: t.menus.files,    action: () => openPanel("files") },
        { label: t.menus.search,   action: () => openPanel("search") },
        { label: t.menus.outline,  action: () => openPanel("outline") },
        { label: t.sidebar.backlinks, action: () => openPanel("backlinks") },
      ],
    },
    {
      label: t.menus.vault,
      entries: [
        { label: t.menus.editMacros,  disabled: !hasVault, action: handleOpenMacros },
        { label: t.menus.editBib,     disabled: !hasVault, action: handleOpenBib },
        { separator: true },
        { label: t.menus.settings,                          action: () => setSettingsOpen(true) },
        { label: t.menus.shortcuts,   shortcut: "?",        action: () => setHelpOpen(true) },
      ],
    },
  ]
}
