import { useCallback, useMemo, useState } from "react"
import type { OpenFile } from "./types"
import { displayBasename } from "./pathUtils"
import { parseTasks, type TaskItem, type SourceFile } from "./generators"
import { useVaultSources, type LoadDiskSources } from "./vaultSources"
import { useT } from "./i18n"
import { Check, CircleCheck, Icon } from "./icons"
import { renderEmptyMessage } from "./emptyStateMessage"
import PanelHeader from "./PanelHeader"

type TodoItem = TaskItem

interface TodoPanelProps {
  openTabs: OpenFile[]
  /** Reads every vault text file (shared search index); open tabs override it. */
  loadDiskSources: LoadDiskSources
  /** Bump to force a reload after a write that bypassed the tabs. */
  reloadKey?: number
  onNavigate: (path: string, line: number) => void
  /** Flip this task's checkbox; the host re-validates it against the file. */
  onToggle: (item: TaskItem) => void
}

// Per-file parse cache keyed on the content string: while typing, only the
// edited tab re-parses; thousands of untouched notes cost a Map lookup each.
const taskCache = new Map<string, { content: string; items: TaskItem[] }>()

function parseTasksCached(files: SourceFile[]): TaskItem[] {
  const out: TaskItem[] = []
  const seen = new Set<string>()
  for (const f of files) {
    seen.add(f.path)
    let hit = taskCache.get(f.path)
    if (!hit || hit.content !== f.content) {
      hit = { content: f.content, items: parseTasks([f]) }
      taskCache.set(f.path, hit)
    }
    for (const item of hit.items) out.push(item)
  }
  for (const path of taskCache.keys()) if (!seen.has(path)) taskCache.delete(path)
  return out
}

export default function TodoPanel({
  openTabs,
  loadDiskSources,
  reloadKey,
  onNavigate,
  onToggle,
}: TodoPanelProps) {
  const t = useT()
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all")
  // Same parser the generated `_tareas.md` uses, so the panel and the file can
  // never disagree about what counts as a task.
  const { sources } = useVaultSources(loadDiskSources, openTabs, reloadKey)
  const items = useMemo(() => parseTasksCached(sources), [sources])

  const handleToggle = useCallback((item: TodoItem) => onToggle(item), [onToggle])

  const done = items.filter((i) => i.done).length
  const visible = items.filter((i) =>
    filter === "all" ? true : filter === "done" ? i.done : !i.done,
  )

  if (items.length === 0)
    return (
      <div className="todo-panel">
        <PanelHeader title={t.sidebar.todo} />
        <div className="panel-empty-rich">
          <div className="panel-empty-icon" aria-hidden="true">
            <Icon icon={CircleCheck} size={16} />
          </div>
          <p className="panel-empty-message">{renderEmptyMessage(t.emptyStates.todoMessage)}</p>
        </div>
      </div>
    )

  const byFile = visible.reduce<Record<string, TodoItem[]>>((acc, item) => {
    if (!acc[item.filePath]) acc[item.filePath] = []
    acc[item.filePath].push(item)
    return acc
  }, {})

  return (
    <div className="todo-panel">
      <PanelHeader title={t.sidebar.todo} count={`${done}/${items.length}`} />
      <div className="todo-header">
        <div className="todo-filters" title={t.todo.summary(done, items.length)}>
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
                {item.done && <Icon icon={Check} size={14} />}
              </button>
              <span
                className="todo-text"
                onClick={() => onNavigate(item.filePath, item.line)}
                title={t.todo.lineTitle(item.line)}
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
