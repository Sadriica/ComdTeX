import { describe, it, expect } from "vitest"
import { docsUrl, DOCS_PAGES, DOCS_SITE, type DocsPage } from "./docsLinks"

describe("docsUrl", () => {
  it("links to the docs index with no page", () => {
    expect(docsUrl()).toBe("https://comdtex.witara.site/docs/")
  })

  it("links to a specific page with no language segment", () => {
    expect(docsUrl("settings")).toBe("https://comdtex.witara.site/docs/settings")
    expect(docsUrl("ai")).toBe("https://comdtex.witara.site/docs/ai")
    expect(docsUrl("troubleshooting")).toBe("https://comdtex.witara.site/docs/troubleshooting")
  })

  it("never emits a language path segment", () => {
    for (const page of DOCS_PAGES) {
      const url = docsUrl(page)
      expect(url).not.toMatch(/\/(en|es)\//)
      expect(url.startsWith(`${DOCS_SITE}/docs/`)).toBe(true)
    }
  })
})

// Every page SettingsModal's docsPageFor and DepsWarning's troubleshooting link can
// reach must actually exist as a doc on the site. The app repo cannot read the sibling
// web repo at test time, so this list is a hardcoded mirror of
// web/src/content/docs/en/*.md (and es/*.md, which the site's [...slug].astro route
// requires to have the same set of filenames). Update both lists together.
const SETTINGS_DOC_PAGES: DocsPage[] = ["settings", "daily-notes", "compile-pdf", "collaboration", "ai"]

describe("pages referenced from the app exist on the site (mirrored list)", () => {
  it("every settings doc page is a known docs page", () => {
    for (const page of SETTINGS_DOC_PAGES) {
      expect(DOCS_PAGES).toContain(page)
    }
  })

  it("the deps-warning troubleshooting page is a known docs page", () => {
    expect(DOCS_PAGES).toContain("troubleshooting")
  })
})
