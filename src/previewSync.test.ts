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

  it("points each environment at its opening line, also when the editor spells it with spaces", () => {
    // A callout reopened from disk becomes `:::theorem[T] {#thm:x}`.
    const spaced = paper.replace(/\]\{#/g, "] {#")
    const lines = spaced.split("\n")
    const root = document.createElement("div")
    root.innerHTML = renderMarkdown(spaced)
    const envs = [...root.querySelectorAll<HTMLElement>(".env-wrap")]
    expect(envs.length).toBeGreaterThan(3)
    for (const env of envs) {
      const line = Number(env.getAttribute("data-source-line"))
      expect(line).toBeGreaterThan(0)
      expect(lines[line - 1]).toMatch(/^\s*:::/)
    }
    const theorem = envs.find((e) => (e.textContent ?? "").includes("Mixing time"))
    expect(lines[Number(theorem?.getAttribute("data-source-line")) - 1]).toContain(":::theorem")
  })
})

describe("preview to editor line mapping across every fixture note", () => {
  const notes = import.meta.glob("../e2e/fixtures/vault/**/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>
  // Display math, tables, callouts and figures never read like their source,
  // so they are matched by kind; each must still land on its own kind of line.
  const KIND_LINE: [string, RegExp][] = [
    ["div.eq-block", /\$\$/],
    ["figure.tbl-block", /^\s*\|/],
    ["div.callout", /^\s*>\s*\[!/],
    ["figure.fig-block", /!\[/],
  ]

  // The editor always sees LF (cmdxFormat restores CRLF on save), and so does the renderer.
  for (const [path, file] of Object.entries(notes)) {
    const raw = file.replace(/\r\n/g, "\n")
    it(`annotates every block of ${path.split("/vault/")[1]} on a line of its kind`, () => {
      const lines = raw.split("\n")
      const root = document.createElement("div")
      root.innerHTML = renderMarkdown(raw)
      const els = [
        ...root.querySelectorAll<HTMLElement>(
          "h1, h2, h3, h4, p, li, blockquote, figure, .env-wrap, .callout, .eq-block",
        ),
      ].filter(
        (el) =>
          !el.closest(".frontmatter-header, .bibliography, .footnotes") &&
          (el.textContent ?? "").trim() !== "",
      )
      for (const el of els) {
        const line = el.getAttribute("data-source-line")
        expect(
          line,
          `${el.tagName}.${el.className}: ${el.textContent?.slice(0, 40)}`,
        ).not.toBeNull()
        for (const [selector, re] of KIND_LINE) {
          if (el.matches(selector)) expect(lines[Number(line) - 1]).toMatch(re)
        }
      }
    })
  }
})

describe("display math in the middle of a paragraph", () => {
  it("keeps the blocks after it on their own lines", () => {
    const raw = [
      "Before $$y$$ after.",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "Closing words here.",
    ].join("\n")
    const root = document.createElement("div")
    root.innerHTML = renderMarkdown(raw)
    expect(root.querySelector(".eq-block")?.getAttribute("data-source-line")).toBe("1")
    expect(root.querySelector("figure.tbl-block")?.getAttribute("data-source-line")).toBe("3")
    const last = [...root.querySelectorAll("p")].find((p) => p.textContent?.includes("Closing"))
    expect(last?.getAttribute("data-source-line")).toBe("7")
  })
})
