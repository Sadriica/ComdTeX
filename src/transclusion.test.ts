import { describe, expect, it } from "vitest"
import { resolveTransclusions } from "./transclusion"

describe("resolveTransclusions", () => {
  it("embeds full notes and strips frontmatter", () => {
    const result = resolveTransclusions("Antes\n![[Nota]]", (target) =>
      target === "Nota" ? "---\ntitle: Nota\n---\n# Nota\nContenido" : null
    )

    expect(result).toContain("# Nota\nContenido")
    expect(result).not.toContain("title: Nota")
    expect(result).toContain("class=\"transclusion\"")
  })

  it("embeds only the requested heading section", () => {
    const source = "# A\nuno\n## B\ndos\n# C\ntres"
    const result = resolveTransclusions("![[Nota#B]]", () => source)

    expect(result).toContain("## B\ndos")
    expect(result).not.toContain("# C")
  })
})
