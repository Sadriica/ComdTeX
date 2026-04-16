import { useLayoutEffect, useRef } from "react"

interface ResizerProps {
  onDrag: (dx: number) => void
  vertical?: boolean
}

export default function Resizer({ onDrag, vertical = true }: ResizerProps) {
  const onDragRef = useRef(onDrag)
  useLayoutEffect(() => { onDragRef.current = onDrag })

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const start = vertical ? e.clientX : e.clientY

    const onMove = (ev: MouseEvent) => {
      onDragRef.current(vertical ? ev.clientX - start : ev.clientY - start)
    }
    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    document.body.style.cursor = vertical ? "col-resize" : "row-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  return (
    <div
      className={`resizer ${vertical ? "resizer-v" : "resizer-h"}`}
      onMouseDown={handleMouseDown}
    />
  )
}
