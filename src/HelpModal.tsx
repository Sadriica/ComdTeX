import { useMemo, useRef, useState } from "react"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

type ShortcutItem = { group: string } | { key: string; desc: string }

export default function HelpModal({ open, onClose }: HelpModalProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  useFocusTrap(modalRef, open, onClose)

  const shortcuts: ShortcutItem[] = useMemo(() => [
    { group: t.help.file },
    { key: "Ctrl+S",          desc: t.help.save },
    { key: "Ctrl+Shift+S",    desc: t.help.saveAs },
    { key: "Ctrl+P",          desc: t.help.commandPalette },
    { key: "Ctrl+;",          desc: t.help.quickSwitcher },
    { key: "Ctrl+Shift+D",    desc: t.help.dailyNote },

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
  ], [t])

  // Filter: keep only groups that contain matching rows; show all rows if query empty
  const filtered: ShortcutItem[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return shortcuts

    const out: ShortcutItem[] = []
    let pendingGroup: { group: string } | null = null
    let groupHasMatches = false

    for (const item of shortcuts) {
      if ("group" in item) {
        // Flush previous group if it had no matches we'll just discard.
        pendingGroup = item
        groupHasMatches = false
      } else {
        const match = item.key.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
        if (match) {
          if (pendingGroup && !groupHasMatches) {
            out.push(pendingGroup)
            groupHasMatches = true
          }
          out.push(item)
        }
      }
    }
    return out
  }, [shortcuts, query])

  if (!open) return null

  const noMatches = query.trim() !== "" && filtered.length === 0

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" ref={modalRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.help.title}</span>
          <button className="modal-close" onClick={onClose} aria-label={t.titleBar.close}>✕</button>
        </div>
        <div className="help-search-row">
          <input
            type="text"
            className="help-search-input"
            placeholder={t.help.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            aria-label={t.help.searchPlaceholder}
          />
        </div>
        <div className="modal-body help-body">
          {noMatches ? (
            <div className="help-no-matches">{t.help.noMatches}</div>
          ) : (
            filtered.map((item, i) =>
              "group" in item ? (
                <div key={i} className="help-group">{item.group}</div>
              ) : (
                <div key={i} className="help-row">
                  <kbd className="help-key">{item.key}</kbd>
                  <span className="help-desc">{item.desc}</span>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  )
}
