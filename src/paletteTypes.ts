import type { ReactNode } from "react"

export type PaletteCategory =
  "Edición" | "Insertar" | "Matemáticas" | "Vista" | "Exportar" | "IA" | "Vault" | "Navegación"

/** What the cursor is on, computed once when the palette opens. See cursorContext.ts. */
export interface CursorContext {
  lineNumber: number
  column: number
  line: string
  hasSelection: boolean
  /** Inside `$...$` or a `$$` block. */
  inMath: "inline" | "display" | null
  /** Innermost enclosing `:::type` block (environment or special block). */
  block: { type: string; startLine: number } | null
  inCodeFence: boolean
  inTable: boolean
  /** `{#kind:name}` under the cursor. */
  label: string | null
  /** `@kind:name` (or `@path@kind:name`) under the cursor. */
  ref: string | null
  /** Inside a `[@key]` citation group. */
  citation: boolean
  /** On a `{{?}}` gap. */
  onGap: boolean
}

export interface PaletteCommand {
  id: string
  label: string
  /** Legacy field: still rendered as a dim description when present. */
  description?: string
  /** Extra hidden terms used only for search. */
  keywords?: string[]
  category?: PaletteCategory
  icon?: ReactNode
  /** Toggle commands: shows a check chip while on. */
  checked?: boolean
  /**
   * Availability: the command is hidden while this returns false. Evaluated
   * against the cursor context captured when the palette opened (an absent
   * context, e.g. no file open, counts as "not available").
   */
  when?: (ctx: CursorContext) => boolean
  /**
   * Relevance: surface the command in the "Here" group of the empty commands
   * view while this is true. Defaults to `when`.
   */
  here?: (ctx: CursorContext) => boolean
  /** Leaf commands run `action`; parents drill into `children`. */
  action?: (ctx: CursorContext | null) => void
  children?: PaletteCommand[]
}

/** The input prefixes: see paletteSources.ts `parsePaletteInput`. */
export type PaletteMode = "files" | "commands" | "outline" | "labels" | "cite" | "line" | "help"
