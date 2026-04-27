import { useEffect, type RefObject } from "react"

/**
 * Trap keyboard focus inside a modal container while it is open.
 *
 *  - Saves the previously focused element on open.
 *  - Focuses the first focusable element inside the container.
 *  - Cycles Tab / Shift+Tab among focusable elements.
 *  - Calls `onClose` on Escape.
 *  - Restores the previously focused element on close.
 *
 * @param ref      Ref pointing to the modal root element.
 * @param isOpen   Whether the modal is currently open.
 * @param onClose  Optional callback fired when Escape is pressed.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose?: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return
    const container = ref.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const getFocusable = (): HTMLElement[] => {
      const selector = [
        "a[href]",
        "button:not([disabled])",
        "textarea:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",")
      const list = Array.from(container.querySelectorAll<HTMLElement>(selector))
      return list.filter((el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null)
    }

    // Move focus into the modal (prefer an element that does NOT autofocus
    // a destructive close button: skip leading [aria-label="close"]-style buttons
    // by simply picking the first focusable element).
    const focusables = getFocusable()
    if (focusables.length > 0 && !container.contains(document.activeElement)) {
      focusables[0].focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onClose) {
          e.stopPropagation()
          onClose()
        }
        return
      }
      if (e.key !== "Tab") return

      const items = getFocusable()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener("keydown", onKeyDown)

    return () => {
      container.removeEventListener("keydown", onKeyDown)
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try { previouslyFocused.focus() } catch { /* element gone */ }
      }
    }
  }, [ref, isOpen, onClose])
}
