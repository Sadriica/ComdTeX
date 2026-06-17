/**
 * Ambient type declarations for the offline spell-check dependencies.
 *
 * `nspell` and the wooorm `dictionary-*` packages ship no (usable) TypeScript
 * types for our usage, and the Hunspell `.aff` / `.dic` data files are imported
 * as raw strings via Vite's `?raw` suffix. These declarations keep `tsc`
 * happy without pulling in the packages' Node-only ESM entry points.
 */

declare module "nspell" {
  /** A minimal slice of the nspell API that ComdTeX uses. */
  export interface NSpell {
    /** True if `word` is spelled correctly. */
    correct(word: string): boolean
    /** Up to a handful of spelling suggestions for `word`. */
    suggest(word: string): string[]
    /** Detailed spelling info: `{ correct, forbidden, warn }`. */
    spell(word: string): { correct: boolean; forbidden: boolean; warn: boolean }
    /** Add a word to the runtime dictionary. */
    add(word: string, model?: string): NSpell
  }

  /**
   * Construct a spell-checker from Hunspell affix + dictionary data.
   * Both arguments accept the raw file contents as strings.
   */
  function nspell(aff: string | { aff: string; dic: string }, dic?: string): NSpell

  export default nspell
}

// Raw Hunspell data imported via Vite's `?raw` loader.
declare module "*.aff?raw" {
  const content: string
  export default content
}
declare module "*.dic?raw" {
  const content: string
  export default content
}
