#!/usr/bin/env node
// Generates src/latexCommands.ts: the command list behind `\` autocomplete.
//
// The list comes from KaTeX itself, so the editor only ever suggests commands
// the preview can render. KaTeX ships its TypeScript sources, and its command
// tables are plain declarations (`defineSymbol(...)`, `defineFunction({ names,
// numArgs })`, `defineMacro("\\name")`, `defineEnvironment({ names })`), which
// this script reads with regular expressions. No KaTeX internals are imported,
// so a KaTeX upgrade only needs `npm run gen:latex` and a look at the diff.
//
// Usage: node scripts/gen-latex-commands.mjs [--check]
//   --check  exit 1 when the committed file differs from a fresh generation.
//
// Output row: [name, glyph, snippet, group]
//   name     command without the backslash ("frac", "begin{pmatrix}")
//   glyph    the rendered symbol for symbols ("α"), "" for the rest
//   snippet  Monaco snippet body when it needs arguments, "" for plain `\name`
//   group    s symbol, f function, m macro, e environment, x extension

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const KATEX_SRC = join(ROOT, "node_modules/katex/src")
const OUT = join(ROOT, "src/latexCommands.ts")

const read = (rel) => readFileSync(join(KATEX_SRC, rel), "utf8")
const unescapeJs = (s) => JSON.parse(`"${s}"`)

