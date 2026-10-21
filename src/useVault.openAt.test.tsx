// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const fsMock = vi.hoisted(() => ({ files: new Map<string, string>() }))

function createLocalStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, String(value)),
  }
}

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(async (path: string) => {
    const text = fsMock.files.get(path)
    if (text === undefined) throw new Error(`missing file: ${path}`)
    return text
  }),
  writeTextFile: vi.fn(async () => {}),
  stat: vi.fn(async () => ({ mtime: new Date(1) })),
  readDir: vi.fn(async () => []),
  mkdir: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
}))
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(async () => "Cancel"),
}))
vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.join("/").replace(/\/+/g, "/")),
  basename: vi.fn(async (path: string) => path.split("/").filter(Boolean).pop() ?? path),
  dirname: vi.fn(async (path: string) => path.split("/").slice(0, -1).join("/") || "/"),
}))
vi.mock("./toastService", () => ({ showToast: vi.fn() }))
vi.mock("./vaultScope", () => ({ allowVaultDir: vi.fn(async () => {}) }))

import { useVault, resetDraftsCache } from "./useVault"

const A = "/vault/a.md"
const B = "/vault/b.md"

describe("useVault open-at-position", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorage())
    resetDraftsCache()
    fsMock.files.clear()
    fsMock.files.set(A, "# A\n")
    fsMock.files.set(B, "# B\n\nline three\n")
  })

  async function withAOpen() {
    const hook = renderHook(() => useVault(60_000))
    await act(async () => {
      await hook.result.current.openFilePath(A)
    })
    await waitFor(() => expect(hook.result.current.activeTabPath).toBe(A))
    return hook
  }

  it("opens the file and hands its target to the editor once", async () => {
    const { result } = await withAOpen()
    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.openFileAt(B, 3, 5)
    })
    expect(outcome).toBe("opened")
    await waitFor(() => expect(result.current.activeTabPath).toBe(B))

    expect(result.current.takePendingReveal(A)).toBeNull()
    expect(result.current.takePendingReveal(B)).toEqual({ line: 3, column: 5 })
    // Taken: a later remount of the same tab must not jump again.
    expect(result.current.takePendingReveal(B)).toBeNull()
  })

  it("defaults the column to 1", async () => {
    const { result } = await withAOpen()
    await act(async () => {
      await result.current.openFileAt(B, 2)
    })
    expect(result.current.takePendingReveal(B)).toEqual({ line: 2, column: 1 })
  })

  it("leaves a jump inside the current file to the caller", async () => {
    const { result } = await withAOpen()
    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.openFileAt(A, 1, 1)
    })
    expect(outcome).toBe("current")
    expect(result.current.takePendingReveal(A)).toBeNull()
  })

  it("switches to an already open tab and still offers the target", async () => {
    const { result } = await withAOpen()
    await act(async () => {
      await result.current.openFilePath(B)
    })
    await waitFor(() => expect(result.current.activeTabPath).toBe(B))
    await act(async () => {
      await result.current.openFileAt(A, 1, 2)
    })
    await waitFor(() => expect(result.current.activeTabPath).toBe(A))
    expect(result.current.takePendingReveal(A)).toEqual({ line: 1, column: 2 })
  })

  it("drops a target that was never picked up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const { result } = await withAOpen()
      await act(async () => {
        await result.current.openFileAt(B, 3)
      })
      vi.setSystemTime(Date.now() + 11_000)
      expect(result.current.takePendingReveal(B)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
