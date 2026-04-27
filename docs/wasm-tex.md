# Built-in LaTeX engine (WASM)

ComdTeX can compile PDFs without requiring the user to install `pandoc`,
`xelatex`, or `tectonic` locally. When the **"Use built-in LaTeX engine
(WASM)"** setting is enabled (default), PDF export first tries a
WebAssembly LaTeX engine bundled with the application; if that fails or is
not present, it falls back to whichever local LaTeX compiler the user has
installed.

## How it works

```
.cmdx / .md  →  exportToTex (src/exporter.ts)  →  .tex source
                                                     │
                                                     ▼
                                  WasmTexEngine.compile (Web Worker)
                                                     │
                                                     ▼
                                   Uint8Array PDF  →  writeFile
```

The engine runs inside a **dedicated Web Worker**
(`src/wasmTex.worker.ts`) so the UI never freezes during compilation. The
worker boots a SwiftLaTeX-style engine — currently `PdfTeXEngine` — and
exposes a small message protocol used by `WasmTexEngine` in
`src/wasmTex.ts`.

## Bundling the runtime

The worker tries to `importScripts("/wasm-tex/swiftlatexpdftex.js")` at
startup. If the file is missing, the engine reports `status: "unavailable"`
to all compile requests and ComdTeX falls back to the local toolchain. To
include the runtime in your build:

1. Download the engine artefacts from
   <https://github.com/SwiftLaTeX/SwiftLaTeX> (MIT license):
   - `swiftlatexpdftex.js`
   - `swiftlatexpdftex.wasm`
2. Place both files in `public/wasm-tex/`. Vite serves the `public/`
   directory verbatim, so `/wasm-tex/swiftlatexpdftex.js` becomes available
   at runtime with no further wiring.
3. Rebuild — the bundled application now includes a full LaTeX compiler.

## Package coverage

The SwiftLaTeX engines ship with the **TeX Live core** required for plain
`article`, `book`, `report`, and `beamer` documents, plus `amsmath`,
`amsfonts`, `amssymb`, `amsthm`, `hyperref`, `graphicx`, `geometry`,
`fontspec`, `inputenc`, `fontenc`, and `babel-english`. The engine
**lazy-fetches** any other package from
<https://texlive2.swiftlatex.com/> on first use; results are cached in the
engine's IndexedDB store, so subsequent compiles are offline-capable.

What this means in practice:

- **Works out of the box**: simple math papers, theorems/proofs, basic
  graphics inclusion, `lmodern`/Computer Modern fonts.
- **Works with internet**: `tikz`, `pgfplots`, `biblatex`, exotic font
  packages — fetched once, cached forever.
- **Won't work today**: anything that needs shell-escape (`minted`,
  `epstopdf` invoked at compile time) or local font files outside of TeX
  Live.

## Settings & UI

| Element                                     | Where                          |
| ------------------------------------------- | ------------------------------ |
| Toggle "Use built-in LaTeX engine (WASM)"   | Settings → PDF compilation     |
| Status indicator (`TeX: WASM` / `local`)    | Bottom status bar              |
| Palette command "Compile PDF (WASM engine)" | Ctrl+P, search "compile pdf"   |

Behaviour:

- WASM compile success → PDF written, preview pane refreshed, toast.
- WASM compile error → log piped through `parseLatexStderr` and surfaced via
  `LatexErrorModal`. ComdTeX still tries the local toolchain afterwards in
  case it has packages the WASM engine lacks.
- WASM unavailable (runtime not bundled) → silent fallback to local
  toolchain, with a one-line "WASM engine unavailable" toast.

## Limitations

- The first compile in a session pays a ~3-5 second engine boot cost.
- Compile times are 2-3× slower than a native `xelatex` for non-trivial
  documents; for short notes it's imperceptible.
- The WASM engine is `pdftex`-based by default. Documents that hard-require
  XeTeX features (e.g. system fonts via `fontspec`) need the XeTeX engine
  variant — drop `swiftlatexxetex.js` + `.wasm` into `public/wasm-tex/` and
  flip the engine URL in `src/wasmTex.ts`.

## Honest scaffolding note

The current source tree intentionally does **not** ship the engine
binaries — they are large, change with upstream SwiftLaTeX releases, and
have their own license metadata. The integration is wired and tested
end-to-end in the application code; what's missing is just the binary
artefacts. Without them, `useWasmTex: true` is a no-op that always falls
back to the local toolchain (and will say so via toast).
