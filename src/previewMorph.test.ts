// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { morphPreviewContent, commitPreview, dropEmptyParagraphs } from "./previewMorph"

function container(html: string): HTMLElement {
  const el = document.createElement("div")
  el.innerHTML = html
  return el
}

// `morphPreviewContent` now takes a pre-parsed DocumentFragment (the shape
// `commitPreview`/DOMPurify hands it) instead of a raw HTML string; build
// one the same way a `<template>` parse would.
function fragment(html: string): DocumentFragment {
  const tpl = document.createElement("template")
  tpl.innerHTML = html
  return tpl.content
}

describe("morphPreviewContent", () => {
  it("keeps the live DOM node of an unchanged block (preserves rendered SVGs)", () => {
    const el = container(`<p data-source-line="1">a</p><div class="diagram"><svg></svg></div>`)
    const svgBlock = el.children[1]
    // Re-render where only the first paragraph changed.
    morphPreviewContent(
      el,
      fragment(`<p data-source-line="1">EDITED</p><div class="diagram"><svg></svg></div>`),
    )
    // The diagram block is the SAME node instance: never torn down or re-parsed.
    expect(el.children[1]).toBe(svgBlock)
    expect(el.children[0].textContent).toBe("EDITED")
  })

  it("keeps the node when ONLY data-source-line shifted (line inserted above)", () => {
    const el = container(
      `<p data-source-line="3">para</p><div class="diagram" data-source-line="5"><svg></svg></div>`,
    )
    const para = el.children[0]
    const diagram = el.children[1]
    // A line inserted above bumps every following block's source line by 1.
    morphPreviewContent(
      el,
      fragment(
        `<p data-source-line="4">para</p><div class="diagram" data-source-line="6"><svg></svg></div>`,
      ),
    )
    expect(el.children[0]).toBe(para)
    expect(el.children[1]).toBe(diagram) // diagram NOT re-created
    // The bookkeeping attribute is updated in place.
    expect(el.children[0].getAttribute("data-source-line")).toBe("4")
    expect(el.children[1].getAttribute("data-source-line")).toBe("6")
  })

  it("replaces a block whose content genuinely changed", () => {
    const el = container(`<p data-source-line="1">old</p>`)
    const old = el.children[0]
    morphPreviewContent(el, fragment(`<p data-source-line="2">brand new</p>`))
    expect(el.children[0]).not.toBe(old)
    expect(el.children[0].textContent).toBe("brand new")
  })

  it("appends new trailing blocks and removes dropped ones", () => {
    const el = container(`<p>one</p><p>two</p><p>three</p>`)
    morphPreviewContent(el, fragment(`<p>one</p><p>two</p>`))
    expect(el.children.length).toBe(2)
    morphPreviewContent(el, fragment(`<p>one</p><p>two</p><p>four</p>`))
    expect(el.children.length).toBe(3)
    expect(el.children[2].textContent).toBe("four")
  })

  it("clears the container when given an empty fragment", () => {
    const el = container(`<p>one</p><p>two</p>`)
    morphPreviewContent(el, fragment(""))
    expect(el.childNodes.length).toBe(0)
  })
})

