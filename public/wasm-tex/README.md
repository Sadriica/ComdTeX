# Bundled LaTeX engine (optional)

This directory hosts the SwiftLaTeX WASM engine artefacts that power the
"Use built-in LaTeX engine (WASM)" setting. When the runtime is not present,
ComdTeX automatically falls back to a locally-installed `tectonic`, `xelatex`,
or `pdflatex`.

## Required files (place here)

| Filename                  | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `swiftlatexpdftex.js`     | JS glue (registers `PdfTeXEngine` global)     |
| `swiftlatexpdftex.wasm`   | pdfTeX WASM binary                            |
| `swiftlatexxetex.js`      | (optional) XeLaTeX glue                       |
| `swiftlatexxetex.wasm`    | (optional) XeLaTeX WASM binary                |

The worker (`src/wasmTex.worker.ts`) loads `swiftlatexpdftex.js` via
`importScripts()` and looks for the global `PdfTeXEngine` constructor. If it
isn't present at runtime, all `compile()` calls resolve with
`status: "unavailable"` and the caller falls back to the local toolchain.

## Where to obtain the artefacts

The pre-built engine binaries are released from
<https://github.com/SwiftLaTeX/SwiftLaTeX> under the MIT license. Drop the
two files (`swiftlatexpdftex.js`, `swiftlatexpdftex.wasm`) into this folder
and rebuild — the bundle will then ship a fully self-contained PDF
compiler. Total size is roughly 8–14 MB plus a `.tar.gz` of base packages.

## Lazy package fetching

By default, SwiftLaTeX engines fetch missing `.sty`/`.cls` files on demand
from `https://texlive2.swiftlatex.com/`. This needs an internet connection
the first time a package is requested, and the result is cached in IndexedDB
inside the engine. See `docs/wasm-tex.md` for full details.
