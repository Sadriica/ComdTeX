// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest"
import { imageCandidates, joinNormalized, resolveImagePath } from "./imagePaths"
import { renderMarkdown } from "./renderer"
import { collectLocalImagePaths } from "./exportBundle"

describe("joinNormalized", () => {
  it("collapses dot segments", () => {
    expect(joinNormalized("/v/papers", "../figures/x.svg")).toBe("/v/figures/x.svg")
    expect(joinNormalized("/v/papers", "./a.png")).toBe("/v/papers/a.png")
  })
  it("accepts Windows separators", () => {
    expect(joinNormalized("C:\\v\\papers", "..\\figures\\x.svg")).toBe("C:/v/figures/x.svg")
  })
})

describe("imageCandidates", () => {
  it("tries the document folder, then the vault root", () => {
    expect(imageCandidates("../figures/x.svg", "/v/papers/doc.md", "/v")[0]).toBe(
      "/v/figures/x.svg",
    )
    expect(imageCandidates("figures/x.svg", "/v/papers/doc.md", "/v")).toEqual([
      "/v/papers/figures/x.svg",
      "/v/figures/x.svg",
    ])
  })
  it("leaves absolute paths alone", () => {
    expect(imageCandidates("/abs/x.png", "/v/doc.md", "/v")).toEqual(["/abs/x.png"])
  })
})

describe("resolveImagePath", () => {
  const files = new Set(["/v/figures/x.svg", "/v/papers/local.png"])
  const exists = (p: string) => files.has(p)

  it("resolves ../ against the document folder", () => {
    expect(resolveImagePath("../figures/x.svg", "/v/papers/doc.md", "/v", exists)).toBe(
      "/v/figures/x.svg",
    )
  })
  it("prefers the document folder when the file is there", () => {
    expect(resolveImagePath("local.png", "/v/papers/doc.md", "/v", exists)).toBe(
      "/v/papers/local.png",
    )
  })
  it("falls back to the vault root", () => {
    expect(resolveImagePath("figures/x.svg", "/v/papers/doc.md", "/v", exists)).toBe(
      "/v/figures/x.svg",
    )
  })
  it("keeps the vault-root rule when nothing can be checked", () => {
    expect(resolveImagePath("figures/x.svg", "/v/papers/doc.md", "/v")).toBe("/v/figures/x.svg")
    expect(resolveImagePath("../figures/x.svg", "/v/papers/doc.md", "/v")).toBe("/v/figures/x.svg")
  })
})

describe("preview image paths", () => {
  // Outside Tauri there is no asset protocol; give the webview shim a plain
  // encoder so the resulting src names the file the renderer picked.
  beforeAll(() => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      convertFileSrc: (p: string) => `asset://${encodeURIComponent(p)}`,
    }
  })
  const render = (src: string, docPath: string, exists: (p: string) => boolean) =>
    renderMarkdown(`![cap](${src})`, {}, "/v", undefined, undefined, undefined, undefined, {
      annotate: false,
      docPath,
      fileExists: exists,
    })

  it("loads ../figures/x.svg relative to the document", () => {
    const html = render("../figures/x.svg", "/v/papers/doc.md", (p) => p === "/v/figures/x.svg")
    expect(html).toContain(encodeURIComponent("/v/figures/x.svg"))
  })

  it("still loads a vault-root path from a nested note", () => {
    const html = render("figures/x.svg", "/v/papers/doc.md", (p) => p === "/v/figures/x.svg")
    expect(html).toContain(encodeURIComponent("/v/figures/x.svg"))
  })
})

describe("export bundling uses the same candidates", () => {
  it("collects the path as written; the bundler resolves it with imageCandidates", () => {
    expect(collectLocalImagePaths("![](../figures/x.svg)")).toEqual(["../figures/x.svg"])
  })
})
