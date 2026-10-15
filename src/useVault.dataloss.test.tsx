// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const fsMock = vi.hoisted(() => ({
  files: new Map<string, { content: string; mtime: number }>(),
  now: 1_000,
  failWrites: false,
  touch(path: string, content: string) {
    this.now += 1_000
    this.files.set(path, { content, mtime: this.now })
  },
}))

const dialogMock = vi.hoisted(() => ({ choice: "Cancel" }))

function createLocalStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, String(value))),
  }
}

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(async (path: string) => {
    const file = fsMock.files.get(path)
    if (!file) throw new Error(`missing file: ${path}`)
    return file.content
  }),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    if (fsMock.failWrites) throw new Error("disk full")
    fsMock.touch(path, content)
  }),
  stat: vi.fn(async (path: string) => {
    const file = fsMock.files.get(path)
    if (file) return { mtime: new Date(file.mtime) }
    // A directory exists when some file lives under it.
    for (const key of fsMock.files.keys())
      if (key.startsWith(`${path}/`)) return { mtime: new Date(1) }
    throw new Error(`missing: ${path}`)
  }),
  readDir: vi.fn(async (dirPath: string) => {
    const prefix = `${dirPath.replace(/\/+$/, "")}/`
    const seen = new Set<string>()
    for (const path of fsMock.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const [first] = path.slice(prefix.length).split("/")
      if (first) seen.add(first)
    }
    return Array.from(seen).map((name) => {
      const isFile = fsMock.files.has(`${prefix}${name}`)
      return { name, isFile, isDirectory: !isFile }
    })
  }),
  mkdir: vi.fn(),
  remove: vi.fn(async (path: string) => {
    fsMock.files.delete(path)
  }),
  rename: vi.fn(async (from: string, to: string) => {
    const file = fsMock.files.get(from)
    if (file) {
      fsMock.files.delete(from)
      fsMock.touch(to, file.content)
      return
    }
    const moved = Array.from(fsMock.files.keys()).filter((k) => k.startsWith(`${from}/`))
    if (moved.length === 0) throw new Error(`missing: ${from}`)
    for (const key of moved) {
      const entry = fsMock.files.get(key)!
      fsMock.files.delete(key)
      fsMock.files.set(to + key.slice(from.length), entry)
    }
  }),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(async () => dialogMock.choice),
}))

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.join("/").replace(/\/+/g, "/")),
  basename: vi.fn(async (path: string) => path.split("/").filter(Boolean).pop() ?? path),
  dirname: vi.fn(async (path: string) => path.split("/").slice(0, -1).join("/") || "/"),
}))

vi.mock("./toastService", () => ({ showToast: vi.fn() }))
vi.mock("./vaultScope", () => ({ allowVaultDir: vi.fn(async () => {}) }))

import { useVault, resetDraftsCache } from "./useVault"
import { showToast } from "./toastService"

const VAULT = "/vault"
const disk = (path: string) => fsMock.files.get(path)?.content

async function openAndType(
  result: { current: ReturnType<typeof useVault> },
  path: string,
  text: string,
) {
  await act(async () => {
    await result.current.openFilePath(path)
  })
  await waitFor(() => expect(result.current.activeTabPath).toBe(path))
  act(() => {
    result.current.updateContent(text)
  })
}

