import type { OpenFile } from "./types"
import { useT } from "./i18n"

interface TabBarProps {
  tabs: OpenFile[]
  activeTabPath: string | null
  onSwitch: (path: string) => void
  onClose: (path: string) => void
}

export default function TabBar({ tabs, activeTabPath, onSwitch, onClose }: TabBarProps) {
  const t = useT()
  if (tabs.length === 0) return null

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={`tab ${tab.path === activeTabPath ? "tab-active" : ""}`}
          onClick={() => onSwitch(tab.path)}
          title={tab.path}
        >
          <span className="tab-name">{tab.name}</span>
          {tab.isDirty && <span className="tab-dirty">●</span>}
          <button
            className="tab-close"
            title={t.titleBar.close}
            onClick={(e) => { e.stopPropagation(); onClose(tab.path) }}
          >×</button>
        </div>
      ))}
    </div>
  )
}
