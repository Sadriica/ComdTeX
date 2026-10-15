import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { installGlobalErrorHandlers, GLOBAL_ERROR_TOAST_INTERVAL_MS } from "./globalErrorHandlers"
import { subscribeToasts, dismissToast, type Toast } from "./toastService"

function fakeTarget() {
  const handlers = new Map<string, (e: unknown) => void>()
  return {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      handlers.set(type, fn)
    },
    removeEventListener: (type: string) => {
      handlers.delete(type)
    },
    fire: (type: string, e: unknown) => handlers.get(type)?.(e),
    count: () => handlers.size,
  }
}

describe("installGlobalErrorHandlers", () => {
  let toasts: Toast[] = []
  let unsub: () => void
  beforeEach(() => {
    toasts = []
    unsub = subscribeToasts((t) => {
      toasts = t
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    for (const t of toasts) dismissToast(t.id)
    unsub()
    vi.restoreAllMocks()
  })

  it("toasts once for a burst of errors and again after the interval", () => {
    const target = fakeTarget()
    let clock = 1000
    installGlobalErrorHandlers(target as unknown as Window, () => clock)
    for (let i = 0; i < 20; i++) target.fire("error", { error: new Error("boom"), message: "boom" })
    target.fire("unhandledrejection", { reason: new Error("nope") })
    expect(toasts).toHaveLength(1)
    expect(toasts[0].type).toBe("error")
    expect(console.error).toHaveBeenCalledTimes(21)
    clock += GLOBAL_ERROR_TOAST_INTERVAL_MS
    target.fire("error", { message: "again" })
    expect(toasts).toHaveLength(2)
  })

  it("uninstalls its listeners", () => {
    const target = fakeTarget()
    const off = installGlobalErrorHandlers(target as unknown as Window)
    expect(target.count()).toBe(2)
    off()
    expect(target.count()).toBe(0)
  })
})
