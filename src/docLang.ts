/**
 * The language of the words a DOCUMENT prints: "Theorem 2", "Figure 1",
 * "References". They are not UI chrome, so they cannot come from React
 * context; the renderer and the exporters are plain functions.
 *
 * Which language: the document's own `lang`/`language` frontmatter when it names
 * one we have, else the interface language. The interface language is held
 * here (`setUiLanguage`, called by the app when the setting changes) so the
 * export paths need no extra argument; it defaults to Spanish, which is also
 * what the app's `LanguageContext` defaults to.
 *
 * `renderMarkdown` pins the resolved language for the duration of a render
 * (`withDocLanguage`), so the environment, figure and bibliography code reads
 * it through `activeDocTerms()` without a parameter on every function.
 *
 * LaTeX export is deliberately NOT routed through here: it names things
 * through its own babel-driven `\newtheorem` declarations.
 */

import { en } from "./i18n/en"
import { es } from "./i18n/es"
import type { Lang } from "./i18n/types"

export type DocLang = Lang

let uiLanguage: DocLang = "es"
let pinnedLanguage: DocLang | null = null

export function setUiLanguage(lang: DocLang): void {
  uiLanguage = lang
}

export function getUiLanguage(): DocLang {
  return uiLanguage
}

/** "en", "en-US", "english", "Español", "es_ES" ... to a supported language, or null. */
export function parseLanguageTag(value: unknown): DocLang | null {
  if (typeof value !== "string") return null
  const v = value.trim().toLowerCase()
  if (/^(en|eng|english|ingl[eé]s)([-_].*)?$/.test(v)) return "en"
  if (/^(es|spa|spanish|espa[nñ]ol|castellano)([-_].*)?$/.test(v)) return "es"
  return null
}

/** The language a document's frontmatter asks for (`lang` or `language`), if any. */
export function frontmatterLanguage(
  data: Record<string, unknown> | null | undefined,
): DocLang | null {
  if (!data) return null
  return parseLanguageTag(data.lang) ?? parseLanguageTag(data.language)
}

/** Document language when it sets one, else `fallback` (the interface language by default). */
export function resolveDocLanguage(
  data: Record<string, unknown> | null | undefined,
  fallback: DocLang = uiLanguage,
): DocLang {
  return frontmatterLanguage(data) ?? fallback
}

export function docTermsFor(lang: DocLang) {
  return (lang === "en" ? en : es).docTerms
}

/**
 * The BCP 47 tag to put on the preview root, so the engine hyphenates with the
 * right dictionary. A frontmatter `lang` that already is a tag ("fr", "de-CH")
 * is passed through even though we have no UI words for it; "english", "eng"
 * and the like resolve to "en"; with nothing usable, the document/interface language.
 */
export function previewLangTag(
  data: Record<string, unknown> | null | undefined,
  fallback: DocLang = uiLanguage,
): string {
  const raw = data?.lang ?? data?.language
  if (typeof raw === "string") {
    const v = raw.trim().replace(/_/g, "-")
    if (/^[A-Za-z]{2}(-[A-Za-z0-9]{2,8})*$/.test(v)) return v
  }
  return resolveDocLanguage(data, fallback)
}

/** Words for the language of the render in progress (the interface language outside one). */
export function activeDocTerms() {
  return docTermsFor(pinnedLanguage ?? uiLanguage)
}

export function activeDocLanguage(): DocLang {
  return pinnedLanguage ?? uiLanguage
}

/** Runs `fn` with `lang` pinned as the document language, then restores the previous one. */
export function withDocLanguage<T>(lang: DocLang, fn: () => T): T {
  const previous = pinnedLanguage
  pinnedLanguage = lang
  try {
    return fn()
  } finally {
    pinnedLanguage = previous
  }
}

/** Title of an environment type (`theorem` -> "Theorem"), or "" when unknown. */
export function envTitle(envName: string, lang: DocLang = activeDocLanguage()): string {
  return docTermsFor(lang).env[envName] ?? ""
}
