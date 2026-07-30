import { memo, useRef, useState, useEffect, useCallback, type ReactNode } from "react"
import type * as monaco from "monaco-editor"
import type { T } from "./i18n"
import { useT } from "./i18n"
import { insertSnippet } from "./editorInsert"

// ── Symbol groups ─────────────────────────────────────────────────────────────

const GREEK_LOWER = [
  ["α","\\alpha"],["β","\\beta"],["γ","\\gamma"],["δ","\\delta"],["ε","\\epsilon"],
  ["ζ","\\zeta"],["η","\\eta"],["θ","\\theta"],["ι","\\iota"],["κ","\\kappa"],
  ["λ","\\lambda"],["μ","\\mu"],["ν","\\nu"],["ξ","\\xi"],["π","\\pi"],
  ["ρ","\\rho"],["σ","\\sigma"],["τ","\\tau"],["υ","\\upsilon"],["φ","\\phi"],
  ["χ","\\chi"],["ψ","\\psi"],["ω","\\omega"],["ϕ","\\varphi"],["ε","\\varepsilon"],
  ["ϑ","\\vartheta"],["ς","\\varsigma"],
] as const

const GREEK_UPPER = [
  ["Γ","\\Gamma"],["Δ","\\Delta"],["Θ","\\Theta"],["Λ","\\Lambda"],["Ξ","\\Xi"],
  ["Π","\\Pi"],["Σ","\\Sigma"],["Υ","\\Upsilon"],["Φ","\\Phi"],["Ψ","\\Psi"],["Ω","\\Omega"],
] as const

const OPERATORS = [
  ["∞","\\infty"],["∂","\\partial"],["∇","\\nabla"],["±","\\pm"],["∓","\\mp"],
  ["×","\\times"],["÷","\\div"],["⊗","\\otimes"],["⊕","\\oplus"],["·","\\cdot"],
  ["∘","\\circ"],["≤","\\leq"],["≥","\\geq"],["≠","\\neq"],["≈","\\approx"],
  ["≡","\\equiv"],["∼","\\sim"],["≃","\\simeq"],["≅","\\cong"],["∝","\\propto"],
  ["∈","\\in"],["∉","\\notin"],["⊂","\\subset"],["⊃","\\supset"],["⊆","\\subseteq"],
  ["∩","\\cap"],["∪","\\cup"],["∅","\\emptyset"],["∀","\\forall"],["∃","\\exists"],
  ["¬","\\neg"],["∧","\\wedge"],["∨","\\vee"],["⊥","\\perp"],["∥","\\parallel"],
  ["√","\\sqrt{}"],["∑","\\sum"],["∏","\\prod"],["∫","\\int"],
] as const

const ARROWS = [
  ["→","\\rightarrow"],["←","\\leftarrow"],["↔","\\leftrightarrow"],
  ["⇒","\\Rightarrow"],["⇐","\\Leftarrow"],["⇔","\\Leftrightarrow"],
  ["↑","\\uparrow"],["↓","\\downarrow"],["↕","\\updownarrow"],
  ["↦","\\mapsto"],["↪","\\hookrightarrow"],["⟹","\\implies"],
  ["⟺","\\iff"],["⟶","\\longrightarrow"],["⟵","\\longleftarrow"],
  ["↗","\\nearrow"],["↘","\\searrow"],["↙","\\swarrow"],["↖","\\nwarrow"],
] as const

// Panel modes the menu can switch to (mirror of App.tsx SidebarMode subset used here).
export type PanelMode =
  | "files" | "search" | "searchReplace" | "backlinks" | "pdfPreview"
  | "outline" | "tags" | "labels" | "keep" | "properties" | "comments" | "todo"
  | "equations" | "environments" | "graph"
  | "stats" | "quality"
  | "focusTimer" | "ai" | "cloudSync" | "help"

interface ToolbarProps {
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
  sidebarMode: PanelMode | string
  setSidebarMode: (m: PanelMode) => void
  /** Live Pomodoro readout, or null when no session is running. */
  focusClock?: { clock: string; phase: string; running: boolean } | null
  /** Whether the detached focus popover is currently showing. */
  focusOpen?: boolean
  /** Toggles the focus popover. Focus hangs off the bar rather than living in
   *  the sidebar: starting and resetting a timer is a glance-and-click action,
   *  not something worth giving up the file tree for. */
  onToggleFocus?: () => void
}

// ── Menu item model ───────────────────────────────────────────────────────────

