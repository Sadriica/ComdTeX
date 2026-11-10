// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { TEMPLATES } from "./templates"
import { lintContent } from "./contentLinter"
import { en } from "./i18n/en"

const Severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const

describe("journal templates", () => {
  // A new paper should start clean: the biology ones turn on the biology
  // checks, which used to flag PLOS, LB, DOI and URL as gene symbols and to
  // ask for a Data availability section the template itself lacked.
  it.each(TEMPLATES.filter((t) => t.category === "journal").map((t) => [t.id, t] as const))(
    "%s lints without warnings or notes",
    (_id, tpl) => {
      const markers = lintContent(
        tpl.content,
        { vaultFileNames: new Set(), bibKeys: new Set(), messages: en.lint.messages },
        Severity as never,
      )
      expect(markers.map((m) => `${m.code} line ${m.startLineNumber}: ${m.message}`)).toEqual([])
    },
  )
})
