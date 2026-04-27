import { useMemo } from "react"
import type * as monaco from "monaco-editor"
import { useT } from "./i18n"
import type { OpenFile } from "./types"

const NUMBERED_TYPES = ["theorem", "lemma", "corollary", "proposition", "definition", "example", "exercise"]
const ALL_TYPES = [...NUMBERED_TYPES, "proof", "remark", "note"]

interface EnvItem {
  type: string
  title: string | null
  number: number | null
  line: number
  filePath: string
  fileName: string
}

function parseEnvironments(tabs: OpenFile[]): EnvItem[] {
  const items: EnvItem[] = []
  const counters: Record<string, number> = {}
  const re = /^:::(\w+)(?:\[([^\]]*)\])?/
  for (const tab of tabs) {
    tab.content.split("\n").forEach((ln, i) => {
      const m = re.exec(ln.trim())
      if (!m) return
      const type = m[1].toLowerCase()
      if (!ALL_TYPES.includes(type)) return
      const title = m[2]?.trim() || null
      const isNumbered = NUMBERED_TYPES.includes(type)
      if (isNumbered) counters[type] = (counters[type] ?? 0) + 1
      items.push({
        type,
        title,
        number: isNumbered ? counters[type] : null,
        line: i + 1,
        filePath: tab.path,
        fileName: tab.name,
      })
    })
  }
  return items
}

interface EnvironmentsPanelProps {
  openTabs: OpenFile[]
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
  activeTabPath: string | null
  onOpenFile: (path: string) => void
}

export default function EnvironmentsPanel({
  openTabs,
  editorRef,
  activeTabPath,
  onOpenFile,
}: EnvironmentsPanelProps) {
  const t = useT()
  const items = useMemo(() => parseEnvironments(openTabs), [openTabs])

  if (items.length === 0) {
    return <div className="panel-empty">{t.environments.empty}</div>
  }

  const jump = (line: number) => {
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
    editor.focus()
  }

  const handleClick = (item: EnvItem) => {
    if (item.filePath === activeTabPath) {
      jump(item.line)
    } else {
      onOpenFile(item.filePath)
      // Jump after the file is opened; use a short timeout to let the editor mount
      setTimeout(() => jump(item.line), 150)
    }
  }

  const typeLabel = (type: string): string => {
    return (t.environments.types as Record<string, string>)[type] ?? type
  }

  return (
    <div className="env-list-panel">
      <div className="panel-header">{t.environments.count(items.length)}</div>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="env-list-item"
          onClick={() => handleClick(item)}
          title={t.environments.fileLineTitle(item.fileName, item.line)}
        >
          <div className="env-list-row1">
            <span className={`env-badge env-badge-${item.type}`}>{typeLabel(item.type)}</span>
            {item.number !== null && (
              <span className="env-list-num">{item.number}</span>
            )}
            {item.title && (
              <span className="env-list-title">{item.title}</span>
            )}
          </div>
          <div className="env-list-file">{item.fileName}:{item.line}</div>
        </div>
      ))}
    </div>
  )
}
