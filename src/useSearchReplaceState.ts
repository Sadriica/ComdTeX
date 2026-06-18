import { useState } from "react"

export interface SearchReplaceResult {
  filePath: string
  line: number
  content: string
  matchStart: number
  matchEnd: number
}

/**
 * Persistent state for the Search & Replace panel, lifted into AppContent so the
 * query, replacement, options and last results survive the panel unmounting when
 * the user switches sidebar panels. Only the transient action flags (searching /
 * replacing / error) stay local to the panel.
 *
 * In-memory only (no sessionStorage): a search query is per-session working state,
 * not something worth restoring across an app restart.
 */
export interface SearchReplaceState {
  query: string
  setQuery: React.Dispatch<React.SetStateAction<string>>
  replacement: string
  setReplacement: React.Dispatch<React.SetStateAction<string>>
  caseSensitive: boolean
  setCaseSensitive: React.Dispatch<React.SetStateAction<boolean>>
  wholeWord: boolean
  setWholeWord: React.Dispatch<React.SetStateAction<boolean>>
  regexMode: boolean
  setRegexMode: React.Dispatch<React.SetStateAction<boolean>>
  results: SearchReplaceResult[]
  setResults: React.Dispatch<React.SetStateAction<SearchReplaceResult[]>>
}

export function useSearchReplaceState(): SearchReplaceState {
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regexMode, setRegexMode] = useState(false)
  const [results, setResults] = useState<SearchReplaceResult[]>([])

  return {
    query, setQuery,
    replacement, setReplacement,
    caseSensitive, setCaseSensitive,
    wholeWord, setWholeWord,
    regexMode, setRegexMode,
    results, setResults,
  }
}
