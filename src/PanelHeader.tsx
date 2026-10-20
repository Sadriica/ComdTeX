import type { ReactNode } from "react"

interface PanelHeaderProps {
  /** The panel's name, shown in small uppercase. */
  title: string
  /** Optional total shown as a pill next to the actions. */
  count?: number | string
  /** Icon buttons for the panel, rendered on the right (`.panel-header-btn`). */
  children?: ReactNode
}

/**
 * The header every sidebar panel starts with: title on the left, an optional
 * count pill and icon-button actions on the right. One shape for all panels,
 * so title size, padding and the divider never drift between them.
 */
export default function PanelHeader({ title, count, children }: PanelHeaderProps) {
  const hasCount = count !== undefined && count !== ""
  return (
    <div className="panel-header">
      <span className="panel-header-title">{title}</span>
      {(hasCount || children) && (
        <span className="panel-header-actions">
          {children}
          {hasCount && <span className="panel-count">{count}</span>}
        </span>
      )}
    </div>
  )
}
