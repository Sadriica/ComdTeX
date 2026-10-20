import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { useFocusTrap } from "./useFocusTrap"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"
import { ArrowDown, ArrowUp, CornerDownLeft, FileText, Icon } from "./icons"

interface QuickSwitcherProps {
  open: boolean
  files: { path: string; name: string }[]
  recentFiles: { path: string; name: string }[]
  onSelect: (path: string) => void
  onClose: () => void
}

export default function QuickSwitcher({
  open,
  files,
  recentFiles,
  onSelect,
  onClose,
}: QuickSwitcherProps) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Escape is handled by the input keydown; the trap only restores focus on close.
  useFocusTrap(dialogRef, open)

  // Start from a clean query each time it opens. The focus trap above moves
  // focus into the input; re-keying the input on focus (as this used to)
  // remounted it in a loop and dropped keystrokes, Escape included.
  useEffect(() => {
    if (!open) return
    // Intentional: reset input and selection each time it opens.
    setQuery("") // eslint-disable-line react-hooks/set-state-in-effect
    setSelected(0)
  }, [open])

  const filteredFiles = useMemo(() => {
    return query
      ? files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
      : recentFiles.slice(0, 10)
  }, [query, files, recentFiles])

  const effectiveSelected = Math.min(selected, Math.max(0, filteredFiles.length - 1))

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, filteredFiles.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (filteredFiles[effectiveSelected]) {
          onSelect(filteredFiles[effectiveSelected].path)
          onClose()
        }
      } else if (e.key === "Escape") {
        onClose()
      }
    },
    [filteredFiles, effectiveSelected, onSelect, onClose],
  )

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setSelected(0)
  }, [])

  if (!open) return null

  return (
    <div className="modal-overlay modal-overlay-top" onMouseDown={onClose}>
      <div
        className="quick-switcher"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.quickSwitcher.placeholder}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={t.quickSwitcher.placeholder}
          aria-label={t.quickSwitcher.placeholder}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <div className="quick-switcher-results">
          {filteredFiles.length === 0 && (
            <div className="quick-switcher-empty">{t.quickSwitcher.noResults}</div>
          )}
          {filteredFiles.map((file, i) => (
            <div
              key={file.path}
              className={`quick-switcher-item${i === effectiveSelected ? " selected" : ""}`}
              onClick={() => {
                onSelect(file.path)
                onClose()
              }}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="quick-switcher-icon" aria-hidden="true">
                <Icon icon={FileText} size={14} />
              </span>
              <span className="quick-switcher-name">{file.name}</span>
              <span className="quick-switcher-path">{displayBasename(file.path)}</span>
            </div>
          ))}
        </div>
        <div className="quick-switcher-footer">
          <span>
            <kbd>
              <Icon icon={ArrowUp} size={14} />
              <Icon icon={ArrowDown} size={14} />
            </kbd>{" "}
            {t.quickSwitcher.navigate}
          </span>
          <span>
            <kbd>
              <Icon icon={CornerDownLeft} size={14} />
            </kbd>{" "}
            {t.quickSwitcher.open}
          </span>
          <span>
            <kbd>Esc</kbd> {t.quickSwitcher.close}
          </span>
        </div>
      </div>
    </div>
  )
}
