/**
 * File extensions the vault treats as written documents.
 *
 * `.qmd` (Quarto) and `.Rmd` (R Markdown) are Markdown with code chunks and
 * Quarto/knitr syntax on top. ComdTeX does not run them; it only lets you write
 * and find them. They are deliberately NOT given a storage format in
 * `cmdxFormat.ts`: they open and save as raw text, so chunks, chunk options and
 * `::: {.callout-note}` divs reach the disk exactly as they were read.
 */

/** Markdown dialects edited raw (no CMDX conversion). */
export const NOTEBOOK_MD_EXTS = ["qmd", "rmd"] as const

/** Extensions of the notes a vault indexes, resolves and diagnoses (lowercase, no dot). */
export const DOC_EXTS = ["md", "tex", ...NOTEBOOK_MD_EXTS] as const

function lowerExt(ext: string | undefined | null): string {
  return (ext ?? "").replace(/^\./, "").toLowerCase()
}

/** True for `.md`, `.tex`, `.qmd` and `.Rmd` (any case). */
export function isDocExt(ext: string | undefined | null): boolean {
  return (DOC_EXTS as readonly string[]).includes(lowerExt(ext))
}

/** True for a file name or path ending in a document extension. */
export function isDocName(name: string): boolean {
  return isDocExt(/\.([^./\\]+)$/.exec(name)?.[1])
}
