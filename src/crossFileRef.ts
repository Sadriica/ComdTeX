// The text of a cross-file environment reference, in one place.
//
// `@folder/note@thm:x` has a bare form and a bracketed one, `@[my folder/note]@thm:x`.
// The renderer, the navigation scanner and the linter only accept a bare path
// made of the characters below; anything else (a space, an accent, a `+`) has to
// be bracketed or the reference never resolves. Every place that WRITES a
// reference (completion, quick fixes, the palette) goes through this module, so
// what is written is always what the readers can resolve. Lives outside
// environments.ts so the editor chunk does not import the renderers.

/** Characters a bare (unbracketed) path may contain; mirrors the readers' patterns. */
export const BARE_PATH_RE = /^[A-Za-z0-9_./-]+$/

/** The path as written after the leading `@`: bare when possible, else `[path]`. */
export function refPathTarget(path: string): string {
  return BARE_PATH_RE.test(path) ? path : `[${path}]`
}

/** `@path@id` (`id` is `kind:name`), bracketing the path when it needs it. */
export function crossFileRefText(path: string, id: string): string {
  return `@${refPathTarget(path)}@${id}`
}
