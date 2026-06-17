// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const fsMock = vi.hoisted(() => ({
  files: new Map<string, { content: string; mtime: number }>(),
  now: 1_000,
  touch(path: string, content: string) {
    this.now += 1_000
    this.files.set(path, { content, mtime: this.now })
  },
}))

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

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path
}

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(async (path: string) => {
    const file = fsMock.files.get(path)
    if (!file) throw new Error(`missing file: ${path}`)
    return file.content
  }),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    fsMock.touch(path, content)
  }),
  stat: vi.fn(async (path: string) => {
    const file = fsMock.files.get(path)
    if (!file) throw new Error(`missing file: ${path}`)
    return { mtime: new Date(file.mtime) }
  }),
  readDir: vi.fn(async (dirPath: string) => {
    const prefix = `${dirPath.replace(/\/+$/, "")}/`
    const seen = new Set<string>()

    for (const path of fsMock.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      const [first] = rest.split("/")
      if (first) seen.add(first)
    }

    return Array.from(seen).map((name) => {
      const fullPath = `${prefix}${name}`
      const isFile = fsMock.files.has(fullPath)
      return { name, isFile, isDirectory: !isFile }
    })
  }),
  mkdir: vi.fn(),
  remove: vi.fn(async (path: string) => {
    fsMock.files.delete(path)
  }),
  rename: vi.fn(async (from: string, to: string) => {
    const file = fsMock.files.get(from)
    if (!file) throw new Error(`missing file: ${from}`)
    fsMock.files.delete(from)
    fsMock.touch(to, file.content)
  }),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.join("/").replace(/\/+/g, "/")),
  basename: vi.fn(async (path: string) => basename(path)),
  dirname: vi.fn(async (path: string) => path.split("/").slice(0, -1).join("/") || "/"),
}))

vi.mock("./toastService", () => ({
  showToast: vi.fn(),
}))

import { useVault } from "./useVault"
import { readTextFile } from "@tauri-apps/plugin-fs"

const VAULT = "/vault"

