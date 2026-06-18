// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { morphPreviewContent } from "./previewMorph"

function container(html: string): HTMLElement {
  const el = document.createElement("div")
  el.innerHTML = html
  return el
}

describe("morphPreviewContent", () => {
  it("keeps the live DOM node of an unchanged block (preserves rendered SVGs)", () => {
    const el = container(`<p data-source-line="1">a</p><div class="diagram"><svg></svg></div>`)
    const svgBlock = el.children[1]
    // Re-render where only the first paragraph changed.
    morphPreviewContent(el, `<p data-source-line="1">EDITED</p><div class="diagram"><svg></svg></div>`)
    // The diagram block is the SAME node instance — never torn down or re-parsed.
    expect(el.children[1]).toBe(svgBlock)
    expect(el.children[0].textContent).toBe("EDITED")
  })

  it("keeps the node when ONLY data-source-line shifted (line inserted above)", () => {
    const el = container(`<p data-source-line="3">para</p><div class="diagram" data-source-line="5"><svg></svg></div>`)
    const para = el.children[0]
    const diagram = el.children[1]
    // A line inserted above bumps every following block's source line by 1.
    morphPreviewContent(el, `<p data-source-line="4">para</p><div class="diagram" data-source-line="6"><svg></svg></div>`)
    expect(el.children[0]).toBe(para)
    expect(el.children[1]).toBe(diagram) // diagram NOT re-created
    // The bookkeeping attribute is updated in place.
    expect(el.children[0].getAttribute("data-source-line")).toBe("4")
    expect(el.children[1].getAttribute("data-source-line")).toBe("6")
  })

  it("replaces a block whose content genuinely changed", () => {
    const el = container(`<p data-source-line="1">old</p>`)
    const old = el.children[0]
    morphPreviewContent(el, `<p data-source-line="2">brand new</p>`)
    expect(el.children[0]).not.toBe(old)
    expect(el.children[0].textContent).toBe("brand new")
  })

  it("appends new trailing blocks and removes dropped ones", () => {
    const el = container(`<p>one</p><p>two</p><p>three</p>`)
    morphPreviewContent(el, `<p>one</p><p>two</p>`)
    expect(el.children.length).toBe(2)
    morphPreviewContent(el, `<p>one</p><p>two</p><p>four</p>`)
    expect(el.children.length).toBe(3)
    expect(el.children[2].textContent).toBe("four")
  })

  it("clears the container when given empty html", () => {
    const el = container(`<p>one</p><p>two</p>`)
    morphPreviewContent(el, "")
    expect(el.childNodes.length).toBe(0)
  })
})
