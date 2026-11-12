import { useT } from "./i18n"
import {
  Copy,
  FilePlus,
  Highlighter,
  Icon,
  ImagePlus,
  MessageSquare,
  PenLine,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "./icons"
import type { AnnotationKind, PdfAnnotationEntry } from "./pdfAnnotations"

const KIND_ICON: Record<AnnotationKind, LucideIcon> = {
  highlight: Highlighter,
  text: Type,
  ink: PenLine,
  image: ImagePlus,
  note: MessageSquare,
}

export interface PdfAnnotationsListProps {
  entries: PdfAnnotationEntry[]
  loading: boolean
  onJump: (entry: PdfAnnotationEntry) => void
  onComment: (entry: PdfAnnotationEntry) => void
  onDelete: (entry: PdfAnnotationEntry) => void
  onCopyAll: () => void
  onExport: () => void
  onClose: () => void
}

/**
 * The Annotations panel of the PDF viewer: every highlight, text box, drawing
 * and comment of the PDF in reading order, as Zotero's annotation sidebar
 * shows them. A click goes to the spot; the buttons copy everything as
 * Markdown or write it into a note beside the PDF.
 */
export default function PdfAnnotationsList({
  entries,
  loading,
  onJump,
  onComment,
  onDelete,
  onCopyAll,
  onExport,
  onClose,
}: PdfAnnotationsListProps) {
  const t = useT()
  const p = t.pdfPreview
  return (
    <aside className="pdf-annotations" aria-label={p.annotations}>
      <div className="pdf-annotations-head">
        <span className="pdf-annotations-title">
          {p.annotations}
          {entries.length > 0 && <span className="pdf-annotations-count">{entries.length}</span>}
        </span>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={onCopyAll}
          disabled={!entries.length}
          title={p.copyAllMarkdown}
          aria-label={p.copyAllMarkdown}
        >
          <Icon icon={Copy} size={14} />
        </button>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={onExport}
          disabled={!entries.length}
          title={p.exportToNote}
          aria-label={p.exportToNote}
        >
          <Icon icon={FilePlus} size={14} />
        </button>
        <button
          type="button"
          className="pdf-toolbar-btn"
          onClick={onClose}
          title={p.closeAnnotations}
          aria-label={p.closeAnnotations}
        >
          <Icon icon={X} size={14} />
        </button>
      </div>
      {!entries.length ? (
        <p className="pdf-annotations-empty">{loading ? p.loading : p.noAnnotations}</p>
      ) : (
        <ul className="pdf-annotations-list">
          {entries.map((e, i) => {
            const heading = i === 0 || entries[i - 1].page !== e.page
            const label = e.text || (e.kind === "highlight" ? p.kinds.highlight : p.kinds[e.kind])
            return (
              <li key={e.id} className="pdf-annotation-row">
                {heading && <div className="pdf-annotations-page">{p.pageHeading(e.page)}</div>}
                <div className="pdf-annotation">
                  <button
                    type="button"
                    className="pdf-annotation-main"
                    onClick={() => onJump(e)}
                    title={p.goToAnnotation}
                  >
                    <span
                      className={`pdf-annotation-mark${e.kind === "highlight" && e.color ? " marker" : ""}`}
                      style={
                        !e.color
                          ? undefined
                          : e.kind === "highlight"
                            ? { background: e.color }
                            : { borderColor: e.color }
                      }
                      aria-hidden="true"
                    >
                      <Icon icon={KIND_ICON[e.kind]} size={14} />
                    </span>
                    <span className="pdf-annotation-body">
                      <span className={`pdf-annotation-text${e.text ? "" : " muted"}`}>
                        {label}
                      </span>
                      {e.comment && <span className="pdf-annotation-comment">{e.comment}</span>}
                    </span>
                  </button>
                  {e.live && (
                    <span className="pdf-annotation-actions">
                      <button
                        type="button"
                        className="pdf-toolbar-btn"
                        onClick={() => onComment(e)}
                        title={e.comment ? p.editComment : p.addComment}
                        aria-label={e.comment ? p.editComment : p.addComment}
                      >
                        <Icon icon={MessageSquare} size={14} />
                      </button>
                      <button
                        type="button"
                        className="pdf-toolbar-btn"
                        onClick={() => onDelete(e)}
                        title={p.deleteAnnotation}
                        aria-label={p.deleteAnnotation}
                      >
                        <Icon icon={Trash2} size={14} />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
