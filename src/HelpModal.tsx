import { useT } from "./i18n"

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  const t = useT()
  if (!open) return null

  const shortcuts = [
    { group: t.help.file },
    { key: "Ctrl+S",          desc: t.help.save },
    { key: "Ctrl+Shift+S",    desc: t.help.saveAs },
    { key: "Ctrl+P",          desc: t.help.commandPalette },
    { key: "Ctrl+;",          desc: t.help.quickSwitcher },

    { group: t.help.edit },
    { key: "Ctrl+F",          desc: t.help.findInFile },
    { key: "Ctrl+Shift+F",    desc: t.help.searchVault },
    { key: "Ctrl+D",          desc: t.help.selectNextOccurrence },
    { key: "Ctrl+Z",          desc: t.help.undo },
    { key: "Ctrl+Y",          desc: t.help.redo },

    { group: t.help.view },
    { key: "F11",             desc: t.help.focusMode },
    { key: "Escape",          desc: t.help.exitFocus },
    { key: "Ctrl+Shift+P",    desc: t.help.togglePreview },
    { key: "Ctrl++/-",        desc: t.help.zoomInOut },
    { key: "Ctrl+0",          desc: t.help.resetZoom },
    { key: "Ctrl+Tab",        desc: t.help.nextTab },
    { key: "Ctrl+Shift+Tab",  desc: t.help.prevTab },
    { key: "Ctrl+W",          desc: t.help.closeTab },
    { key: "?",               desc: t.help.thisHelp },

    { group: t.help.editor },
    { key: "Tab",             desc: t.help.expandShorthand },
    { key: "Tab / Shift+Tab", desc: t.help.navigatePlaceholders },
    { key: "[[",              desc: t.help.autocompleteWikilink },

    { group: t.help.math },
    { key: "frac(a, b)",      desc: "\\frac{a}{b}" },
    { key: "sqrt(x)",         desc: "\\sqrt{x}" },
    { key: "sum(i=0, n)",     desc: "\\sum_{i=0}^{n}" },
    { key: "int(a, b)",       desc: "\\int_{a}^{b}" },
    { key: "mat(1,2,3,4)",    desc: t.help.autoMatrix },
    { key: "matf(2,2,...)",   desc: t.help.fixedMatrix },
    { key: "table(C1,C2)",    desc: t.help.markdownTable },
  ]

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.help.title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body help-body">
          {shortcuts.map((item, i) =>
            "group" in item ? (
              <div key={i} className="help-group">{item.group}</div>
            ) : (
              <div key={i} className="help-row">
                <kbd className="help-key">{"key" in item ? item.key : ""}</kbd>
                <span className="help-desc">{"desc" in item ? item.desc : ""}</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
