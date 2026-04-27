// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { resolveTransclusions, processBlockIds, attachBlockIds } from "./transclusion"

describe("resolveTransclusions", () => {
  it("embeds full notes and strips frontmatter", () => {
    const result = resolveTransclusions("Antes\n![[Nota]]", (target) =>
      target === "Nota" ? "---\ntitle: Nota\n---\n# Nota\nContenido" : null
    )

    expect(result).toContain("# Nota\nContenido")
    expect(result).not.toContain("title: Nota")
    expect(result).toContain("class=\"transclusion\"")
  })

  it("emits a transclusion-header showing the source", () => {
    const result = resolveTransclusions("![[Nota]]", () => "Body")
    expect(result).toContain("transclusion-header")
    expect(result).toContain("from: Nota")
  })

  it("embeds only the requested heading section", () => {
    const source = "# A\nuno\n## B\ndos\n# C\ntres"
    const result = resolveTransclusions("![[Nota#B]]", () => source)

    expect(result).toContain("## B\ndos")
    expect(result).not.toContain("# C")
  })

  it("embeds only the paragraph for ![[file#^block-id]]", () => {
    const source = "Intro line.\n\nKey paragraph here. ^key\n\nAnother paragraph."
    const result = resolveTransclusions("![[Nota#^key]]", () => source)

    expect(result).toContain("Key paragraph here.")
    // The embedded body should not still carry the trailing marker.
    expect(result).not.toMatch(/Key paragraph here\.\s*\^key/)
    expect(result).not.toContain("Intro line")
    expect(result).not.toContain("Another paragraph")
  })

  it("renders a missing-target fallback when resolver returns null", () => {
    const result = resolveTransclusions("![[Ghost]]", () => null)
    expect(result).toContain("transclusion-missing")
    expect(result).toContain("Ghost")
    expect(result).toContain("Not found")
  })

  it("renders block-not-found notice when ^id is missing in target", () => {
    const result = resolveTransclusions("![[Nota#^missing]]", () => "Body without anchor")
    expect(result).toContain("Block not found: ^missing")
  })
})

describe("processBlockIds + attachBlockIds", () => {
  it("strips ^id from rendered content and emits a placeholder comment", () => {
    const out = processBlockIds("Important paragraph. ^foo")
    expect(out).not.toMatch(/\^foo/)
    expect(out).toContain("<!--block:foo-->")
  })

  it("does not touch lines inside fenced code blocks", () => {
    const input = ["```", "let x = 0 ^id", "```"].join("\n")
    const out = processBlockIds(input)
    expect(out).toContain("let x = 0 ^id")
  })

  it("attachBlockIds hoists the comment to its parent block id", () => {
    const html = "<p>Important. <!--block:foo--></p>"
    const out = attachBlockIds(html)
    expect(out).toMatch(/<p id="block-foo">Important\./)
    expect(out).not.toContain("block:foo")
  })

  it("attachBlockIds is a noop when no placeholders are present", () => {
    const html = "<p>Plain.</p>"
    expect(attachBlockIds(html)).toBe(html)
  })
})
