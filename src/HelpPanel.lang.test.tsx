// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import HelpPanel from "./HelpPanel"
import { LANGS, LanguageContext, type Lang } from "./i18n"

afterEach(cleanup)

function panelText(lang: Lang): string {
  const { container } = render(
    <LanguageContext.Provider value={LANGS[lang]}>
      <HelpPanel />
    </LanguageContext.Provider>,
  )
  for (const b of container.querySelectorAll("button.hp-section-title")) fireEvent.click(b)
  return container.textContent ?? ""
}

describe("HelpPanel code samples follow the interface language", () => {
  it("shows English samples in the English interface", () => {
    const text = panelText("en")
    expect(text).toContain("# Introduction {#sec:intro}")
    expect(text).toContain("{#fig:diagram}")
    expect(text).toContain("`code`")
    expect(text).toContain("title: Real Analysis")
    expect(text).not.toContain("Introducción {#sec")
    expect(text).not.toContain("Análisis Real")
    expect(text).not.toContain("@fig:diagrama")
  })

  it("keeps the Spanish samples in the Spanish interface", () => {
    const text = panelText("es")
    expect(text).toContain("# Introducción {#sec:intro}")
    expect(text).toContain("@fig:diagrama")
    expect(text).toContain("`código`")
    expect(text).toContain("title: Análisis Real")
  })
})
