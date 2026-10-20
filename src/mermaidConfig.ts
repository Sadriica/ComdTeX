// Shared Mermaid initialization config.
//
// Lives in its own module (rather than inline in App.tsx) so the render path
// and the regression tests read the SAME object; a duplicated literal could
// drift and let a test pass while the app stays broken.

// ── Design-token palette ─────────────────────────────────────────────────────
//
// Mermaid 12 renders with the `neo` look by default and lays flowcharts out
// with ELK (bundled with mermaid, loaded as its own lazy chunk the first time
// a diagram needs it). We adopt `neo`, but colour it from the app's design
// tokens (docs/design-tokens.md) instead of a built-in Mermaid theme: the
// `base` theme takes every colour from `themeVariables`.
//
// Tokens are read from the DOM at render time (`readMermaidPalette`), so the
// diagram follows the active app theme. Mermaid's colour maths (khroma) cannot
// parse `oklch()`, so each token is resolved to a plain `#rrggbb` through a
// canvas. When a token is missing, or there is no DOM (unit tests), the
// per-theme fallback palette below is used.

export type MermaidThemeName = "dark" | "light" | "hc"

type Palette = {
  fg: string
  fgMuted: string
  border: string
  bgSurface: string
  bgRaised: string
  viz: readonly string[]
}

const FALLBACK_PALETTES: Record<MermaidThemeName, Palette> = {
  dark: {
    fg: "#e9e6dc",
    fgMuted: "#a8a79d",
    border: "#3b4140",
    bgSurface: "#171a19",
    bgRaised: "#222726",
    viz: ["#89b0bf", "#d3bd72", "#9cc28f", "#b7a1dc", "#dc9a6e", "#d98fab", "#72c2b2", "#d97b72"],
  },
  light: {
    fg: "#23282a",
    fgMuted: "#586064",
    border: "#cfcabb",
    bgSurface: "#f6f2e7",
    bgRaised: "#fcfaf3",
    viz: ["#2f6f8a", "#9a7a14", "#3f7d3a", "#6a4fa0", "#b0561e", "#a8416a", "#17806f", "#b3382f"],
  },
  hc: {
    fg: "#ffffff",
    fgMuted: "#e6e6e6",
    border: "#ffffff",
    bgSurface: "#000000",
    bgRaised: "#000000",
    viz: ["#4dd2ff", "#ffe600", "#5bff6f", "#d79bff", "#ff9a3c", "#ff7fbf", "#3dffd9", "#ff6b6b"],
  },
}

const FALLBACK_FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"

let probeCtx: CanvasRenderingContext2D | null | undefined

/** Resolve any CSS colour (including `oklch()` / `color-mix()`) to `#rrggbb`. */
function toHex(value: string, fallback: string): string {
  const v = value.trim()
  if (!v) return fallback
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  if (typeof document === "undefined") return fallback
  try {
    if (probeCtx === undefined) {
      probeCtx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    }
    const ctx = probeCtx
    if (!ctx) return fallback
    ctx.clearRect(0, 0, 1, 1)
    // An unparseable colour leaves fillStyle at its previous value; set a
    // sentinel first so a bad token is detected instead of silently reused.
    ctx.fillStyle = "#010203"
    ctx.fillStyle = v
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    if (a === 0) return fallback
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
  } catch {
    return fallback
  }
}

type ResolvedPalette = Palette & { fontFamily: string }

/**
 * Read the diagram palette from the design tokens in effect at `el` (any
 * element inside the themed `.app`). Falls back per theme for missing tokens.
 */
