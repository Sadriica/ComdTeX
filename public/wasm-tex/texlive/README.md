# Local TeX package mirror (optional)

The bundled SwiftLaTeX engine normally downloads missing TeX files
(`.sty`, `.cls`, `.tfm`, fonts…) on demand from the package server configured
in **Settings → PDF** (default: `https://texlive2.swiftlatex.com/`). That
public server has a history of outages, and without it the WASM engine cannot
compile documents that need any non-preloaded package.

The engine glue (`swiftlatexpdftex.js`) is patched to look **here first**:
any file dropped into this directory is served to the engine without touching
the network.

## Layout

Flat, keyed by file name exactly as TeX requests it (no subdirectories):

```
public/wasm-tex/texlive/
  xcolor.sty
  ulem.sty
  float.sty
  listings.sty
  lstmisc.sty
  ...
```

The engine requests names like `xcolor.sty`, `spanish.ldf`, `t1cmtt.fd`,
`ecrm1200.tfm` — the kpathsea *format* number in the remote protocol is
ignored for local lookups, so one flat directory covers all types.

## Populating

Copy the files from any TeX Live distribution (`texmf-dist/tex/latex/...`,
`texmf-dist/fonts/tfm/...`) or harvest the exact request list by compiling a
document and reading the worker console (`Start downloading texlive file …`
lines show every miss; `Loaded local texlive file …` confirms hits).

> Note: a fully offline compile also needs `pdflatex.fmt`, which the public
> server builds server-side. Until a format file is bundled, the mirror
> reduces network dependency but does not remove it for cold sessions.
