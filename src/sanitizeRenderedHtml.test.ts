// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"

describe("sanitizeRenderedHtml — data: image policy", () => {
  it("allows data:image/png base64 src", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9V4M0sAAAAAASUVORK5CYII="
    const html = sanitizeRenderedHtml(`<img src="${png}" alt="dot">`)
    expect(html).toContain(`src="${png}"`)
  })

  it("allows data:image/jpeg base64 src", () => {
    const jpg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/"
    const html = sanitizeRenderedHtml(`<img src="${jpg}">`)
    expect(html).toContain(`src="${jpg}"`)
  })

  it("removes data:image/svg+xml src (potential XSS vector)", () => {
    const svg =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'
    const html = sanitizeRenderedHtml(`<img src='${svg}'>`)
    expect(html).not.toContain("data:image/svg")
    expect(html).not.toContain("onload")
    expect(html).not.toContain("alert")
  })

  it("removes data:image/svg+xml even when base64-encoded", () => {
    const svg =
      "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+"
    const html = sanitizeRenderedHtml(`<img src="${svg}">`)
    expect(html).not.toContain("data:image/svg")
  })

  it("rejects non-base64 raster data: payloads (no inline markup smuggling)", () => {
    const inline = "data:image/png,<script>alert(1)</script>"
    const html = sanitizeRenderedHtml(`<img src="${inline}">`)
    expect(html).not.toContain("data:image/png,")
    expect(html).not.toContain("<script>")
  })

  it("still allows http(s), relative, blob: URLs", () => {
    expect(sanitizeRenderedHtml('<a href="https://example.com">x</a>')).toContain(
      'href="https://example.com"',
    )
    expect(sanitizeRenderedHtml('<a href="/foo">x</a>')).toContain('href="/foo"')
    expect(sanitizeRenderedHtml('<a href="./bar">x</a>')).toContain('href="./bar"')
    expect(sanitizeRenderedHtml('<img src="blob:abc">')).toContain('src="blob:abc"')
  })

  it("strips javascript: URLs", () => {
    const html = sanitizeRenderedHtml('<a href="javascript:alert(1)">x</a>')
    expect(html).not.toContain("javascript:")
  })

  it("strips inline event handlers", () => {
    const html = sanitizeRenderedHtml('<div onclick="alert(1)">x</div>')
    expect(html).not.toContain("onclick")
    expect(html).not.toContain("alert")
  })

  // Behavior change vs. the old hand-rolled sanitizer: `file:` links are now
  // stripped (they let a rendered doc navigate to/reference arbitrary local
  // files, distinct from just displaying a local image), and `asset:` is
  // removed from <a href> specifically while remaining allowed for <img src>.
  it("strips file: links but keeps asset: images", () => {
    const linkHtml = sanitizeRenderedHtml('<a href="file:///etc/passwd">x</a>')
    expect(linkHtml).not.toContain("file:")

    const assetLinkHtml = sanitizeRenderedHtml('<a href="asset://localhost/secret.md">x</a>')
    expect(assetLinkHtml).not.toContain("asset:")

    const imgHtml = sanitizeRenderedHtml('<img src="asset://localhost/vault/pic.png">')
    expect(imgHtml).toContain('src="asset://localhost/vault/pic.png"')
  })
})

describe("sanitizeRenderedHtml — dangerous markup", () => {
  it("strips <script> nested inside inline <svg>", () => {
    const html = sanitizeRenderedHtml(
      '<svg><script>alert(1)</script><circle cx="5" cy="5" r="4"></circle></svg>',
    )
    expect(html).not.toContain("<script")
    expect(html).not.toContain("alert")
    expect(html).toContain("<circle")
  })

  it("neutralizes mXSS-style namespace confusion (math > mtext > style)", () => {
    const html = sanitizeRenderedHtml(
      '<math><mtext><style><img src=x onerror=alert(1)></style></mtext></math>',
    )
    expect(html).not.toContain("onerror")
    expect(html).not.toContain("alert(1)")
  })

  it("strips onerror handlers on <img>", () => {
    const html = sanitizeRenderedHtml('<img src="https://example.com/a.png" onerror="alert(1)">')
    expect(html).not.toContain("onerror")
    expect(html).not.toContain("alert")
    expect(html).toContain('src="https://example.com/a.png"')
  })
})

