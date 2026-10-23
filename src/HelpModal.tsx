import { useMemo, useRef, useState, useId } from "react"
import { useT } from "./i18n"
import { Icon, X } from "./icons"
import { useFocusTrap } from "./useFocusTrap"
import { shortcutKeys } from "./appShortcuts"

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

type ShortcutItem = { group: string } | { key: string; desc: string }

export default function HelpModal({ open, onClose }: HelpModalProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [query, setQuery] = useState("")
  useFocusTrap(modalRef, open, onClose)

  const shortcuts: ShortcutItem[] = useMemo(
    () => [
      { group: t.help.file },
      { key: shortcutKeys("save"), desc: t.help.save },
      { key: shortcutKeys("saveAs"), desc: t.help.saveAs },
      { key: shortcutKeys("quickOpen"), desc: t.help.quickSwitcher },
      { key: shortcutKeys("quickOpenAlt"), desc: t.help.quickSwitcher },
      { key: shortcutKeys("commandPalette"), desc: t.help.commandPalette },
      { key: shortcutKeys("dailyNote"), desc: t.help.dailyNote },

      { group: t.palette.modesTitle },
      { key: ">", desc: t.palette.modes.commands.hint },
      { key: "@", desc: t.palette.modes.outline.hint },
      { key: "#", desc: t.palette.modes.labels.hint },
      { key: "[", desc: t.palette.modes.cite.hint },
      { key: ":", desc: t.palette.modes.line.hint },
      { key: "note#", desc: t.palette.modes.files.hint },
      { key: "?", desc: t.palette.modes.help.hint },

      { group: t.help.edit },
      { key: shortcutKeys("find"), desc: t.help.findInFile },
      { key: shortcutKeys("searchVault"), desc: t.help.searchVault },
      { key: "Ctrl+D", desc: t.help.selectNextOccurrence },
      { key: "Ctrl+Z", desc: t.help.undo },
      { key: "Ctrl+Y", desc: t.help.redo },

      { group: t.help.view },
      { key: shortcutKeys("focusMode"), desc: t.help.focusMode },
      { key: "Escape", desc: t.help.exitFocus },
      { key: shortcutKeys("togglePreview"), desc: t.help.togglePreview },
      { key: "Ctrl++/-", desc: t.help.zoomInOut },
      { key: shortcutKeys("resetZoom"), desc: t.help.resetZoom },
      { key: shortcutKeys("nextTab"), desc: t.help.nextTab },
      { key: shortcutKeys("prevTab"), desc: t.help.prevTab },
      { key: shortcutKeys("closeTab"), desc: t.help.closeTab },
      { key: shortcutKeys("aiPanel"), desc: t.help.openAiAssistant },
      { key: shortcutKeys("insertToc"), desc: t.help.insertTocShortcut },
      { key: shortcutKeys("toggleOutline"), desc: t.help.toggleOutline },
      { key: "?", desc: t.help.thisHelp },

      { group: t.help.editor },
      { key: "Tab", desc: t.help.expandShorthand },
      { key: "Tab / Shift+Tab", desc: t.help.navigatePlaceholders },
      { key: "[[", desc: t.help.autocompleteWikilink },

      { group: t.help.math },
      { key: "frac(a, b)", desc: "\\frac{a}{b}" },
      { key: "sqrt(x)", desc: "\\sqrt{x}" },
      { key: "sum(i=0, n)", desc: "\\sum_{i=0}^{n}" },
      { key: "int(a, b)", desc: "\\int_{a}^{b}" },
      { key: "mat(1,2,3,4)", desc: t.help.autoMatrix },
      { key: "matf(2,2,...)", desc: t.help.fixedMatrix },
      { key: "table(C1,C2)", desc: t.help.markdownTable },
    ],
    [t],
  )

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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal modal-wide"
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span id={titleId}>{t.help.title}</span>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t.titleBar.close}
            title={t.titleBar.close}
          >
            <Icon icon={X} size={14} />
          </button>
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
                <div key={i} className="help-group">
                  {item.group}
                </div>
              ) : (
                <div key={i} className="help-row">
                  <kbd className="help-key">{item.key}</kbd>
                  <span className="help-desc">{item.desc}</span>
                </div>
              ),
            )
          )}
        </div>
      </div>
    </div>
  )
}
