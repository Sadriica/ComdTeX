import { describe, expect, it } from "vitest"
import {
  LabelScanner,
  createWorkerBackend,
  syncLabelBackend,
  type LabelScanBackend,
  type LabelScanFile,
} from "./labelScanner"
import { scanFileLabels, scanStructuralLabels } from "./structuralLabels"

const file = (path: string, content: string): LabelScanFile => ({
  path,
  name: path.split("/").pop()!,
  content,
})

describe("scanFileLabels", () => {
  it("collects labels and references with line numbers", () => {
    const scan = scanFileLabels(
      file("/v/a.md", "$$x$$ {#eq:one}\nsee @eq:one and @fig:nope\n![c](p.png) {#fig:pic}"),
    )
    expect(scan.labels.map((l) => [l.id, l.line])).toEqual([
      ["eq:one", 1],
      ["fig:pic", 3],
    ])
    expect(scan.references.map((r) => [r.id, r.line])).toEqual([
      ["eq:one", 2],
      ["fig:nope", 2],
    ])
  })

  it("ignores unknown kinds and empty names", () => {
    const scan = scanFileLabels(file("/v/a.md", "{#zzz:x} {#eq:} @zzz:y"))
    expect(scan.labels).toEqual([])
    expect(scan.references).toEqual([])
  })
})

describe("LabelScanner", () => {
  const files = [file("/v/a.md", "{#eq:a}"), file("/v/b.md", "@eq:a @eq:missing")]

  it("matches the one-shot scanStructuralLabels result", async () => {
    const index = await new LabelScanner().update(files)
    expect(index).toEqual(scanStructuralLabels(files))
    expect(index!.broken.map((r) => r.id)).toEqual(["eq:missing"])
  })

  it("rescans only files whose content changed", async () => {
    const scanner = new LabelScanner()
    await scanner.update(files)
    expect(scanner.lastScannedCount).toBe(2)
    await scanner.update([files[0], file("/v/b.md", "@eq:a")])
    expect(scanner.lastScannedCount).toBe(1)
    const index = await scanner.update([files[0], file("/v/b.md", "@eq:a")])
    expect(scanner.lastScannedCount).toBe(0)
    expect(index!.broken).toEqual([])
  })

  it("forgets removed files and picks up added ones", async () => {
    const scanner = new LabelScanner()
    await scanner.update(files)
    const index = await scanner.update([files[1], file("/v/c.md", "{#eq:missing}")])
    expect(index!.labels.map((l) => l.id)).toEqual(["eq:missing"])
    // eq:a was defined only in the removed a.md, so b.md's reference is now broken
    expect(index!.broken.map((r) => r.id)).toEqual(["eq:a"])
    expect(scanner.lastScannedCount).toBe(1)
  })

  it("drops a stale result when a newer update started", async () => {
    const releases: (() => void)[] = []
    const slow: LabelScanBackend = (batch) =>
      new Promise((resolve) => releases.push(() => resolve(batch.map(scanFileLabels))))
    const scanner = new LabelScanner(slow)
    const first = scanner.update([file("/v/a.md", "{#eq:old}")])
    const second = scanner.update([file("/v/a.md", "{#eq:new}")])
    // finish the newer request first, then the older one
    releases[1]()
    releases[0]()
    expect(await first).toBeNull()
    expect((await second)!.labels.map((l) => l.id)).toEqual(["eq:new"])
  })

  it("does not cache the content of a stale scan", async () => {
    const releases: (() => void)[] = []
    const slow: LabelScanBackend = (batch) =>
      new Promise((resolve) => releases.push(() => resolve(batch.map(scanFileLabels))))
    const scanner = new LabelScanner(slow)
    const stale = scanner.update([file("/v/a.md", "{#eq:old}")])
    scanner.cancel()
    releases[0]()
    expect(await stale).toBeNull()
    const next = scanner.update([file("/v/a.md", "{#eq:old}")])
    expect(scanner.lastScannedCount).toBe(1)
    releases[1]()
    expect((await next)!.labels).toHaveLength(1)
  })
})

describe("createWorkerBackend", () => {
  it("round-trips a request through a worker-like object", async () => {
    const fake = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      onerror: null as (() => void) | null,
      postMessage(msg: { id: number; files: LabelScanFile[] }) {
        queueMicrotask(() =>
          fake.onmessage?.({
            data: { id: msg.id, scans: msg.files.map(scanFileLabels) },
          } as MessageEvent),
        )
      },
    }
    const backend = createWorkerBackend(fake as unknown as Worker)
    const scans = await backend([file("/v/a.md", "{#eq:a}")])
    expect(scans[0].labels[0].id).toBe("eq:a")
  })

  it("falls back to the sync scan on worker error", async () => {
    const fake = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      onerror: null as (() => void) | null,
      postMessage() {
        queueMicrotask(() => fake.onerror?.())
      },
    }
    const backend = createWorkerBackend(fake as unknown as Worker)
    const scans = await backend([file("/v/a.md", "{#eq:a}")])
    expect(scans[0].labels[0].id).toBe("eq:a")
  })

  it("sync backend scans immediately", async () => {
    expect((await syncLabelBackend([file("/v/a.md", "@eq:z")]))[0].references).toHaveLength(1)
  })
})
