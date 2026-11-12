import { describe, expect, it } from "vitest"
import { commentText, PdfCommentManager, type CommentTarget } from "./pdfCommentManager"

function target(text: string | null): CommentTarget {
  return { comment: text, getData: () => ({ contentsObj: { str: text } }) }
}

function host() {
  const calls: string[] = []
  return {
    calls,
    host: {
      openDialog: (_t: CommentTarget, x: number, y: number) => calls.push(`dialog ${x},${y}`),
      togglePopup: (t: CommentTarget | null, visible: boolean, pinned: boolean) =>
        calls.push(`popup ${t ? commentText(t) : "none"} ${visible} ${pinned}`),
      changed: () => calls.push("changed"),
    },
  }
}

describe("PdfCommentManager", () => {
  it("shows a comment on hover and hides it on leave", () => {
    const { calls, host: h } = host()
    const m = new PdfCommentManager(h)
    const a = target("Check this")
    m.toggleCommentPopup(a, false, true)
    m.toggleCommentPopup(a, false, false)
    expect(calls).toEqual(["popup Check this true false", "popup Check this false false"])
  })

  it("pins it on click, ignores hovers while pinned, unpins on a second click", () => {
    const { calls, host: h } = host()
    const m = new PdfCommentManager(h)
    const a = target("Pinned")
    m.toggleCommentPopup(a, true)
    m.toggleCommentPopup(a, false, false)
    m.toggleCommentPopup(a, true)
    expect(calls).toEqual(["popup Pinned true true", "popup Pinned false false"])
  })

  it("opens the dialog where pdf.js asks and closes any popup first", () => {
    const { calls, host: h } = host()
    const m = new PdfCommentManager(h)
    m.showDialog(null, target(""), 10, 20)
    expect(calls).toEqual(["popup none false false", "dialog 10,20"])
  })

  it("reports changes to comments", () => {
    const { calls, host: h } = host()
    const m = new PdfCommentManager(h)
    m.addComment()
    m.updateComment()
    m.removeComments()
    expect(calls).toEqual(["changed", "changed", "changed"])
  })

  it("reads a target's comment text, empty when it has none or fails", () => {
    expect(commentText(target("x"))).toBe("x")
    expect(commentText(target(null))).toBe("")
    expect(
      commentText({
        comment: null,
        getData: () => {
          throw new Error("gone")
        },
      }),
    ).toBe("")
  })
})
