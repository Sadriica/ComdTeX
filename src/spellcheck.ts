/**
 * Offline spell-checking for ComdTeX (Spanish + English only).
 *
 * Uses the wooorm Hunspell dictionaries (`dictionary-es`, `dictionary-en`)
 * driven by `nspell`. The `.aff` / `.dic` data files are imported as raw
 * strings so the checker works fully offline in the bundled app — no network,
 * no filesystem access, no manual downloads.
 *
 * Design notes:
 *  - Dictionaries are loaded lazily and asynchronously (the `.dic` files are
 *    ~0.5–0.7 MB each). Until a language's dictionary is ready, `checkText`
 *    returns `[]` — callers re-run once `onReady` fires.
 *  - Only ONE language is active per check, chosen from the document's
 *    frontmatter `lang:` (if present) or the app `settings.language`.
 *  - Before tokenising we mask out everything that is *not* prose: code spans
 *    and fences, math, URLs, wikilinks, citations, `:::env` markers, LaTeX
 *    commands and frontmatter. This keeps syntax from being flagged as typos.
 */

import nspell, { type NSpell } from "nspell"

// Raw Hunspell data. Relative `?raw` imports bypass each package's `exports`
// map (which only exposes the Node-only ESM entry) and give us plain strings
// that work in the browser bundle and in the (node) test environment alike.
import esAff from "../node_modules/dictionary-es/index.aff?raw"
import esDic from "../node_modules/dictionary-es/index.dic?raw"
import enAff from "../node_modules/dictionary-en/index.aff?raw"
import enDic from "../node_modules/dictionary-en/index.dic?raw"

export type SpellLang = "es" | "en"

export interface SpellIssue {
  /** The misspelled word, as it appears in the source. */
  word: string
  /** 0-based character offset of the word's first character. */
  start: number
  /** 0-based character offset just past the word's last character. */
  end: number
  /** Up to ~5 correction suggestions. */
  suggestions: string[]
}

// ── Dictionary lifecycle (lazy, async, cached) ─────────────────────────────────

const RAW: Record<SpellLang, { aff: string; dic: string }> = {
  es: { aff: esAff, dic: esDic },
  en: { aff: enAff, dic: enDic },
}

const checkers: Partial<Record<SpellLang, NSpell>> = {}
const loading: Partial<Record<SpellLang, Promise<NSpell>>> = {}
const readyListeners = new Set<(lang: SpellLang) => void>()

/**
 * Register a callback fired whenever a language's dictionary finishes loading.
 * Used by the linter to re-run once async loading completes. Returns an
 * unsubscribe function.
 */
export function onDictionaryReady(cb: (lang: SpellLang) => void): () => void {
  readyListeners.add(cb)
  return () => readyListeners.delete(cb)
}

function normalizeLang(lang: string | undefined): SpellLang {
  const l = (lang ?? "").toLowerCase()
  if (l.startsWith("en")) return "en"
  return "es" // default + any es-* variant
}

/**
 * Kick off (or return cached) async load of a language's spell-checker.
 * Building the nspell instance from the ~MB dictionary is the heavy part, so
 * we yield to a microtask first to avoid blocking the caller synchronously.
 */
function ensureChecker(lang: SpellLang): Promise<NSpell> {
  const existing = checkers[lang]
  if (existing) return Promise.resolve(existing)
  const inFlight = loading[lang]
  if (inFlight) return inFlight

  const p = Promise.resolve().then(() => {
    const { aff, dic } = RAW[lang]
    const checker = nspell(aff, dic)
    checkers[lang] = checker
    delete loading[lang]
    for (const cb of readyListeners) cb(lang)
    return checker
  })
  loading[lang] = p
  return p
}

/** Pick the active spell-check language for a document. */
export function resolveSpellLang(
  frontmatterLang: string | undefined,
  settingsLang: string | undefined,
): SpellLang {
  if (frontmatterLang) return normalizeLang(frontmatterLang)
  return normalizeLang(settingsLang)
}

