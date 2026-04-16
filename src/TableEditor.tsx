import { useEffect, useMemo, useState } from "react"

interface TableEditorProps {
  open: boolean
  onClose: () => void
  initialMarkdown?: string
  onInsert: (markdown: string) => void
}

function parseMarkdownTable(md: string): string[][] | null {
  const lines = md.trim().split("\n").filter(l => l.trim().startsWith("|"))
  if (lines.length < 2) return null
  const parseRow = (line: string) =>
    line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim())
  const header = parseRow(lines[0])
  // skip separator line (lines[1])
  const dataRows = lines.slice(2).map(parseRow)
  return [header, ...dataRows]
}

function generateMarkdown(rows: string[][]): string {
  if (rows.length === 0) return ""
  const cols = Math.max(...rows.map(r => r.length))
  const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill("")]

  const header = pad(rows[0])
  const sep = Array(cols).fill("---")
  const dataRows = rows.slice(1).map(pad)

  const renderRow = (cells: string[]) => `| ${cells.join(" | ")} |`

  return [
    renderRow(header),
    renderRow(sep),
    ...dataRows.map(renderRow),
  ].join("\n")
}

const DEFAULT_ROWS = 3
const DEFAULT_COLS = 3

function makeEmpty(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(""))
}

export default function TableEditor({ open, onClose, initialMarkdown, onInsert }: TableEditorProps) {
  const [rows, setRows] = useState<string[][]>(() => makeEmpty(DEFAULT_ROWS, DEFAULT_COLS))

  useEffect(() => {
    if (!open) return
    if (initialMarkdown) {
      const parsed = parseMarkdownTable(initialMarkdown)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows(parsed ?? makeEmpty(DEFAULT_ROWS, DEFAULT_COLS))
    } else {
      setRows(makeEmpty(DEFAULT_ROWS, DEFAULT_COLS))
    }
  }, [open, initialMarkdown])

  const cols = rows[0]?.length ?? DEFAULT_COLS

  const preview = useMemo(() => generateMarkdown(rows), [rows])

  const updateCell = (r: number, c: number, val: string) => {
    setRows(prev => {
      const next = prev.map(row => [...row])
      next[r][c] = val
      return next
    })
  }

  const addRow = () => setRows(prev => [...prev, Array(cols).fill("")])

  const removeRow = () => {
    if (rows.length <= 1) return
    setRows(prev => prev.slice(0, -1))
  }

  const addCol = () => setRows(prev => prev.map(row => [...row, ""]))

  const removeCol = () => {
    if (cols <= 1) return
    setRows(prev => prev.map(row => row.slice(0, -1)))
  }

  const handleInsert = () => {
    onInsert(preview)
    onClose()
  }

  if (!open) return null

  return (
    <div className="table-editor-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="table-editor-dialog">
        <h3>Editor de tabla</h3>

        <div className="table-editor-grid">
          {rows.map((row, r) => (
            <div key={r} className="table-editor-row">
              {row.map((cell, c) => (
                <input
                  key={c}
                  className="table-editor-cell"
                  value={cell}
                  placeholder={r === 0 ? `Col ${c + 1}` : ""}
                  onChange={e => updateCell(r, c, e.target.value)}
                  aria-label={r === 0 ? `Encabezado columna ${c + 1}` : `Fila ${r} columna ${c + 1}`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="table-editor-actions">
          <button onClick={addRow}>+ Fila</button>
          <button onClick={removeRow} disabled={rows.length <= 1}>− Fila</button>
          <button onClick={addCol}>+ Columna</button>
          <button onClick={removeCol} disabled={cols <= 1}>− Columna</button>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Vista previa</div>
          <div className="table-editor-preview">{preview}</div>
        </div>

        <div className="table-editor-footer">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-insert" onClick={handleInsert}>Insertar</button>
        </div>
      </div>
    </div>
  )
}
