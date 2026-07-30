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
  /** Runs one of the editor's built-in edit commands (see `EditorActionId`). */
  runEditorAction: (id: EditorActionId) => void
  handleNormalizeTable: () => void
  handleRegenerateFolderFiles: () => void
  recentEntries: MenuEntry[]
}

/** The edit operations surfaced in the Edición menu. */
export type EditorActionId =
  | "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll"
  | "duplicateLine" | "moveLineUp" | "moveLineDown" | "toggleComment"

export function buildMenus(ctx: BuildMenusCtx): MenuDef[] {
  const {
    t, hasFile, hasVault, deps, exportActions, selectVault, setTemplateOpen,
    handleSave, handleSaveAs, handleFind, openPanel, setPaletteOpen, setFocusMode,
    handleOpenMacros, handleOpenBib, setSettingsOpen, setHelpOpen, recentEntries,
    runEditorAction, handleNormalizeTable, handleRegenerateFolderFiles,
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
        // These are all pre-existing editor capabilities; they were only ever
        // reachable by shortcut, which made them invisible to anyone who did not
        // already know them.
        { label: t.menus.undo,            shortcut: "Ctrl+Z",       disabled: !hasFile, action: () => runEditorAction("undo") },
        { label: t.menus.redo,            shortcut: "Ctrl+Shift+Z", disabled: !hasFile, action: () => runEditorAction("redo") },
        { separator: true },
        { label: t.menus.cut,             shortcut: "Ctrl+X",       disabled: !hasFile, action: () => runEditorAction("cut") },
        { label: t.menus.copy,            shortcut: "Ctrl+C",       disabled: !hasFile, action: () => runEditorAction("copy") },
        { label: t.menus.paste,           shortcut: "Ctrl+V",       disabled: !hasFile, action: () => runEditorAction("paste") },
        { label: t.menus.selectAll,       shortcut: "Ctrl+A",       disabled: !hasFile, action: () => runEditorAction("selectAll") },
        { separator: true },
        { label: t.menus.duplicateLine,   shortcut: "Ctrl+Shift+D", disabled: !hasFile, action: () => runEditorAction("duplicateLine") },
        { label: t.menus.moveLineUp,      shortcut: "Alt+↑",        disabled: !hasFile, action: () => runEditorAction("moveLineUp") },
        { label: t.menus.moveLineDown,    shortcut: "Alt+↓",        disabled: !hasFile, action: () => runEditorAction("moveLineDown") },
        { label: t.menus.toggleComment,   shortcut: "Ctrl+/",       disabled: !hasFile, action: () => runEditorAction("toggleComment") },
        { separator: true },
        { label: t.palette.normalizeTable,                          disabled: !hasFile, action: handleNormalizeTable },
        { separator: true },
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
        { label: t.folderRules.regenerate, disabled: !hasVault, action: handleRegenerateFolderFiles },
        { separator: true },
        { label: t.menus.editMacros,  disabled: !hasVault, action: handleOpenMacros },
        { label: t.menus.editBib,     disabled: !hasVault, action: handleOpenBib },
        { separator: true },
        { label: t.menus.settings,                          action: () => setSettingsOpen(true) },
        { label: t.menus.shortcuts,   shortcut: "?",        action: () => setHelpOpen(true) },
      ],
    },
  ]
}