describe("useVault CMDX integration", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorage())
    localStorage.clear()
    fsMock.files.clear()
    fsMock.now = 1_000
  })

  it("opens and saves Markdown, LaTeX, and BibTeX through the storage gateway", async () => {
    fsMock.touch(`${VAULT}/note.md`, "> [!note] Title\n> Body")
    fsMock.touch(`${VAULT}/paper.tex`, "\\begin{theorem}[Named]\\label{thm:named}\nBody\n\\end{theorem}")
    fsMock.touch(`${VAULT}/refs.bib`, "@article{knuth84,\n  title = {Literate Programming}\n}")

    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.openFilePath(`${VAULT}/note.md`)
    })
    await waitFor(() => expect(result.current.openFile?.path).toBe(`${VAULT}/note.md`))
    expect(result.current.openFile?.content).toBe(":::note[Title]\nBody\n:::")
    expect(result.current.openFile?.mode).toBe("md")

    await act(async () => {
      await result.current.saveFile(`${VAULT}/note.md`, ":::theorem[Result]\nLet x.\n:::")
    })
    expect(fsMock.files.get(`${VAULT}/note.md`)?.content).toContain("> [!abstract] Theorem: Result")
    expect(fsMock.files.get(`${VAULT}/note.md`)?.content).toContain("> Let x.")

    await act(async () => {
      await result.current.openFilePath(`${VAULT}/paper.tex`)
    })
    await waitFor(() => expect(result.current.openFile?.path).toBe(`${VAULT}/paper.tex`))
    expect(result.current.openFile?.content).toContain(":::theorem[Named] {#thm:named}")
    expect(result.current.openFile?.mode).toBe("tex")

    await act(async () => {
      await result.current.saveFile(`${VAULT}/paper.tex`, "mat(1, 2, 3, 4)")
    })
    expect(fsMock.files.get(`${VAULT}/paper.tex`)?.content).toBe("\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}")

    await act(async () => {
      await result.current.openFilePath(`${VAULT}/refs.bib`)
    })
    await waitFor(() => expect(result.current.openFile?.path).toBe(`${VAULT}/refs.bib`))
    expect(result.current.openFile?.content).toContain("@article{knuth84")
    expect(result.current.openFile?.mode).toBe("md")

    await act(async () => {
      await result.current.saveFile(`${VAULT}/refs.bib`, "table(A, B)")
    })
    expect(fsMock.files.get(`${VAULT}/refs.bib`)?.content).toBe("table(A, B)")
  })

  it("restores saved tabs from localStorage using CMDX editor content", async () => {
    const mdPath = `${VAULT}/note.md`
    const texPath = `${VAULT}/paper.tex`
    const bibPath = `${VAULT}/refs.bib`
    fsMock.touch(mdPath, "> [!warning] Careful\n> Check signs")
    fsMock.touch(texPath, "\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}")
    fsMock.touch(bibPath, "@book{euclid,\n  title = {Elements}\n}")
    localStorage.setItem("comdtex_vault", VAULT)

    const { result } = renderHook(() => useVault())
    localStorage.setItem("comdtex_tabs", JSON.stringify([mdPath, texPath, bibPath, "/other/outside.md"]))
    localStorage.setItem("comdtex_active", texPath)

    await act(async () => {
      await result.current.loadVault()
    })

    await waitFor(() => expect(result.current.openTabs).toHaveLength(3))
    expect(result.current.activeTabPath).toBe(texPath)
    expect(result.current.openTabs.find((tab) => tab.path === mdPath)?.content).toBe(
      ":::warning[Careful]\nCheck signs\n:::",
    )
    expect(result.current.openTabs.find((tab) => tab.path === texPath)?.content).toBe("mat(1, 2, 3, 4)")
    expect(result.current.openTabs.find((tab) => tab.path === bibPath)?.content).toContain("@book{euclid")
  })

  it("searches and replaces closed files using CMDX editor content", async () => {
    const mdPath = `${VAULT}/note.md`
    fsMock.touch(mdPath, "> [!abstract] Theorem: Main\n> Body")

    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.selectVault(VAULT)
    })
    await waitFor(() => expect(result.current.tree.length).toBeGreaterThan(0))

    const hits = await result.current.search(":::theorem")
    expect(hits).toHaveLength(1)
    expect(hits[0].content).toContain(":::theorem")

    await act(async () => {
      const count = await result.current.replaceInVault(":::theorem[Main]", ":::lemma[Changed]")
      expect(count).toBe(1)
    })

    expect(fsMock.files.get(mdPath)?.content).toContain("> [!abstract] Lemma: Changed")
  })

  it("migrates a pending autosave across renameFile (no orphaned old file)", async () => {
    const oldPath = `${VAULT}/draft.md`
    const newPath = `${VAULT}/final.md`
    fsMock.touch(oldPath, "original")

    const { result } = renderHook(() => useVault({ autoSaveMs: 20 }))

    await act(async () => {
      await result.current.selectVault(VAULT)
    })
    await act(async () => {
      await result.current.openFilePath(oldPath)
    })
    await waitFor(() => expect(result.current.openFile?.path).toBe(oldPath))

    // Queue a debounced autosave keyed to the OLD path...
    act(() => {
      result.current.updateContent("edited in flight")
    })
    // ...then rename before the timer fires.
    await act(async () => {
      await result.current.renameFile(oldPath, "final.md")
    })

    // Wait past the debounce so any queued save actually fires.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    // The stale save must NOT recreate the old file...
    expect(fsMock.files.has(oldPath)).toBe(false)
    // ...and the in-flight edit must land on the new path.
    expect(fsMock.files.get(newPath)?.content).toBe("edited in flight")
    expect(result.current.openTabs.find((tab) => tab.path === newPath)).toBeTruthy()
  })

  it("cancels a pending autosave when replaceInVault rewrites an open file", async () => {
    const mdPath = `${VAULT}/note.md`
    fsMock.touch(mdPath, "alpha beta")

    const { result } = renderHook(() => useVault({ autoSaveMs: 20 }))

    await act(async () => {
      await result.current.selectVault(VAULT)
    })
    await act(async () => {
      await result.current.openFilePath(mdPath)
    })
    await waitFor(() => expect(result.current.openFile?.path).toBe(mdPath))

    // Queue a stale autosave that would clobber the replacement if not cancelled.
    act(() => {
      result.current.updateContent("alpha beta STALE")
    })
    await act(async () => {
      const count = await result.current.replaceInVault("beta", "gamma")
      expect(count).toBe(1)
    })

    // Wait past the debounce; the cancelled stale save must not fire.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    expect(fsMock.files.get(mdPath)?.content).toBe("alpha gamma")
  })

  it("does not read binary preview files during vault search or replace", async () => {
    const mdPath = `${VAULT}/note.md`
    const pdfPath = `${VAULT}/paper.pdf`
    fsMock.touch(mdPath, "needle")
    fsMock.touch(pdfPath, "%PDF-1.7 binary-ish needle")

    const { result } = renderHook(() => useVault())

    await act(async () => {
      await result.current.selectVault(VAULT)
    })
    await waitFor(() => expect(result.current.tree.length).toBeGreaterThan(0))

    vi.mocked(readTextFile).mockClear()
    const hits = await result.current.search("needle")

    expect(hits).toHaveLength(1)
    expect(hits[0].filePath).toBe(mdPath)
    expect(vi.mocked(readTextFile)).not.toHaveBeenCalledWith(pdfPath)

    vi.mocked(readTextFile).mockClear()
    await act(async () => {
      const count = await result.current.replaceInVault("needle", "changed")
      expect(count).toBe(1)
    })

    expect(fsMock.files.get(mdPath)?.content).toBe("changed")
    expect(fsMock.files.get(pdfPath)?.content).toBe("%PDF-1.7 binary-ish needle")
    expect(vi.mocked(readTextFile)).not.toHaveBeenCalledWith(pdfPath)
  })
})
