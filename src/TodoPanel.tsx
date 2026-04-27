import { useCallback, useMemo, useState } from "react"
import type { OpenFile } from "./types"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"
import { renderEmptyMessage } from "./emptyStateMessage"

interface TodoItem {
  filePath: string
  fileName: string
  line: number
  text: string
  done: boolean
}

function parseTasks(tabs: OpenFile[]): TodoItem[] {
  const items: TodoItem[] = []
  for (const tab of tabs) {
    tab.content.split("\n").forEach((ln, i) => {
      const m = /^\s*-\s*\[([ xX])\]\s+(.+)$/.exec(ln)
      if (m) items.push({
        filePath: tab.path, fileName: tab.name,
        line: i + 1, text: m[2].trim(), done: m[1].toLowerCase() === "x",
      })
    })
  }
  return items
}

interface TodoPanelProps {
  openTabs: OpenFile[]
  onNavigate: (path: string, line: number) => void
  onToggle: (path: string, newContent: string) => void
}

export default function TodoPanel({ openTabs, onNavigate, onToggle }: TodoPanelProps) {
  const t = useT()
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all")
  const items = useMemo(() => parseTasks(openTabs), [openTabs])

  const handleToggle = useCallback((item: TodoItem) => {
    const tab = openTabs.find((t) => t.path === item.filePath)
    if (!tab) return
    const lines = tab.content.split("\n")
    const ln = lines[item.line - 1]
    lines[item.line - 1] = item.done
      ? ln.replace(/\[[ xX]\]/, "[ ]")
      : ln.replace(/\[[ xX]\]/, "[x]")
    onToggle(item.filePath, lines.join("\n"))
  }, [openTabs, onToggle])

  const done = items.filter((i) => i.done).length
  const visible = items.filter((i) =>
    filter === "all" ? true : filter === "done" ? i.done : !i.done
  )

  if (items.length === 0) return (
    <div className="panel-empty-rich">
      <div className="panel-empty-icon" aria-hidden="true">{t.emptyStates.todoIcon}</div>
      <p className="panel-empty-message">{renderEmptyMessage(t.emptyStates.todoMessage)}</p>
    </div>
  )

  const byFile = visible.reduce<Record<string, TodoItem[]>>((acc, item) => {
    if (!acc[item.filePath]) acc[item.filePath] = []
    acc[item.filePath].push(item)
    return acc
  }, {})

  return (
    <div className="todo-panel">
      <div className="todo-header">
        <span className="todo-summary">{t.todo.summary(done, items.length)}</span>
        <div className="todo-filters">
          {(["all", "pending", "done"] as const).map((f) => (
            <button
              key={f}
              className={`todo-filter${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {t.todo[f]}
            </button>
          ))}
        </div>
      </div>
      {Object.entries(byFile).map(([path, fileItems]) => (
        <div key={path} className="todo-file-group">
          <div className="todo-file-name">{displayBasename(path)}</div>
          {fileItems.map((item, i) => (
            <div key={i} className={`todo-item${item.done ? " todo-done" : ""}`}>
              <button
                className="todo-check"
                onClick={() => handleToggle(item)}
                title={item.done ? t.todo.markPending : t.todo.markDone}
                aria-label={item.done ? t.todo.markPending : t.todo.markDone}
              >
                {item.done ? "✓" : "○"}
              </button>
              <span
                className="todo-text"
                onClick={() => onNavigate(item.filePath, item.line)}
                title={`Línea ${item.line}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onNavigate(item.filePath, item.line)}
              >
                {item.text}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
