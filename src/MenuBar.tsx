import { useState, useRef, useEffect, useCallback } from "react"
import React from "react"

export interface MenuAction {
  label: string
  shortcut?: string
  disabled?: boolean
  action: () => void
}

export interface MenuSeparatorItem {
  separator: true
}

export type MenuEntry = MenuAction | MenuSeparatorItem

export interface MenuDef {
  label: string
  entries: MenuEntry[]
}

function isSep(e: MenuEntry): e is MenuSeparatorItem {
  return "separator" in e
}

type Focus = "first" | "last"

interface DropdownProps extends MenuDef {
  open: boolean
  /** Where keyboard focus should land once the panel is open (null: leave it). */
  focusTarget: Focus | null
  onOpen: (focus: Focus | null) => void
  onClose: (returnFocus: boolean | "if-lost") => void
  /** Move to the previous (-1) or next (1) top-level menu, opened. */
  onStep: (dir: -1 | 1) => void
  onFocusTop: (dir: -1 | 1) => void
  triggerRef: (el: HTMLButtonElement | null) => void
}

function MenuDropdown({
  label,
  entries,
  open,
  focusTarget,
  onOpen,
  onClose,
  onStep,
  onFocusTop,
  triggerRef,
}: DropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const items = useCallback(
    () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>("button.menu-entry:not(:disabled)") ??
          [],
      ),
    [],
  )

  // Keyboard-opened menus move focus into the panel; mouse-opened ones keep it
  // where it was (the editor), as before.
  useEffect(() => {
    if (!open || !focusTarget) return
    const list = items()
    if (!list.length) return
    list[focusTarget === "first" ? 0 : list.length - 1].focus()
  }, [open, focusTarget, items])

  const onTriggerKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        onOpen("first")
        break
      case "ArrowUp":
        e.preventDefault()
        onOpen("last")
        break
      case "ArrowRight":
        e.preventDefault()
        onFocusTop(1)
        break
      case "ArrowLeft":
        e.preventDefault()
        onFocusTop(-1)
        break
      case "Escape":
        if (open) {
          e.preventDefault()
          onClose(true)
        }
        break
    }
  }

  const onPanelKey = (e: React.KeyboardEvent) => {
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => {
      e.preventDefault()
      list[(i + list.length) % list.length]?.focus()
    }
    switch (e.key) {
      case "ArrowDown":
        go(at + 1)
        break
      case "ArrowUp":
        go(at < 0 ? -1 : at - 1)
        break
      case "Home":
        go(0)
        break
      case "End":
        go(-1)
        break
      case "ArrowRight":
        e.preventDefault()
        onStep(1)
        break
      case "ArrowLeft":
        e.preventDefault()
        onStep(-1)
        break
      case "Escape":
        e.preventDefault()
        onClose(true)
        break
      case "Tab":
        onClose(false)
        break
    }
  }

  return (
    <div className="menu-item">
      <button
        ref={triggerRef}
        className={`menu-btn${open ? " open" : ""}`}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault()
          if (open) onClose(false)
          else onOpen(null)
        }}
        // Keyboard activation (Enter/Space) arrives as a click with detail 0;
        // a mouse click was already handled on mousedown.
        onClick={(e) => {
          if (e.detail !== 0) return
          if (open) onClose(true)
          else onOpen("first")
        }}
        onKeyDown={onTriggerKey}
      >
        {label}
      </button>
      {open && (
        <div
          className="menu-panel"
          role="menu"
          aria-label={label}
          ref={panelRef}
          onKeyDown={onPanelKey}
        >
          {entries.map((entry, i) =>
            isSep(entry) ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : (
              <button
                key={i}
                className="menu-entry"
                role="menuitem"
                disabled={entry.disabled}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!entry.disabled) {
                    onClose(false)
                    entry.action()
                  }
                }}
                onClick={(e) => {
                  if (e.detail !== 0 || entry.disabled) return
                  // Close first, then run: an action that focuses the editor
                  // (or opens a dialog) keeps its focus. The trigger only gets
                  // focus back when the action left it nowhere.
                  onClose("if-lost")
                  entry.action()
                }}
              >
                <span className="menu-entry-label">{entry.label}</span>
                {entry.shortcut && <span className="menu-shortcut">{entry.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function MenuBar({ menus, children }: { menus: MenuDef[]; children?: React.ReactNode }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [focusTarget, setFocusTarget] = useState<Focus | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const triggers = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (openIdx === null) return
    const close = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenIdx(null)
    }
    // Escape closes the menu wherever focus is: a mouse-opened menu leaves it in
    // the editor, which would otherwise swallow the key.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      e.stopPropagation()
      const inBar = barRef.current?.contains(document.activeElement) ?? false
      const was = openIdx
      setOpenIdx(null)
      setFocusTarget(null)
      if (inBar) triggers.current[was]?.focus()
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onEscape, true)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onEscape, true)
    }
  }, [openIdx])

  const open = (i: number, focus: Focus | null) => {
    setFocusTarget(focus)
    setOpenIdx(i)
  }
  const close = (returnFocus: boolean | "if-lost") => {
    const was = openIdx
    setOpenIdx(null)
    setFocusTarget(null)
    if (was === null) return
    if (returnFocus === true) triggers.current[was]?.focus()
    else if (returnFocus === "if-lost") {
      // After the action ran and the panel unmounted: only a focus that fell
      // to <body> goes back to the trigger.
      setTimeout(() => {
        const a = document.activeElement
        if (!a || a === document.body) triggers.current[was]?.focus()
      }, 0)
    }
  }
  const wrap = (i: number, dir: -1 | 1) => (i + dir + menus.length) % menus.length

  return (
    <div className="menu-bar" role="menubar" ref={barRef}>
      {menus.map((m, i) => (
        <MenuDropdown
          key={m.label}
          {...m}
          open={openIdx === i}
          focusTarget={openIdx === i ? focusTarget : null}
          onOpen={(f) => open(i, f)}
          onClose={close}
          onStep={(dir) => {
            const next = wrap(i, dir)
            triggers.current[next]?.focus()
            open(next, "first")
          }}
          onFocusTop={(dir) => {
            const next = wrap(i, dir)
            triggers.current[next]?.focus()
            // With a menu open, the neighbour opens too (menubar convention).
            if (openIdx !== null) open(next, null)
          }}
          triggerRef={(el) => {
            triggers.current[i] = el
          }}
        />
      ))}
      {children}
    </div>
  )
}

// Memoized: AppContent re-renders per keystroke; with `menus` and `children`
// memoized by the host, this skips the whole menu subtree on every keystroke.
export default React.memo(MenuBar)
