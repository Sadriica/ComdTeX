// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SyncOutcome } from "./vaultSync"

const syncVault = vi.fn<() => Promise<SyncOutcome>>()
const showToast = vi.fn()

vi.mock("./vaultSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./vaultSync")>()),
  syncVault: () => syncVault(),
}))
vi.mock("./gitApi", () => ({ runGit: vi.fn() }))
vi.mock("./toastService", () => ({ showToast: (...a: unknown[]) => showToast(...a) }))

const { useVaultSync } = await import("./useVaultSync")
const { getSyncStatus } = await import("./syncStatusStore")

const synced = (pulled = false): SyncOutcome => ({
  kind: "synced",
  committed: false,
  pulled,
  pushed: false,
})
const offline: SyncOutcome = { kind: "error", stage: "fetch", message: "Could not resolve host" }
const conflict: SyncOutcome = { kind: "conflict", files: ["a.md"], inProgress: false }

function setup(over: { auto?: boolean; editSignal?: string } = {}) {
  const onPulled = vi.fn()
  const flushPending = vi.fn(async () => {})
  const hook = renderHook(
    (p: { editSignal: string }) =>
      useVaultSync({
        vaultPath: "/v",
        auto: over.auto ?? true,
        delayMinutes: 2,
        editSignal: p.editSignal,
        flushPending,
        onPulled,
      }),
    { initialProps: { editSignal: over.editSignal ?? "start" } },
  )
  return { ...hook, onPulled, flushPending }
}

const flush = () => act(async () => {})

beforeEach(() => {
  vi.useFakeTimers()
  syncVault.mockReset()
  showToast.mockReset()
})
afterEach(() => vi.useRealTimers())

describe("useVaultSync", () => {
  it("syncs shortly after the vault opens, then every ten minutes", async () => {
    syncVault.mockResolvedValue(synced())
    setup()
    expect(syncVault).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    expect(syncVault).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000))
    expect(syncVault).toHaveBeenCalledTimes(2)
  })

  it("does nothing on its own while automatic sync is off", async () => {
    syncVault.mockResolvedValue(synced())
    setup({ auto: false })
    await act(async () => vi.advanceTimersByTimeAsync(30 * 60_000))
    expect(syncVault).not.toHaveBeenCalled()
  })

  it("sends edits once writing has stopped for the chosen delay", async () => {
    syncVault.mockResolvedValue(synced())
    const { rerender } = setup()
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    syncVault.mockClear()
    rerender({ editSignal: "a" })
    await act(async () => vi.advanceTimersByTimeAsync(90_000))
    rerender({ editSignal: "ab" })
    await act(async () => vi.advanceTimersByTimeAsync(90_000))
    expect(syncVault).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(syncVault).toHaveBeenCalledTimes(1)
  })

  it("reloads after bringing changes and flushes autosaves first", async () => {
    syncVault.mockResolvedValue(synced(true))
    const { result, onPulled, flushPending } = setup({ auto: false })
    await act(async () => {
      await result.current.runSync("manual")
    })
    expect(flushPending).toHaveBeenCalled()
    expect(onPulled).toHaveBeenCalledTimes(1)
  })

  it("pauses automatic sync after a conflict until a sync by hand", async () => {
    syncVault.mockResolvedValue(conflict)
    const { result } = setup()
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    expect(getSyncStatus().paused).toBe(true)
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000))
    expect(syncVault).toHaveBeenCalledTimes(1)

    syncVault.mockResolvedValue(synced())
    await act(async () => {
      await result.current.runSync("manual")
    })
    expect(getSyncStatus().paused).toBe(false)
  })

  it("reports an outage once, not on every automatic run", async () => {
    syncVault.mockResolvedValue(offline)
    setup()
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000))
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000))
    expect(syncVault).toHaveBeenCalledTimes(3)
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast.mock.calls[0][0]).toContain("Could not reach the shared copy")
    await flush()
  })
})
