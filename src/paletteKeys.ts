import type * as Monaco from "monaco-editor"

/**
 * Keys that open the palette, bound ON the editor.
 *
 * The app also handles them on `window` (appShortcuts.ts), but Monaco claims
 * some of them while it has focus: F1 is its own quick-command picker, and
 * monaco-vim takes Ctrl+P / Ctrl+N in insert mode for completion. Editor-level
 * commands win over both and stop the event, so the window listener never sees
 * it twice. Returns a disposer.
 */
export interface PaletteKeyActions {
  openCommands: () => void
  openFiles: () => void
  togglePreview: () => void
}

export function registerPaletteKeys(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  actions: () => PaletteKeyActions,
): void {
  const { KeyMod, KeyCode } = monaco
  // F1 and Ctrl+Shift+P: the commands palette instead of Monaco's.
  editor.addCommand(KeyCode.F1, () => actions().openCommands())
  editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP, () => actions().openCommands())
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyP, () => actions().openFiles())
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.Semicolon, () => actions().openFiles())
  editor.addCommand(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP, () => actions().togglePreview())
}
