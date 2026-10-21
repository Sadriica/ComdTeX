import type * as monacoApi from "monaco-editor"

// Monaco themes built from the design tokens (docs/design-tokens.md). Monaco
// wants hex colours, the tokens are oklch(): each theme is read from a hidden
// probe element that carries the matching data-theme, and every colour is
// resolved through the browser (computed style, then a 1px canvas), so the
// editor follows themes.css with no second copy of the palette.

export type MonacoThemeName = "comdtex-dark" | "comdtex-light" | "comdtex-hc"

const THEMES: {
  name: MonacoThemeName
  attr: "dark" | "light" | "hc"
  base: "vs-dark" | "vs" | "hc-black"
}[] = [
  { name: "comdtex-dark", attr: "dark", base: "vs-dark" },
  { name: "comdtex-light", attr: "light", base: "vs" },
  { name: "comdtex-hc", attr: "hc", base: "hc-black" },
]

/** Settings value (a Monaco built-in name) to the token-built theme. */
export function monacoThemeName(setting: string): MonacoThemeName {
  return setting === "vs" ? "comdtex-light" : setting === "hc-black" ? "comdtex-hc" : "comdtex-dark"
}

/** Any CSS expression (a token, a color-mix of tokens) to a hex colour, or undefined. */
export type ColourResolver = (expr: string) => string | undefined

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0")
}

