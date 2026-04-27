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

  it("still allows http(s), relative, asset:, blob:, file: URLs", () => {
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
})
