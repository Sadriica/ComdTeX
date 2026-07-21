# Bundled LaTeX engine (optional)

This directory hosts the SwiftLaTeX WASM engine artefacts that power the
"Use built-in LaTeX engine (WASM)" setting. When the runtime is not present,
ComdTeX automatically falls back to a locally-installed `tectonic`, `xelatex`,
or `pdflatex`.

## Required files (place here)

| Filename                  | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `PdfTeXEngine.js`         | Wrapper class — registers the `PdfTeXEngine` global  |
| `swiftlatexpdftex.js`     | Inner Emscripten worker (spawned by the wrapper)     |
| `swiftlatexpdftex.wasm`   | pdfTeX WASM binary (loaded by the inner worker)      |
| `swiftlatexxetex.js`      | (optional) XeLaTeX inner worker                       |
| `swiftlatexxetex.wasm`    | (optional) XeLaTeX WASM binary                        |

SwiftLaTeX ships **two** JS files per engine: the high-level `PdfTeXEngine.js`
wrapper, and the inner Emscripten worker `swiftlatexpdftex.js` that the wrapper
spawns. The wrapper exposes `loadEngine()` / `compileLaTeX()` / `writeMemFSFile()`
etc. and talks to the inner worker over a `{cmd: "..."}` message protocol.

The ComdTeX worker (`src/wasmTex.worker.ts`) is a **classic** worker that loads
`PdfTeXEngine.js` via `importScripts()` and looks for the global `PdfTeXEngine`
constructor. (A classic worker is required: `importScripts` is disabled inside
module workers.) If the constructor isn't present at runtime, all `compile()`
calls resolve with `status: "unavailable"` and the caller falls back to the
local toolchain.

> Historical note: earlier builds bundled only `swiftlatexpdftex.js` (the inner
> worker) and tried to use it directly as the `PdfTeXEngine` — but that file
> never defines the global, so the engine was always "unavailable". The
> `PdfTeXEngine.js` wrapper now bundled here closes that gap.

## Where to obtain the artefacts

The pre-built engine binaries are released from
<https://github.com/SwiftLaTeX/SwiftLaTeX> under the MIT license. Drop the
two files (`swiftlatexpdftex.js`, `swiftlatexpdftex.wasm`) into this folder
and rebuild — the bundle will then ship a fully self-contained PDF
compiler. Total size is roughly 8–14 MB plus a `.tar.gz` of base packages.

## Lazy package fetching

By default, SwiftLaTeX engines fetch missing `.sty`/`.cls` files on demand
from the package server configured in Settings → PDF (default
`https://texlive2.swiftlatex.com/` — a community server with a history of
outages). This needs an internet connection the first time a package is
requested; results are cached only in worker memory (per session, NOT
persisted). `swiftlatexpdftex.js` is patched to check the local mirror at
`texlive/` (see `texlive/README.md`) before hitting the network. See
`docs/wasm-tex.md` for full details.
