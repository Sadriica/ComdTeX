import { useState } from "react"
import { useT } from "./i18n"
import { matchesQuery } from "./PanelSearch"
import { CATEGORY_ORDER, SYMBOLS } from "./mathSymbols"

const CATEGORY_LABELS: Record<string, string> = {
  "greek-lower": "Greek (lowercase)",
  "greek-upper": "Greek (uppercase)",
  operators: "Operators",
  relations: "Relations",
  arrows: "Arrows",
  logic: "Logic",
  sets: "Sets & Numbers",
  calculus: "Calculus & Analysis",
  misc: "Miscellaneous",
}

export default function SymbolPickerPanel({ onInsert }: { onInsert: (latex: string) => void }) {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState<string | "all">("all")
  // Symbol under the pointer or keyboard focus: its LaTeX command is shown in
  // the footer, where a tooltip would be clipped by the scrolling grid.
  const [hovered, setHovered] = useState<{ name: string; latex: string } | null>(null)
  const t = useT()

  const query = search.trim().toLowerCase()

  const filtered = query
    ? SYMBOLS.filter(
        (s) =>
          matchesQuery(s.name, query) ||
          matchesQuery(s.latex, query) ||
          s.keywords.some((k) => matchesQuery(k, query)),
      )
    : activeCategory === "all"
      ? SYMBOLS
      : SYMBOLS.filter((s) => s.category === activeCategory)

  const showSections = !query && activeCategory === "all"

  const sections = showSections
    ? CATEGORY_ORDER.map((cat) => ({
        cat,
        label: CATEGORY_LABELS[cat],
        symbols: SYMBOLS.filter((s) => s.category === cat),
      }))
    : null

  return (
    <div className="symbol-picker">
      <div className="symbol-picker-title">{t.symbolPicker.title}</div>
      <input
        className="symbol-picker-search"
        type="text"
        placeholder={t.symbolPicker.searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label={t.symbolPicker.searchPlaceholder}
      />
      {!query && (
        <div className="symbol-picker-cats">
          <button
            className={`symbol-cat-btn${activeCategory === "all" ? " active" : ""}`}
            onClick={() => setActiveCategory("all")}
          >
            {t.symbolPicker.all}
          </button>
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              className={`symbol-cat-btn${activeCategory === cat ? " active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}
      <div className="symbol-grid-wrap">
        {showSections && sections ? (
          sections.map(({ cat, label, symbols }) => (
            <div key={cat}>
              <div className="symbol-section-label">{label}</div>
              <div className="symbol-grid">
                {symbols.map((sym, i) => (
                  <button
                    key={`${cat}-${i}`}
                    className="symbol-btn"
                    title={`${sym.name}: ${sym.latex}`}
                    aria-label={`${sym.name} (${sym.latex})`}
                    onClick={() => onInsert(sym.latex)}
                    onMouseEnter={() => setHovered(sym)}
                    onFocus={() => setHovered(sym)}
                  >
                    {sym.display}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="symbol-grid">
            {filtered.map((sym, i) => (
              <button
                key={i}
                className="symbol-btn"
                title={`${sym.name}: ${sym.latex}`}
                aria-label={`${sym.name} (${sym.latex})`}
                onClick={() => onInsert(sym.latex)}
                onMouseEnter={() => setHovered(sym)}
                onFocus={() => setHovered(sym)}
              >
                {sym.display}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="symbol-picker-info" aria-live="off">
        {hovered ? (
          <>
            <code className="symbol-picker-cmd">{hovered.latex}</code>
            <span className="symbol-picker-name">{hovered.name}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}
