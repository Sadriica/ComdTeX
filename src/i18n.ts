import { createContext, useContext } from "react"
import type { Lang, T } from "./i18n/types"
import { es } from "./i18n/es"
import { en } from "./i18n/en"

export type { Lang, T }
export { es, en }

// ── Context & hook ────────────────────────────────────────────────────────────

export const LANGS: Record<Lang, T> = { en, es }

export const LanguageContext = createContext<T>(es)

export function useT(): T {
  return useContext(LanguageContext)
}
