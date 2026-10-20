#!/usr/bin/env node
// Contrast gate for the theme tokens. Parses src/styles/themes.css (opaque
// oklch() values only), converts to sRGB, and asserts WCAG ratios per theme.
// Usage: node scripts/check-contrast.mjs   (exit 1 on any failure)
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const THEMES_CSS = resolve(here, "../src/styles/themes.css")

// ---- colour maths ---------------------------------------------------------

const clamp01 = (x) => Math.min(1, Math.max(0, x))

/** oklch -> linear sRGB (clipped to gamut). */
export function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** linear sRGB -> oklch. */
export function linearToOklch([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(a, bb)
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { L, C, h: C < 1e-4 ? 0 : h }
}

export function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(c1, c2) {
  const a = luminance(c1)
  const b = luminance(c2)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** color-mix(in oklch, a pct%, b), shorter-hue interpolation. */
export function mixOklch(linA, pct, linB) {
  const A = linearToOklch(linA)
  const B = linearToOklch(linB)
  const t = pct / 100
  let hA = A.h
  let hB = B.h
  if (A.C < 1e-3) hA = hB
  if (B.C < 1e-3) hB = hA
  let d = hB - hA
  if (d > 180) d -= 360
  if (d < -180) d += 360
  const h = (hA + d * (1 - t) + 360) % 360
  // t is the share of A; interpolation runs from B to A.
  return oklchToLinear(B.L + (A.L - B.L) * t, B.C + (A.C - B.C) * t, h)
}

// ---- parsing --------------------------------------------------------------

const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/

/** Returns { dark: {token: linearRGB}, light: {...}, hc: {...} }. */
export function parseThemes(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const themes = { dark: {}, light: {}, hc: {} }
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim()
    const sel = selector.match(/data-theme="(light|hc)"/)
    const target = sel ? sel[1] : "dark"
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const v = d[2].trim().match(OKLCH)
      if (!v) continue
      const L = v[1].endsWith("%") ? parseFloat(v[1]) / 100 : parseFloat(v[1])
      themes[target][d[1]] = oklchToLinear(L, parseFloat(v[2]), parseFloat(v[3]))
    }
  }
  return themes
}

/** The current themes.css, parsed. */
export function loadThemes() {
  return parseThemes(readFileSync(THEMES_CSS, "utf8"))
}

// ---- checks ---------------------------------------------------------------

const BG = [
  "--bg-app",
  "--bg-surface",
  "--bg-raised",
  "--bg-sunken",
  "--bg-hover",
  "--bg-active",
  "--bg-selected",
]
const ENV = [
  "theorem",
  "lemma",
  "corollary",
  "proposition",
  "definition",
  "example",
  "exercise",
  "remark",
  "proof",
  "note",
].map((n) => `--env-${n}`)
const CALLOUT = ["note", "tip", "info", "warning", "danger", "success", "quote"].map(
  (n) => `--callout-${n}`,
)
const STATUS = ["--danger", "--warn", "--ok", "--info"]
const MARKS = ["yellow", "green", "blue", "purple", "orange", "red", "pink"].map(
  (n) => `--mark-${n}`,
)
const SYN = ["keyword", "string", "number", "comment", "function", "type", "punct"].map(
  (n) => `--syn-${n}`,
)

export function runChecks(themes) {
  const results = []
  for (const [name, t] of Object.entries(themes)) {
    const need = (k) => {
      if (!t[k]) {
        results.push({
          theme: name,
          label: `${k} defined`,
          ratio: 0,
          min: 1,
          ok: false,
          note: "missing",
        })
        return false
      }
      return true
    }
    const check = (fg, bg, min, label, bgColor) => {
      if (!need(fg)) return
      const bgc = bgColor ?? (need(bg) ? t[bg] : null)
      if (!bgc) return
      const ratio = contrast(t[fg], bgc)
      results.push({ theme: name, label: label ?? `${fg} on ${bg}`, ratio, min, ok: ratio >= min })
    }
    for (const bg of BG) {
      check("--fg", bg, 4.5)
      check("--fg-muted", bg, 4.5)
    }
    for (const bg of ["--bg-surface", "--bg-app"]) {
      check("--border-strong", bg, 3)
      check("--focus-ring", bg, 3)
    }
    check("--link", "--bg-surface", 4.5)
    check("--accent", "--bg-surface", 4.5)
    for (const k of [...ENV, ...CALLOUT, ...STATUS]) {
      check(k, "--bg-surface", 4.5)
      if (t[k] && t["--bg-surface"]) {
        const mixed = mixOklch(t[k], 8, t["--bg-surface"])
        check(k, "8% mix", 4.5, `${k} on its 8% mix`, mixed)
      }
    }
    check("--accent-fg", "--accent", 4.5)
    check("--status-fg", "--status-bg", 4.5)
    check("--chrome-fg", "--chrome-bg", 4.5)
    // Beyond the contract: text that sits on tokens the contract defines.
    check("--code-fg", "--code-bg", 4.5)
    for (const k of SYN) check(k, "--code-bg", 4.5)
    for (const k of MARKS) check("--fg", k, 4.5, `--fg on ${k}`, t[k])
    check("--fg", "--accent-soft", 4.5)
  }
  return results
}

function main() {
  const themes = loadThemes()
  const results = runChecks(themes)
  const failed = results.filter((r) => !r.ok)
  for (const name of Object.keys(themes)) {
    const rs = results.filter((r) => r.theme === name)
    const bad = rs.filter((r) => !r.ok)
    console.log(`${name}: ${rs.length - bad.length}/${rs.length} pass`)
    for (const r of bad)
      console.log(`  FAIL ${r.label}: ${r.note ?? r.ratio.toFixed(2)} (needs ${r.min})`)
  }
  if (process.env.CONTRAST_VERBOSE)
    for (const r of results)
      console.log(`${r.ok ? "ok  " : "FAIL"} ${r.theme} ${r.label} ${r.ratio.toFixed(2)}`)
  if (failed.length) {
    console.error(`\n${failed.length} contrast check(s) failed`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
