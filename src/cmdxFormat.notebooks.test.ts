import { describe, expect, it } from "vitest"
import { toDiskContent, toEditorContent, storageFormatForPath } from "./cmdxFormat"
import { isDocExt, isDocName } from "./docExts"
import { findVaultFile } from "./vaultResolve"

// Real Quarto and R Markdown sources. They must come back from open + save
// byte for byte: ComdTeX never executes or rewrites them.
const QMD = `---
title: "Growth curves"
author: "A. Researcher"
format:
  html:
    code-fold: true
    toc: true
bibliography: references.bib
execute:
  echo: false
---

# Methods {#sec-methods}

We fit a logistic model (@fig-growth, see also @tbl-fit and [@smith2020]).

\`\`\`{r}
#| label: fig-growth
#| fig-cap: "Growth over time"
#| warning: false
library(ggplot2)
ggplot(df, aes(t, n)) + geom_line()
\`\`\`

\`\`\`{python}
#| label: tbl-fit
import pandas as pd
df = pd.read_csv("data.csv")
\`\`\`

The mean is \`r mean(df$n)\` and the fit has \`r nrow(df)\` rows.

::: {.callout-note}
## Heads up
Chunks are not executed by ComdTeX.
:::

::: {.callout-warning collapse="true"}
Nested:

::: {#fig-panel layout-ncol=2}
![A](a.png){#fig-a}

![B](b.png){#fig-b}
:::
:::

:::{.column-margin}
A margin note.
:::

| a | b |
|---|---|
| 1 | 2 |

$$ y = \\beta_0 + \\beta_1 x $$ {#eq-line}

> [!note] Obsidian style callout
> kept as is
`

const RMD = `---
title: "Report"
output:
  html_document:
    df_print: paged
params:
  n: 10
---

\`\`\`{r setup, include=FALSE}
knitr::opts_chunk$set(echo = TRUE, fig.width = 6)
\`\`\`

## Summary

Mean: \`r round(mean(x), 2)\`

\`\`\`{r cars, fig.cap="Cars"}
plot(cars)
\`\`\`

\`\`\`{bash}
ls -l
\`\`\`

:::theorem
Not an env here, just text in an Rmd.
:::
`

const TRICKY = [
  "# T\n\n:::note\nnot closed\n",
  "> [!tip] Hi\n> body\n",
  "| a | b |\n|---|---|\n| 1 | 2 |\n\n\n\n",
  "text with trailing spaces   \n\n\n",
  "no trailing newline",
  "",
  '$$\nx\n$$\n\n:::{.callout-tip title="x"}\ny\n:::\n',
]

const NAMES = ["a.qmd", "a.Rmd", "a.rmd", "A.QMD", "dir/Report.RMD"]

describe("Quarto and R Markdown files are raw text", () => {
  it("have no CMDX storage format", () => {
    for (const n of NAMES) expect(storageFormatForPath(`/v/${n}`)).toBeNull()
    expect(storageFormatForPath("/v/a.md")).toBe("md")
  })

  for (const name of NAMES) {
    const path = `/v/${name}`
    const sources: Array<[string, string]> = [
      ["quarto document", QMD],
      ["R Markdown document", RMD],
      ...TRICKY.map((s, i): [string, string] => [`edge case ${i}`, s]),
    ]
    for (const [label, disk] of sources) {
      it(`${name}: ${label} is identical after open and save`, () => {
        const editor = toEditorContent(path, disk)
        expect(editor).toBe(disk)
        expect(toDiskContent(path, editor)).toBe(disk)
      })
      it(`${name}: ${label} keeps CRLF after open and save`, () => {
        const crlf = disk.replace(/\n/g, "\r\n")
        const editor = toEditorContent(path, crlf)
        expect(toDiskContent(path, editor)).toBe(crlf)
      })
    }
  }

  it("does not turn Quarto divs or callouts into other syntax", () => {
    const editor = toEditorContent("/v/q.qmd", QMD)
    expect(editor).toContain("::: {.callout-note}")
    expect(editor).toContain("#| label: fig-growth")
    expect(editor).toContain("`r mean(df$n)`")
    expect(editor).toContain("```{python}")
    expect(editor).not.toContain("\u0000")
  })

  it("an edit changes only what was edited", () => {
    const editor = toEditorContent("/v/q.qmd", QMD)
    const edited = editor.replace("Methods", "Methods and data")
    expect(toDiskContent("/v/q.qmd", edited)).toBe(QMD.replace("Methods", "Methods and data"))
  })
})

describe("document extensions", () => {
  it("accepts md, tex, qmd and Rmd in any case", () => {
    for (const e of ["md", "tex", "qmd", "Rmd", "RMD", ".qmd"]) expect(isDocExt(e)).toBe(true)
    for (const e of ["bib", "csv", "pdf", "", undefined, null]) expect(isDocExt(e)).toBe(false)
    expect(isDocName("/v/a/Report.Rmd")).toBe(true)
    expect(isDocName("C:\\v\\a.qmd")).toBe(true)
    expect(isDocName("/v/refs.bib")).toBe(false)
    expect(isDocName("/v/noext")).toBe(false)
  })

  it("resolves a bare name to a .qmd or .Rmd file", () => {
    const files = [
      { path: "/v/notes.md", name: "notes.md" },
      { path: "/v/analysis.qmd", name: "analysis.qmd" },
      { path: "/v/Report.Rmd", name: "Report.Rmd" },
    ]
    expect(findVaultFile(files, "analysis")?.name).toBe("analysis.qmd")
    expect(findVaultFile(files, "report")?.name).toBe("Report.Rmd")
    expect(findVaultFile(files, "analysis.qmd")?.name).toBe("analysis.qmd")
  })
})
