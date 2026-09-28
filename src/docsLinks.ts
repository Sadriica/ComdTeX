// Links from the app into the marketing site's documentation.
//
// The site (comdtex.witara.site) does NOT put the language in the URL path:
// language is a client-side toggle on each doc page (see web/src/pages/docs/[...slug].astro,
// which renders both the es/ and en/ content side by side and switches with CSS/JS).
// A doc page lives at `${SITE}/docs/<slug>` where <slug> is the filename (no extension)
// shared by both `web/src/content/docs/en/<slug>.md` and `web/src/content/docs/es/<slug>.md`.
export const DOCS_SITE = "https://comdtex.witara.site"

// Mirrors the slugs published under web/src/content/docs/{en,es}/*.md at the time of
// writing. Kept here (rather than read from the sibling repo) because the app repo
// cannot depend on the site repo at build or test time; update this list whenever a
// docs page is added, renamed or removed on the site.
export const DOCS_PAGES = [
  "ai",
  "citations",
  "collaboration",
  "compile-pdf",
  "daily-notes",
  "data",
  "diagrams",
  "environments",
  "first-vault",
  "folder-rules",
  "install",
  "integrations",
  "interop",
  "journal-templates",
  "long-documents",
  "panels",
  "plots",
  "references",
  "science",
  "settings",
  "shortcuts",
  "shorthands",
  "study-tools",
  "troubleshooting",
  "typst",
] as const

export type DocsPage = (typeof DOCS_PAGES)[number]

/**
 * Builds a URL to the ComdTeX documentation site.
 *
 * With no page, links to the docs index (`/docs/`). With a page, links to that
 * page (`/docs/<page>`). Never appends a language segment: the site itself
 * handles es/en switching client-side.
 */
export function docsUrl(page?: DocsPage): string {
  if (!page) return `${DOCS_SITE}/docs/`
  return `${DOCS_SITE}/docs/${page}`
}
