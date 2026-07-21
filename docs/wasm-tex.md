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

At startup the worker `importScripts`-loads the **wrapper**
`/wasm-tex/PdfTeXEngine.js`, which registers the global `PdfTeXEngine`
class and in turn spawns the inner Emscripten worker
(`/wasm-tex/swiftlatexpdftex.js`), which loads the WASM binary
(`/wasm-tex/swiftlatexpdftex.wasm`). The default engine URL is
`/wasm-tex/PdfTeXEngine.js` (`src/wasmTex.ts`). If the wrapper is missing,
the engine reports `status: "unavailable"` to all compile requests and
ComdTeX falls back to the local toolchain. To include the runtime in your
build:

1. Download the engine artefacts from
   <https://github.com/SwiftLaTeX/SwiftLaTeX> (MIT license):
   - `PdfTeXEngine.js` (wrapper)
   - `swiftlatexpdftex.js`
   - `swiftlatexpdftex.wasm`
2. Place all three files in `public/wasm-tex/`. Vite serves the `public/`
   directory verbatim, so `/wasm-tex/PdfTeXEngine.js` becomes available
   at runtime with no further wiring.
3. Rebuild — the bundled application now includes a full LaTeX compiler.

## Package coverage

The SwiftLaTeX engines ship with the **TeX Live core** required for plain
`article`, `book`, `report`, and `beamer` documents, plus `amsmath`,
`amsfonts`, `amssymb`, `amsthm`, `hyperref`, `graphicx`, `geometry`,
`fontspec`, `inputenc`, `fontenc`, and `babel-english`. The engine
**lazy-fetches** any other package from the server configured in
**Settings → PDF** (default <https://texlive2.swiftlatex.com/>) on first use.
Results are cached **only in worker memory** — the cache does not survive an
app restart, so a fresh session needs the server again. Two mitigations exist:

- **Local mirror**: files dropped into `public/wasm-tex/texlive/` (flat,
  keyed by filename) are served to the engine before any network request —
  see `public/wasm-tex/texlive/README.md`.
- **Configurable endpoint**: the package-server URL is a setting
  (`texliveUrl`), so users can point at a self-hosted or alternative mirror
  when the default is down. Remember the host must also be allowed by the
  CSP `connect-src` in `tauri.conf.json` (the default one already is).

When every engine fails (WASM *and* the local `tectonic`/`xelatex`/`pdflatex`
fallbacks), the error modal appears — the WASM diagnostics are held until the
fallback chain also fails, so a successful local compile never shows an error.

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
- The bundled engine ships **without synctex output**, so forward/inverse
  SyncTeX between the editor and the PDF preview is not available even though
  the `.synctex` parser (`src/synctex.ts`) exists — no engine currently emits
  the data it needs.

## Bundled engine

The repository **ships the `pdftex` engine binaries** in `public/wasm-tex/`
(`PdfTeXEngine.js` wrapper + `swiftlatexpdftex.js` + `swiftlatexpdftex.wasm`),
so a fresh checkout compiles PDFs out of the box with `useWasmTex: true`.
If those files are
ever removed, the engine reports `status: "unavailable"` and ComdTeX
silently falls back to the local toolchain (with a one-line toast). To
update the engine, re-download the artefacts from
<https://github.com/SwiftLaTeX/SwiftLaTeX> and drop them back into
`public/wasm-tex/`.
