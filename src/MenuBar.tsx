import { useState, useRef, useEffect } from "react"
import React from "react"

export interface MenuAction {
  label: string
  shortcut?: string
  disabled?: boolean
  action: () => void
}

export interface MenuSeparatorItem { separator: true }

export type MenuEntry = MenuAction | MenuSeparatorItem

export interface MenuDef {
  label: string
  entries: MenuEntry[]
}

function isSep(e: MenuEntry): e is MenuSeparatorItem {
  return "separator" in e
}

function MenuDropdown({ label, entries }: MenuDef) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div className="menu-item" ref={ref}>
      <button
        className={`menu-btn${open ? " open" : ""}`}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o) }}
      >
        {label}
      </button>
      {open && (
        <div className="menu-panel">
          {entries.map((entry, i) =>
            isSep(entry) ? (
              <div key={i} className="menu-sep" />
            ) : (
              <button
                key={i}
                className="menu-entry"
                disabled={entry.disabled}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!entry.disabled) { entry.action(); setOpen(false) }
                }}
              >
                <span className="menu-entry-label">{entry.label}</span>
                {entry.shortcut && <span className="menu-shortcut">{entry.shortcut}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default function MenuBar({ menus, children }: { menus: MenuDef[]; children?: React.ReactNode }) {
  return (
    <div className="menu-bar">
      {menus.map((m) => <MenuDropdown key={m.label} {...m} />)}
      {children}
    </div>
  )
}