export function readMermaidPalette(
  el: Element | null,
  theme: MermaidThemeName = "dark",
): ResolvedPalette {
  const fb = FALLBACK_PALETTES[theme]
  if (!el || typeof getComputedStyle === "undefined") return { ...fb, fontFamily: FALLBACK_FONT }
  const cs = getComputedStyle(el)
  const get = (name: string, fallback: string) => toHex(cs.getPropertyValue(name), fallback)
  return {
    fg: get("--fg", fb.fg),
    fgMuted: get("--fg-muted", fb.fgMuted),
    border: get("--border", fb.border),
    bgSurface: get("--bg-surface", fb.bgSurface),
    bgRaised: get("--bg-raised", fb.bgRaised),
    viz: fb.viz.map((c, i) => get(`--viz-${i + 1}`, c)),
    fontFamily: cs.getPropertyValue("--font-ui").replace(/["']/g, "").trim() || FALLBACK_FONT,
  }
}

function themeVariablesFor(p: ResolvedPalette) {
  const v = p.viz
  return {
    fontFamily: p.fontFamily,
    background: "transparent",
    // Nodes and containers.
    primaryColor: p.bgRaised,
    primaryTextColor: p.fg,
    primaryBorderColor: v[0],
    secondaryColor: p.bgSurface,
    secondaryTextColor: p.fg,
    secondaryBorderColor: v[1],
    tertiaryColor: p.bgSurface,
    tertiaryTextColor: p.fg,
    tertiaryBorderColor: p.border,
    mainBkg: p.bgRaised,
    nodeBorder: v[0],
    nodeTextColor: p.fg,
    clusterBkg: p.bgSurface,
    clusterBorder: p.border,
    // Lines, labels, notes.
    lineColor: p.fgMuted,
    textColor: p.fg,
    titleColor: p.fg,
    edgeLabelBackground: p.bgSurface,
    noteBkgColor: p.bgSurface,
    noteTextColor: p.fg,
    noteBorderColor: p.border,
    // Sequence diagrams.
    actorBkg: p.bgRaised,
    actorBorder: v[0],
    actorTextColor: p.fg,
    actorLineColor: p.fgMuted,
    signalColor: p.fgMuted,
    signalTextColor: p.fg,
    labelBoxBkgColor: p.bgRaised,
    labelBoxBorderColor: p.border,
    labelTextColor: p.fg,
    loopTextColor: p.fg,
    activationBkgColor: p.bgSurface,
    activationBorderColor: v[0],
    sequenceNumberColor: p.bgSurface,
    // Categorical series (pie, git, mindmap sections, gantt, ...).
    pie1: v[0],
    pie2: v[1],
    pie3: v[2],
    pie4: v[3],
    pie5: v[4],
    pie6: v[5],
    pie7: v[6],
    pie8: v[7],
    pieStrokeColor: p.bgSurface,
    pieOuterStrokeColor: p.border,
    pieTitleTextColor: p.fg,
    pieSectionTextColor: p.bgSurface,
    pieLegendTextColor: p.fg,
    cScale0: v[0],
    cScale1: v[1],
    cScale2: v[2],
    cScale3: v[3],
    cScale4: v[4],
    cScale5: v[5],
    cScale6: v[6],
    cScale7: v[7],
    cScaleLabel0: p.bgSurface,
    cScaleLabel1: p.bgSurface,
    cScaleLabel2: p.bgSurface,
    cScaleLabel3: p.bgSurface,
    cScaleLabel4: p.bgSurface,
    cScaleLabel5: p.bgSurface,
    cScaleLabel6: p.bgSurface,
    cScaleLabel7: p.bgSurface,
    git0: v[0],
    git1: v[1],
    git2: v[2],
    git3: v[3],
    git4: v[4],
    git5: v[5],
    git6: v[6],
    git7: v[7],
    // Gantt / state / class.
    taskBkgColor: v[0],
    taskTextColor: p.bgSurface,
    taskTextLightColor: p.bgSurface,
    taskTextDarkColor: p.bgSurface,
    taskBorderColor: v[0],
    activeTaskBkgColor: v[1],
    activeTaskBorderColor: v[1],
    doneTaskBkgColor: p.fgMuted,
    doneTaskBorderColor: p.fgMuted,
    critBkgColor: v[7],
    critBorderColor: v[7],
    gridColor: p.border,
    todayLineColor: v[1],
    sectionBkgColor: p.bgSurface,
    altSectionBkgColor: p.bgRaised,
    sectionBkgColor2: p.bgSurface,
    excludeBkgColor: p.bgSurface,
    classText: p.fg,
    stateBkg: p.bgRaised,
    stateLabelColor: p.fg,
    labelColor: p.fg,
    altBackground: p.bgSurface,
    transitionColor: p.fgMuted,
    specialStateColor: p.fgMuted,
  }
}

/**
 * Build the Mermaid config for the tokens in effect at `el`. `layout` is left
 * at Mermaid 12's default (ELK). A document opts back to the old look with
 * frontmatter / `%%{init}%%` (`look: classic`, `layout: dagre`); the document's
 * own config always wins over this site config.
 */
export function buildMermaidConfig(el: Element | null = null, theme: MermaidThemeName = "dark") {
  return {
    startOnLoad: false,
    // `base` is the only built-in theme that takes ALL its colours from
    // `themeVariables`, which is how the design tokens reach the diagrams.
    theme: "base" as const,
    look: "neo" as const,
    flowchart: { wrappingWidth: 300 },
    // Render node/edge labels as native SVG <text>/<tspan> instead of HTML
    // inside <foreignObject>.
    //
    // This is NOT cosmetic: it's required for labels to be visible at all.
    // `sanitizeRenderedHtml` runs DOMPurify over every rendered SVG, and
    // DOMPurify ships `foreignobject` in its DEFAULT_FORBID_CONTENTS set: it
    // keeps the <foreignObject> element but deliberately drops its children.
    // With Mermaid's default `htmlLabels: true`, every node rendered as an
    // empty shape. Native <text>/<tspan> passes the sanitizer untouched.
    //
    // Do not "fix" a label problem by weakening the sanitizer: removing
    // `foreignobject` from FORBID_CONTENTS does not restore the children
    // anyway (a namespace check rejects them too).
    //
    // The root-level flag takes precedence over the (deprecated) per-diagram
    // `flowchart.htmlLabels` / `class.htmlLabels` / ... settings, so this single
    // flag covers every diagram type we can emit.
    htmlLabels: false,
    // `securityLevel` is intentionally left at Mermaid's default ("strict").
    //
    // It used to be "loose", justified by a comment claiming loose was required
    // for the `↺` (and similar) characters in our pseudocode-derived flowcharts.
    // That is not true: rendering the same diagrams under strict and loose
    // produces byte-identical SVG (same viewBox, same `↺` / `≤` / `←` / accented
    // text). The special chars are plain Unicode in SVG text; no HTML involved.
    //
    // Strict is the safer default: Mermaid additionally sanitizes label text
    // itself, so a hostile label in a raw ```mermaid fence is defanged before it
    // ever reaches our sanitizer. Nothing is lost: Mermaid's `click` handlers
    // (the other thing strict disables) never worked here anyway, since the
    // render path re-injects the SVG through `innerHTML`, which drops any
    // listeners Mermaid attached.
    themeVariables: themeVariablesFor(readMermaidPalette(el, theme)),
  }
}

export type MermaidConfigObject = ReturnType<typeof buildMermaidConfig>

/** Static config (token fallbacks, dark): what the unit tests and fixtures read. */
export const MERMAID_CONFIG: MermaidConfigObject = buildMermaidConfig()

/**
 * Stable string identity of a built config's colours. The diagram caches key on
 * it, so a theme switch can never serve an SVG drawn with the old palette.
 */
export function mermaidThemeKey(cfg: MermaidConfigObject): string {
  return JSON.stringify(cfg.themeVariables)
}

// The config the live preview is currently initialised with. diagramExport
// re-initialises Mermaid to a print theme and must restore THIS, not the static
// fallback, or exporting would leave the open preview with the wrong palette.
let activeConfig: MermaidConfigObject = MERMAID_CONFIG
export function setActiveMermaidConfig(cfg: MermaidConfigObject): void {
  activeConfig = cfg
}
export function getActiveMermaidConfig(): MermaidConfigObject {
  return activeConfig
}
