import { useCallback, useRef, useState } from "react"
import { displayBasename } from "./pathUtils"
import { buildSearchRegExp, type SearchReplaceOptions, type SearchReplaceTarget } from "./searchReplace"
import { useT } from "./i18n"

interface SearchReplaceResult {
  filePath: string
  line: number
  content: string
  matchStart: number
  matchEnd: number
}

interface SearchReplacePanelProps {
  vaultPath: string
  onOpenFile: (path: string, line?: number) => void
  onReplaceInFile: (path: string, search: string, replace: string, opts: SearchReplaceOptions, target?: SearchReplaceTarget) => Promise<number>
}

function highlightMatch(content: string, matchStart: number, matchEnd: number): { before: string; match: string; after: string } {
  const RADIUS = 40
  const start = Math.max(0, matchStart - RADIUS)
  const end = Math.min(content.length, matchEnd + RADIUS)
  return {
    before: (start > 0 ? "…" : "") + content.slice(start, matchStart),
    match: content.slice(matchStart, matchEnd),
    after: content.slice(matchEnd, end) + (end < content.length ? "…" : ""),
  }
}

export default function SearchReplacePanel({ vaultPath: _vaultPath, onOpenFile, onReplaceInFile }: SearchReplacePanelProps) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regexMode, setRegexMode] = useState(false)
  const [results, setResults] = useState<SearchReplaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingSearchRef = useRef<() => void>(() => {})

  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    const pattern = buildSearchRegExp(query, { caseSensitive, wholeWord, regex: regexMode })
    if (!pattern) { setError(t.search.errorPattern); return }
    const validPattern = pattern
    setError(null)
    setSearching(true)
    setResults([])

    try {
      const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs")
      const found: SearchReplaceResult[] = []

      async function scanDir(dirPath: string) {
        let entries
        try {
          entries = await readDir(dirPath)
        } catch {
          return
        }
        for (const entry of entries) {
          const fullPath = `${dirPath}/${entry.name}`
          if (entry.isDirectory) {
            await scanDir(fullPath)
          } else if (entry.name.endsWith(".md") || entry.name.endsWith(".tex")) {
            try {
              const text = await readTextFile(fullPath)
              const lines = text.split("\n")
              lines.forEach((lineContent, lineIdx) => {
                const re = new RegExp(validPattern.source, validPattern.flags)
                let m: RegExpExecArray | null
                while ((m = re.exec(lineContent)) !== null) {
                  found.push({
                    filePath: fullPath,
                    line: lineIdx + 1,
                    content: lineContent,
                    matchStart: m.index,
                    matchEnd: m.index + m[0].length,
                  })
                  if (m[0].length === 0) re.lastIndex++
                  if (!re.global) break
                }
              })
            } catch {
              // skip unreadable files
            }
          }
        }
      }

      await scanDir(_vaultPath)

      if (mountedRef.current) {
        setResults(found.slice(0, 500))
        setSearching(false)
      }
    } catch {
      if (mountedRef.current) {
        setError(t.search.errorSearching)
        setSearching(false)
      }
    }
  }, [query, caseSensitive, wholeWord, regexMode, _vaultPath, t])

  const handleSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(), 300)
    pendingSearchRef.current = doSearch
  }, [doSearch])

  const handleSearchNow = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    await doSearch()
  }, [doSearch])

  const handleReplaceOne = useCallback(async (result: SearchReplaceResult) => {
    if (replacing) return
    setReplacing(true)
    try {
      await onReplaceInFile(result.filePath, query, replacement, {
        caseSensitive,
        wholeWord,
        regex: regexMode,
      }, {
        line: result.line,
        matchStart: result.matchStart,
        matchEnd: result.matchEnd,
      })
      // Re-run search to refresh results
      await handleSearchNow()
    } finally {
      if (mountedRef.current) setReplacing(false)
    }
  }, [replacing, caseSensitive, wholeWord, regexMode, query, replacement, onReplaceInFile, handleSearchNow])

  const handleReplaceAll = useCallback(async () => {
    if (replacing || results.length === 0) return
    setReplacing(true)
    try {
      // Group by file path to replace once per file
      const files = [...new Set(results.map(r => r.filePath))]
      for (const filePath of files) {
        await onReplaceInFile(filePath, query, replacement, {
          caseSensitive,
          wholeWord,
          regex: regexMode,
        })
      }
      await handleSearchNow()
    } finally {
      if (mountedRef.current) setReplacing(false)
    }
  }, [replacing, results, caseSensitive, wholeWord, regexMode, query, replacement, onReplaceInFile, handleSearchNow])

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-header-title">{t.search.toggleReplace}</span>
      </div>

      <div className="search-replace-inputs">
        <input
          placeholder={t.search.searchPlaceholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          aria-label="Término de búsqueda"
        />
        <input
          placeholder={t.search.replaceWithPlaceholder}
          value={replacement}
          onChange={e => setReplacement(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          aria-label="Texto de reemplazo"
        />
      </div>

      <div className="search-replace-options">
        <label>
          <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />
          Aa
        </label>
        <label>
          <input type="checkbox" checked={wholeWord} onChange={e => setWholeWord(e.target.checked)} />
          \b
        </label>
        <label>
          <input type="checkbox" checked={regexMode} onChange={e => setRegexMode(e.target.checked)} />
          .*
        </label>
      </div>

      <div className="search-replace-btns">
        <button onClick={handleSearchNow} disabled={!query.trim() || searching}>
          {searching ? "Buscando…" : "Buscar"}
        </button>
        <button onClick={handleReplaceAll} disabled={results.length === 0 || replacing}>
          {replacing ? "Reemplazando…" : "Reemplazar todo"}
        </button>
      </div>

      {error && <div className="panel-empty" style={{ color: "#e88" }}>{error}</div>}

      {!error && query && results.length === 0 && !searching && (
        <div className="panel-empty">{t.search.noResults}</div>
      )}

      {results.length >= 500 && (
        <div className="panel-empty" style={{ color: "#888" }}>{t.search.limit}</div>
      )}

      <div style={{ overflowY: "auto", flex: 1 }}>
        {results.map((result, idx) => {
          const { before, match, after } = highlightMatch(result.content, result.matchStart, result.matchEnd)
          return (
            <div key={idx} className="search-replace-result">
              <span
                className="search-replace-result-file"
                title={result.filePath}
                onClick={() => onOpenFile(result.filePath, result.line)}
                onKeyDown={(e) => e.key === "Enter" && onOpenFile(result.filePath, result.line)}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                {displayBasename(result.filePath)}
              </span>
              <span className="search-replace-result-line">{result.line}</span>
              <span
                className="search-replace-result-text"
                onClick={() => onOpenFile(result.filePath, result.line)}
                onKeyDown={(e) => e.key === "Enter" && onOpenFile(result.filePath, result.line)}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                {before}
                {match && <mark>{match}</mark>}
                {after}
              </span>
              <button
                className="search-replace-result-btn"
                onClick={() => handleReplaceOne(result)}
                disabled={replacing}
              >
                Reemplazar
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
