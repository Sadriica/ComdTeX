import { describe, expect, it } from "vitest"
import { numberHeadings, resolveSectionRefs } from "./references"

describe("references", () => {
  it("numbers explicit heading labels and resolves @sec references", () => {
    const numbered = numberHeadings("# Intro {#sec:intro}\n\nVer @sec:sec:intro")

    expect(numbered.content).toContain("# 1 Intro")
    expect(numbered.content).not.toContain("{#sec:intro}")
    expect(resolveSectionRefs(numbered.content, numbered.sections)).toContain("sección 1")
  })
})
