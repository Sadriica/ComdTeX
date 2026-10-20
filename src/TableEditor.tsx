import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"
import { AlignCenter, AlignLeft, AlignRight, Icon } from "./icons"
import type { LucideIcon } from "./icons"

interface TableEditorProps {
  open: boolean
  onClose: () => void
  initialMarkdown?: string
  onInsert: (markdown: string) => void
}

type Alignment = "left" | "center" | "right"

const ALIGN_ICON: Record<Alignment, LucideIcon> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
}

function parseMarkdownTable(md: string): { rows: string[][]; alignments: Alignment[] } | null {
  const lines = md
    .trim()
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
  if (lines.length < 2) return null
  const parseRow = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim())
  const header = parseRow(lines[0])
  const sepCells = parseRow(lines[1])
  const alignments: Alignment[] = sepCells.map((cell) => {
    const s = cell.trim()
    if (s.startsWith(":") && s.endsWith(":")) return "center"
    if (s.endsWith(":")) return "right"
    return "left"
  })
  // pad alignments to match header length
  while (alignments.length < header.length) alignments.push("left")
  const dataRows = lines.slice(2).map(parseRow)
  return { rows: [header, ...dataRows], alignments }
}

function alignmentToSep(a: Alignment): string {
  if (a === "center") return ":---:"
  if (a === "right") return "---:"
  return ":---"
}

function alignmentToLatex(a: Alignment): string {
  if (a === "center") return "c"
  if (a === "right") return "r"
  return "l"
}

function generateMarkdown(rows: string[][], alignments: Alignment[]): string {
  if (rows.length === 0) return ""
  const cols = Math.max(...rows.map((r) => r.length))
  const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill("")]

  const header = pad(rows[0])
  const paddedAligns = [
    ...alignments,
    ...Array(Math.max(0, cols - alignments.length)).fill("left" as Alignment),
  ]
  const sep = paddedAligns.map(alignmentToSep)
  const dataRows = rows.slice(1).map(pad)

  const renderRow = (cells: string[]) => `| ${cells.join(" | ")} |`

  return [renderRow(header), renderRow(sep), ...dataRows.map(renderRow)].join("\n")
}

function generateLatex(rows: string[][], alignments: Alignment[]): string {
  if (rows.length === 0) return ""
  const cols = Math.max(...rows.map((r) => r.length))
  const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill("")]
  const paddedAligns = [
    ...alignments,
    ...Array(Math.max(0, cols - alignments.length)).fill("left" as Alignment),
  ]

  const colSpec = paddedAligns.map(alignmentToLatex).join("")

  const renderRow = (cells: string[]) => `${pad(cells).join(" & ")} \\\\`

  const lines: string[] = [
    `\\begin{tabular}{${colSpec}}`,
    "\\hline",
    renderRow(rows[0]),
    "\\hline",
    ...rows.slice(1).map((r) => renderRow(r)),
    "\\hline",
    "\\end{tabular}",
  ]
  return lines.join("\n")
}

const DEFAULT_ROWS = 3
const DEFAULT_COLS = 3

function makeEmpty(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(""))
}

function makeAlignments(cols: number): Alignment[] {
  return Array(cols).fill("left")
}

const ALIGNMENTS: Alignment[] = ["left", "center", "right"]

const ALIGN_TITLE = (t: ReturnType<typeof useT>): Record<Alignment, string> => ({
  left: t.tableEditor.alignLeft,
  center: t.tableEditor.alignCenter,
  right: t.tableEditor.alignRight,
})

