import type * as monacoApi from "monaco-editor"
import type { CompletionEnv, CompletionModel } from "./types"

export function makeRange(
  env: CompletionEnv,
  startColumn: number,
  endColumn: number = env.position.column,
): monacoApi.IRange {
  return {
    startLineNumber: env.position.lineNumber,
    endLineNumber: env.position.lineNumber,
    startColumn,
    endColumn,
  }
}

/**
 * How much of an auto-inserted closer follows the cursor, and what to insert.
 *
 * Typing `[[` makes the editor produce `[[]]`; accepting a suggestion that
 * inserts `name]]` there used to leave `name]]]]`. The result tells the caller
 * how many characters after the cursor the replacement range should swallow
 * and which closer text the item still has to supply (empty when the construct
 * is already closed further along the line).
 */
export function closerPlan(after: string, closer: string): { extend: number; text: string } {
  let lead = 0
  while (lead < closer.length && after[lead] === closer[lead]) lead++
  if (lead > 0) return { extend: lead, text: closer }
  // Already closed later on the line (`[[na|alias]]`, `[@a; @b]`): add nothing.
  const escaped = closer.replace(/[\]}]/g, "\\$&")
  if (new RegExp(`^[^\\[\\]{}]*${escaped}`).test(after)) return { extend: 0, text: "" }
  return { extend: 0, text: closer }
}

/** Value derived from the whole document, recomputed only when the text changed. */
const versionCache = new WeakMap<object, Map<string, { version: number; value: unknown }>>()
export function cachedByVersion<T>(model: CompletionModel, key: string, compute: () => T): T {
  let perModel = versionCache.get(model)
  if (!perModel) {
    perModel = new Map()
    versionCache.set(model, perModel)
  }
  const version = model.getVersionId()
  const hit = perModel.get(key)
  if (hit && hit.version === version) return hit.value as T
  const value = compute()
  perModel.set(key, { version, value })
  return value
}

/** Escape text so Monaco's snippet parser inserts it literally. */
export function escapeSnippet(text: string): string {
  return text.replace(/[\\$}]/g, "\\$&")
}

export function foldAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/** Lowercase, accent-free, dash-separated slug for a label name. */
export function slugify(text: string, max = 40): string {
  return foldAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "")
}

/** Cap for one response; beyond it the list is marked incomplete and re-queried per keystroke. */
export const MAX_ITEMS = 200
