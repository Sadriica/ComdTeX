import { useEffect, useRef, useCallback } from "react"

export interface TouchpadGestureHandlers {
  openCommandPalette: () => void
  nextTab: () => void
  prevTab: () => void
  searchVault: () => void
  goToDefinition: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

interface GestureState {
  startX: number
  startY: number
  startTime: number
  pointers: Map<number, { x: number; y: number }>
}

const SWIPE_THRESHOLD = 60
const PINCH_ZOOM_THRESHOLD = 0.02
const GESTURE_TIMEOUT_MS = 500
const EDGE_SWIPE_THRESHOLD = 100

export function useTouchpadGestures(handlers: TouchpadGestureHandlers, enabled = true) {
  const state = useRef<GestureState | null>(null)
  const gestureTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPinchDist = useRef<number | null>(null)

  const clearGestureTimeout = useCallback(() => {
    if (gestureTimeout.current) {
      clearTimeout(gestureTimeout.current)
      gestureTimeout.current = null
    }
  }, [])

  const scheduleGestureTimeout = useCallback(() => {
    clearGestureTimeout()
    gestureTimeout.current = setTimeout(() => {
      state.current = null
    }, GESTURE_TIMEOUT_MS)
  }, [clearGestureTimeout])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!enabled) return

    if (!state.current) {
      state.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTime: Date.now(),
        pointers: new Map(),
      }
      scheduleGestureTimeout()
    }

    state.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }, [enabled, scheduleGestureTimeout])

  // Pinch-zoom: works when 2+ pointers are tracked. Compares distance frame-to-frame
  // as a partial-reliability fallback alongside Ctrl+wheel.
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!enabled || !state.current) return

    const pointers = state.current.pointers
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.size >= 2) {
      const points = Array.from(pointers.values())
      const dx = points[1].x - points[0].x
      const dy = points[1].y - points[0].y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (lastPinchDist.current !== null && lastPinchDist.current > 0) {
        const diff = dist - lastPinchDist.current
        const normalized = diff / lastPinchDist.current
        if (Math.abs(normalized) > PINCH_ZOOM_THRESHOLD) {
          e.preventDefault()
          if (normalized > 0) handlers.zoomIn()
          else handlers.zoomOut()
          lastPinchDist.current = dist
        }
      } else {
        lastPinchDist.current = dist
      }
    }
  }, [enabled, handlers])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!enabled || !state.current) return

    const { startX, pointers } = state.current
    pointers.delete(e.pointerId)

    if (pointers.size === 0) {
      const dx = e.clientX - startX
      const dist = Math.abs(dx)

      // Edge swipe: 1-finger drag from screen edge → tab nav.
      if (startX < EDGE_SWIPE_THRESHOLD && dist > SWIPE_THRESHOLD && dx > 0) {
        e.preventDefault()
        handlers.prevTab()
      } else if (startX > window.innerWidth - EDGE_SWIPE_THRESHOLD && dist > SWIPE_THRESHOLD && dx < 0) {
        e.preventDefault()
        handlers.nextTab()
      }

      state.current = null
      lastPinchDist.current = null
      clearGestureTimeout()
    }
  }, [enabled, handlers, clearGestureTimeout])

  // Ctrl/Cmd + wheel → zoom (universally reliable).
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!enabled) return

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      if (e.deltaY < 0) {
        handlers.zoomIn()
      } else {
        handlers.zoomOut()
      }
    }
  }, [enabled, handlers])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("wheel", handleWheel, { passive: false })

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("wheel", handleWheel)
      clearGestureTimeout()
    }
  }, [enabled, handlePointerDown, handlePointerMove, handlePointerUp, handleWheel, clearGestureTimeout])
}
