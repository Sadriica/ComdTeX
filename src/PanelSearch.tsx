import { useT } from "./i18n"

interface PanelSearchProps {
  value: string
  onChange: (value: string) => void
  /** Overrides the generic "Filter…" placeholder. */
  placeholder?: string
  /** Shown next to the input, e.g. "12 of 87". */
  resultCount?: { shown: number; total: number }
}

/**
 * The filter box used at the top of sidebar panels.
 *
 * Same shape and behaviour as the file tree's long-standing `.tree-filter`, so
 * every panel that grew long enough to need searching gets the control the user
 * already knows rather than a new one per panel.
 */
export default function PanelSearch({ value, onChange, placeholder, resultCount }: PanelSearchProps) {
  const t = useT()
  const label = placeholder ?? t.panelSearch.placeholder
  return (
    <div className="panel-search">
      <input
        className="panel-search-input"
        type="search"
        value={value}
        placeholder={label}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <>
          {resultCount && (
            <span className="panel-search-count" aria-live="polite">
              {t.panelSearch.count(resultCount.shown, resultCount.total)}
            </span>
          )}
          <button
            className="panel-search-clear"
            onClick={() => onChange("")}
            title={t.panelSearch.clear}
            aria-label={t.panelSearch.clear}
          >×</button>
        </>
      )}
    </div>
  )
}

/**
 * Case- and accent-insensitive substring match.
 *
 * Accent folding matters here: the UI is Spanish, and someone typing "indice"
 * must find "índice"; an exact match would make the filter feel broken.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  if (!query.trim()) return true
  return fold(haystack).includes(fold(query))
}

function fold(s: string): string {
  return s
    .toLowerCase()
    // NFD would decompose ñ into "n" + combining tilde and the strip below
    // would turn it into a plain "n". In Spanish ñ is its own letter, not an
    // accented n, so it is parked on a private-use code point across the fold and
    // restored afterwards. Accented vowels DO fold: "indice" finds "índice".
    .replace(/\u00f1/g, "\ue000")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\ue000/g, "\u00f1")
}