type MenuItem =
  | { kind: "action"; label: string; title?: string; snippet: string }
  | { kind: "panel"; label: string; mode: PanelMode }
  | { kind: "submenu"; label: string; items: MenuItem[] }
  | { kind: "symbols" } // special: embeds the SymbolPicker grid
  | { kind: "sep" }

interface MenuSection {
  id: string
  icon: ReactNode
  label: string
  items: MenuItem[]
}

// Monochrome folder icon (inline SVG with currentColor — emoji folder glyphs
// render coloured in WebKitGTK, the same bug that forced the settings gear to SVG).
const FolderIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-0.15em" }}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
)

// All panel modes contained (recursively) in a section's items — used to mark
// the section button active when one of its panels is the active sidebar mode.
function collectPanelModes(items: MenuItem[]): PanelMode[] {
  const out: PanelMode[] = []
  for (const it of items) {
    if (it.kind === "panel") out.push(it.mode)
    else if (it.kind === "submenu") out.push(...collectPanelModes(it.items))
  }
  return out
}

// ── Menu data ─────────────────────────────────────────────────────────────────

function getSections(t: T): MenuSection[] {
  const p = (label: string, mode: PanelMode): MenuItem => ({ kind: "panel", label, mode })
  const a = (label: string, snippet: string, title?: string): MenuItem =>
    ({ kind: "action", label, snippet, title })

  return [
    // 1. Archivos
    {
      id: "files",
      icon: FolderIcon,
      label: t.toolbar.secFiles,
      items: [
        p(t.sidebar.files, "files"),
        p(t.sidebar.search, "search"),
        p(t.sidebar.searchReplace, "searchReplace"),
        p(t.sidebar.backlinks, "backlinks"),
        p(t.sidebar.pdfPreview, "pdfPreview"),
      ],
    },
    // 2. Textos
    {
      id: "texts",
      icon: "✎",
      label: t.toolbar.secTexts,
      items: [
        a(t.toolbar.bold, "**${1:texto}**", t.toolbar.bold),
        a(t.toolbar.italic, "_${1:texto}_", t.toolbar.italic),
        a(t.toolbar.underline, "<u>${1:texto}</u>", t.toolbar.underline),
        a(t.toolbar.strikethrough, "~~${1:texto}~~", t.toolbar.strikethrough),
        a(t.toolbar.inlineCode, "`${1:código}`", t.toolbar.inlineCode),
        a(t.toolbar.link, "[${1:texto}](${2:url})", t.toolbar.link),
        {
          kind: "submenu",
          label: t.toolbar.highlight,
          items: [
            a(`🟨 ${t.toolbar.hlDefault}`, "==${1:texto}=="),
            a(`🟩 ${t.toolbar.hlGreen}`,  '<mark class="hl-green">${1:texto}</mark>'),
            a(`🟦 ${t.toolbar.hlBlue}`,   '<mark class="hl-blue">${1:texto}</mark>'),
            a(`🟪 ${t.toolbar.hlPurple}`, '<mark class="hl-purple">${1:texto}</mark>'),
            a(`🟧 ${t.toolbar.hlOrange}`, '<mark class="hl-orange">${1:texto}</mark>'),
            a(`🟥 ${t.toolbar.hlRed}`,    '<mark class="hl-red">${1:texto}</mark>'),
            a(`🌸 ${t.toolbar.hlPink}`,   '<mark class="hl-pink">${1:texto}</mark>'),
          ],
        },
        {
          kind: "submenu",
          label: t.toolbar.headings,
          items: [
            a(t.toolbar.lbl_heading1, "# ${1:Título}"),
            a(t.toolbar.lbl_heading2, "## ${1:Título}"),
            a(t.toolbar.lbl_heading3, "### ${1:Título}"),
          ],
        },
        {
          kind: "submenu",
          label: t.toolbar.list,
          items: [
            a(t.toolbar.lbl_list,        "- ${1:ítem}\n- ${2:ítem}\n- ${3:ítem}"),
            a(t.toolbar.lbl_orderedList, "1. ${1:ítem}\n2. ${2:ítem}\n3. ${3:ítem}"),
            a(t.toolbar.lbl_taskList,    "- [ ] ${1:tarea}\n- [ ] ${2:tarea}"),
          ],
        },
        a(t.toolbar.quote, "> ${1:cita}", t.toolbar.quote),
        a(t.toolbar.separator, "\n---\n", t.toolbar.separator),
        a(t.toolbar.insertToc, "[[toc]]\n", t.toolbar.insertToc),
        { kind: "sep" },
        p(t.sidebar.outline, "outline"),
        p(t.sidebar.tags, "tags"),
        p(t.sidebar.labels, "labels"),
        p(t.sidebar.properties, "properties"),
        p(t.sidebar.comments, "comments"),
        p(t.sidebar.todo, "todo"),
      ],
    },
    // 3. Matemáticas
    {
      id: "math",
      icon: "∑",
      label: t.toolbar.secMath,
      items: [
        a(t.toolbar.mathInline, "\\$${1}\\$", t.toolbar.mathInline),
        a(t.toolbar.mathBlock, "\\$\\$\n${1}\n\\$\\$", t.toolbar.mathBlock),
        { kind: "submenu", label: t.toolbar.symbols, items: [{ kind: "symbols" }] },
        {
          kind: "submenu",
          label: t.toolbar.mathOps,
          items: [
            a(t.toolbar.lbl_superscript, "sup(${1:x}, ${2:n})"),
            a(t.toolbar.lbl_subscript,   "sub(${1:x}, ${2:n})"),
            a(t.toolbar.lbl_fraction,    "frac(${1:a}, ${2:b})"),
            a(t.toolbar.lbl_sqrt,        "sqrt(${1:x})"),
            a(t.toolbar.lbl_nthRoot,     "root(${1:n}, ${2:x})"),
            a(t.toolbar.lbl_sum,         "sum(${1:i=0}, ${2:n})"),
            a(t.toolbar.lbl_integral,    "int(${1:a}, ${2:b})"),
            a(t.toolbar.lbl_limit,       "lim(${1:x}, ${2:0})"),
            a(t.toolbar.lbl_partialDer,  "pder(${1:f}, ${2:x})"),
            a(t.toolbar.lbl_derivative,  "der(${1:f}, ${2:x})"),
            a(t.toolbar.lbl_gradient,    "\\$\\\\nabla ${1:f}\\$"),
            a(t.toolbar.lbl_inverse,     "inv(${1:A})"),
            a(t.toolbar.lbl_transpose,   "trans(${1:A})"),
            a(t.toolbar.lbl_matAuto,     "mat(${1:1}, ${2:2}, ${3:3}, ${4:4})"),
            a(t.toolbar.lbl_matFixed,    "matf(${1:2}, ${2:2})"),
            a(t.toolbar.lbl_matLiteral,  "[[${1:1},${2:2}],[${3:3},${4:4}]]"),
          ],
        },
        {
          kind: "submenu",
          label: t.toolbar.decorators,
          items: [
            a("x̂  hat",   "hat(${1:x})"),
            a("x̄  bar",   "bar(${1:x})"),
            a("x̃  tilde", "tilde(${1:x})"),
            a("ẍ  ddot",  "ddot(${1:x})"),
            a("v⃗  vec",   "vec(${1:v})"),
          ],
        },
        {
          kind: "submenu",
          label: t.toolbar.mathFonts,
          items: [
            a("𝐱  bf",  "bf(${1:x})"),
            a("𝒜  cal", "cal(${1:A})"),
            a("ℝ  bb",  "bb(${1:R})"),
          ],
        },
        {
          kind: "submenu",
          label: t.toolbar.environments,
          items: [
            a(t.toolbar.lbl_theorem,     ":::theorem[${1:título}]\n${2:enunciado}\n:::"),
            a(t.toolbar.lbl_lemma,       ":::lemma[${1:título}]\n${2:enunciado}\n:::"),
            a(t.toolbar.lbl_corollary,   ":::corollary\n${1:enunciado}\n:::"),
            a(t.toolbar.lbl_proposition, ":::proposition\n${1:enunciado}\n:::"),
            a(t.toolbar.lbl_definition,  ":::definition\n${1:definición}\n:::"),
            a(t.toolbar.lbl_example,     ":::example\n${1:ejemplo}\n:::"),
            a(t.toolbar.lbl_proof,       ":::proof\n${1:demostración}\n:::"),
          ],
        },
        { kind: "sep" },
        p(t.sidebar.equations, "equations"),
        p(t.sidebar.environments, "environments"),
        p(t.sidebar.graph, "graph"),
      ],
    },
    // 4. Vistas
    {
      id: "views",
      icon: "▦",
      label: t.toolbar.secViews,
      items: [
        p(t.sidebar.keep, "keep"),
        p(t.sidebar.stats, "stats"),
        p(t.sidebar.quality, "quality"),
      ],
    },
  ]
}

