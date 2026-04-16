import { useCallback, useRef, useState } from "react"
import { displayBasename } from "./pathUtils"

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
  onReplaceInFile: (path: string, search: string, replace: string, flags: string) => Promise<number>
}

function buildFlags(caseSensitive: boolean): string {
  return caseSensitive ? "g" : "gi"
}

function buildPattern(query: string, caseSensitive: boolean, wholeWord: boolean, regexMode: boolean): RegExp | null {
  try {
    let pattern = regexMode ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (wholeWord) pattern = `\\b${pattern}\\b`
    const flags = caseSensitive ? "g" : "gi"
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
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

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    const pattern = buildPattern(query, caseSensitive, wholeWord, regexMode)
    if (!pattern) { setError("Expresión regular inválida"); return }
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
        setError("Error al buscar en el vault")
        setSearching(false)
      }
    }
  }, [query, caseSensitive, wholeWord, regexMode, _vaultPath])

  const handleReplaceOne = useCallback(async (result: SearchReplaceResult) => {
    if (replacing) return
    setReplacing(true)
    try {
      const flags = buildFlags(caseSensitive)
      await onReplaceInFile(result.filePath, query, replacement, flags)
      // Re-run search to refresh results
      await handleSearch()
    } finally {
      if (mountedRef.current) setReplacing(false)
    }
  }, [replacing, caseSensitive, query, replacement, onReplaceInFile, handleSearch])

  const handleReplaceAll = useCallback(async () => {
    if (replacing || results.length === 0) return
    setReplacing(true)
    try {
      const flags = buildFlags(caseSensitive)
      // Group by file path to replace once per file
      const files = [...new Set(results.map(r => r.filePath))]
      for (const filePath of files) {
        await onReplaceInFile(filePath, query, replacement, flags)
      }
      await handleSearch()
    } finally {
      if (mountedRef.current) setReplacing(false)
    }
  }, [replacing, results, caseSensitive, query, replacement, onReplaceInFile, handleSearch])

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-header-title">Buscar y Reemplazar</span>
      </div>

      <div className="search-replace-inputs">
        <input
          placeholder="Buscar…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          aria-label="Término de búsqueda"
        />
        <input
          placeholder="Reemplazar con…"
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
        <button onClick={handleSearch} disabled={!query.trim() || searching}>
          {searching ? "Buscando…" : "Buscar"}
        </button>
        <button onClick={handleReplaceAll} disabled={results.length === 0 || replacing}>
          {replacing ? "Reemplazando…" : "Reemplazar todo"}
        </button>
      </div>

      {error && <div className="panel-empty" style={{ color: "#e88" }}>{error}</div>}

      {!error && query && results.length === 0 && !searching && (
        <div className="panel-empty">Sin resultados</div>
      )}

      {results.length >= 500 && (
        <div className="panel-empty" style={{ color: "#888" }}>Mostrando primeros 500 resultados</div>
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
