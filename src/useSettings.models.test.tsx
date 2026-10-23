// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { STORAGE_KEYS } from "./storageKeys"

vi.mock("./secretStore", () => ({
  getSecret: vi.fn(async () => ""),
  setSecret: vi.fn(async () => {}),
  deleteSecret: vi.fn(async () => {}),
}))

import { useSettings } from "./useSettings"

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

describe("saved AI model", () => {
  beforeEach(() => vi.stubGlobal("localStorage", createLocalStorage()))

  it("moves a retired default model forward", () => {
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ aiModel: "claude-3-5-sonnet-latest" }),
    )
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.aiModel).toBe("claude-opus-5-5")
  })

  it("leaves a model the user chose alone", () => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ aiModel: "my-local-llama" }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.aiModel).toBe("my-local-llama")
  })
})