describe("sanitizeRenderedHtml — iframes", () => {
  it("keeps a youtube-nocookie embed iframe", () => {
    const html = sanitizeRenderedHtml(
      '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>',
    )
    expect(html).toContain("<iframe")
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ")
  })

  it("drops a non-youtube iframe", () => {
    const html = sanitizeRenderedHtml('<iframe src="https://evil.example.com/"></iframe>')
    expect(html).not.toContain("<iframe")
  })
})

describe("sanitizeRenderedHtml — app-specific markup", () => {
  it("keeps task-list checkboxes with their state and line attribute", () => {
    const html = sanitizeRenderedHtml(
      '<input type="checkbox" class="preview-checkbox" data-line="3" checked>',
    )
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('data-line="3"')
    expect(html).toContain("checked")
  })

  it("keeps data-source-line used for click-to-reveal in the editor", () => {
    const html = sanitizeRenderedHtml('<div data-source-line="12">Some text</div>')
    expect(html).toContain('data-source-line="12"')
  })

  it("keeps a representative KaTeX render intact", () => {
    const katex =
      '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML">' +
      '<semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x</annotation></semantics>' +
      '</math></span><span class="katex-html" aria-hidden="true">' +
      '<span class="base"><span class="strut" style="height:0.4306em;"></span>' +
      '<span class="mord mathnormal">x</span></span></span></span>'
    const html = sanitizeRenderedHtml(katex)
    expect(html).toContain("<semantics>")
    expect(html).toContain('<annotation encoding="application/x-tex">x</annotation>')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('class="katex-mathml"')
    expect(html).toContain('style="height:0.4306em;"')
  })
})

describe("sanitizeRenderedHtml â Mermaid SVG labels", () => {
  // Regression guard for the empty-Mermaid-node bug: DOMPurify ships
  // `foreignobject` in DEFAULT_FORBID_CONTENTS, so it keeps the element but
  // drops its children. Mermaid's default `htmlLabels: true` puts every node
  // label in a <foreignObject>, which meant every shape rendered blank.
  //
  // The fix is `htmlLabels: false` (see src/mermaidConfig.ts) â these tests pin
  // the two facts that fix depends on.
  it("keeps native SVG <text>/<tspan> node labels (what Mermaid now emits)", () => {
    const svg =
      '<svg><g class="node"><rect width="118" height="38"></rect>' +
      '<text x="10" y="20" class="nodeLabel"><tspan x="10" dy="0">Idea (oportunidad o problema)</tspan></text>' +
      "</g></svg>"
    const html = sanitizeRenderedHtml(svg)
    expect(html).toContain("<text")
    expect(html).toContain("<tspan")
    expect(html).toContain("Idea (oportunidad o problema)")
    expect(html).toContain('class="nodeLabel"')
  })

  it("keeps accented and symbolic label text used by pseudocode flowcharts", () => {
    const svg =
      '<svg><text class="nodeLabel"><tspan>Más estudio, plata y personas</tspan></text>' +
      '<text class="edgeLabel"><tspan>↺ No</tspan></text>' +
      '<text class="nodeLabel"><tspan>WHILE lo ≤ hi</tspan></text>' +
      '<text class="nodeLabel"><tspan>mid ← (lo + hi) / 2</tspan></text></svg>'
    const html = sanitizeRenderedHtml(svg)
    expect(html).toContain("Más estudio, plata y personas")
    expect(html).toContain("↺ No")
    expect(html).toContain("WHILE lo ≤ hi")
    expect(html).toContain("mid ← (lo + hi) / 2")
  })

  it("documents that <foreignObject> children do NOT survive (why htmlLabels must stay false)", () => {
    const svg =
      '<svg><foreignObject width="118" height="38">' +
      '<div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">Idea (oportunidad o problema)</span></div>' +
      "</foreignObject></svg>"
    const html = sanitizeRenderedHtml(svg)
    // DOMPurify keeps the element but strips its contents. If this ever starts
    // passing the label through, `htmlLabels: false` is no longer load-bearing
    // â but do NOT weaken the sanitizer to try to make it pass.
    expect(html).not.toContain("Idea (oportunidad o problema)")
    expect(html).not.toContain("nodeLabel")
  })

  it("still strips scripts and event handlers from an SVG", () => {
    const svg =
      '<svg><text class="nodeLabel"><tspan>ok</tspan></text>' +
      '<script>alert(1)</script><rect onload="alert(2)" width="10"></rect></svg>'
    const html = sanitizeRenderedHtml(svg)
    expect(html).toContain("ok")
    expect(html).not.toContain("<script")
    expect(html).not.toContain("onload")
    expect(html).not.toContain("alert")
  })
})
