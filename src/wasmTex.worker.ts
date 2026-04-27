// SwiftLaTeX-style engine worker.
//
// The worker boots a WASM LaTeX engine inside its own thread. The engine
// runtime (the JS glue + WASM binary) is fetched at runtime — it is NOT
// imported statically — so that builds without the runtime still produce a
// valid bundle and gracefully report "unavailable" at runtime.
//
// SwiftLaTeX exposes a `PdfTeXEngine` class (via the global scope) once its
// glue script is loaded. We re-create that surface here and translate it to
// our message protocol. If the glue fails to load, we keep the worker alive
// and answer all compile requests with `status: "unavailable"`.
//
// Message protocol — see `wasmTex.ts` for the canonical shapes.

/// <reference lib="webworker" />

interface SwiftLatexEngine {
  loadEngine(): Promise<void>
  setEngineMainFile(name: string): void
  writeMemFSFile(filename: string, data: string | Uint8Array): void
  makeMemFSFolder(path: string): void
  flushCache(): void
  closeWorker?(): void
  compileLaTeX(): Promise<{
    status: number
    log: string
    pdf?: Uint8Array
  }>
}

type EngineCtor = new () => SwiftLatexEngine

interface InitMessage {
  type: "init"
  engineUrl: string | null
}

interface CompileMessage {
  type: "compile"
  id: string
  tex: string
  mainFile?: string
  files?: Record<string, string>
}

interface DisposeMessage {
  type: "dispose"
}

type IncomingMessage = InitMessage | CompileMessage | DisposeMessage

// Globals on the worker scope where SwiftLaTeX glue scripts publish their
// engine constructors.
declare const self: DedicatedWorkerGlobalScope & {
  PdfTeXEngine?: EngineCtor
  XeTeXEngine?: EngineCtor
}

let engine: SwiftLatexEngine | null = null
let unavailableReason = ""

function post(msg: unknown, transfer?: Transferable[]) {
  if (transfer && transfer.length) {
    self.postMessage(msg, transfer)
  } else {
    self.postMessage(msg)
  }
}

async function init(engineUrl: string | null): Promise<void> {
  if (engineUrl == null) {
    unavailableReason = "engine_disabled"
    post({ type: "ready" })
    return
  }
  try {
    // SwiftLaTeX glue scripts are classic scripts that register a global
    // constructor (e.g. `PdfTeXEngine`). importScripts is the cleanest way
    // to load them inside a module worker on Chromium-based webviews.
    const scope = self as unknown as { importScripts?: (url: string) => void }
    if (typeof scope.importScripts !== "function") {
      throw new Error("importScripts not supported")
    }
    scope.importScripts(engineUrl)
    const Ctor = self.PdfTeXEngine ?? self.XeTeXEngine
    if (!Ctor) {
      throw new Error("engine constructor not found on global scope")
    }
    const inst = new Ctor()
    await inst.loadEngine()
    engine = inst
    post({ type: "ready" })
  } catch (err) {
    unavailableReason = err instanceof Error ? err.message : String(err)
    // We still notify "ready" so the caller can proceed — compiles will
    // resolve with status: "unavailable".
    post({ type: "ready" })
  }
}

async function compile(msg: CompileMessage): Promise<void> {
  const { id } = msg
  if (!engine) {
    post({
      type: "result",
      id,
      status: "unavailable",
      pdf: null,
      log: `WASM TeX engine unavailable: ${unavailableReason || "no engine loaded"}`,
    })
    return
  }
  try {
    post({ type: "progress", id, message: "Writing source files" })
    const mainFile = msg.mainFile ?? "main.tex"
    engine.writeMemFSFile(mainFile, msg.tex)
    if (msg.files) {
      for (const [name, content] of Object.entries(msg.files)) {
        engine.writeMemFSFile(name, content)
      }
    }
    engine.setEngineMainFile(mainFile)

    post({ type: "progress", id, message: "Compiling LaTeX" })
    const result = await engine.compileLaTeX()
    if (result.status === 0 && result.pdf && result.pdf.byteLength > 0) {
      // Transfer the underlying buffer to avoid copying.
      const buf = result.pdf.buffer
      post({
        type: "result",
        id,
        status: "ok",
        pdf: result.pdf,
        log: result.log ?? "",
      }, [buf as ArrayBuffer])
    } else {
      post({
        type: "result",
        id,
        status: "error",
        pdf: null,
        log: result.log ?? "compilation failed",
      })
    }
  } catch (err) {
    post({
      type: "result",
      id,
      status: "error",
      pdf: null,
      log: err instanceof Error ? err.message : String(err),
    })
  }
}

self.addEventListener("message", (ev: MessageEvent<IncomingMessage>) => {
  const msg = ev.data
  if (!msg || typeof msg !== "object") return
  if (msg.type === "init") {
    void init(msg.engineUrl)
    return
  }
  if (msg.type === "compile") {
    void compile(msg)
    return
  }
  if (msg.type === "dispose") {
    try {
      engine?.closeWorker?.()
    } catch { /* ignore */ }
    engine = null
    self.close()
    return
  }
})

export {} // make this a module
