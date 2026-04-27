import { Fragment, type ReactNode } from "react"

/**
 * Render a short empty-state message with backtick-wrapped segments
 * shown as inline <code>. Pure text otherwise — no Markdown beyond `code`.
 */
export function renderEmptyMessage(message: string): ReactNode {
  const parts = message.split(/(`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}