export default function TableEditor({
  open,
  onClose,
  initialMarkdown,
  onInsert,
}: TableEditorProps) {
  const t = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [rows, setRows] = useState<string[][]>(() => makeEmpty(DEFAULT_ROWS, DEFAULT_COLS))
  const [alignments, setAlignments] = useState<Alignment[]>(() => makeAlignments(DEFAULT_COLS))
  const [latexCopied, setLatexCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initialMarkdown) {
      const parsed = parseMarkdownTable(initialMarkdown)
      if (parsed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRows(parsed.rows)
        setAlignments(parsed.alignments)
      } else {
        setRows(makeEmpty(DEFAULT_ROWS, DEFAULT_COLS))
        setAlignments(makeAlignments(DEFAULT_COLS))
      }
    } else {
      setRows(makeEmpty(DEFAULT_ROWS, DEFAULT_COLS))
      setAlignments(makeAlignments(DEFAULT_COLS))
    }
  }, [open, initialMarkdown])

  const cols = rows[0]?.length ?? DEFAULT_COLS

  const preview = useMemo(() => generateMarkdown(rows, alignments), [rows, alignments])

  const updateCell = (r: number, c: number, val: string) => {
    setRows((prev) => {
      const next = prev.map((row) => [...row])
      next[r][c] = val
      return next
    })
  }

  const setAlignment = (c: number, al: Alignment) => {
    setAlignments((prev) => {
      const next = [...prev]
      while (next.length <= c) next.push("left")
      next[c] = al
      return next
    })
  }

  const addRow = () => setRows((prev) => [...prev, Array(cols).fill("")])

  const removeRow = () => {
    if (rows.length <= 1) return
    setRows((prev) => prev.slice(0, -1))
  }

  const addCol = () => {
    setRows((prev) => prev.map((row) => [...row, ""]))
    setAlignments((prev) => [...prev, "left"])
  }

  const removeCol = () => {
    if (cols <= 1) return
    setRows((prev) => prev.map((row) => row.slice(0, -1)))
    setAlignments((prev) => prev.slice(0, -1))
  }

  const handleInsert = () => {
    onInsert(preview)
    onClose()
  }

  const handleCopyLatex = () => {
    const latex = generateLatex(rows, alignments)
    navigator.clipboard
      .writeText(latex)
      .then(() => {
        setLatexCopied(true)
        setTimeout(() => setLatexCopied(false), 1500)
      })
      .catch((err) => {
        console.error("Failed to copy LaTeX:", err)
      })
  }

  // Focus moves into the dialog, Tab stays inside it and Escape closes it.
  useFocusTrap(dialogRef, open, onClose)

  if (!open) return null

  return (
    <div className="table-editor-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="table-editor-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId}>{t.palette.tableEditor}</h3>

        <div className="table-editor-grid">
          {/* Alignment row: one segmented control per column */}
          <div className="table-editor-row">
            {rows[0]?.map((_cell, c) => (
              <div
                key={c}
                className="table-editor-align"
                role="group"
                aria-label={`${t.tableEditor.alignLeft} / ${t.tableEditor.alignCenter} / ${t.tableEditor.alignRight} ${c + 1}`}
              >
                {ALIGNMENTS.map((al) => (
                  <button
                    key={al}
                    type="button"
                    className={`table-editor-align-btn${(alignments[c] ?? "left") === al ? " active" : ""}`}
                    aria-pressed={(alignments[c] ?? "left") === al}
                    title={ALIGN_TITLE(t)[al]}
                    aria-label={ALIGN_TITLE(t)[al]}
                    onClick={() => setAlignment(c, al)}
                  >
                    <Icon icon={ALIGN_ICON[al]} size={14} />
                  </button>
                ))}
              </div>
            ))}
          </div>

          {rows.map((row, r) => (
            <div key={r} className="table-editor-row">
              {row.map((cell, c) => (
                <input
                  key={c}
                  className={`table-editor-cell${r === 0 ? " table-editor-head" : ""}`}
                  value={cell}
                  placeholder={r === 0 ? `Col ${c + 1}` : ""}
                  onChange={(e) => updateCell(r, c, e.target.value)}
                  aria-label={
                    r === 0 ? `Encabezado columna ${c + 1}` : `Fila ${r} columna ${c + 1}`
                  }
                />
              ))}
            </div>
          ))}
        </div>

        <div className="table-editor-actions">
          <button onClick={addRow}>{t.tableEditor.addRow}</button>
          <button onClick={removeRow} disabled={rows.length <= 1}>
            {t.tableEditor.removeRow}
          </button>
          <button onClick={addCol}>{t.tableEditor.addColumn}</button>
          <button onClick={removeCol} disabled={cols <= 1}>
            {t.tableEditor.removeColumn}
          </button>
        </div>

        <div>
          <div className="table-editor-label">{t.tableEditor.preview}</div>
          <div className="table-editor-preview">{preview}</div>
        </div>

        <div className="table-editor-footer">
          <button className="btn-copy-latex" onClick={handleCopyLatex}>
            {latexCopied ? t.tableEditor.latexCopied : t.tableEditor.copyLatex}
          </button>
          <button className="btn-cancel" onClick={onClose}>
            {t.tableEditor.cancel}
          </button>
          <button className="btn-insert" onClick={handleInsert}>
            {t.tableEditor.insert}
          </button>
        </div>
      </div>
    </div>
  )
}
