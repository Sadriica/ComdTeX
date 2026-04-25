import { useState, useRef, useCallback, useMemo } from "react"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"

interface QuickSwitcherProps {
  open: boolean
  files: { path: string; name: string }[]
  recentFiles: { path: string; name: string }[]
  onSelect: (path: string) => void
  onClose: () => void
}

export default function QuickSwitcher({ open, files, recentFiles, onSelect, onClose }: QuickSwitcherProps) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [inputKey, setInputKey] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleOpen = useCallback(() => {
    setInputKey((k) => k + 1)
    setQuery("")
    setSelected(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const filteredFiles = useMemo(() => {
    return query
      ? files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
      : recentFiles.slice(0, 10)
  }, [query, files, recentFiles])

  const effectiveSelected = Math.min(selected, Math.max(0, filteredFiles.length - 1))

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
  }, [filteredFiles, effectiveSelected, onSelect, onClose])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setSelected(0)
  }, [])

  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="quick-switcher" onMouseDown={(e) => e.stopPropagation()}>
        <input
          key={inputKey}
          ref={inputRef}
          type="text"
          placeholder={t.quickSwitcher.placeholder}
          value={query}
          onFocus={handleOpen}
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
              onClick={() => { onSelect(file.path); onClose() }}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="quick-switcher-icon">📄</span>
              <span className="quick-switcher-name">{file.name}</span>
              <span className="quick-switcher-path">{displayBasename(file.path)}</span>
            </div>
          ))}
        </div>
        <div className="quick-switcher-footer">
          <span>↑↓ {t.quickSwitcher.navigate}</span>
          <span>↵ {t.quickSwitcher.open}</span>
          <span>Esc {t.quickSwitcher.close}</span>
        </div>
      </div>
    </div>
  )
}