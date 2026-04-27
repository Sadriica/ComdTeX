import { useState } from "react"
import { useT } from "./i18n"

interface MathSymbol {
  display: string
  latex: string
  name: string
  category: string
  keywords: string[]
}

const SYMBOLS: MathSymbol[] = [
  // greek-lower
  { display: "α", latex: "\\alpha",    name: "alpha",   category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "β", latex: "\\beta",     name: "beta",    category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "γ", latex: "\\gamma",    name: "gamma",   category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "δ", latex: "\\delta",    name: "delta",   category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ε", latex: "\\epsilon",  name: "epsilon", category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ζ", latex: "\\zeta",     name: "zeta",    category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "η", latex: "\\eta",      name: "eta",     category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "θ", latex: "\\theta",    name: "theta",   category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ι", latex: "\\iota",     name: "iota",    category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "κ", latex: "\\kappa",    name: "kappa",   category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "λ", latex: "\\lambda",   name: "lambda",  category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "μ", latex: "\\mu",       name: "mu",      category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ν", latex: "\\nu",       name: "nu",      category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ξ", latex: "\\xi",       name: "xi",      category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "π", latex: "\\pi",       name: "pi",      category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ρ", latex: "\\rho",      name: "rho",     category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "σ", latex: "\\sigma",    name: "sigma",   category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "τ", latex: "\\tau",      name: "tau",     category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "υ", latex: "\\upsilon",  name: "upsilon", category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "φ", latex: "\\phi",      name: "phi",     category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "χ", latex: "\\chi",      name: "chi",     category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ψ", latex: "\\psi",      name: "psi",     category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ω", latex: "\\omega",    name: "omega",   category: "greek-lower", keywords: ["greek", "letter"] },
  { display: "ε", latex: "\\varepsilon", name: "varepsilon", category: "greek-lower", keywords: ["greek", "letter", "variant"] },
  { display: "φ", latex: "\\varphi",   name: "varphi",  category: "greek-lower", keywords: ["greek", "letter", "variant"] },
  { display: "θ", latex: "\\vartheta", name: "vartheta", category: "greek-lower", keywords: ["greek", "letter", "variant"] },
  { display: "ρ", latex: "\\varrho",   name: "varrho",  category: "greek-lower", keywords: ["greek", "letter", "variant"] },

  // greek-upper
  { display: "Γ", latex: "\\Gamma",   name: "Gamma",   category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Δ", latex: "\\Delta",   name: "Delta",   category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Θ", latex: "\\Theta",   name: "Theta",   category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Λ", latex: "\\Lambda",  name: "Lambda",  category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Ξ", latex: "\\Xi",      name: "Xi",      category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Π", latex: "\\Pi",      name: "Pi",      category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Σ", latex: "\\Sigma",   name: "Sigma",   category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Υ", latex: "\\Upsilon", name: "Upsilon", category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Φ", latex: "\\Phi",     name: "Phi",     category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Ψ", latex: "\\Psi",     name: "Psi",     category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },
  { display: "Ω", latex: "\\Omega",   name: "Omega",   category: "greek-upper", keywords: ["greek", "letter", "uppercase"] },

  // operators
  { display: "×", latex: "\\times",    name: "times",    category: "operators", keywords: ["multiply", "cross"] },
  { display: "÷", latex: "\\div",      name: "div",      category: "operators", keywords: ["divide"] },
  { display: "±", latex: "\\pm",       name: "pm",       category: "operators", keywords: ["plus minus"] },
  { display: "∓", latex: "\\mp",       name: "mp",       category: "operators", keywords: ["minus plus"] },
  { display: "∘", latex: "\\circ",     name: "circ",     category: "operators", keywords: ["composition", "circle"] },
  { display: "·", latex: "\\cdot",     name: "cdot",     category: "operators", keywords: ["dot", "multiply"] },
  { display: "⊕", latex: "\\oplus",    name: "oplus",    category: "operators", keywords: ["direct sum", "xor"] },
  { display: "⊗", latex: "\\otimes",   name: "otimes",   category: "operators", keywords: ["tensor", "product"] },
  { display: "⊙", latex: "\\odot",     name: "odot",     category: "operators", keywords: ["dot product"] },
  { display: "∗", latex: "\\ast",      name: "ast",      category: "operators", keywords: ["asterisk", "star"] },
  { display: "⊎", latex: "\\uplus",    name: "uplus",    category: "operators", keywords: ["union plus"] },
  { display: "⊓", latex: "\\sqcap",    name: "sqcap",    category: "operators", keywords: ["meet", "infimum"] },
  { display: "⊔", latex: "\\sqcup",    name: "sqcup",    category: "operators", keywords: ["join", "supremum"] },
  { display: "∩", latex: "\\cap",      name: "cap",      category: "operators", keywords: ["intersection"] },
  { display: "∪", latex: "\\cup",      name: "cup",      category: "operators", keywords: ["union"] },
  { display: "∖", latex: "\\setminus", name: "setminus", category: "operators", keywords: ["set difference", "backslash"] },
  { display: "△", latex: "\\triangle", name: "triangle", category: "operators", keywords: ["delta", "symmetric difference"] },
  { display: "∙", latex: "\\bullet",   name: "bullet",   category: "operators", keywords: ["dot"] },
  { display: "◦", latex: "\\circ",     name: "circ2",    category: "operators", keywords: ["compose"] },
  { display: "≀", latex: "\\wr",       name: "wr",       category: "operators", keywords: ["wreath product"] },
  { display: "⋊", latex: "\\rtimes",   name: "rtimes",   category: "operators", keywords: ["semidirect product"] },
  { display: "⋉", latex: "\\ltimes",   name: "ltimes",   category: "operators", keywords: ["semidirect product"] },
  { display: "⊞", latex: "\\boxplus",  name: "boxplus",  category: "operators", keywords: ["box plus"] },
  { display: "⊠", latex: "\\boxtimes", name: "boxtimes", category: "operators", keywords: ["box times"] },

  // relations
  { display: "=",  latex: "=",           name: "equals",    category: "relations", keywords: ["equal"] },
  { display: "≠",  latex: "\\neq",       name: "neq",       category: "relations", keywords: ["not equal"] },
  { display: "<",  latex: "<",           name: "less than", category: "relations", keywords: ["lt"] },
  { display: ">",  latex: ">",           name: "greater than", category: "relations", keywords: ["gt"] },
  { display: "≤",  latex: "\\leq",       name: "leq",       category: "relations", keywords: ["less equal"] },
  { display: "≥",  latex: "\\geq",       name: "geq",       category: "relations", keywords: ["greater equal"] },
  { display: "≡",  latex: "\\equiv",     name: "equiv",     category: "relations", keywords: ["equivalent", "congruent"] },
  { display: "≢",  latex: "\\not\\equiv", name: "not equiv", category: "relations", keywords: ["not equivalent"] },
  { display: "≈",  latex: "\\approx",    name: "approx",    category: "relations", keywords: ["approximately"] },
  { display: "∼",  latex: "\\sim",       name: "sim",       category: "relations", keywords: ["similar", "tilde"] },
  { display: "≃",  latex: "\\simeq",     name: "simeq",     category: "relations", keywords: ["similar equal"] },
  { display: "≅",  latex: "\\cong",      name: "cong",      category: "relations", keywords: ["congruent", "isomorphic"] },
  { display: "∝",  latex: "\\propto",    name: "propto",    category: "relations", keywords: ["proportional"] },
  { display: "⊂",  latex: "\\subset",    name: "subset",    category: "relations", keywords: ["subset"] },
  { display: "⊃",  latex: "\\supset",    name: "supset",    category: "relations", keywords: ["superset"] },
  { display: "⊆",  latex: "\\subseteq",  name: "subseteq",  category: "relations", keywords: ["subset equal"] },
  { display: "⊇",  latex: "\\supseteq",  name: "supseteq",  category: "relations", keywords: ["superset equal"] },
  { display: "∈",  latex: "\\in",        name: "in",        category: "relations", keywords: ["element", "member"] },
  { display: "∉",  latex: "\\notin",     name: "notin",     category: "relations", keywords: ["not element", "not member"] },
  { display: "∋",  latex: "\\ni",        name: "ni",        category: "relations", keywords: ["contains"] },
  { display: "⊏",  latex: "\\sqsubset",  name: "sqsubset",  category: "relations", keywords: ["square subset"] },
  { display: "⊐",  latex: "\\sqsupset",  name: "sqsupset",  category: "relations", keywords: ["square superset"] },
  { display: "≺",  latex: "\\prec",      name: "prec",      category: "relations", keywords: ["precedes"] },
  { display: "≻",  latex: "\\succ",      name: "succ",      category: "relations", keywords: ["succeeds"] },
  { display: "⊢",  latex: "\\vdash",     name: "vdash",     category: "relations", keywords: ["proves", "turnstile"] },
  { display: "⊨",  latex: "\\models",    name: "models",    category: "relations", keywords: ["satisfies"] },
  { display: "⊥",  latex: "\\perp",      name: "perp",      category: "relations", keywords: ["perpendicular", "bottom"] },
  { display: "∣",  latex: "\\mid",       name: "mid",       category: "relations", keywords: ["divides", "such that"] },

  // arrows
  { display: "→",  latex: "\\to",                  name: "to",                  category: "arrows", keywords: ["right arrow"] },
  { display: "←",  latex: "\\leftarrow",            name: "leftarrow",           category: "arrows", keywords: ["left arrow"] },
  { display: "↔",  latex: "\\leftrightarrow",       name: "leftrightarrow",      category: "arrows", keywords: ["biconditional"] },
  { display: "⇒",  latex: "\\Rightarrow",           name: "Rightarrow",          category: "arrows", keywords: ["implies", "double right"] },
  { display: "⇐",  latex: "\\Leftarrow",            name: "Leftarrow",           category: "arrows", keywords: ["double left"] },
  { display: "⇔",  latex: "\\Leftrightarrow",       name: "Leftrightarrow",      category: "arrows", keywords: ["iff", "double biconditional"] },
  { display: "↑",  latex: "\\uparrow",              name: "uparrow",             category: "arrows", keywords: ["up"] },
  { display: "↓",  latex: "\\downarrow",            name: "downarrow",           category: "arrows", keywords: ["down"] },
  { display: "↕",  latex: "\\updownarrow",          name: "updownarrow",         category: "arrows", keywords: ["up down"] },
  { display: "↗",  latex: "\\nearrow",              name: "nearrow",             category: "arrows", keywords: ["northeast"] },
  { display: "↘",  latex: "\\searrow",              name: "searrow",             category: "arrows", keywords: ["southeast"] },
  { display: "↙",  latex: "\\swarrow",              name: "swarrow",             category: "arrows", keywords: ["southwest"] },
  { display: "↖",  latex: "\\nwarrow",              name: "nwarrow",             category: "arrows", keywords: ["northwest"] },
  { display: "↦",  latex: "\\mapsto",               name: "mapsto",              category: "arrows", keywords: ["maps to"] },
  { display: "⟶",  latex: "\\longrightarrow",       name: "longrightarrow",      category: "arrows", keywords: ["long right"] },
  { display: "⟸",  latex: "\\longleftarrow",        name: "longleftarrow",       category: "arrows", keywords: ["long left"] },
  { display: "⟺",  latex: "\\longleftrightarrow",   name: "longleftrightarrow",  category: "arrows", keywords: ["long biconditional"] },
  { display: "⟹",  latex: "\\Longrightarrow",       name: "Longrightarrow",      category: "arrows", keywords: ["long implies"] },
  { display: "↠",  latex: "\\twoheadrightarrow",    name: "twoheadrightarrow",   category: "arrows", keywords: ["surjective"] },
  { display: "↣",  latex: "\\rightarrowtail",       name: "rightarrowtail",      category: "arrows", keywords: ["injective"] },
  { display: "⇌",  latex: "\\rightleftharpoons",    name: "rightleftharpoons",   category: "arrows", keywords: ["equilibrium"] },
  { display: "⇀",  latex: "\\rightharpoonup",       name: "rightharpoonup",      category: "arrows", keywords: ["harpoon"] },
  { display: "↼",  latex: "\\leftharpoonup",        name: "leftharpoonup",       category: "arrows", keywords: ["harpoon"] },

  // logic
  { display: "¬",  latex: "\\neg",           name: "neg",       category: "logic", keywords: ["not", "negation"] },
  { display: "∧",  latex: "\\land",          name: "land",      category: "logic", keywords: ["and", "conjunction"] },
  { display: "∨",  latex: "\\lor",           name: "lor",       category: "logic", keywords: ["or", "disjunction"] },
  { display: "→",  latex: "\\rightarrow",    name: "rightarrow", category: "logic", keywords: ["implies", "conditional"] },
  { display: "↔",  latex: "\\leftrightarrow", name: "leftrightarrow2", category: "logic", keywords: ["iff", "biconditional"] },
  { display: "⊤",  latex: "\\top",           name: "top",       category: "logic", keywords: ["true", "tautology"] },
  { display: "⊥",  latex: "\\bot",           name: "bot",       category: "logic", keywords: ["false", "contradiction", "bottom"] },
  { display: "∀",  latex: "\\forall",        name: "forall",    category: "logic", keywords: ["for all", "universal"] },
  { display: "∃",  latex: "\\exists",        name: "exists",    category: "logic", keywords: ["there exists", "existential"] },
  { display: "∄",  latex: "\\nexists",       name: "nexists",   category: "logic", keywords: ["not exists"] },
  { display: "∴",  latex: "\\therefore",     name: "therefore", category: "logic", keywords: ["so", "thus"] },
  { display: "∵",  latex: "\\because",       name: "because",   category: "logic", keywords: ["since"] },
  { display: "□",  latex: "\\square",        name: "square",    category: "logic", keywords: ["box", "necessity"] },
  { display: "■",  latex: "\\blacksquare",   name: "blacksquare", category: "logic", keywords: ["qed", "end proof"] },
  { display: "◇",  latex: "\\diamond",       name: "diamond",   category: "logic", keywords: ["possibility"] },

  // sets
  { display: "∅",  latex: "\\emptyset",      name: "emptyset",   category: "sets", keywords: ["empty set", "null"] },
  { display: "ℕ",  latex: "\\mathbb{N}",     name: "naturals",   category: "sets", keywords: ["natural numbers", "N"] },
  { display: "ℤ",  latex: "\\mathbb{Z}",     name: "integers",   category: "sets", keywords: ["integers", "Z"] },
  { display: "ℚ",  latex: "\\mathbb{Q}",     name: "rationals",  category: "sets", keywords: ["rational numbers", "Q"] },
  { display: "ℝ",  latex: "\\mathbb{R}",     name: "reals",      category: "sets", keywords: ["real numbers", "R"] },
  { display: "ℂ",  latex: "\\mathbb{C}",     name: "complex",    category: "sets", keywords: ["complex numbers", "C"] },
  { display: "ℙ",  latex: "\\mathbb{P}",     name: "primes",     category: "sets", keywords: ["prime numbers", "P"] },
  { display: "ℍ",  latex: "\\mathbb{H}",     name: "quaternions", category: "sets", keywords: ["quaternions", "H"] },
  { display: "∞",  latex: "\\infty",         name: "infty",      category: "sets", keywords: ["infinity"] },
  { display: "ℵ",  latex: "\\aleph",         name: "aleph",      category: "sets", keywords: ["aleph", "cardinal"] },
  { display: "ℶ",  latex: "\\beth",          name: "beth",       category: "sets", keywords: ["beth", "cardinal"] },
  { display: "𝒫",  latex: "\\mathcal{P}",    name: "powerset",   category: "sets", keywords: ["power set", "calligraphic P"] },
  { display: "∪",  latex: "\\cup",           name: "cup2",       category: "sets", keywords: ["union"] },
  { display: "∩",  latex: "\\cap",           name: "cap2",       category: "sets", keywords: ["intersection"] },
  { display: "∖",  latex: "\\setminus",      name: "setminus2",  category: "sets", keywords: ["set difference"] },
  { display: "△",  latex: "\\triangle",      name: "triangle2",  category: "sets", keywords: ["symmetric difference"] },
  { display: "ℓ",  latex: "\\ell",           name: "ell",        category: "sets", keywords: ["script l"] },

  // calculus
  { display: "∫",  latex: "\\int",           name: "int",      category: "calculus", keywords: ["integral"] },
  { display: "∬",  latex: "\\iint",          name: "iint",     category: "calculus", keywords: ["double integral"] },
  { display: "∭",  latex: "\\iiint",         name: "iiint",    category: "calculus", keywords: ["triple integral"] },
  { display: "∮",  latex: "\\oint",          name: "oint",     category: "calculus", keywords: ["contour integral", "line integral"] },
  { display: "∑",  latex: "\\sum",           name: "sum",      category: "calculus", keywords: ["summation"] },
  { display: "∏",  latex: "\\prod",          name: "prod",     category: "calculus", keywords: ["product"] },
  { display: "∂",  latex: "\\partial",       name: "partial",  category: "calculus", keywords: ["partial derivative"] },
  { display: "∇",  latex: "\\nabla",         name: "nabla",    category: "calculus", keywords: ["gradient", "del", "laplacian"] },
  { display: "∞",  latex: "\\infty",         name: "infty2",   category: "calculus", keywords: ["infinity"] },
  { display: "ℏ",  latex: "\\hbar",          name: "hbar",     category: "calculus", keywords: ["planck", "h-bar"] },
  { display: "℘",  latex: "\\wp",            name: "wp",       category: "calculus", keywords: ["weierstrass p"] },
  { display: "ℜ",  latex: "\\Re",            name: "Re",       category: "calculus", keywords: ["real part"] },
  { display: "ℑ",  latex: "\\Im",            name: "Im",       category: "calculus", keywords: ["imaginary part"] },
  { display: "≜",  latex: "\\triangleq",     name: "triangleq", category: "calculus", keywords: ["defined as", "equals by definition"] },
  { display: "≝",  latex: "\\overset{\\text{def}}{=}", name: "def equals", category: "calculus", keywords: ["defined as", "definition"] },

  // misc
  { display: "°",  latex: "\\degree",               name: "degree",      category: "misc", keywords: ["angle"] },
  { display: "′",  latex: "^{\\prime}",             name: "prime",       category: "misc", keywords: ["prime", "derivative"] },
  { display: "″",  latex: "^{\\prime\\prime}",      name: "double prime", category: "misc", keywords: ["double prime", "second derivative"] },
  { display: "∎",  latex: "\\blacksquare",          name: "qed",         category: "misc", keywords: ["qed", "end proof", "halmos"] },
  { display: "†",  latex: "\\dagger",               name: "dagger",      category: "misc", keywords: ["dagger", "adjoint"] },
  { display: "‡",  latex: "\\ddagger",              name: "ddagger",     category: "misc", keywords: ["double dagger"] },
  { display: "§",  latex: "\\S",                    name: "section",     category: "misc", keywords: ["section"] },
  { display: "¶",  latex: "\\P",                    name: "paragraph",   category: "misc", keywords: ["pilcrow"] },
  { display: "ℓ",  latex: "\\ell",                  name: "ell2",        category: "misc", keywords: ["script l", "length"] },
  { display: "♯",  latex: "\\sharp",                name: "sharp",       category: "misc", keywords: ["sharp", "music"] },
  { display: "♭",  latex: "\\flat",                 name: "flat",        category: "misc", keywords: ["flat", "music"] },
  { display: "♮",  latex: "\\natural",              name: "natural",     category: "misc", keywords: ["natural", "music"] },
  { display: "⋯",  latex: "\\cdots",                name: "cdots",       category: "misc", keywords: ["dots", "ellipsis", "horizontal"] },
  { display: "⋮",  latex: "\\vdots",                name: "vdots",       category: "misc", keywords: ["dots", "ellipsis", "vertical"] },
  { display: "⋱",  latex: "\\ddots",                name: "ddots",       category: "misc", keywords: ["dots", "ellipsis", "diagonal"] },
  { display: "…",  latex: "\\ldots",                name: "ldots",       category: "misc", keywords: ["dots", "ellipsis"] },
]

const CATEGORY_ORDER = [
  "greek-lower",
  "greek-upper",
  "operators",
  "relations",
  "arrows",
  "logic",
  "sets",
  "calculus",
  "misc",
]

const CATEGORY_LABELS: Record<string, string> = {
  "greek-lower": "Greek — lowercase",
  "greek-upper": "Greek — uppercase",
  "operators":   "Operators",
  "relations":   "Relations",
  "arrows":      "Arrows",
  "logic":       "Logic",
  "sets":        "Sets & Numbers",
  "calculus":    "Calculus & Analysis",
  "misc":        "Miscellaneous",
}

export default function SymbolPickerPanel({ onInsert }: { onInsert: (latex: string) => void }) {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState<string | "all">("all")
  const t = useT()

  const query = search.trim().toLowerCase()

  const filtered = query
    ? SYMBOLS.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.latex.toLowerCase().includes(query) ||
        s.keywords.some(k => k.toLowerCase().includes(query))
      )
    : activeCategory === "all"
      ? SYMBOLS
      : SYMBOLS.filter(s => s.category === activeCategory)

  const showSections = !query && activeCategory === "all"

  const sections = showSections
    ? CATEGORY_ORDER.map(cat => ({
        cat,
        label: CATEGORY_LABELS[cat],
        symbols: SYMBOLS.filter(s => s.category === cat),
      }))
    : null

  return (
    <div className="symbol-picker">
      <div style={{ fontWeight: 600, fontSize: "0.9em", paddingBottom: "0.25rem" }}>
        {t.symbolPicker.title}
      </div>
      <input
        className="symbol-picker-search"
        type="text"
        placeholder={t.symbolPicker.searchPlaceholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
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
          {CATEGORY_ORDER.map(cat => (
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
        {showSections && sections
          ? sections.map(({ cat, label, symbols }) => (
              <div key={cat}>
                <div className="symbol-section-label">{label}</div>
                <div className="symbol-grid">
                  {symbols.map((sym, i) => (
                    <button
                      key={`${cat}-${i}`}
                      className="symbol-btn"
                      title={`${sym.name} — ${sym.latex}`}
                      aria-label={`${sym.name} (${sym.latex})`}
                      onClick={() => onInsert(sym.latex)}
                    >
                      {sym.display}
                    </button>
                  ))}
                </div>
              </div>
            ))
          : (
            <div className="symbol-grid">
              {filtered.map((sym, i) => (
                <button
                  key={i}
                  className="symbol-btn"
                  title={`${sym.name} — ${sym.latex}`}
                  aria-label={`${sym.name} (${sym.latex})`}
                  onClick={() => onInsert(sym.latex)}
                >
                  {sym.display}
                </button>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