// Direct (no-dropdown) buttons on the right.
function getDirectButtons(t: T): { mode: PanelMode; icon: ReactNode; label: string }[] {
  return [
    { mode: "focusTimer", icon: "◷", label: t.sidebar.focusTimer },
    {
      mode: "ai",
      // Monochrome sparkle SVG — the ✦/✨ glyphs render coloured in WebKitGTK.
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-0.15em" }}>
          <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
        </svg>
      ),
      label: t.sidebar.ai,
    },
    { mode: "cloudSync", icon: "☁", label: t.sidebar.cloudSync },
    { mode: "help", icon: "?", label: t.sidebar.help },
  ]
}

// ── Symbol grid (reused inside the "Símbolos" submenu) ───────────────────────

type SymbolTab = "greek" | "operators" | "arrows"

function SymbolGrid({ onInsert }: { onInsert: (s: string) => void }) {
  const t = useT()
  const [tab, setTab] = useState<SymbolTab>("greek")
  const symbols =
    tab === "greek"     ? [...GREEK_LOWER, ...GREEK_UPPER] :
    tab === "operators" ? OPERATORS : ARROWS

  return (
    <div className="symbol-panel-inline">
      <div className="symbol-tabs">
        {(["greek", "operators", "arrows"] as SymbolTab[]).map((tb) => (
          <button
            key={tb}
            type="button"
            className={`symbol-tab${tab === tb ? " active" : ""}`}
            title={tb === "greek" ? t.toolbar.greekLetters : tb === "operators" ? t.toolbar.operators : t.toolbar.arrows}
            onMouseDown={(e) => { e.preventDefault(); setTab(tb) }}
          >
            {tb === "greek" ? "αβ" : tb === "operators" ? "∑∫" : "→⇒"}
          </button>
        ))}
      </div>
      <div className="symbol-grid">
        {symbols.map(([glyph, cmd]) => (
          <button
            key={cmd}
            type="button"
            className="symbol-btn"
            title={cmd}
            onMouseDown={(e) => { e.preventDefault(); onInsert(`$${cmd}$`) }}
          >
            {glyph}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Menu list (renders the items of an open section/submenu) ─────────────────

function MenuList({
  items,
  onAction,
  onPanel,
  activeMode,
  closeAll,
}: {
  items: MenuItem[]
  onAction: (snippet: string) => void
  onPanel: (mode: PanelMode) => void
  activeMode: string
  closeAll: () => void
}) {
  const [openSub, setOpenSub] = useState<number | null>(null)
  // Submenu flyout coords (position:fixed, computed from the trigger) so it
  // opens to the RIGHT and isn't clipped by the menu-list's overflow.
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null)
  const openSubmenu = (i: number, btn: HTMLElement) => {
    const r = btn.getBoundingClientRect()
    setSubPos({ left: r.right + 2, top: r.top - 5 })
    setOpenSub(i)
  }

  return (
    <div className="menu-list" role="menu">
      {items.map((item, i) => {
        if (item.kind === "sep") {
          return <div key={i} className="menu-list-sep" role="separator" />
        }
        if (item.kind === "symbols") {
          return (
            <SymbolGrid
              key={i}
              onInsert={(s) => { onAction(s); closeAll() }}
            />
          )
        }
        if (item.kind === "action") {
          return (
            <button
              key={i}
              type="button"
              role="menuitem"
              className="menu-list-item"
              title={item.title}
              onMouseDown={(e) => { e.preventDefault(); onAction(item.snippet); closeAll() }}
            >
              {item.label}
            </button>
          )
        }
        if (item.kind === "panel") {
          const active = activeMode === item.mode
          return (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`menu-list-item menu-list-panel${active ? " active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); onPanel(item.mode); closeAll() }}
            >
              {item.label}
            </button>
          )
        }
        // submenu — opens as a flyout to the RIGHT (click to toggle)
        const isOpen = openSub === i
        return (
          <div key={i} className="menu-sub">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              className={`menu-list-item menu-sub-trigger${isOpen ? " open" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault()
                if (isOpen) setOpenSub(null)
                else openSubmenu(i, e.currentTarget)
              }}
            >
              <span>{item.label}</span>
              <span className="menu-sub-arrow">▸</span>
            </button>
            {isOpen && (
              <div
                className="menu-sub-panel"
                style={subPos ? { left: subPos.left, top: subPos.top } : undefined}
              >
                <MenuList
                  items={item.items}
                  onAction={onAction}
                  onPanel={onPanel}
                  activeMode={activeMode}
                  closeAll={closeAll}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Section button + dropdown ────────────────────────────────────────────────

function SectionMenu({
  section,
  activeMode,
  openId,
  setOpenId,
  onAction,
  onPanel,
}: {
  section: MenuSection
  activeMode: string
  openId: string | null
  setOpenId: (id: string | null) => void
  onAction: (snippet: string) => void
  onPanel: (mode: PanelMode) => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const open = openId === section.id

  const sectionActive = collectPanelModes(section.items).includes(activeMode as PanelMode)

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 4 })
    }
    setOpenId(open ? null : section.id)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`menubar-section-btn${open ? " open" : ""}${sectionActive ? " section-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={section.label}
        onMouseDown={(e) => { e.preventDefault(); toggle() }}
      >
        <span className="menubar-section-icon">{section.icon}</span>
        <span className="menubar-section-label">{section.label}</span>
        <span className="menubar-section-arrow">▾</span>
      </button>
      {open && (
        <div
          className="menubar-popup"
          role="menu"
          style={pos ? { left: pos.left, top: pos.top } : undefined}
        >
          <MenuList
            items={section.items}
            onAction={onAction}
            onPanel={onPanel}
            activeMode={activeMode}
            closeAll={() => setOpenId(null)}
          />
        </div>
      )}
    </>
  )
}

// ── Toolbar (unified menu bar) ───────────────────────────────────────────────

function Toolbar({ editorRef, sidebarMode, setSidebarMode, focusClock, focusOpen, onToggleFocus }: ToolbarProps) {
  const t = useT()
  const sections = getSections(t)
  const directButtons = getDirectButtons(t)
  const [openId, setOpenId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // Outside-click + Escape close.
  useEffect(() => {
    if (openId === null) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      // Popups are position:fixed siblings of the bar, so check both the bar and
      // any open menubar-popup element.
      if (barRef.current?.contains(target)) return
      const popups = document.querySelectorAll(".menubar-popup, .menu-sub-panel")
      for (const el of popups) if (el.contains(target)) return
      setOpenId(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [openId])

  const insert = useCallback((snippet: string) => {
    insertSnippet(editorRef.current, snippet)
  }, [editorRef])

  const onPanel = useCallback((mode: PanelMode) => setSidebarMode(mode), [setSidebarMode])

  return (
    <div className="menubar" ref={barRef}>
      {sections.map((section) => (
        <SectionMenu
          key={section.id}
          section={section}
          activeMode={sidebarMode}
          openId={openId}
          setOpenId={setOpenId}
          onAction={insert}
          onPanel={onPanel}
        />
      ))}

      {directButtons.map((b) => {
        // Focus is a popover anchored to this bar, not a sidebar panel.
        const isFocus = b.mode === "focusTimer" && !!onToggleFocus
        const active = isFocus ? !!focusOpen : sidebarMode === b.mode
        return (
          <button
            key={b.mode}
            type="button"
            className={`menubar-direct-btn${active ? " active" : ""}`}
            title={b.label}
            onMouseDown={(e) => {
              e.preventDefault()
              if (isFocus) onToggleFocus!()
              else setSidebarMode(b.mode)
            }}
          >
            <span className="menubar-section-icon">{b.icon}</span>
            <span className="menubar-section-label">{b.label}</span>
          </button>
        )
      })}

      {/* Live Pomodoro readout, pinned right. Only rendered while a session
          exists, so the bar is unchanged for anyone not using the timer. */}
      {focusClock && (
        <button
          type="button"
          className={`menubar-focus-clock${focusClock.running ? " running" : " paused"}`}
          title={`${t.focusTimer.barTitle} — ${focusClock.phase}`}
          onMouseDown={(e) => { e.preventDefault(); onToggleFocus?.() }}
        >
          <span className="menubar-focus-dot" aria-hidden="true">●</span>
          <span className="menubar-focus-time">{focusClock.clock}</span>
        </button>
      )}
    </div>
  )
}

// Memoized: props are a stable ref + rarely-changing sidebar mode/callback, so
// the toolbar subtree (sections, symbol grid) skips per-keystroke re-renders.
export default memo(Toolbar)
