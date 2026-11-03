/**
 * Typography choices: curated font stacks plus fonts installed on the system.
 *
 * A stored value is one of:
 *   "default"            the built-in stack for that role (no override)
 *   "preset:<id>"        a curated stack from CURATED
 *   "system:<Family>"    an installed family, with the role's generic fallback
 * Anything else is treated as "default", so a hand-edited or stale settings
 * blob can never produce a broken font-family.
 */

export type FontRole = "ui" | "editor" | "preview"

export interface FontPreset {
  id: string
  /** Display name (a font name, not translated). */
  label: string
  /** Ready-to-use CSS font-family value. */
  stack: string
}

export interface SystemFont {
  name: string
  monospace: boolean
}

export const DEFAULT_FONT = "default"

/** Generic fallback appended to an installed family, per role. */
const GENERIC: Record<FontRole, string> = {
  ui: "system-ui, sans-serif",
  editor: "ui-monospace, monospace",
  preview: "serif",
}

/** The stack each role uses today. "default" keeps these exact values. */
export const DEFAULT_EDITOR_STACK =
  '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace'

const SANS_FALLBACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const MONO_FALLBACK = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif'

export const CURATED: Record<FontRole, FontPreset[]> = {
  ui: [
    { id: "system", label: "System UI", stack: SANS_FALLBACK },
    { id: "inter", label: "Inter", stack: `Inter, "Inter Variable", ${SANS_FALLBACK}` },
    { id: "segoe", label: "Segoe UI", stack: `"Segoe UI", ${SANS_FALLBACK}` },
    { id: "noto-sans", label: "Noto Sans", stack: `"Noto Sans", ${SANS_FALLBACK}` },
    {
      id: "source-sans",
      label: "Source Sans",
      stack: `"Source Sans 3", "Source Sans Pro", ${SANS_FALLBACK}`,
    },
    {
      id: "helvetica",
      label: "Helvetica / Arial",
      stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    },
    { id: "serif", label: "Libertinus Serif", stack: `"Libertinus Serif", ${SERIF_FALLBACK}` },
  ],
  editor: [
    { id: "jetbrains", label: "JetBrains Mono", stack: DEFAULT_EDITOR_STACK },
    { id: "fira-code", label: "Fira Code", stack: `"Fira Code", ${MONO_FALLBACK}` },
    {
      id: "cascadia",
      label: "Cascadia Code",
      stack: `"Cascadia Code", "Cascadia Mono", ${MONO_FALLBACK}`,
    },
    { id: "source-code", label: "Source Code Pro", stack: `"Source Code Pro", ${MONO_FALLBACK}` },
    { id: "dejavu-mono", label: "DejaVu Sans Mono", stack: `"DejaVu Sans Mono", ${MONO_FALLBACK}` },
    {
      id: "consolas",
      label: "Consolas / Menlo",
      stack: 'Consolas, Menlo, "SF Mono", "Liberation Mono", monospace',
    },
    { id: "system-mono", label: "System monospace", stack: "ui-monospace, monospace" },
  ],
  preview: [
    {
      id: "libertinus",
      label: "Libertinus Serif",
      stack: '"Libertinus Serif", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    },
    {
      id: "latin-modern",
      label: "Latin Modern / Computer Modern",
      stack: `"Latin Modern Roman", "LM Roman 10", "CMU Serif", "Computer Modern Serif", ${SERIF_FALLBACK}`,
    },
    {
      id: "eb-garamond",
      label: "EB Garamond",
      stack: `"EB Garamond", Garamond, ${SERIF_FALLBACK}`,
    },
    {
      id: "source-serif",
      label: "Source Serif",
      stack: `"Source Serif 4", "Source Serif Pro", ${SERIF_FALLBACK}`,
    },
    { id: "georgia", label: "Georgia", stack: `Georgia, ${SERIF_FALLBACK}` },
    {
      id: "palatino",
      label: "Palatino",
      stack: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    },
    { id: "sans", label: "Sans (UI font)", stack: SANS_FALLBACK },
  ],
}

export function presetValue(id: string): string {
  return `preset:${id}`
}

export function systemValue(family: string): string {
  return `system:${family}`
}

/** Quote a family name for CSS, escaping backslashes and quotes. */
export function quoteFamily(name: string): string {
  return `"${name.replace(/[\\"]/g, "\\$&").replace(/[\r\n]/g, " ")}"`
}

/**
 * The CSS font-family for a stored value, or null for "default" (and for any
 * value that does not parse), meaning: do not override.
 */
export function buildStack(role: FontRole, value: string | undefined): string | null {
  if (!value || value === DEFAULT_FONT) return null
  if (value.startsWith("preset:")) {
    const id = value.slice("preset:".length)
    return CURATED[role].find((p) => p.id === id)?.stack ?? null
  }
  if (value.startsWith("system:")) {
    const family = value.slice("system:".length).trim()
    if (!family) return null
    return `${quoteFamily(family)}, ${GENERIC[role]}`
  }
  return null
}

/** Normalise a stored value: unknown shapes and unknown presets fall back to "default". */
export function sanitizeFontValue(role: FontRole, value: unknown): string {
  if (typeof value !== "string") return DEFAULT_FONT
  if (value.startsWith("system:")) return value.slice(7).trim() ? value : DEFAULT_FONT
  return buildStack(role, value) ? value : DEFAULT_FONT
}

/** Installed families for a role: monospaced only for the editor, minus names already curated. */
export function pickInstalled(role: FontRole, fonts: SystemFont[]): SystemFont[] {
  const curated = new Set(CURATED[role].map((p) => p.label.toLowerCase()))
  const seen = new Set<string>()
  const out: SystemFont[] = []
  for (const f of fonts) {
    const key = f.name.toLowerCase()
    if (seen.has(key) || curated.has(key)) continue
    if (role === "editor" && !f.monospace) continue
    seen.add(key)
    out.push(f)
  }
  return out
}

/** CSS font-family for previewing an option in its own face. */
export function sampleFamily(role: FontRole, value: string): string | undefined {
  return buildStack(role, value) ?? undefined
}

/** CSS rule overriding the UI font token; "" when nothing is overridden. */
export function fontOverrideCss(ui: string | null): string {
  if (!ui) return ""
  // `:root .app` beats the theme-independent `:root, .app` token block.
  return `:root, :root .app { --font-ui: ${ui}; }`
}
