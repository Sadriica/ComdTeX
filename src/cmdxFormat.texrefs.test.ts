import { afterEach, describe, expect, it } from "vitest"
import { forgetLineEnding, texRefLanguage, toDiskContent, toEditorContent } from "./cmdxFormat"
import { setUiLanguage } from "./docLang"

const PATH = "/vault/paper.tex"
const cycle = (disk: string, times = 3) => {
  let text = disk
  for (let i = 0; i < times; i++) text = toDiskContent(PATH, toEditorContent(PATH, text))
  return text
}

afterEach(() => {
  forgetLineEnding(PATH)
  setUiLanguage("en")
})

describe(".tex reference storage", () => {
  // Before: each open and save added another "Figura~" in front of every
  // figure, table and section reference, and \ref{thm:x} was saved as @thm:x.
  it.each([
    "See Figura~\\ref{fig:a}, Tabla~\\ref{tbl:b}, sección~\\ref{sec:c} and \\eqref{eq:d}.",
    "See Figure~\\ref{fig:a}, Table~\\ref{tbl:b} and Section~\\ref{sec:c}.",
    "See Fig.~\\ref{fig:a}, \\ref{tbl:b} and Sección~\\ref{sec:c}.",
    "By Teorema~\\ref{thm:x}, \\ref{lem:y} and the result in @gp/cal@def:v.",
  ])("round-trips %s byte for byte", (disk) => {
    expect(cycle(disk)).toBe(disk)
  })

  it("opens the names ComdTeX writes as references", () => {
    expect(toEditorContent(PATH, "Figura~\\ref{fig:a} and Figure~\\ref{fig:b}")).toBe(
      "@fig:a and @fig:b",
    )
  })

  it("keeps a Spanish file Spanish under an English interface", () => {
    setUiLanguage("en")
    const editor = toEditorContent(PATH, "Ver Figura~\\ref{fig:a}.")
    expect(toDiskContent(PATH, `${editor} Y @tbl:t.`)).toBe(
      "Ver Figura~\\ref{fig:a}. Y Tabla~\\ref{tbl:t}.",
    )
  })

  it("writes a new file in the interface language, with full stops outside the label", () => {
    setUiLanguage("en")
    expect(toDiskContent("/vault/new.tex", "See @fig:a. And @thm:x.")).toBe(
      "See Figure~\\ref{fig:a}. And \\ref{thm:x}.",
    )
    setUiLanguage("es")
    expect(toDiskContent("/vault/new.tex", "Ver @sec:intro.")).toBe("Ver sección~\\ref{sec:intro}.")
  })

  it("detects the language of the names in a file", () => {
    expect(texRefLanguage("Figura~\\ref{fig:a} y Tabla~\\ref{tbl:b}")).toBe("es")
    expect(texRefLanguage("Figure~\\ref{fig:a}")).toBe("en")
    expect(texRefLanguage("\\ref{fig:a}")).toBeNull()
  })
})