describe("morphPreviewContent keyed diff", () => {
  const block = (n: number, line: number) => `<p data-source-line="${line}">block ${n}</p>\n`
  const doc = (ids: number[], lineOf: (k: number) => number = (k) => k + 1) =>
    ids.map((id, k) => block(id, lineOf(k))).join("")
  const byText = (el: HTMLElement) =>
    new Map(Array.from(el.children).map((c) => [c.textContent ?? "", c]))

  it("keeps every unchanged node when a block is inserted at the top", () => {
    const el = container(doc([1, 2, 3, 4]))
    const before = byText(el)
    morphPreviewContent(el, fragment(doc([0, 1, 2, 3, 4])))
    const after = byText(el)
    for (const k of [1, 2, 3, 4]) expect(after.get(`block ${k}`)).toBe(before.get(`block ${k}`))
    expect(after.get("block 0")).toBeDefined()
    expect(el.children.length).toBe(5)
  })

  it("updates data-source-line on kept nodes after the shift", () => {
    const el = container(doc([1, 2, 3]))
    const before = byText(el)
    morphPreviewContent(el, fragment(doc([0, 1, 2, 3])))
    const after = byText(el)
    expect(after.get("block 3")).toBe(before.get("block 3"))
    expect(after.get("block 3")!.getAttribute("data-source-line")).toBe("4")
    expect(Array.from(el.children).map((c) => c.getAttribute("data-source-line"))).toEqual([
      "1",
      "2",
      "3",
      "4",
    ])
  })

  it("keeps nodes after a deletion in the middle", () => {
    const el = container(doc([1, 2, 3, 4, 5]))
    const before = byText(el)
    morphPreviewContent(el, fragment(doc([1, 2, 4, 5])))
    const after = byText(el)
    expect(after.has("block 3")).toBe(false)
    for (const k of [1, 2, 4, 5]) expect(after.get(`block ${k}`)).toBe(before.get(`block ${k}`))
    expect(after.get("block 5")!.getAttribute("data-source-line")).toBe("4")
  })

  it("moves blocks by reusing the same nodes", () => {
    const el = container(doc([1, 2, 3, 4]))
    const before = byText(el)
    morphPreviewContent(el, fragment(doc([3, 1, 2, 4])))
    const order = Array.from(el.children).map((c) => c.textContent)
    expect(order).toEqual(["block 3", "block 1", "block 2", "block 4"])
    for (const k of [1, 2, 3, 4]) {
      expect(byText(el).get(`block ${k}`)).toBe(before.get(`block ${k}`))
    }
  })

  it("pairs duplicate blocks by occurrence and keeps their nodes", () => {
    const dup = `<hr><p>same</p><p>same</p><p>same</p>`
    const el = container(dup)
    const [hr, a, b, c] = Array.from(el.children)
    morphPreviewContent(el, fragment(`<p>new</p>` + dup))
    expect(Array.from(el.children).map((x) => x.tagName)).toEqual(["P", "HR", "P", "P", "P"])
    expect(el.children[1]).toBe(hr)
    expect(el.children[2]).toBe(a)
    expect(el.children[3]).toBe(b)
    expect(el.children[4]).toBe(c)
    // dropping one duplicate removes exactly one of them
    morphPreviewContent(el, fragment(`<hr><p>same</p><p>same</p>`))
    expect(el.children.length).toBe(3)
    expect(el.children[0]).toBe(hr)
  })

  it("syncs nested data-source-line attributes of kept blocks", () => {
    const el = container(`<ul data-source-line="1"><li data-source-line="1">a</li></ul>`)
    const ul = el.children[0]
    morphPreviewContent(
      el,
      fragment(`<ul data-source-line="5"><li data-source-line="5">a</li></ul>`),
    )
    expect(el.children[0]).toBe(ul)
    expect(ul.querySelector("li")!.getAttribute("data-source-line")).toBe("5")
  })

  it("replaces a block whose nested content changed", () => {
    const el = container(`<div><span>a</span></div><p>x</p>`)
    const [div, p] = Array.from(el.children)
    morphPreviewContent(el, fragment(`<div><span>b</span></div><p>x</p>`))
    expect(el.children[0]).not.toBe(div)
    expect(el.children[1]).toBe(p)
  })

  it("replaces exactly one node for a top insertion in a 400-block document (benchmark)", () => {
    const ids = Array.from({ length: 400 }, (_, i) => i)
    const heavy = (n: number, line: number) =>
      `<div class="katex-display" data-source-line="${line}">` +
      `<span class="katex"><span>${"x".repeat(200)}${n}</span></span></div>\n`
    const mk = (list: number[]) => list.map((id, k) => heavy(id, k + 1)).join("")
    const el = container(mk(ids))
    const old = new Set(Array.from(el.children))
    const t0 = performance.now()
    morphPreviewContent(el, fragment(mk([-1, ...ids])))
    const ms = performance.now() - t0
    const fresh = Array.from(el.children).filter((c) => !old.has(c))
    expect(el.children.length).toBe(401)
    expect(fresh.length).toBe(1)
    expect(ms).toBeLessThan(1000) // generous: typically a few ms
  })
})

describe("commitPreview", () => {
  it("sanitizes, annotates, and morphs raw renderMarkdown-shaped HTML in one call", () => {
    const el = container("")
    commitPreview(el, `<p>Hello world</p>`, "Hello world")
    expect(el.children.length).toBe(1)
    expect(el.children[0].tagName).toBe("P")
    expect(el.children[0].textContent).toBe("Hello world")
    // annotateSourceLinesIn found the matching source line and stamped it.
    expect(el.children[0].getAttribute("data-source-line")).toBe("1")
  })

  it("strips unsafe markup via the same sanitizer as sanitizeRenderedHtml", () => {
    const el = container("")
    commitPreview(el, `<p>safe</p><script>alert(1)</script>`, "safe")
    expect(el.querySelector("script")).toBeNull()
    expect(el.textContent).toContain("safe")
  })

  it("re-commits on subsequent calls, preserving unchanged live nodes", () => {
    const el = container("")
    commitPreview(el, `<p>para</p><div class="diagram"><svg></svg></div>`, "para")
    const diagram = el.children[1]
    commitPreview(el, `<p>EDITED</p><div class="diagram"><svg></svg></div>`, "EDITED")
    expect(el.children[1]).toBe(diagram)
    expect(el.children[0].textContent).toBe("EDITED")
  })
})

describe("dropEmptyParagraphs", () => {
  it("removes the empty paragraphs left around a block that was substituted into one", () => {
    const f = fragment("<p>we have<br>\n</p><div>eq</div><p>\n</p><p></p><p>after</p>")
    dropEmptyParagraphs(f)
    expect([...f.children].map((n) => n.tagName)).toEqual(["P", "DIV", "P"])
    expect(f.children[2].textContent).toBe("after")
  })

  it("keeps a paragraph that holds only a line break or an element", () => {
    const f = fragment("<p><br></p><p><span class='katex'></span></p>")
    dropEmptyParagraphs(f)
    expect(f.children).toHaveLength(2)
  })
})
