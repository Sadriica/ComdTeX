import { describe, expect, it } from "vitest"
import { collectLocalImagePaths } from "./exportBundle"

describe("collectLocalImagePaths", () => {
  it("finds plain markdown images", () => {
    expect(collectLocalImagePaths("![Cap](figures/plot.png)")).toEqual(["figures/plot.png"])
  })

  it("finds labeled figures (same underlying markdown image syntax)", () => {
    expect(collectLocalImagePaths("![Cap](a.png){#fig:map}")).toEqual(["a.png"])
  })

  it("finds several images across a document", () => {
    const content = "![One](a.png)\n\nSome text.\n\n![Two](sub/b.jpg){#fig:two}"
    expect(collectLocalImagePaths(content)).toEqual(["a.png", "sub/b.jpg"])
  })

  it("ignores remote http/https URLs", () => {
    const content = "![Remote](https://example.com/x.png)\n![Also remote](http://example.com/y.png)"
    expect(collectLocalImagePaths(content)).toEqual([])
  })

  it("ignores data: URIs", () => {
    expect(collectLocalImagePaths("![Inline](data:image/png;base64,AAAA)")).toEqual([])
  })

  it("dedupes repeated references to the same asset", () => {
    const content = "![First use](a.png)\n\n![Second use](a.png)"
    expect(collectLocalImagePaths(content)).toEqual(["a.png"])
  })

  it("handles paths with spaces", () => {
    expect(collectLocalImagePaths("![Cap](my figures/plot one.png)")).toEqual(["my figures/plot one.png"])
  })

  it("returns an empty list when the document has no images", () => {
    expect(collectLocalImagePaths("# Title\n\nJust prose, no figures here.")).toEqual([])
  })

  it("returns an empty list for empty content", () => {
    expect(collectLocalImagePaths("")).toEqual([])
  })
})
