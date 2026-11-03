import { foldText, rankItems } from "./fuzzy"
import { shortcutForCommand } from "./appShortcuts"
import { usageBoost, type PalettePrefs } from "./palettePrefs"
import type { CursorContext, PaletteCategory, PaletteCommand } from "./paletteTypes"

/**
 * Searching the command list: flattening the drill-in tree into leaves and
 * ranking them. Kept apart from the component so the golden-order tests run the
 * exact code the palette runs.
 */

export interface FlatCommand {
  cmd: PaletteCommand
  category?: PaletteCategory
  /** Labels of the parents, outermost first ("Highlight" for "Yellow"). */
  parents: string[]
  gates: ((c: CursorContext) => boolean)[]
}

export function flattenCommands(commands: PaletteCommand[]): {
  leaves: FlatCommand[]
  all: Map<string, PaletteCommand>
} {
  const leaves: FlatCommand[] = []
  const all = new Map<string, PaletteCommand>()
  const visit = (
    items: PaletteCommand[],
    inheritedCategory: PaletteCategory | undefined,
    parents: string[],
    gates: ((c: CursorContext) => boolean)[],
  ) => {
    for (const item of items) {
      const category = item.category ?? inheritedCategory
      const g = item.when ? [...gates, item.when] : gates
      all.set(item.id, { ...item, category })
      if (item.children?.length) visit(item.children, category, [...parents, item.label], g)
      else if (item.action) leaves.push({ cmd: { ...item, category }, category, parents, gates: g })
    }
  }
  visit(commands, undefined, [], [])
  return { leaves, all }
}

export function isAvailable(
  gates: ((c: CursorContext) => boolean)[],
  ctx: CursorContext | null,
): boolean {
  return gates.every((g) => !!ctx && g(ctx))
}

export interface RankedCommand {
  flat: FlatCommand
  score: number
  /** Positions inside the label, for highlighting (empty when another field won). */
  positions: number[]
}

/**
 * Rank leaf commands for a query. Weights: label > keywords > parent path >
 * description; category and shortcut only count for near-exact queries, so a
 * short query like `ins` is not dragged into every command through the word
 * "Insertar". Recency and frequency (prefs) and pins nudge ties and near-ties.
 */
export function rankCommands(
  leaves: readonly FlatCommand[],
  query: string,
  categoryLabel: (c: PaletteCategory) => string,
  prefs: PalettePrefs,
  ctx: CursorContext | null,
): RankedCommand[] {
  const strict = rankCommandsStrict(leaves, query, categoryLabel, prefs, ctx)
  if (strict.length > 0) return strict
  // Nothing has every word: people type a verb and a noun ("abrir ajustes",
  // "open settings") and the command is only named by the noun, or by a
  // synonym. Retry without filler verbs and with synonyms, then, as a last
  // resort, with the commands that match most of the words.
  const merged = new Map<string, RankedCommand>()
  for (const variant of queryVariants(query)) {
    for (const r of rankCommandsStrict(leaves, variant, categoryLabel, prefs, ctx)) {
      const prev = merged.get(r.flat.cmd.id)
      if (!prev || r.score > prev.score) merged.set(r.flat.cmd.id, r)
    }
  }
  if (merged.size > 0) return [...merged.values()].sort((a, b) => b.score - a.score)
  return rankByAnyWord(leaves, query, categoryLabel, prefs, ctx)
}

/** Verbs that introduce a command without naming it. */
const FILLER = new Set([
  "abrir",
  "abre",
  "ir",
  "ver",
  "mostrar",
  "muestra",
  "ejecutar",
  "usar",
  "cambiar",
  "activar",
  "open",
  "go",
  "show",
  "run",
  "use",
  "toggle",
  "to",
  "a",
  "al",
  "el",
  "la",
  "de",
  "the",
  "my",
  "mi",
])

/** Words that name the same thing. Folded; any member stands for the others. */
const SYNONYMS: string[][] = [
  ["ajustes", "configuracion", "preferencias", "opciones", "settings", "preferences", "options"],
  ["exportar", "export", "guardar como", "save as"],
  ["tabla", "table", "cuadro"],
  ["matriz", "matrix"],
  ["buscar", "find", "search", "busqueda"],
  ["reemplazar", "replace", "sustituir"],
  ["archivo", "file", "nota", "note"],
  ["carpeta", "folder", "directorio"],
  ["nuevo", "nueva", "new", "crear", "create"],
  ["cita", "citation", "referencia", "cite"],
  ["tema", "theme", "apariencia"],
  ["ayuda", "help"],
  ["atajos", "shortcuts", "teclas", "keybindings"],
  ["deshacer", "undo"],
  ["rehacer", "redo"],
  ["cerrar", "close"],
]

function queryVariants(query: string): string[] {
  const terms = foldText(query).split(/\s+/).filter(Boolean)
  const kept = terms.filter((t) => !FILLER.has(t))
  const base = kept.length > 0 ? kept : terms
  let variants: string[][] = [base]
  for (let i = 0; i < base.length; i++) {
    const group = SYNONYMS.find((g) => g.some((w) => w === base[i] || w.startsWith(base[i])))
    if (!group || base[i].length < 3) continue
    const next: string[][] = []
    for (const v of variants) {
      next.push(v)
      for (const w of group)
        if (w !== base[i] && !w.includes(" ")) next.push(v.map((x, k) => (k === i ? w : x)))
    }
    variants = next.slice(0, 40)
  }
  return variants.map((v) => v.join(" "))
}

function rankByAnyWord(
  leaves: readonly FlatCommand[],
  query: string,
  categoryLabel: (c: PaletteCategory) => string,
  prefs: PalettePrefs,
  ctx: CursorContext | null,
): RankedCommand[] {
  const terms = foldText(query)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !FILLER.has(t))
  if (terms.length < 2) return []
  const hits = new Map<string, { r: RankedCommand; n: number }>()
  for (const term of terms) {
    for (const r of rankCommandsStrict(leaves, term, categoryLabel, prefs, ctx)) {
      const h = hits.get(r.flat.cmd.id)
      if (h) {
        h.n++
        h.r = { ...h.r, score: h.r.score + r.score }
      } else hits.set(r.flat.cmd.id, { r, n: 1 })
    }
  }
  return [...hits.values()].sort((a, b) => b.n - a.n || b.r.score - a.r.score).map((h) => h.r)
}

function rankCommandsStrict(
  leaves: readonly FlatCommand[],
  query: string,
  categoryLabel: (c: PaletteCategory) => string,
  prefs: PalettePrefs,
  ctx: CursorContext | null,
): RankedCommand[] {
  const available = leaves.filter((l) => isAvailable(l.gates, ctx))
  const ranked = rankItems(available, query, (l) => [
    { text: l.cmd.label, weight: 1 },
    ...(l.cmd.keywords ?? []).map((k) => ({ text: k, weight: 0.6 })),
    { text: l.parents.join(" "), weight: 0.5 },
    { text: l.cmd.description, weight: 0.35 },
    {
      text: l.category ? categoryLabel(l.category) : undefined,
      weight: 0.5,
      exactOnly: true,
    },
    { text: shortcutForCommand(l.cmd.id), weight: 0.4, exactOnly: true },
  ])
  return ranked
    .map((r) => ({
      flat: r.item,
      score:
        r.score +
        usageBoost(prefs, r.item.cmd.id) +
        (prefs.pinned.includes(r.item.cmd.id) ? 5 : 0) -
        // Among equal matches the shallower command is the more general one.
        r.item.parents.length * 1.5,
      positions: r.field === 0 ? r.positions : [],
    }))
    .sort((a, b) => b.score - a.score)
}
