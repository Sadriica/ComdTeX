// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { WasmTexEngine, _resetSharedEngine } from "./wasmTex"

// A minimal in-process Worker stand-in that the engine's WorkerFactory can
// produce. We do NOT exercise actual WASM here — we only verify the message
// protocol contract between WasmTexEngine and its worker.

interface Listener<T = unknown> { (ev: { data: T }): void }

class FakeWorker {
  private msgListeners: Listener[] = []
  private errListeners: Array<(e: Event) => void> = []
  public terminated = false
  public received: unknown[] = []

  // Hook installed by the test to script the worker's response.
  public onPosted?: (msg: unknown, post: (reply: unknown) => void) => void

  addEventListener(type: string, fn: Listener | ((e: Event) => void)) {
    if (type === "message") this.msgListeners.push(fn as Listener)
    else if (type === "error") this.errListeners.push(fn as (e: Event) => void)
  }

  removeEventListener(_type: string, _fn: unknown) { /* not exercised */ }

  postMessage(msg: unknown) {
    this.received.push(msg)
    const post = (reply: unknown) => {
      // schedule async to mimic real Worker
      queueMicrotask(() => {
        for (const fn of this.msgListeners) fn({ data: reply })
      })
    }
    if (this.onPosted) this.onPosted(msg, post)
  }

  terminate() { this.terminated = true }
}

afterEach(() => {
  _resetSharedEngine()
})

describe("WasmTexEngine — init protocol", () => {
  it("resolves init() when worker posts ready", async () => {
    const fake = new FakeWorker()
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string }
      if (m.type === "init") post({ type: "ready" })
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await expect(eng.init({ engineUrl: null })).resolves.toBeUndefined()

    // Init message should carry the engineUrl override (here, null).
    expect(fake.received[0]).toMatchObject({ type: "init", engineUrl: null })
  })

  it("init() is idempotent — multiple calls return the same promise", () => {
    const fake = new FakeWorker()
    fake.onPosted = (_msg, post) => post({ type: "ready" })
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    const p1 = eng.init()
    const p2 = eng.init()
    expect(p1).toBe(p2)
  })

  it("rejects init() when worker reports init_error", async () => {
    const fake = new FakeWorker()
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string }
      if (m.type === "init") post({ type: "init_error", error: "boom" })
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await expect(eng.init()).rejects.toThrow(/boom/)
  })
})

describe("WasmTexEngine — compile protocol", () => {
  it("compile() resolves with the worker's result message", async () => {
    const fake = new FakeWorker()
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string; id?: string }
      if (m.type === "init") post({ type: "ready" })
      if (m.type === "compile") {
        post({ type: "progress", id: m.id, message: "compiling" })
        const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF"
        post({ type: "result", id: m.id, status: "ok", pdf, log: "ok\n" })
      }
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await eng.init()

    const progresses: string[] = []
    const out = await eng.compile("\\documentclass{article}\\begin{document}hi\\end{document}", {
      onProgress: (m) => progresses.push(m),
    })
    expect(out.status).toBe("ok")
    expect(out.pdf).toBeInstanceOf(Uint8Array)
    expect(out.pdf?.[0]).toBe(0x25)
    expect(out.log).toBe("ok\n")
    expect(progresses).toContain("compiling")
  })

  it("compile() returns status:error with log when worker reports failure", async () => {
    const fake = new FakeWorker()
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string; id?: string }
      if (m.type === "init") post({ type: "ready" })
      if (m.type === "compile") {
        post({ type: "result", id: m.id, status: "error", pdf: null, log: "missing $" })
      }
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await eng.init()
    const out = await eng.compile("invalid")
    expect(out.status).toBe("error")
    expect(out.pdf).toBeNull()
    expect(out.log).toMatch(/missing/)
  })

  it("compile() reports unavailable when engine isn't bundled", async () => {
    const fake = new FakeWorker()
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string; id?: string }
      if (m.type === "init") post({ type: "ready" })
      if (m.type === "compile") {
        post({ type: "result", id: m.id, status: "unavailable", pdf: null, log: "no engine" })
      }
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await eng.init({ engineUrl: null })
    const out = await eng.compile("anything")
    expect(out.status).toBe("unavailable")
    expect(out.pdf).toBeNull()
  })

  it("compile() throws if init() was not called", () => {
    const eng = new WasmTexEngine(() => new FakeWorker() as unknown as Worker)
    expect(() => eng.compile("x")).toThrow(/init\(\)/)
  })

  it("each compile gets a unique id", async () => {
    const fake = new FakeWorker()
    const seenIds: string[] = []
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string; id?: string }
      if (m.type === "init") post({ type: "ready" })
      if (m.type === "compile") {
        seenIds.push(m.id!)
        post({ type: "result", id: m.id, status: "ok", pdf: new Uint8Array([1]), log: "" })
      }
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await eng.init()
    await Promise.all([
      eng.compile("a"),
      eng.compile("b"),
      eng.compile("c"),
    ])
    expect(new Set(seenIds).size).toBe(3)
  })
})

describe("WasmTexEngine — dispose", () => {
  it("dispose() terminates worker and rejects pending compiles", async () => {
    const fake = new FakeWorker()
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string }
      if (m.type === "init") post({ type: "ready" })
      // never reply to compile
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await eng.init()
    const compilePromise = eng.compile("x")
    eng.dispose()
    await expect(compilePromise).rejects.toThrow(/dispose/)
    expect(fake.terminated).toBe(true)
  })

  it("dispose() is idempotent", async () => {
    const fake = new FakeWorker()
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string }
      if (m.type === "init") post({ type: "ready" })
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await eng.init()
    eng.dispose()
    expect(() => eng.dispose()).not.toThrow()
  })

  it("compile() throws after dispose()", async () => {
    const fake = new FakeWorker()
    fake.onPosted = (msg, post) => {
      const m = msg as { type: string }
      if (m.type === "init") post({ type: "ready" })
    }
    const eng = new WasmTexEngine(() => fake as unknown as Worker)
    await eng.init()
    eng.dispose()
    expect(() => eng.compile("x")).toThrow(/disposed/)
  })
})
