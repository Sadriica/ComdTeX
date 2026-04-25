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

interface LastTouchInfo {
  isTouchpad: boolean
  lastTouchTime: number
}

const SWIPE_THRESHOLD = 60
const TAP_TIME_MS = 300
const TAP_DIST_THRESHOLD = 15
const PINCH_ZOOM_THRESHOLD = 0.02
const GESTURE_TIMEOUT_MS = 500
const MULTI_FINGER_SWIPE_THRESHOLD = 80
const EDGE_SWIPE_THRESHOLD = 100

export function useTouchpadGestures(handlers: TouchpadGestureHandlers, enabled = true) {
  const state = useRef<GestureState | null>(null)
  const lastTouchInfo = useRef<LastTouchInfo>({ isTouchpad: true, lastTouchTime: 0 })
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

    lastTouchInfo.current = {
      isTouchpad: e.pointerType !== "mouse",
      lastTouchTime: Date.now(),
    }

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

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!enabled || !state.current) return

    const pointers = state.current.pointers
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const pointCount = pointers.size

    if (pointCount >= 4) {
      const points = Array.from(pointers.values())
      const startPoints = Array.from(pointers.entries())
        .map(([id]) => state.current!.pointers.get(id))
        .filter(Boolean) as { x: number; y: number }[]

      if (startPoints.length >= 2) {
        const startDx = startPoints[1].x - startPoints[0].x
        const startDy = startPoints[1].y - startPoints[0].y
        const startDist = Math.sqrt(startDx * startDx + startDy * startDy)

        const curDx = points[1].x - points[0].x
        const curDy = points[1].y - points[0].y
        const curDist = Math.sqrt(curDx * curDx + curDy * curDy)

        if (startDist > 0 && curDist > 0) {
          const distDiff = curDist - startDist
          const normalizedDiff = distDiff / startDist

          if (Math.abs(normalizedDiff) > PINCH_ZOOM_THRESHOLD) {
            e.preventDefault()
            if (normalizedDiff > 0) {
              handlers.zoomIn()
            } else {
              handlers.zoomOut()
            }
          }
        }

        const avgDx = points.reduce((sum, p) => sum + (p.x - (state.current!.startX + (p.x - e.clientX))), 0) / points.length
        const avgDy = points.reduce((sum, p) => sum + (p.y - (state.current!.startY + (p.y - e.clientY))), 0) / points.length

        const threshold = MULTI_FINGER_SWIPE_THRESHOLD
        if (Math.abs(avgDx) > threshold && Math.abs(avgDx) > Math.abs(avgDy)) {
          e.preventDefault()
          if (avgDx > 0) {
            handlers.nextTab()
          } else {
            handlers.prevTab()
          }
          state.current = null
          clearGestureTimeout()
          return
        }

        if (Math.abs(avgDy) > threshold && Math.abs(avgDy) > Math.abs(avgDx)) {
          e.preventDefault()
          if (avgDy < 0) {
            handlers.searchVault()
          }
          state.current = null
          clearGestureTimeout()
          return
        }
      }
    }

    if (pointCount >= 2) {
      const points = Array.from(pointers.values())
      if (points.length >= 2) {
        const dx = points[1].x - points[0].x
        const dy = points[1].y - points[0].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        lastPinchDist.current = dist
      }
    }
  }, [enabled, handlers, clearGestureTimeout])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!enabled || !state.current) return

    const { startX, startY, startTime, pointers } = state.current
    const currentPos = pointers.get(e.pointerId)
    pointers.delete(e.pointerId)

    if (pointers.size === 0 && currentPos) {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const elapsed = Date.now() - startTime

      if (dist < TAP_DIST_THRESHOLD && elapsed < TAP_TIME_MS) {
        if (e.detail === 2) {
          const editor = document.querySelector(".monaco-editor")
          if (editor?.contains(e.target as Node)) {
            e.preventDefault()
            handlers.goToDefinition()
          }
        }

        if (lastTouchInfo.current.isTouchpad) {
          e.preventDefault()
          handlers.openCommandPalette()
        }
      }

      if (e.clientX < EDGE_SWIPE_THRESHOLD && dist > SWIPE_THRESHOLD && dx > 0) {
        e.preventDefault()
        handlers.prevTab()
      } else if (e.clientX > window.innerWidth - EDGE_SWIPE_THRESHOLD && dist > SWIPE_THRESHOLD && dx < 0) {
        e.preventDefault()
        handlers.nextTab()
      }
    }

    if (pointers.size === 0) {
      state.current = null
      clearGestureTimeout()
    }
  }, [enabled, handlers, clearGestureTimeout])

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