describe("useVault data-loss guards", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorage())
    resetDraftsCache()
    fsMock.files.clear()
    fsMock.now = Date.now() - 1_000_000
    fsMock.failWrites = false
    dialogMock.choice = "Cancel"
    vi.mocked(showToast).mockClear()
  })

  describe("closeTab", () => {
    it("keeps the tab open when the save fails", async () => {
      fsMock.touch(`${VAULT}/a.md`, "old")
      const { result } = renderHook(() => useVault(60_000))
      await openAndType(result, `${VAULT}/a.md`, "new edits")

      fsMock.failWrites = true
      await act(async () => {
        await result.current.closeTab(`${VAULT}/a.md`)
      })
      expect(result.current.openTabs.map((tb) => tb.path)).toEqual([`${VAULT}/a.md`])
      expect(result.current.hasPendingSave(`${VAULT}/a.md`)).toBe(true)
      expect(showToast).toHaveBeenCalledWith(expect.any(String), "error")

      fsMock.failWrites = false
      await act(async () => {
        await result.current.closeTab(`${VAULT}/a.md`)
      })
      expect(result.current.openTabs).toEqual([])
      expect(disk(`${VAULT}/a.md`)).toBe("new edits")
    })

    it("keeps a dirty tab open when the conflict prompt is cancelled", async () => {
      fsMock.touch(`${VAULT}/a.md`, "old")
      const { result } = renderHook(() => useVault(60_000))
      await openAndType(result, `${VAULT}/a.md`, "mine")

      fsMock.touch(`${VAULT}/a.md`, "changed elsewhere")
      dialogMock.choice = "Cancel"
      await act(async () => {
        await result.current.closeTab(`${VAULT}/a.md`)
      })
      expect(result.current.openTabs).toHaveLength(1)
      expect(disk(`${VAULT}/a.md`)).toBe("changed elsewhere")

      // Already conflicted: a second close must not slip through either.
      await act(async () => {
        await result.current.closeTab(`${VAULT}/a.md`)
      })
      expect(result.current.openTabs).toHaveLength(1)
    })
  })

  describe("create / rename / move", () => {
    it("refuses to create over an existing file", async () => {
      fsMock.touch(`${VAULT}/a.md`, "precious")
      const { result } = renderHook(() => useVault())
      await act(async () => {
        await result.current.selectVault(VAULT)
      })
      await act(async () => {
        await result.current.createFile("a", "clobber")
      })
      expect(disk(`${VAULT}/a.md`)).toBe("precious")
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining("a.md"), "error")
    })

    it("refuses to rename or move onto an existing file", async () => {
      fsMock.touch(`${VAULT}/a.md`, "A")
      fsMock.touch(`${VAULT}/b.md`, "B")
      fsMock.touch(`${VAULT}/sub/b.md`, "SUB-B")
      const { result } = renderHook(() => useVault())

      await act(async () => {
        await result.current.renameFile(`${VAULT}/a.md`, "b.md")
      })
      expect(disk(`${VAULT}/a.md`)).toBe("A")
      expect(disk(`${VAULT}/b.md`)).toBe("B")

      await act(async () => {
        await result.current.moveFile(`${VAULT}/b.md`, `${VAULT}/sub`)
      })
      expect(disk(`${VAULT}/b.md`)).toBe("B")
      expect(disk(`${VAULT}/sub/b.md`)).toBe("SUB-B")
    })

    it("re-keys open tabs and pending edits when a folder is renamed", async () => {
      fsMock.touch(`${VAULT}/dir/a.md`, "old")
      const { result } = renderHook(() => useVault(60_000))
      await openAndType(result, `${VAULT}/dir/a.md`, "typed before rename")

      await act(async () => {
        await result.current.renameFile(`${VAULT}/dir`, "dir2")
      })
      expect(result.current.openTabs.map((tb) => tb.path)).toEqual([`${VAULT}/dir2/a.md`])
      expect(result.current.activeTabPath).toBe(`${VAULT}/dir2/a.md`)
      expect(result.current.openTabs[0].content).toBe("typed before rename")

      await act(async () => {
        await result.current.flushPending()
      })
      expect(disk(`${VAULT}/dir2/a.md`)).toBe("typed before rename")
      expect(fsMock.files.has(`${VAULT}/dir/a.md`)).toBe(false)
    })

    it("re-keys open tabs when a folder is moved", async () => {
      fsMock.touch(`${VAULT}/dir/a.md`, "old")
      fsMock.touch(`${VAULT}/target/keep.md`, "keep")
      const { result } = renderHook(() => useVault(60_000))
      await openAndType(result, `${VAULT}/dir/a.md`, "edit")

      await act(async () => {
        await result.current.moveFile(`${VAULT}/dir`, `${VAULT}/target`)
      })
      expect(result.current.openTabs.map((tb) => tb.path)).toEqual([`${VAULT}/target/dir/a.md`])
      await act(async () => {
        await result.current.flushPending()
      })
      expect(disk(`${VAULT}/target/dir/a.md`)).toBe("edit")
    })
  })

  describe("vault switch", () => {
    it("flushes pending edits of the previous vault before switching", async () => {
      fsMock.touch(`${VAULT}/a.md`, "old")
      const { result } = renderHook(() => useVault(60_000))
      await openAndType(result, `${VAULT}/a.md`, "unsaved before switch")

      await act(async () => {
        await result.current.selectVault("/other-vault")
      })
      expect(disk(`${VAULT}/a.md`)).toBe("unsaved before switch")
    })
  })

  describe("replaceInVault", () => {
    it("inserts a literal replacement without expanding dollar patterns", async () => {
      fsMock.touch(`${VAULT}/a.md`, "price: cost")
      const { result } = renderHook(() => useVault())
      await act(async () => {
        await result.current.selectVault(VAULT)
      })
      await waitFor(() => expect(result.current.tree.length).toBeGreaterThan(0))

      let count = 0
      await act(async () => {
        count = await result.current.replaceInVault("cost", "$$5 and $& and $1")
      })
      expect(count).toBe(1)
      expect(disk(`${VAULT}/a.md`)).toBe("price: $$5 and $& and $1")
    })

    it("still expands group references in regex mode", async () => {
      fsMock.touch(`${VAULT}/a.md`, "ab")
      const { result } = renderHook(() => useVault())
      await act(async () => {
        await result.current.selectVault(VAULT)
      })
      await waitFor(() => expect(result.current.tree.length).toBeGreaterThan(0))
      await act(async () => {
        await result.current.replaceInVault("(a)(b)", "$2$1", { regex: true })
      })
      expect(disk(`${VAULT}/a.md`)).toBe("ba")
    })

    it("applies the replacement to unsaved edits instead of discarding them", async () => {
      fsMock.touch(`${VAULT}/a.md`, "foo on disk")
      const { result } = renderHook(() => useVault(60_000))
      await act(async () => {
        await result.current.selectVault(VAULT)
      })
      await waitFor(() => expect(result.current.tree.length).toBeGreaterThan(0))
      await openAndType(result, `${VAULT}/a.md`, "foo typed but unsaved, plus new words")

      await act(async () => {
        await result.current.replaceInVault("foo", "bar")
      })
      expect(disk(`${VAULT}/a.md`)).toBe("bar typed but unsaved, plus new words")
      expect(result.current.openFile?.content).toBe("bar typed but unsaved, plus new words")
    })
  })

  describe("restoreTabs drafts", () => {
    function seed(draftSavedAt: (mtime: number) => number) {
      fsMock.touch(`${VAULT}/a.md`, "disk text")
      const mtime = fsMock.files.get(`${VAULT}/a.md`)!.mtime
      localStorage.setItem("comdtex_vault", VAULT)
      localStorage.setItem("comdtex_tabs", JSON.stringify([`${VAULT}/a.md`]))
      localStorage.setItem(
        "comdtex_drafts",
        JSON.stringify([
          { path: `${VAULT}/a.md`, content: "draft text", savedAt: draftSavedAt(mtime) },
        ]),
      )
      resetDraftsCache()
    }

    it("restores a newer draft as pending content that reaches disk", async () => {
      seed((mtime) => mtime + 500)
      const { result } = renderHook(() => useVault(60_000))
      await act(async () => {
        await result.current.loadVault()
      })
      await waitFor(() => expect(result.current.openFile?.content).toBe("draft text"))
      expect(result.current.openFile?.isDirty).toBe(true)
      expect(result.current.hasPendingSave(`${VAULT}/a.md`)).toBe(true)
      // Not masked: the baseline is the real disk mtime, so an external change
      // after this point is still detected.
      expect(result.current.openFile?.cachedMtime).toBe(fsMock.files.get(`${VAULT}/a.md`)!.mtime)

      await act(async () => {
        await result.current.flushPending()
      })
      expect(disk(`${VAULT}/a.md`)).toBe("draft text")
    })

    it("discards a draft older than the file on disk", async () => {
      seed((mtime) => mtime - 500)
      const { result } = renderHook(() => useVault(60_000))
      await act(async () => {
        await result.current.loadVault()
      })
      await waitFor(() => expect(result.current.openFile?.content).toBe("disk text"))
      expect(result.current.openFile?.isDirty).toBe(false)
      expect(result.current.hasPendingSave(`${VAULT}/a.md`)).toBe(false)
      expect(disk(`${VAULT}/a.md`)).toBe("disk text")
    })
  })

  describe("getLiveContent", () => {
    it("returns the newest keystrokes before React state catches up", async () => {
      fsMock.touch(`${VAULT}/a.md`, "old")
      const { result } = renderHook(() => useVault(60_000))
      await openAndType(result, `${VAULT}/a.md`, "first")
      act(() => {
        result.current.updateContent("second")
      })
      expect(result.current.getLiveContent(`${VAULT}/a.md`)).toBe("second")
    })
  })
})
