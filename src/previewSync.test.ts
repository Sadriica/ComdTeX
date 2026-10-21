// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderMarkdown } from "./renderer"
import paper from "../e2e/fixtures/vault/papers/spectral-gap.md?raw"

function blocks(html: string): HTMLElement[] {
  const root = document.createElement("div")
  root.innerHTML = html
  return [...root.querySelectorAll<HTMLElement>("h1, h2, h3, p, li")].filter(
    (el) => !el.closest(".frontmatter-header, .bibliography, .footnotes"),
  )
}

describe("preview to editor line mapping on a real paper", () => {
  const html = renderMarkdown(paper)
  const els = blocks(html)
  const lineOf = (text: string) =>
    els.find((el) => (el.textContent ?? "").includes(text))?.getAttribute("data-source-line")

  it("maps labelled headings and paragraphs full of math to their own lines", () => {
    expect(lineOf("Introduction")).toBe("9")
    expect(lineOf("controls how fast a random walk")).toBe("11")
    expect(lineOf("The normalized adjacency matrix")).toBe("16")
    expect(lineOf("Main results")).toBe("22")
    expect(lineOf("This follows from Lemma")).toBe("44")
  })

  it("annotates nearly every block, in source order", () => {
    const lines = els.map((el) => el.getAttribute("data-source-line")).filter((l) => l !== null)
    expect(lines.length / els.length).toBeGreaterThan(0.85)
    const nums = lines.map(Number)
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1])
  })
})
