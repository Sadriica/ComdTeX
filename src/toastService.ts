export type ToastType = "success" | "error" | "info"

export interface Toast {
  id: number
  message: string
  type: ToastType
}

let nextId = 0
let current: Toast[] = []
const listeners = new Set<(toasts: Toast[]) => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function notify() {
  const snapshot = [...current]
  listeners.forEach((fn) => fn(snapshot))
}

export function showToast(message: string, type: ToastType = "info", durationMs?: number) {
  // Default durations: 6s for errors (need more time to read), 3.5s otherwise
  const defaultDuration = type === "error" ? 6000 : 3500
  const effectiveDuration = durationMs ?? defaultDuration
  const id = ++nextId
  current = [...current, { id, message, type }]
  notify()
  const timer = setTimeout(() => {
    timers.delete(id)
    current = current.filter((t) => t.id !== id)
    notify()
  }, effectiveDuration)
  timers.set(id, timer)
}

export function dismissToast(id: number) {
  const timer = timers.get(id)
  if (timer) { clearTimeout(timer); timers.delete(id) }
  current = current.filter((t) => t.id !== id)
  notify()
}

export function subscribeToasts(fn: (toasts: Toast[]) => void): () => void {
  listeners.add(fn)
  fn([...current])
  return () => listeners.delete(fn)
}
