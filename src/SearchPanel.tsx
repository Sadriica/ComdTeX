import { useCallback, useEffect, useRef, useState } from "react"
import type { SearchResult } from "./types"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"

interface SearchPanelProps {
  onSearch: (query: string, opts?: { regex?: boolean; caseSensitive?: boolean }) => Promise<SearchResult[]>
  onOpenResult: (filePath: string, line?: number) => void
  onReplaceAll?: (query: string, replacement: string, opts?: { regex?: boolean; caseSensitive?: boolean }) => Promise<number>
}

/** Extract a ±RADIUS character snippet around the first occurrence of `query`. */
function contextSnippet(
  content: string,
  query: string,
): { before: string; match: string; after: string } {
  const RADIUS = 45
  const idx = content.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) {
    return { before: content.slice(0, RADIUS * 2), match: "", after: "" }
  }
  const start = Math.max(0, idx - RADIUS)
  const end = Math.min(content.length, idx + query.length + RADIUS)
  return {
    before: (start > 0 ? "…" : "") + content.slice(start, idx),
    match: content.slice(idx, idx + query.length),
    after: content.slice(idx + query.length, end) + (end < content.length ? "…" : ""),
  }
}

export default function SearchPanel({ onSearch, onOpenResult, onReplaceAll }: SearchPanelProps) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")
  const [replaceMode, setReplaceMode] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearching(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const found = await onSearch(query, { regex: useRegex, caseSensitive })
        if (mountedRef.current) { setResults(found); setSearching(false) }
      } catch {
        if (mountedRef.current) { setResults([]); setSearching(false) }
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, onSearch, useRegex, caseSensitive])

  const toggleExpand = useCallback((filePath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.filePath]) acc[r.filePath] = []
    acc[r.filePath].push(r)
    return acc
  }, {})

  const handleReplaceAll = useCallback(async () => {
    if (!onReplaceAll || !query.trim() || replacing) return
    setReplacing(true)
    try {
      const count = await onReplaceAll(query, replacement, { regex: useRegex, caseSensitive })
      if (mountedRef.current) {
        const found = await onSearch(query, { regex: useRegex, caseSensitive })
        if (mountedRef.current) { setResults(found); setSearching(false) }
      }
      void count
    } finally {
      if (mountedRef.current) setReplacing(false)
    }
  }, [onReplaceAll, query, replacement, replacing, onSearch, useRegex, caseSensitive])

  return (
    <div className="search-panel" role="search">
      <div className="search-input-wrap">
        <input
          autoFocus
          className="search-input"
          placeholder={t.search.placeholder}
          value={query}
          onChange={(e) => {
            const val = e.target.value
            setQuery(val)
            if (!val.trim()) { setResults([]); setSearching(false) }
          }}
          aria-label={t.search.ariaLabel}
        />
        <button
          className={`search-opt-btn${useRegex ? " active" : ""}`}
          onClick={() => setUseRegex((r) => !r)}
          title={t.search.regexTitle}
          aria-pressed={useRegex}
        >.*</button>
        <button
          className={`search-opt-btn${caseSensitive ? " active" : ""}`}
          onClick={() => setCaseSensitive((c) => !c)}
          title={t.search.caseSensitiveTitle}
          aria-pressed={caseSensitive}
        >Aa</button>
        {onReplaceAll && (
          <button
            className={`search-replace-toggle${replaceMode ? " active" : ""}`}
            onClick={() => setReplaceMode((r) => !r)}
            title={t.search.toggleReplace}
            aria-pressed={replaceMode}
          >⇄</button>
        )}
        {searching && <span className="search-spinner" aria-live="polite" aria-label={t.search.searching}>⟳</span>}
      </div>
      {replaceMode && (
        <div className="search-replace-wrap">
          <input
            className="search-input search-replace-input"
            placeholder={t.search.replacePlaceholder}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReplaceAll()}
          />
          <button
            className="search-replace-btn"
            onClick={handleReplaceAll}
            disabled={!query.trim() || replacing}
            title={t.search.replaceAll}
          >
            {replacing ? "⟳" : t.search.replaceAll}
          </button>
        </div>
      )}

      <div className="search-results" role="list">
        {query && results.length === 0 && !searching && (
          <div className="search-empty" role="status">{t.search.noResults}</div>
        )}
        {results.length >= 500 && (
          <div className="search-limit-banner" role="status" aria-live="polite">
            <span className="search-limit-icon" aria-hidden="true">⚠</span>
            <span className="search-limit-text">{t.search.limit}</span>
          </div>
        )}

        {Object.entries(grouped).map(([filePath, hits]) => {
          const isExpanded = expanded.has(filePath)
          const displayHits = isExpanded ? hits : hits.slice(0, 5)

          return (
            <div key={filePath} className="search-group" role="listitem">
              <div
                className="search-file"
                onClick={() => hits.length > 5 ? toggleExpand(filePath) : onOpenResult(filePath)}
                title={filePath}
                role="button"
                aria-expanded={hits.length > 5 ? isExpanded : undefined}
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && (hits.length > 5 ? toggleExpand(filePath) : onOpenResult(filePath))}
              >
                {displayBasename(filePath)}
                <span className="search-count" aria-label={t.search.count(hits.length)}>{hits.length}</span>
              </div>
              {displayHits.map((hit, i) => {
                const { before, match, after } = contextSnippet(hit.content, query)
                return (
                  <div
                    key={i}
                    className="search-hit"
                    onClick={() => onOpenResult(hit.filePath, hit.line)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onOpenResult(hit.filePath, hit.line)}
                    aria-label={t.search.lineAriaLabel(hit.line, hit.content)}
                  >
                    <span className="search-line">{hit.line}</span>
                    <span className="search-content">
                      {before}
                      {match && <mark className="search-highlight">{match}</mark>}
                      {after}
                    </span>
                  </div>
                )
              })}
              {hits.length > 5 && (
                <div
                  className="search-more"
                  onClick={() => toggleExpand(filePath)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && toggleExpand(filePath)}
                >
                  {isExpanded ? t.search.showLess : t.search.more(hits.length - 5)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
