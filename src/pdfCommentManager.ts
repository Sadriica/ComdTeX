/**
 * The comment manager pdf.js's annotation editor asks for (`commentManager`
 * on PDFViewer). Firefox's lives in its viewer app with its own dialog,
 * popup and sidebar markup; this one hands every request to ComdTeX's React
 * UI instead: a dialog to write the comment, a popup to read it, and the
 * Annotations panel, which re-reads the list whenever a comment changes.
 *
 * Comments are stored by pdf.js itself (`target.comment = text`) and written
 * into the PDF as the annotation's popup text, which every reader shows.
 */

/** What pdf.js passes: an annotation editor, or the popup of a saved annotation. */
export interface CommentTarget {
  comment: unknown
  getData(): { contentsObj?: { str?: string | null } | null }
  uid?: string
  pageIndex?: number
}

export interface CommentHost {
  /** Open the comment dialog for `target` near (x, y) in viewport pixels. */
  openDialog(target: CommentTarget, x: number, y: number): void
  /** Show (`visible`) or hide the comment of `target`; `pinned` keeps it open. */
  togglePopup(target: CommentTarget | null, visible: boolean, pinned: boolean): void
  /** A comment was added, changed or removed. */
  changed(): void
}

/** The text of a target's comment ("" when none). */
export function commentText(target: CommentTarget): string {
  try {
    return target.getData()?.contentsObj?.str ?? ""
  } catch {
    return ""
  }
}

export class PdfCommentManager {
  #host: CommentHost
  #pinned: CommentTarget | null = null
  #dialogElement: HTMLElement | null = null

  constructor(host: CommentHost) {
    this.#host = host
  }

  /**
   * pdf.js points each comment button's aria-controls at this element and
   * fails to build the button without one. The dialog itself is React's, so
   * pdf.js gets a stand-in.
   */
  get dialogElement(): HTMLElement {
    this.#dialogElement ??= document.createElement("div")
    return this.#dialogElement
  }

  setSidebarUiManager(): void {}
  showSidebar(): void {}
  hideSidebar(): void {}
  selectComment(): void {}

  addComment(): void {
    this.#host.changed()
  }
  updateComment(): void {
    this.#host.changed()
  }
  removeComments(): void {
    this.#host.changed()
  }

  /**
   * pdf.js calls this on hover (visibility true/false) and on click
   * (isSelected): a click pins the popup until the next click elsewhere.
   */
  toggleCommentPopup(
    target: CommentTarget | null,
    isSelected?: boolean,
    visibility?: boolean,
  ): void {
    if (!target) {
      this.#pinned = null
      this.#host.togglePopup(null, false, false)
      return
    }
    if (isSelected) {
      const again = this.#pinned === target
      this.#pinned = again ? null : target
      this.#host.togglePopup(target, !again, !again)
      return
    }
    if (this.#pinned) return
    this.#host.togglePopup(target, visibility !== false, false)
  }

  destroyPopup(): void {
    this.#pinned = null
    this.#host.togglePopup(null, false, false)
  }

  updatePopupColor(): void {}

  showDialog(_uiManager: unknown, target: CommentTarget, posX: number, posY: number): void {
    this.#pinned = null
    this.#host.togglePopup(null, false, false)
    this.#host.openDialog(target, posX, posY)
  }

  /** Background of the comment button: pdf.js's default when null. */
  makeCommentColor(): string | null {
    return null
  }

  destroy(): void {
    this.destroyPopup()
  }
}
