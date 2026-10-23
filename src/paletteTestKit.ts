import { LANGS, type Lang } from "./i18n"
import type { PaletteCommandsCtx } from "./commands"

/** A ctx whose callbacks do nothing: the search only reads labels and keywords. */
export function makeCtx(lang: Lang): PaletteCommandsCtx {
  const noop = () => {}
  const base: Record<string, unknown> = {
    t: LANGS[lang],
    deps: null,
    typewriterMode: false,
    syncScroll: false,
    wordWrap: false,
    minimapEnabled: false,
    spellcheck: false,
    exportActions: new Proxy({}, { get: () => noop }),
    openCmdkRef: { current: noop },
    editorRef: { current: null },
  }
  return new Proxy(base, {
    get: (target, key) => (key in target ? target[key as string] : noop),
  }) as unknown as PaletteCommandsCtx
}
