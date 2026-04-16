import { useState } from "react"
import type { OpenFile } from "./types"
import type { LintSummary } from "./contentLinter"
import { useT } from "./i18n"

interface TabBarProps {
  tabs: OpenFile[]
  activeTabPath: string | null
  onSwitch: (path: string) => void
  onClose: (path: string) => void
  lintCounts?: Record<string, LintSummary>
  pinnedPaths?: Set<string>
  onTogglePin?: (path: string) => void
  onReorder?: (from: number, to: number) => void
}

export default function TabBar({ tabs, activeTabPath, onSwitch, onClose, lintCounts, pinnedPaths, onTogglePin, onReorder }: TabBarProps) {
  const t = useT()
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  if (tabs.length === 0) return null

  return (
    <div className="tab-bar">
      {tabs.map((tab, idx) => {
        const counts = lintCounts?.[tab.path]
        const hasErrors = (counts?.errors ?? 0) > 0
        const hasWarnings = (counts?.warnings ?? 0) > 0
        const isPinned = pinnedPaths?.has(tab.path) ?? false

        return (
          <div
            key={tab.path}
            className={`tab ${tab.path === activeTabPath ? "tab-active" : ""}${dragIdx === idx ? " tab-dragging" : ""}`}
            onClick={() => onSwitch(tab.path)}
            title={tab.path}
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragIdx(idx) }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) onReorder?.(dragIdx, idx); setDragIdx(null) }}
            onDragEnd={() => setDragIdx(null)}
          >
            <span className="tab-name">{tab.name}</span>
            {tab.isDirty && <span className="tab-dirty">●</span>}
            {hasErrors && (
              <span className="tab-lint-error" title={`${counts!.errors} error${counts!.errors === 1 ? "" : "s"}`}>
                {counts!.errors}
              </span>
            )}
            {!hasErrors && hasWarnings && (
              <span className="tab-lint-warning" title={`${counts!.warnings} aviso${counts!.warnings === 1 ? "" : "s"}`}>
                {counts!.warnings}
              </span>
            )}
            <button
              className={`tab-pin${isPinned ? " tab-pinned" : ""}`}
              title={isPinned ? "Desanclar" : "Anclar"}
              onClick={(e) => { e.stopPropagation(); onTogglePin?.(tab.path) }}
              aria-label={isPinned ? "Desanclar pestaña" : "Anclar pestaña"}
            >
              {isPinned ? "📌" : "·"}
            </button>
            {!isPinned && (
              <button
                className="tab-close"
                title={t.titleBar.close}
                onClick={(e) => { e.stopPropagation(); onClose(tab.path) }}
              >×</button>
            )}
          </div>
        )
      })}
    </div>
  )
}
