// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { morphPreviewContent, commitPreview } from "./previewMorph"

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
    morphPreviewContent(el, fragment(`<p data-source-line="1">EDITED</p><div class="diagram"><svg></svg></div>`))
    // The diagram block is the SAME node instance: never torn down or re-parsed.
    expect(el.children[1]).toBe(svgBlock)
    expect(el.children[0].textContent).toBe("EDITED")
  })

  it("keeps the node when ONLY data-source-line shifted (line inserted above)", () => {
    const el = container(`<p data-source-line="3">para</p><div class="diagram" data-source-line="5"><svg></svg></div>`)
    const para = el.children[0]
    const diagram = el.children[1]
    // A line inserted above bumps every following block's source line by 1.
    morphPreviewContent(el, fragment(`<p data-source-line="4">para</p><div class="diagram" data-source-line="6"><svg></svg></div>`))
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