/** The generated file text and the number of commands in it. */
export function generate() {
  /** name -> row, later sources never override earlier (symbols win over macros). */
  const rows = new Map()
  function add(name, glyph, snippet, group) {
    if (!/^[A-Za-z]+\*?$/.test(name) && !name.startsWith("begin{")) return
    if (rows.has(name)) {
      const old = rows.get(name)
      if (!old[1] && glyph) old[1] = glyph
      if (!old[2] && snippet) old[2] = snippet
      return
    }
    rows.set(name, [name, glyph, snippet, group])
  }

  // ── Symbols ────────────────────────────────────────────────────────────────
  const symbolRe =
    /defineSymbol\(\s*math\s*,\s*(\w+)\s*,\s*(\w[\w-]*)\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"\\\\([A-Za-z]+)"/g
  const symbols = read("symbols.ts")
  for (const m of symbols.matchAll(symbolRe)) {
    let glyph = ""
    try {
      glyph = unescapeJs(m[3])
    } catch {
      glyph = ""
    }
    // Combining marks and invisible characters have no useful standalone glyph.
    if (/^[\u0300-\u036f\u200b-\u200f\u2060]$/.test(glyph) || glyph.length > 2) glyph = ""
    // Accents are drawn over a base; their bare glyph reads as noise.
    if (m[2] === "accent-token") glyph = ""
    add(m[4], glyph, "", "s")
  }

  // ── Functions and environments ─────────────────────────────────────────────
  function walk(dir) {
    return readdirSync(join(KATEX_SRC, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
    )
  }

  const namesRe = /names:\s*\[([^\]]*)\]/g
  for (const file of walk("functions")) {
    const text = read(file)
    for (const m of text.matchAll(namesRe)) {
      const names = [...m[1].matchAll(/"\\\\([A-Za-z]+\*?)"/g)].map((x) => x[1])
      if (names.length === 0) continue
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 500)
      const args = /numArgs:\s*(\d+)/.exec(tail)
      const opt = /numOptionalArgs:\s*(\d+)/.exec(tail)
      const n = args ? Number(args[1]) : 0
      for (const name of names) {
        let snippet = ""
        if (n > 0) {
          const optional = opt && Number(opt[1]) > 0 ? "[${1}]" : ""
          const offset = optional ? 1 : 0
          const body = Array.from(
            { length: n - (opt ? Number(opt[1]) : 0) },
            (_, i) => `{\${${i + 1 + offset}}}`,
          )
          snippet = `\\${name}${optional}${body.join("")}`
        }
        add(name, "", snippet, "f")
      }
    }
  }

  const envNames = new Set()
  for (const file of ["environments/array.ts", "environments/cd.ts"]) {
    for (const m of read(file).matchAll(namesRe)) {
      for (const x of m[1].matchAll(/"([A-Za-z]+\*?)"/g)) envNames.add(x[1])
    }
  }
  for (const env of [...envNames].sort()) {
    add(`begin{${env}}`, "", `\\begin{${env}}\n\t\${0}\n\\end{${env}}`, "e")
  }

  // ── Macros ─────────────────────────────────────────────────────────────────
  const macros = read("macros.ts")
  for (const m of macros.matchAll(/defineMacro\(\s*"\\\\([A-Za-z]+\*?)"\s*,\s*([^\n]*)/g)) {
    const body = m[2]
    const count = Math.max(0, ...[...body.matchAll(/#(\d)/g)].map((x) => Number(x[1])))
    const snippet =
      count > 0
        ? `\\${m[1]}` + Array.from({ length: count }, (_, i) => `{\${${i + 1}}}`).join("")
        : ""
    add(m[1], "", snippet, "m")
  }

  // ── mhchem extension (loaded by the editor next to KaTeX) ──────────────────
  add("ce", "", "\\ce{${1}}", "x")
  add("pu", "", "\\pu{${1}}", "x")

  // ── Curated snippets: the argument shapes people actually type ─────────────
  const curated = {
    frac: "\\frac{${1}}{${2}}",
    dfrac: "\\dfrac{${1}}{${2}}",
    tfrac: "\\tfrac{${1}}{${2}}",
    cfrac: "\\cfrac{${1}}{${2}}",
    binom: "\\binom{${1}}{${2}}",
    sqrt: "\\sqrt{${1}}",
    text: "\\text{${1}}",
    textbf: "\\textbf{${1}}",
    textit: "\\textit{${1}}",
    mathrm: "\\mathrm{${1}}",
    mathbf: "\\mathbf{${1}}",
    mathbb: "\\mathbb{${1:R}}",
    mathcal: "\\mathcal{${1:A}}",
    mathfrak: "\\mathfrak{${1:g}}",
    mathscr: "\\mathscr{${1:L}}",
    operatorname: "\\operatorname{${1}}",
    boldsymbol: "\\boldsymbol{${1}}",
    vec: "\\vec{${1}}",
    hat: "\\hat{${1}}",
    bar: "\\bar{${1}}",
    tilde: "\\tilde{${1}}",
    dot: "\\dot{${1}}",
    ddot: "\\ddot{${1}}",
    overline: "\\overline{${1}}",
    underline: "\\underline{${1}}",
    widehat: "\\widehat{${1}}",
    widetilde: "\\widetilde{${1}}",
    overbrace: "\\overbrace{${1}}^{${2}}",
    underbrace: "\\underbrace{${1}}_{${2}}",
    xrightarrow: "\\xrightarrow{${1}}",
    xleftarrow: "\\xleftarrow{${1}}",
    overset: "\\overset{${1}}{${2}}",
    underset: "\\underset{${1}}{${2}}",
    stackrel: "\\stackrel{${1}}{${2}}",
    boxed: "\\boxed{${1}}",
    cancel: "\\cancel{${1}}",
    textcolor: "\\textcolor{${1:red}}{${2}}",
    color: "\\color{${1:red}}",
    colorbox: "\\colorbox{${1:yellow}}{${2}}",
    sum: "\\sum_{${1:i=1}}^{${2:n}}",
    prod: "\\prod_{${1:i=1}}^{${2:n}}",
    coprod: "\\coprod_{${1:i=1}}^{${2:n}}",
    int: "\\int_{${1:a}}^{${2:b}}",
    iint: "\\iint_{${1}}",
    oint: "\\oint_{${1}}",
    lim: "\\lim_{${1:x \\to \\infty}}",
    limsup: "\\limsup_{${1:n \\to \\infty}}",
    liminf: "\\liminf_{${1:n \\to \\infty}}",
    max: "\\max_{${1}}",
    min: "\\min_{${1}}",
    sup: "\\sup_{${1}}",
    inf: "\\inf_{${1}}",
    bigcup: "\\bigcup_{${1:i}}^{${2}}",
    bigcap: "\\bigcap_{${1:i}}^{${2}}",
    left: "\\left${1:(} ${2} \\right${3:)}",
    begin: "\\begin{${1:env}}\n\t${0}\n\\end{${1:env}}",
    substack: "\\substack{${1}}",
    pmod: "\\pmod{${1:n}}",
    bmod: "\\bmod ${1:n}",
    tag: "\\tag{${1}}",
    label: "\\label{${1}}",
    hspace: "\\hspace{${1:1em}}",
    vspace: "\\vspace{${1:1em}}",
    phantom: "\\phantom{${1}}",
    not: "\\not${1:=}",
  }
  for (const [name, snippet] of Object.entries(curated)) {
    const row = rows.get(name)
    if (row) row[2] = snippet
    else rows.set(name, [name, "", snippet, "f"])
  }

  // Blackboard bold and friends: show the glyph users picture, insert the arg.
  const bbGlyph = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ" }
  for (const [letter, glyph] of Object.entries(bbGlyph)) {
    rows.set(`mathbb{${letter}}`, [`mathbb{${letter}}`, glyph, "", "f"])
  }

  const sorted = [...rows.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

  const q = (s) => JSON.stringify(s)
  const body = sorted.map((r) => `  [${r.map(q).join(", ")}],`).join("\n")
  const out = `// GENERATED by scripts/gen-latex-commands.mjs from KaTeX's own command tables.
// Do not edit by hand: run \`npm run gen:latex\` after upgrading KaTeX.

/** [name, glyph, snippet, group]; see the generator for the column meanings. */
export type LatexCommandRow = readonly [name: string, glyph: string, snippet: string, group: string]

export const LATEX_COMMANDS: readonly LatexCommandRow[] = [
${body}
]
`
  return { out, count: sorted.length }
}

function main() {
  const { out, count } = generate()
  if (process.argv.includes("--check")) {
    let current = ""
    try {
      current = readFileSync(OUT, "utf8")
    } catch {
      // missing file: treated as different
    }
    if (current !== out) {
      console.error("src/latexCommands.ts is stale: run `npm run gen:latex`")
      process.exit(1)
    }
    console.log(`latexCommands.ts is up to date (${count} commands)`)
  } else {
    writeFileSync(OUT, out)
    console.log(`wrote ${count} commands to src/latexCommands.ts`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
