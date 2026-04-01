import { useCallback, useEffect, useRef, useState } from "react"
import type { SearchResult } from "./types"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"

interface SearchPanelProps {
  onSearch: (query: string) => Promise<SearchResult[]>
  onOpenResult: (filePath: string, line?: number) => void
}

export default function SearchPanel({ onSearch, onOpenResult }: SearchPanelProps) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); setSearching(false); return }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const found = await onSearch(query)
      setResults(found)
      setSearching(false)
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, onSearch])

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

  return (
    <div className="search-panel" role="search">
      <div className="search-input-wrap">
        <input
          autoFocus
          className="search-input"
          placeholder={t.search.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t.search.ariaLabel}
        />
        {searching && <span className="search-spinner" aria-live="polite" aria-label={t.search.searching}>⟳</span>}
      </div>

      <div className="search-results" role="list">
        {query && results.length === 0 && !searching && (
          <div className="search-empty" role="status">{t.search.noResults}</div>
        )}
        {results.length >= 500 && (
          <div className="search-limit" role="status">{t.search.limit}</div>
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
              {displayHits.map((hit, i) => (
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
                  <span className="search-content">{hit.content.slice(0, 80)}</span>
                </div>
              ))}
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
