import { describe, expect, it } from "vitest"
import { selectionAwareReplacement } from "./editorInsert"

describe("selectionAwareReplacement", () => {
  it("wraps selected text with snippets that use ${1}", () => {
    expect(selectionAwareReplacement("$${1}$", "\\nabla y")).toBe("$\\nabla y$")
  })

  it("wraps selected text from toolbar escaped inline math snippets", () => {
    expect(selectionAwareReplacement("\\$${1}\\$", "\\nabla y")).toBe("$\\nabla y$")
  })

  it("does not create nested inline math delimiters when selection already contains math", () => {
    expect(selectionAwareReplacement("\\$${1}\\$", "Altura ($\\nabla$y) = h")).toBe(
      "$Altura (\\nabla y) = h$",
    )
  })

  it("wraps selected text with snippets that use ${1:placeholder}", () => {
    expect(selectionAwareReplacement("**${1:texto}**", "Datos:")).toBe("**Datos:**")
  })

  it("turns selected lines into bullet list items", () => {
    const selected = "Altura = h\n  g = 9.8\nV_0y = 0"

    expect(selectionAwareReplacement("- ${1:ítem}\n- ${2:ítem}", selected)).toBe(
      "- Altura = h\n  - g = 9.8\n- V_0y = 0",
    )
  })

  it("turns selected lines into ordered list items", () => {
    const selected = "Altura = h\ng = 9.8\nV_0y = 0"

    expect(selectionAwareReplacement("1. ${1:ítem}\n2. ${2:ítem}", selected)).toBe(
      "1. Altura = h\n2. g = 9.8\n3. V_0y = 0",
    )
  })

  it("turns selected lines into task list items", () => {
    const selected = "Altura = h\ng = 9.8"

    expect(selectionAwareReplacement("- [ ] ${1:tarea}\n- [ ] ${2:tarea}", selected)).toBe(
      "- [ ] Altura = h\n- [ ] g = 9.8",
    )
  })
})
