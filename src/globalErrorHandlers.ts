import { showToast } from "./toastService"
import { en, es } from "./i18n"

/** Minimum gap between two "something went wrong" toasts. */
export const GLOBAL_ERROR_TOAST_INTERVAL_MS = 10_000

function message(): string {
  const lang = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "es"
  return (lang.startsWith("en") ? en : es).errorBoundary.unexpectedBackground
}

/**
 * Last-resort handlers for errors nothing caught (async failures, event
 * handlers). They log the real error and tell the user once in a while, never
 * once per error: a failing render loop must not bury the screen in toasts.
 * Returns an uninstall function.
 */
export function installGlobalErrorHandlers(
  target: Pick<Window, "addEventListener" | "removeEventListener"> = window,
  now: () => number = () => Date.now(),
): () => void {
  let lastToastAt = -Infinity

  const report = (label: string, detail: unknown) => {
    console.error(`[ComdTeX] ${label}:`, detail)
    const t = now()
    if (t - lastToastAt < GLOBAL_ERROR_TOAST_INTERVAL_MS) return
    lastToastAt = t
    showToast(message(), "error")
  }

  const onRejection = (e: PromiseRejectionEvent) => report("Unhandled promise rejection", e.reason)
  const onError = (e: ErrorEvent) => report("Uncaught error", e.error ?? e.message)

  target.addEventListener("unhandledrejection", onRejection)
  target.addEventListener("error", onError)
  return () => {
    target.removeEventListener("unhandledrejection", onRejection)
    target.removeEventListener("error", onError)
  }
}