// ── Masking (replace non-prose with spaces, preserving offsets) ────────────────

/**
 * Replace every non-prose region with spaces so its characters never reach the
 * tokenizer, while preserving newlines (and therefore all character offsets).
 */
function maskNonProse(text: string): string {
  const buf = Array.from(text)
  const blank = (start: number, len: number) => {
    for (let i = start; i < start + len && i < buf.length; i++) {
      if (buf[i] !== "\n") buf[i] = " "
    }
  }
  const apply = (re: RegExp) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      blank(m.index, m[0].length)
      if (m[0].length === 0) re.lastIndex++ // guard against zero-width matches
    }
  }

  // YAML frontmatter (must be at the very top).
  if (text.startsWith("---\n") || text.startsWith("---\r\n")) {
    const end = text.indexOf("\n---", 4)
    if (end !== -1) blank(0, end + 4)
  }

  apply(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm) // fenced code blocks
  apply(/`[^`\n]+`/g)                        // inline code
  apply(/\$\$[\s\S]*?\$\$/g)                 // display math
  apply(/\$[^$\n]+\$/g)                      // inline math
  apply(/!?\[\[[^\]\n]*\]\]/g)               // wikilinks + transclusions
  apply(/\[@[^\]\n]*\]/g)                    // citations
  apply(/@(?:eq|fig|sec|tbl):[\w:.-]+/g)     // cross-references
  apply(/https?:\/\/\S+/g)                   // bare URLs
  apply(/\]\([^)\n]*\)/g)                    // markdown link/image targets
  apply(/\{#[\w:.-]+\}/g)                    // label definitions
  apply(/^:::\w[^\n]*/gm)                    // :::env opening markers
  apply(/\\[a-zA-Z@]+\*?/g)                  // LaTeX commands
  apply(/#\w[\w-]*/g)                        // inline #tags

  return buf.join("")
}

// ── Tokenisation ───────────────────────────────────────────────────────────────

// A word is a run of letters (incl. accented/Unicode), optionally with internal
// apostrophes or hyphens (don't, well-known). The `u` flag enables \p classes.
const WORD_RE = /\p{L}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)*/gu

/** Skip pure-uppercase acronyms and words containing digits. */
function isLikelyProseWord(word: string): boolean {
  if (word.length < 2) return false
  if (/\d/.test(word)) return false
  if (word === word.toUpperCase() && word.length > 1) return false // ACRONYM / API
  return true
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Spell-check `text` against the dictionary for `lang`.
 *
 * Returns issues for unknown words. If the dictionary for `lang` is not yet
 * loaded, kicks off the async load and returns `[]` immediately (callers
 * re-run via `onDictionaryReady`).
 */
export function checkText(text: string, lang: SpellLang): SpellIssue[] {
  const checker = checkers[lang]
  if (!checker) {
    void ensureChecker(lang) // start loading; results arrive on a later pass
    return []
  }

  const masked = maskNonProse(text)
  const issues: SpellIssue[] = []
  WORD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  const seen = new Map<string, string[]>() // word → cached suggestions

  while ((m = WORD_RE.exec(masked)) !== null) {
    const word = m[0]
    if (!isLikelyProseWord(word)) continue
    if (checker.correct(word)) continue

    let suggestions = seen.get(word)
    if (suggestions === undefined) {
      suggestions = checker.suggest(word).slice(0, 5)
      seen.set(word, suggestions)
    }

    issues.push({ word, start: m.index, end: m.index + word.length, suggestions })
  }

  return issues
}

/** Eagerly begin loading a language's dictionary (e.g. when the setting flips on). */
export function preloadDictionary(lang: SpellLang): void {
  void ensureChecker(lang)
}

/** Test/inspection helper: is a language's dictionary loaded yet? */
export function isDictionaryReady(lang: SpellLang): boolean {
  return Boolean(checkers[lang])
}
