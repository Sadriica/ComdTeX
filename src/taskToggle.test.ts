import { describe, expect, it } from "vitest"
import { findTaskLineToToggle } from "./markdownEditing"
import { renderMarkdown } from "./renderer"

const lines = (text: string) => text.split("\n")

describe("preview checkbox targets", () => {
  it("points checkboxes at editor lines when the note has frontmatter", () => {
    const src = "---\ntitle: T\ntags: [a]\n---\n\n# H\n\n- [ ] one\n- [x] two\n"
    const html = renderMarkdown(src)
    const hints = [...html.matchAll(/data-line="(\d+)"/g)].map((m) => Number(m[1]))
    const l = lines(src)
    expect(hints.map((h) => l[h])).toEqual(["- [ ] one", "- [x] two"])
  })

  it("trusts the hint only when it holds a task in the expected state", () => {
    const l = lines("- [x] done\n- [ ] open\ntext")
    expect(findTaskLineToToggle(l.length, (i) => l[i], 1, false)).toBe(1)
    // Hint drifted onto the done task while the open one was clicked.
    expect(findTaskLineToToggle(l.length, (i) => l[i], 0, false)).toBe(1)
    // Nothing matches: touch nothing.
    expect(findTaskLineToToggle(l.length, (i) => l[i], 2, true, 0)).toBe(-1)
    const prose = lines("just prose\nmore prose")
    expect(findTaskLineToToggle(prose.length, (i) => prose[i], 0, false)).toBe(-1)
  })
})
