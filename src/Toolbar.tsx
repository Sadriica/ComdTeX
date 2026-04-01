import { useRef, useState, useEffect } from "react"
import type * as monaco from "monaco-editor"
import type { T } from "./i18n"
import { useT } from "./i18n"

interface ToolbarProps {
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
  previewVisible: boolean
  onTogglePreview: () => void
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Btn {
  label: string
  title: string
  snippet: string
}

interface DropdownItem {
  label: string
  title: string
  snippet: string
}

interface BtnGroup {
  kind: "buttons"
  items: Btn[]
}

interface DropdownGroup {
  kind: "dropdown"
  label: string
  title: string
  items: DropdownItem[]
}

type Group = BtnGroup | DropdownGroup

// ── Group definitions ────────────────────────────────────────────────────────

function getGroups(t: T): Group[] {
  return [
    // ── Formato de texto ────────────────────────────────────────────────────
    {
      kind: "buttons",
      items: [
        { label: "B",   title: t.toolbar.bold,        snippet: "**${1:texto}**" },
        { label: "I",   title: t.toolbar.italic,      snippet: "_${1:texto}_" },
        { label: "~~",  title: t.toolbar.strikethrough, snippet: "~~${1:texto}~~" },
        { label: "`",   title: t.toolbar.inlineCode,  snippet: "`${1:código}`" },
      ],
    },
    // ── Encabezados ─────────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "H",
      title: t.toolbar.headings,
      items: [
        { label: t.toolbar.lbl_heading1, title: t.toolbar.heading1, snippet: "# ${1:Título}" },
        { label: t.toolbar.lbl_heading2, title: t.toolbar.heading2, snippet: "## ${1:Título}" },
        { label: t.toolbar.lbl_heading3, title: t.toolbar.heading3, snippet: "### ${1:Título}" },
      ],
    },
    // ── Insertar ────────────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "⊕",
      title: t.toolbar.insert,
      items: [
        { label: t.toolbar.lbl_quote,       title: t.toolbar.quote,       snippet: "> ${1:cita}" },
        { label: t.toolbar.lbl_separator,   title: t.toolbar.separator,   snippet: "\n---\n" },
        { label: t.toolbar.lbl_list,        title: t.toolbar.list,        snippet: "- ${1:ítem}\n- ${2:ítem}\n- ${3:ítem}" },
        { label: t.toolbar.lbl_orderedList, title: t.toolbar.orderedList, snippet: "1. ${1:ítem}\n2. ${2:ítem}\n3. ${3:ítem}" },
        { label: t.toolbar.lbl_taskList,    title: t.toolbar.taskList,    snippet: "- [ ] ${1:tarea}\n- [ ] ${2:tarea}" },
        { label: t.toolbar.lbl_link,        title: t.toolbar.link,        snippet: "[${1:texto}](${2:url})" },
        { label: t.toolbar.lbl_codeBlock,   title: t.toolbar.codeBlock,   snippet: "\\`\\`\\`${1:lenguaje}\n${2:código}\n\\`\\`\\`" },
      ],
    },
    // ── Math contenedores ───────────────────────────────────────────────────
    {
      kind: "buttons",
      items: [
        { label: "$",   title: t.toolbar.mathInline, snippet: "\\$${1}\\$" },
        { label: "$$",  title: t.toolbar.mathBlock,  snippet: "\\$\\$\n${1}\n\\$\\$" },
      ],
    },
    // ── Operaciones math ────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "∫",
      title: t.toolbar.mathOps,
      items: [
        { label: t.toolbar.lbl_superscript, title: t.toolbar.superscript, snippet: "sup(${1:x}, ${2:n})" },
        { label: t.toolbar.lbl_subscript,   title: t.toolbar.subscript,   snippet: "sub(${1:x}, ${2:n})" },
        { label: t.toolbar.lbl_fraction,    title: t.toolbar.fraction,    snippet: "frac(${1:a}, ${2:b})" },
        { label: t.toolbar.lbl_sqrt,        title: t.toolbar.sqrt,        snippet: "sqrt(${1:x})" },
        { label: t.toolbar.lbl_nthRoot,     title: t.toolbar.nthRoot,     snippet: "root(${1:n}, ${2:x})" },
        { label: t.toolbar.lbl_sum,         title: t.toolbar.sum,         snippet: "sum(${1:i=0}, ${2:n})" },
        { label: t.toolbar.lbl_integral,    title: t.toolbar.integral,    snippet: "int(${1:a}, ${2:b})" },
        { label: t.toolbar.lbl_limit,       title: t.toolbar.limit,       snippet: "lim(${1:x}, ${2:0})" },
        { label: t.toolbar.lbl_partialDer,  title: t.toolbar.partialDer,  snippet: "pder(${1:f}, ${2:x})" },
        { label: t.toolbar.lbl_derivative,  title: t.toolbar.derivative,  snippet: "der(${1:f}, ${2:x})" },
        { label: t.toolbar.lbl_gradient,    title: t.toolbar.gradient,    snippet: "\\$\\\\nabla ${1:f}\\$" },
        { label: t.toolbar.lbl_inverse,     title: t.toolbar.inverse,     snippet: "inv(${1:A})" },
        { label: t.toolbar.lbl_transpose,   title: t.toolbar.transpose,   snippet: "trans(${1:A})" },
      ],
    },
    // ── Decoradores ─────────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "x̂",
      title: t.toolbar.decorators,
      items: [
        { label: "x̂  hat",    title: "hat",   snippet: "hat(${1:x})" },
        { label: "x̄  bar",    title: "bar",   snippet: "bar(${1:x})" },
        { label: "x̃  tilde",  title: "tilde", snippet: "tilde(${1:x})" },
        { label: "ẋ  dot",    title: "dot",   snippet: "dot(${1:x})" },
        { label: "ẍ  ddot",   title: "ddot",  snippet: "ddot(${1:x})" },
        { label: "v⃗  vec",    title: "vec",   snippet: "vec(${1:v})" },
      ],
    },
    // ── Math fonts ───────────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "ℝ",
      title: t.toolbar.mathFonts,
      items: [
        { label: "𝐱  bf",  title: "mathbf",  snippet: "bf(${1:x})" },
        { label: "𝒜  cal", title: "mathcal", snippet: "cal(${1:A})" },
        { label: "ℝ  bb",  title: "mathbb",  snippet: "bb(${1:R})" },
      ],
    },
    // ── Letras griegas ──────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "α",
      title: t.toolbar.greekLetters,
      items: [
        { label: "α",  title: "alpha",   snippet: "\\$\\\\alpha\\$" },
        { label: "β",  title: "beta",    snippet: "\\$\\\\beta\\$" },
        { label: "γ",  title: "gamma",   snippet: "\\$\\\\gamma\\$" },
        { label: "δ",  title: "delta",   snippet: "\\$\\\\delta\\$" },
        { label: "ε",  title: "epsilon", snippet: "\\$\\\\epsilon\\$" },
        { label: "ζ",  title: "zeta",    snippet: "\\$\\\\zeta\\$" },
        { label: "η",  title: "eta",     snippet: "\\$\\\\eta\\$" },
        { label: "θ",  title: "theta",   snippet: "\\$\\\\theta\\$" },
        { label: "λ",  title: "lambda",  snippet: "\\$\\\\lambda\\$" },
        { label: "μ",  title: "mu",      snippet: "\\$\\\\mu\\$" },
        { label: "ν",  title: "nu",      snippet: "\\$\\\\nu\\$" },
        { label: "ξ",  title: "xi",      snippet: "\\$\\\\xi\\$" },
        { label: "π",  title: "pi",      snippet: "\\$\\\\pi\\$" },
        { label: "ρ",  title: "rho",     snippet: "\\$\\\\rho\\$" },
        { label: "σ",  title: "sigma",   snippet: "\\$\\\\sigma\\$" },
        { label: "τ",  title: "tau",     snippet: "\\$\\\\tau\\$" },
        { label: "φ",  title: "phi",     snippet: "\\$\\\\phi\\$" },
        { label: "χ",  title: "chi",     snippet: "\\$\\\\chi\\$" },
        { label: "ψ",  title: "psi",     snippet: "\\$\\\\psi\\$" },
        { label: "ω",  title: "omega",   snippet: "\\$\\\\omega\\$" },
        { label: "Γ",  title: "Gamma",   snippet: "\\$\\\\Gamma\\$" },
        { label: "Δ",  title: "Delta",   snippet: "\\$\\\\Delta\\$" },
        { label: "Θ",  title: "Theta",   snippet: "\\$\\\\Theta\\$" },
        { label: "Λ",  title: "Lambda",  snippet: "\\$\\\\Lambda\\$" },
        { label: "Π",  title: "Pi",      snippet: "\\$\\\\Pi\\$" },
        { label: "Σ",  title: "Sigma",   snippet: "\\$\\\\Sigma\\$" },
        { label: "Φ",  title: "Phi",     snippet: "\\$\\\\Phi\\$" },
        { label: "Ψ",  title: "Psi",     snippet: "\\$\\\\Psi\\$" },
        { label: "Ω",  title: "Omega",   snippet: "\\$\\\\Omega\\$" },
      ],
    },
    // ── Operators and symbols ────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "±",
      title: t.toolbar.operators,
      items: [
        { label: "±",  title: "plus-minus",  snippet: "\\$\\\\pm\\$" },
        { label: "×",  title: "times",       snippet: "\\$\\\\times\\$" },
        { label: "÷",  title: "div",         snippet: "\\$\\\\div\\$" },
        { label: "≠",  title: "neq",         snippet: "\\$\\\\neq\\$" },
        { label: "≤",  title: "leq",         snippet: "\\$\\\\leq\\$" },
        { label: "≥",  title: "geq",         snippet: "\\$\\\\geq\\$" },
        { label: "≈",  title: "approx",      snippet: "\\$\\\\approx\\$" },
        { label: "∝",  title: "propto",      snippet: "\\$\\\\propto\\$" },
        { label: "∞",  title: "infty",       snippet: "\\$\\\\infty\\$" },
        { label: "∈",  title: "in",          snippet: "\\$\\\\in\\$" },
        { label: "∉",  title: "notin",       snippet: "\\$\\\\notin\\$" },
        { label: "⊂",  title: "subset",      snippet: "\\$\\\\subset\\$" },
        { label: "⊆",  title: "subseteq",    snippet: "\\$\\\\subseteq\\$" },
        { label: "∩",  title: "cap",         snippet: "\\$\\\\cap\\$" },
        { label: "∪",  title: "cup",         snippet: "\\$\\\\cup\\$" },
        { label: "∅",  title: "emptyset",    snippet: "\\$\\\\emptyset\\$" },
        { label: "∀",  title: "forall",      snippet: "\\$\\\\forall\\$" },
        { label: "∃",  title: "exists",      snippet: "\\$\\\\exists\\$" },
        { label: "¬",  title: "neg",         snippet: "\\$\\\\neg\\$" },
        { label: "∧",  title: "and",         snippet: "\\$\\\\wedge\\$" },
        { label: "∨",  title: "or",          snippet: "\\$\\\\vee\\$" },
      ],
    },
    // ── Flechas ─────────────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "→",
      title: t.toolbar.arrows,
      items: [
        { label: "→",  title: "rightarrow",     snippet: "\\$\\\\rightarrow\\$" },
        { label: "←",  title: "leftarrow",      snippet: "\\$\\\\leftarrow\\$" },
        { label: "↑",  title: "uparrow",        snippet: "\\$\\\\uparrow\\$" },
        { label: "↓",  title: "downarrow",      snippet: "\\$\\\\downarrow\\$" },
        { label: "↔",  title: "leftrightarrow", snippet: "\\$\\\\leftrightarrow\\$" },
        { label: "⇒",  title: "Rightarrow",     snippet: "\\$\\\\Rightarrow\\$" },
        { label: "⇐",  title: "Leftarrow",      snippet: "\\$\\\\Leftarrow\\$" },
        { label: "⇔",  title: "Leftrightarrow", snippet: "\\$\\\\Leftrightarrow\\$" },
        { label: "↦",  title: "mapsto",         snippet: "\\$\\\\mapsto\\$" },
      ],
    },
    // ── Math environments ────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "∎",
      title: t.toolbar.environments,
      items: [
        { label: t.toolbar.lbl_theorem,     title: t.toolbar.theorem,     snippet: ":::theorem[${1:título}]\n${2:enunciado}\n:::" },
        { label: t.toolbar.lbl_lemma,       title: t.toolbar.lemma,       snippet: ":::lemma[${1:título}]\n${2:enunciado}\n:::" },
        { label: t.toolbar.lbl_corollary,   title: t.toolbar.corollary,   snippet: ":::corollary\n${1:enunciado}\n:::" },
        { label: t.toolbar.lbl_proposition, title: t.toolbar.proposition, snippet: ":::proposition\n${1:enunciado}\n:::" },
        { label: t.toolbar.lbl_definition,  title: t.toolbar.definition,  snippet: ":::definition\n${1:definición}\n:::" },
        { label: t.toolbar.lbl_example,     title: t.toolbar.example,     snippet: ":::example\n${1:ejemplo}\n:::" },
        { label: t.toolbar.lbl_exercise,    title: t.toolbar.exercise,    snippet: ":::exercise\n${1:ejercicio}\n:::" },
        { label: t.toolbar.lbl_proof,       title: t.toolbar.proof,       snippet: ":::proof\n${1:demostración}\n:::" },
        { label: t.toolbar.lbl_remark,      title: t.toolbar.remark,      snippet: ":::remark\n${1:observación}\n:::" },
        { label: t.toolbar.lbl_note,        title: t.toolbar.note,        snippet: ":::note\n${1:nota}\n:::" },
      ],
    },
    // ── Estructuras ──────────────────────────────────────────────────────────
    {
      kind: "dropdown",
      label: "⊞",
      title: t.toolbar.structures,
      items: [
        { label: t.toolbar.lbl_table,      title: t.toolbar.table,      snippet: "table(${1:Col1}, ${2:Col2}, ${3:Col3})" },
        { label: t.toolbar.lbl_matAuto,    title: t.toolbar.matAuto,    snippet: "mat(${1:1}, ${2:2}, ${3:3}, ${4:4})" },
        { label: t.toolbar.lbl_matFixed,   title: t.toolbar.matFixed,   snippet: "matf(${1:2}, ${2:2})" },
        { label: t.toolbar.lbl_matLiteral, title: t.toolbar.matLiteral, snippet: "[[${1:1},${2:2}],[${3:3},${4:4}]]" },
      ],
    },
  ]
}