/** Resolver bound to one themed probe element. Needs a real DOM + canvas. */
function probeResolver(probe: HTMLElement): ColourResolver {
  let ctx: CanvasRenderingContext2D | null = null
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    ctx = canvas.getContext("2d", { willReadFrequently: true })
  } catch {
    ctx = null
  }
  return (expr) => {
    if (!ctx) return undefined
    probe.style.backgroundColor = ""
    probe.style.backgroundColor = expr
    const computed = getComputedStyle(probe).backgroundColor
    if (!computed) return undefined
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = "#000"
    ctx.fillStyle = computed
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 255 ? toHex(a) : ""}`
  }
}

type Rule = monacoApi.editor.ITokenThemeRule
type Colours = monacoApi.editor.IColors

/** Pure: the Monaco theme data for one resolver. Unresolvable colours are skipped. */
export function buildThemeData(
  base: "vs-dark" | "vs" | "hc-black",
  resolve: ColourResolver,
): monacoApi.editor.IStandaloneThemeData {
  const v = (token: string) => resolve(`var(--${token})`)
  const mix = (a: string, pct: number, b: string) =>
    resolve(`color-mix(in oklch, var(--${a}) ${pct}%, var(--${b}))`)
  const strip = (hex?: string) => hex?.slice(1)

  const rule = (token: string, fg: string | undefined, fontStyle?: string): Rule | null =>
    fg ? { token, foreground: strip(fg), ...(fontStyle !== undefined ? { fontStyle } : {}) } : null

  const rules = [
    rule("", v("fg")),
    // Markdown headings, list markers, table delimiters, typst headings.
    rule("keyword", v("accent"), "bold"),
    rule("keyword.table", v("syn-punct"), ""),
    rule("string", v("syn-string")),
    rule("string.link", v("link")),
    rule("string.target", v("syn-number")),
    rule("string.escape", v("syn-punct")),
    rule("escape", v("syn-punct")),
    rule("variable", v("syn-string")),
    rule("variable.source", v("syn-string")),
    rule("comment", v("syn-comment"), "italic"),
    rule("number", v("syn-number")),
    rule("type", v("syn-type")),
    rule("type.identifier", v("syn-type")),
    rule("tag", v("syn-function")),
    rule("attribute.name", v("syn-type")),
    rule("delimiter", v("syn-punct")),
    rule("meta.separator", v("syn-punct")),
    rule("strong", v("fg"), "bold"),
    rule("emphasis", v("fg"), "italic"),
    // ComdTeX grammar (comdtexLanguage.ts, latexLanguage.ts). Structure is the
    // keyword hue (fences, environment names), anchors are gold (labels), what
    // points elsewhere is rose (references) or coral (citations); math sits in
    // a quiet blue so a page of it reads as one calm field.
    rule("keyword.env", v("syn-keyword"), "bold"),
    rule("delimiter.env", v("syn-keyword"), ""),
    rule("keyword.block", v("syn-keyword"), ""),
    rule("keyword.task", v("syn-type"), "bold"),
    rule("string.title", v("syn-string"), ""),
    rule("tag.label", v("syn-label"), ""),
    rule("tag.ref", v("syn-ref"), ""),
    rule("tag.footnote", v("syn-label"), ""),
    rule("string.cite", v("syn-cite"), ""),
    rule("string.link.embed", v("link"), "bold"),
    rule("math", v("syn-math")),
    rule("keyword.math", v("syn-function"), ""),
    rule("number.math", v("syn-math")),
    rule("delimiter.math", v("syn-punct")),
    rule("function.shorthand", v("syn-function"), ""),
    rule("operator", v("syn-function")),
    rule("mark", v("syn-number"), "bold"),
    rule("invalid.gap", v("warn"), "underline bold"),
    rule("comment.keep", v("syn-comment"), "italic"),
    rule("delimiter.fence", v("syn-punct")),
    rule("meta.frontmatter", v("syn-punct")),
  ].filter((r): r is Rule => r !== null)

  const colours: Record<string, string | undefined> = {
    "editor.background": v("bg-surface"),
    "editor.foreground": v("fg"),
    "editorGutter.background": v("bg-surface"),
    "editorLineNumber.foreground": v("fg-subtle"),
    "editorLineNumber.activeForeground": v("fg-muted"),
    "editor.lineHighlightBackground": mix("bg-hover", 55, "bg-surface"),
    "editor.lineHighlightBorder":
      base === "hc-black" ? v("border") : mix("bg-hover", 55, "bg-surface"),
    "editor.selectionBackground": v("selection"),
    "editor.inactiveSelectionBackground": mix("selection", 55, "bg-surface"),
    "editor.selectionHighlightBackground": mix("selection", 45, "bg-surface"),
    "editor.wordHighlightBackground": mix("selection", 45, "bg-surface"),
    "editor.findMatchBackground": v("mark-orange"),
    "editor.findMatchHighlightBackground": v("mark-yellow"),
    "editor.findRangeHighlightBackground": mix("selection", 35, "bg-surface"),
    "editorCursor.foreground": v("accent"),
    "editorWhitespace.foreground": v("border"),
    "editorIndentGuide.background1": v("border"),
    "editorIndentGuide.activeBackground1": v("border-strong"),
    "editorBracketMatch.background": v("accent-soft"),
    "editorBracketMatch.border": v("accent"),
    "editorLink.activeForeground": v("link"),
    "editorError.foreground": v("danger"),
    "editorWarning.foreground": v("warn"),
    "editorInfo.foreground": v("info"),
    "editorHint.foreground": v("fg-muted"),
    "editorRuler.foreground": v("border"),
    "editorOverviewRuler.border": v("border"),
    "editorWidget.background": v("bg-raised"),
    "editorWidget.foreground": v("fg"),
    "editorWidget.border": v("border-strong"),
    "editorSuggestWidget.background": v("bg-raised"),
    "editorSuggestWidget.foreground": v("fg"),
    "editorSuggestWidget.border": v("border-strong"),
    "editorSuggestWidget.selectedBackground": v("bg-selected"),
    "editorSuggestWidget.highlightForeground": v("accent"),
    "editorHoverWidget.background": v("bg-raised"),
    "editorHoverWidget.foreground": v("fg"),
    "editorHoverWidget.border": v("border-strong"),
    "list.hoverBackground": v("bg-hover"),
    "list.activeSelectionBackground": v("bg-selected"),
    "list.activeSelectionForeground": v("fg"),
    "list.focusBackground": v("bg-selected"),
    "list.highlightForeground": v("accent"),
    "input.background": v("bg-sunken"),
    "input.foreground": v("fg"),
    "input.border": v("border-strong"),
    focusBorder: v("focus-ring"),
    "scrollbarSlider.background": mix("border-strong", 40, "bg-surface"),
    "scrollbarSlider.hoverBackground": mix("border-strong", 65, "bg-surface"),
    "scrollbarSlider.activeBackground": v("border-strong"),
    "minimap.background": v("bg-surface"),
    "minimap.selectionHighlight": v("selection"),
    "foldingEditor.foreground": v("fg-muted"),
  }
  const out: Colours = {}
  for (const [key, value] of Object.entries(colours)) if (value) out[key] = value

  return { base, inherit: true, rules, colors: out }
}

let lastMonaco: typeof monacoApi | null = null
let fontsHooked = false

/** Define every token-built theme from the current CSS. Safe to call repeatedly. */
export function defineMonacoThemes(monaco: typeof monacoApi): void {
  lastMonaco = monaco
  const probe = document.createElement("div")
  probe.className = "app"
  probe.setAttribute("aria-hidden", "true")
  probe.style.display = "none"
  document.body.appendChild(probe)
  try {
    for (const t of THEMES) {
      probe.setAttribute("data-theme", t.attr)
      monaco.editor.defineTheme(t.name, buildThemeData(t.base, probeResolver(probe)))
    }
  } finally {
    probe.remove()
  }
}

/** Mount-time setup: themes, plus a font re-measure once the bundled mono face is in. */
export function setupMonacoTheming(monaco: typeof monacoApi): void {
  defineMonacoThemes(monaco)
  if (fontsHooked || typeof document === "undefined" || !document.fonts) return
  fontsHooked = true
  const remeasure = () => monaco.editor.remeasureFonts()
  void document.fonts.ready.then(remeasure)
  void document.fonts.load('13px "JetBrains Mono Variable"').then(remeasure, () => {})
}

/** Re-read the tokens (theme switch) and apply the matching theme. */
export function refreshMonacoThemes(setting: string): void {
  if (!lastMonaco) return
  defineMonacoThemes(lastMonaco)
  lastMonaco.editor.setTheme(monacoThemeName(setting))
}
