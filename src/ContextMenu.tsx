import { useEffect, useRef } from "react"

export interface ContextMenuItem {
  label: string
  action: () => void
  danger?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  // Keep menu on screen
  const style: React.CSSProperties = {
    position: "fixed",
    top: y,
    left: x,
    zIndex: 5000,
  }

  return (
    <div ref={ref} className="ctx-menu" style={style}>
      {items.map((item, i) => (
        <button
          key={i}
          className={`ctx-item${item.danger ? " ctx-danger" : ""}`}
          disabled={item.disabled}
          onMouseDown={(e) => {
            e.preventDefault()
            if (!item.disabled) { item.action(); onClose() }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