// ── Dropdown component ────────────────────────────────────────────────────────

function Dropdown({
  label,
  title,
  items,
  onInsert,
}: {
  label: string
  title: string
  items: DropdownItem[]
  onInsert: (snippet: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div className="toolbar-dropdown" ref={ref}>
      <button
        className="toolbar-btn toolbar-btn-arrow"
        title={title}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o) }}
      >
        {label} <span className="arrow">▾</span>
      </button>
      {open && (
        <div className="dropdown-panel">
          {items.map((item) => (
            <button
              key={item.title}
              title={item.title}
              className="dropdown-item"
              onMouseDown={(e) => {
                e.preventDefault()
                onInsert(item.snippet)
                setOpen(false)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

export default function Toolbar({ editorRef, previewVisible, onTogglePreview }: ToolbarProps) {
  const t = useT()
  const groups = getGroups(t)

  const insert = (snippet: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = editor.getContribution<any>("snippetController2")
    if (ctrl) {
      ctrl.insert(snippet)
    } else {
      // fallback: plain text at cursor
      const sel = editor.getSelection()
      if (sel) editor.executeEdits("toolbar", [{ range: sel, text: snippet }])
    }
  }

  return (
    <div className="toolbar">
      {groups.map((group, gi) => (
        <div key={gi} className="toolbar-group">
          {group.kind === "buttons"
            ? group.items.map((btn) => (
                <button
                  key={btn.title}
                  title={btn.title}
                  className="toolbar-btn"
                  onMouseDown={(e) => { e.preventDefault(); insert(btn.snippet) }}
                >
                  {btn.label}
                </button>
              ))
            : (
                <Dropdown
                  label={group.label}
                  title={group.title}
                  items={group.items}
                  onInsert={insert}
                />
              )}
        </div>
      ))}

      {/* Preview toggle — right-aligned */}
      <div className="toolbar-group toolbar-right">
        <button
          className={`toolbar-btn toolbar-preview-btn${previewVisible ? " active" : ""}`}
          title={t.toolbar.togglePreview}
          onMouseDown={(e) => { e.preventDefault(); onTogglePreview() }}
        >
          ⊢
        </button>
      </div>
    </div>
  )
}
