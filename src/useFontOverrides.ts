import { useEffect } from "react"
import { buildStack, fontOverrideCss } from "./fontChoices"

const STYLE_ID = "comdtex-font-overrides"

/** Applies the interface font by injecting a rule that overrides `--font-ui`. */
export function useFontOverrides(uiFontFamily: string): void {
  useEffect(() => {
    const css = fontOverrideCss(buildStack("ui", uiFontFamily))
    let el = document.getElementById(STYLE_ID)
    if (!css) {
      el?.remove()
      return
    }
    if (!el) {
      el = document.createElement("style")
      el.id = STYLE_ID
    }
    el.textContent = css
    // Re-append so it stays after any stylesheet injected later (dev HMR).
    document.head.appendChild(el)
  }, [uiFontFamily])
}
