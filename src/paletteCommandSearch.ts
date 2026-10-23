import { rankItems } from "./fuzzy"
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
