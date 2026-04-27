import type { StorageFormat } from "../../cmdxFormat"

export interface CmdxRoundTripFixture {
  name: string
  path: string
  format: StorageFormat | null
  storage: string
  cmdx: string
  expectedStorage: string
}

export const CMDX_ROUND_TRIP_FIXTURES: CmdxRoundTripFixture[] = [
  {
    name: "markdown callouts and tables",
    path: "note.md",
    format: "md",
    storage: [
      "---",
      "title: Sample",
      "---",
      "> [!abstract] Theorem: Main",
      "> Body",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n"),
    cmdx: [
      "---",
      "title: Sample",
      "---",
      ":::theorem[Main]",
      "Body",
      ":::",
      "",
      "table(A, B)",
    ].join("\n"),
    expectedStorage: [
      "---",
      "title: Sample",
      "---",
      "> [!abstract] Theorem: Main",
      "> Body",
      "",
      "| A | B |",
      "| --- | --- |",
    ].join("\n"),
  },
  {
    name: "latex theorem and shorthands",
    path: "note.tex",
    format: "tex",
    storage: [
      "\\begin{theorem}[Main]",
      "\\label{thm:main}",
      "\\frac{a}{b}",
      "\\end{theorem}",
      "",
      "\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}",
    ].join("\n"),
    cmdx: [
      ":::theorem[Main] {#thm:main}",
      "frac(a, b)",
      ":::",
      "",
      "mat(1, 2, 3, 4)",
    ].join("\n"),
    expectedStorage: [
      "\\begin{theorem}[Main]",
      "\\label{thm:main}",
      "\\frac{a}{b}",
      "\\end{theorem}",
      "",
      "\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}",
    ].join("\n"),
  },
  {
    name: "bib is raw",
    path: "references.bib",
    format: null,
    storage: "@book{cmdx, title={table(A, B)}}",
    cmdx: "@book{cmdx, title={table(A, B)}}",
    expectedStorage: "@book{cmdx, title={table(A, B)}}",
  },
]

