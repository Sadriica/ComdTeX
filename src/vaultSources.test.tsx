// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { VaultSearchIndex, type SearchCandidate } from "./searchIndex"
import { loadDiskSources, mergeSources } from "./vaultSources"
import { toggleTaskInContent } from "./generators"
import GraphPanel, { buildGraph } from "./GraphPanel"
import TodoPanel from "./TodoPanel"
import type { FileNode, OpenFile } from "./types"

/** Candidate backed by an in-memory "disk"; counts real reads. */
function disk(files: Record<string, string>, reads: string[] = []): SearchCandidate[] {
  return Object.entries(files).map(([path, content]) => ({
    path,
    name: path.split("/").pop()!,
    ext: "md",
    getMtime: async () => 1,
    readContent: async () => {
      reads.push(path)
      return content
    },
  }))
}

function fileNode(path: string): FileNode {
  const name = path.split("/").pop()!
  return { name, path, type: "file", ext: "md" } as FileNode
}

function tab(path: string, content: string): OpenFile {
  return { path, name: path.split("/").pop()!, content, dirty: false } as unknown as OpenFile
}

const FILES = {
  "/v/a.md": "# A\nsee [[b]]\n- [ ] closed todo\n",
  "/v/b.md": "# B\nback to [[a]] and [[c]]\n",
  "/v/c.md": "# C\n- [x] done in c\n",
}

describe("loadDiskSources", () => {
  it("reads closed files once and serves repeats from the index", async () => {
    const reads: string[] = []
    const index = new VaultSearchIndex()
    const first = await loadDiskSources(index, disk(FILES, reads))
    expect([...first.keys()]).toEqual(Object.keys(FILES))
    expect(reads).toHaveLength(3)
    await loadDiskSources(index, disk(FILES, reads))
    expect(reads).toHaveLength(3)
  })

  it("skips files whose mtime or read fails", async () => {
    const cands = disk(FILES)
    cands[0].getMtime = async () => undefined
    cands[1].readContent = async () => {
      throw new Error("gone")
    }
    const out = await loadDiskSources(new VaultSearchIndex(), cands)
    expect([...out.keys()]).toEqual(["/v/c.md"])
  })
})

describe("mergeSources", () => {
  it("lets an open tab override the disk text", () => {
    const merged = mergeSources(
      new Map([
        ["/v/a.md", "disk"],
        ["/v/b.md", "b"],
      ]),
      [{ path: "/v/a.md", content: "unsaved edit" }],
    )
    expect(merged).toEqual([
      { path: "/v/a.md", content: "unsaved edit" },
      { path: "/v/b.md", content: "b" },
    ])
  })

  it("keeps tabs that are not on disk yet, and works before the load finishes", () => {
    expect(mergeSources(null, [{ path: "/v/new.md", content: "x" }])).toEqual([
      { path: "/v/new.md", content: "x" },
    ])
  })
})

describe("buildGraph over the whole vault", () => {
  const tree = Object.keys(FILES).map(fileNode)
  const pairs = (edges: { source: string; target: string }[]) =>
    edges.map((e) => [e.source, e.target].sort().join("|")).sort()

  it("draws edges from closed files", () => {
    const sources = mergeSources(new Map(Object.entries(FILES)), [])
    expect(pairs(buildGraph(tree, sources).edges)).toEqual(["/v/a.md|/v/b.md", "/v/b.md|/v/c.md"])
  })

  it("lets an unsaved tab edit change the links", () => {
    const sources = mergeSources(new Map(Object.entries(FILES)), [
      { path: "/v/b.md", content: "# B\nno links now\n" },
    ])
    expect(pairs(buildGraph(tree, sources).edges)).toEqual(["/v/a.md|/v/b.md"])
  })

  it("reads tags from closed files", () => {
    const sources = mergeSources(new Map([["/v/a.md", "---\ntags: [Math]\n---\nbody"]]), [])
    expect(buildGraph([fileNode("/v/a.md")], sources).nodes[0].tags).toEqual(["math"])
  })
})

describe("toggleTaskInContent", () => {
  it("flips the checkbox on the matching line only", () => {
    expect(toggleTaskInContent("x\n- [ ] a\n- [ ] a\n", 3, "a")).toBe("x\n- [ ] a\n- [x] a\n")
    expect(toggleTaskInContent("- [x] a", 1, "a")).toBe("- [ ] a")
  })

  it("refuses a stale line instead of touching another one", () => {
    expect(toggleTaskInContent("- [ ] changed", 1, "a")).toBeNull()
    expect(toggleTaskInContent("- [ ] a", 5, "a")).toBeNull()
  })
})

describe("panels", () => {
  it("TodoPanel lists tasks of closed files and prefers the open tab text", async () => {
    const load = async () => new Map(Object.entries(FILES))
    render(
      <TodoPanel
        openTabs={[tab("/v/c.md", "# C\n- [ ] edited in tab\n")]}
        loadDiskSources={load}
        onNavigate={() => {}}
        onToggle={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByText("closed todo")).toBeTruthy())
    expect(screen.getByText("edited in tab")).toBeTruthy()
    expect(screen.queryByText("done in c")).toBeNull()
  })

  it("GraphPanel counts edges from closed files", async () => {
    const load = async () => new Map(Object.entries(FILES))
    const { container } = render(
      <GraphPanel
        tree={Object.keys(FILES).map(fileNode)}
        openTabs={[]}
        loadDiskSources={load}
        activePath={null}
        onOpenFile={() => {}}
      />,
    )
    await waitFor(() =>
      expect(container.querySelector(".graph-info")?.textContent).toMatch(/\b2\b.*(enlaces|links)/),
    )
    await waitFor(() =>
      expect(container.querySelector(".graph-panel")?.getAttribute("data-layout")).toBe("done"),
    )
  })
})
