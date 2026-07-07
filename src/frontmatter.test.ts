import { describe, it, expect } from "vitest"
import {
  extractFrontmatter,
  serializeFrontmatter,
  renderFrontmatterHeader,
  extractTags,
  extractDetailedTags,
  classifyTag,
  type FrontmatterData,
} from "./frontmatter"

describe("extractFrontmatter", () => {
  it("returns null when the document has no frontmatter", () => {
    expect(extractFrontmatter("# Hello\n\nBody text")).toBeNull()
  })

  it("returns null when the closing --- is missing", () => {
    expect(extractFrontmatter("---\ntitle: Foo\n\nBody")).toBeNull()
  })

  it("parses simple key: value pairs", () => {
    const doc = "---\ntitle: My Document\nauthor: John Doe\n---\nBody content"
    const result = extractFrontmatter(doc)
    expect(result).not.toBeNull()
    expect(result!.data.title).toBe("My Document")
    expect(result!.data.author).toBe("John Doe")
    expect(result!.content).toBe("Body content")
  })

  it("handles \\r\\n line endings for the opening delimiter", () => {
    const doc = "---\r\ntitle: Foo\r\n---\r\nBody"
    const result = extractFrontmatter(doc)
    expect(result).not.toBeNull()
    expect(result!.data.title).toBe("Foo")
  })

  it("unquotes double- and single-quoted string values", () => {
    const doc = '---\ntitle: "Quoted Title"\nauthor: \'Single Quoted\'\n---\nBody'
    const result = extractFrontmatter(doc)!
    expect(result.data.title).toBe("Quoted Title")
    expect(result.data.author).toBe("Single Quoted")
  })

  it("unescapes escaped double quotes inside a quoted string", () => {
    const doc = '---\ntitle: "She said \\"Hi\\""\n---\nBody'
    const result = extractFrontmatter(doc)!
    expect(result.data.title).toBe('She said "Hi"')
  })

  it("parses inline arrays", () => {
    const doc = "---\ntags: [calculus, linear-algebra, \"multi word\"]\n---\nBody"
    const result = extractFrontmatter(doc)!
    expect(result.data.tags).toEqual(["calculus", "linear-algebra", "multi word"])
  })

  it("parses bullet-list arrays", () => {
    const doc = "---\ntags:\n  - calculus\n  - algebra\n---\nBody"
    const result = extractFrontmatter(doc)!
    expect(result.data.tags).toEqual(["calculus", "algebra"])
  })

  it("parses booleans and numbers", () => {
    const doc = "---\ndraft: true\npublished: false\ncount: 42\nratio: 3.14\n---\nBody"
    const result = extractFrontmatter(doc)!
    expect(result.data.draft).toBe(true)
    expect(result.data.published).toBe(false)
    expect(result.data.count).toBe(42)
    expect(result.data.ratio).toBe(3.14)
  })

  it("parses a literal block scalar (|) preserving newlines", () => {
    const doc = "---\nabstract: |\n  Line one\n  Line two\ntitle: After\n---\nBody"
    const result = extractFrontmatter(doc)!
    expect(result.data.abstract).toBe("Line one\nLine two")
    expect(result.data.title).toBe("After")
  })

  it("parses a folded block scalar (>) joining lines with spaces", () => {
    const doc = "---\nabstract: >\n  Line one\n  Line two\n---\nBody"
    const result = extractFrontmatter(doc)!
    expect(result.data.abstract).toBe("Line one Line two")
  })

  it("skips blank lines and comments", () => {
    const doc = "---\n# a comment\ntitle: Foo\n\nauthor: Bar\n---\nBody"
    const result = extractFrontmatter(doc)!
    expect(result.data.title).toBe("Foo")
    expect(result.data.author).toBe("Bar")
  })

  it("strips only a single leading newline after the closing delimiter", () => {
    const doc = "---\ntitle: Foo\n---\n\nBody\n\nMore"
    const result = extractFrontmatter(doc)!
    // Only one `\n` right after `---` is consumed as the delimiter's own
    // line break; any further blank line is preserved as document content.
    expect(result.content).toBe("\nBody\n\nMore")
  })
})

describe("serializeFrontmatter / round-trip", () => {
  it("round-trips a simple record through serialize -> extract", () => {
    const data: FrontmatterData = { title: "My Doc", author: "Jane" }
    const yaml = serializeFrontmatter(data)
    const doc = `${yaml}\nBody text`
    const parsed = extractFrontmatter(doc)!
    expect(parsed.data.title).toBe("My Doc")
    expect(parsed.data.author).toBe("Jane")
    expect(parsed.content).toBe("Body text")
  })

  it("wraps values containing a colon in quotes", () => {
    const yaml = serializeFrontmatter({ title: "Time: 10:30" })
    expect(yaml).toContain('title: "Time: 10:30"')
  })

  it("serializes arrays as inline quoted lists, skipping empty arrays", () => {
    const yaml = serializeFrontmatter({ tags: ["a", "b"], empty: [] })
    expect(yaml).toContain('tags: ["a", "b"]')
    expect(yaml).not.toContain("empty")
  })

  it("serializes multi-line strings as a literal block", () => {
    const yaml = serializeFrontmatter({ abstract: "Line one\nLine two" })
    expect(yaml).toContain("abstract: |")
    expect(yaml).toContain("  Line one")
    expect(yaml).toContain("  Line two")
  })

  it("skips undefined/null values", () => {
    const yaml = serializeFrontmatter({ title: "Foo", author: undefined, date: null as unknown as undefined })
    expect(yaml).toContain("title: Foo")
    expect(yaml).not.toContain("author")
    expect(yaml).not.toContain("date")
  })

  it("round-trips booleans and numbers", () => {
    const yaml = serializeFrontmatter({ draft: true, count: 3 } as unknown as FrontmatterData)
    const parsed = extractFrontmatter(`${yaml}\nBody`)!
    expect(parsed.data.draft).toBe(true)
    expect(parsed.data.count).toBe(3)
  })
})

describe("renderFrontmatterHeader", () => {
  it("returns an empty string for empty data", () => {
    expect(renderFrontmatterHeader({})).toBe("")
  })

  it("renders title, author, date", () => {
    const html = renderFrontmatterHeader({ title: "My Doc", author: "Jane", date: "2024-01-15" })
    expect(html).toContain("fm-title")
    expect(html).toContain("My Doc")
    expect(html).toContain("Jane")
    expect(html).toContain("2024-01-15")
  })

  it("escapes HTML-special characters in title", () => {
    const html = renderFrontmatterHeader({ title: '<script>alert("x")</script>' })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("renders papersize display labels", () => {
    expect(renderFrontmatterHeader({ papersize: "a4" })).toContain("A4")
    expect(renderFrontmatterHeader({ papersize: "letter" })).toContain("Letter")
  })

  it("renders landscape orientation marker", () => {
    expect(renderFrontmatterHeader({ orientation: "landscape" })).toContain("Landscape")
  })

  it("renders tags as pills", () => {
    const html = renderFrontmatterHeader({ tags: ["calculus", "algebra"] })
    expect(html).toContain("fm-tag")
    expect(html).toContain("calculus")
    expect(html).toContain("algebra")
  })

  it("renders print header/footer blocks only when set", () => {
    const withHeader = renderFrontmatterHeader({ headerLeft: "L" })
    expect(withHeader).toContain("print-header")
    const withoutHeader = renderFrontmatterHeader({ title: "Foo" })
    expect(withoutHeader).not.toContain("print-header")
  })
})

describe("classifyTag", () => {
  it("classifies hierarchical tags by their prefix before /", () => {
    expect(classifyTag("math/calculus")).toBe("math")
  })
  it("classifies namespaced tags by their prefix before :", () => {
    expect(classifyTag("topic:algebra")).toBe("topic")
  })
  it("falls back to general for flat tags", () => {
    expect(classifyTag("algebra")).toBe("general")
  })
})

describe("extractTags / extractDetailedTags", () => {
  it("extracts tags from frontmatter", () => {
    const doc = "---\ntags: [calculus, algebra]\n---\nBody"
    expect(extractTags(doc).sort()).toEqual(["algebra", "calculus"])
  })

  it("extracts inline #tags from the body", () => {
    const doc = "# Title\n\nSome text with #important and #todo tags."
    expect(extractTags(doc).sort()).toEqual(["important", "todo"])
  })

  it("does not pick up tags inside fenced code blocks", () => {
    const doc = "Body\n```\n#notatag\n```\nMore text #realtag"
    const tags = extractTags(doc)
    expect(tags).toContain("realtag")
    expect(tags).not.toContain("notatag")
  })

  it("does not pick up tags inside inline code spans", () => {
    const doc = "Text `#notatag` and #realtag"
    const tags = extractTags(doc)
    expect(tags).toContain("realtag")
    expect(tags).not.toContain("notatag")
  })

  it("does not pick up # inside math", () => {
    const doc = "Formula $x \\# y$ and #realtag more $$a \\# b$$"
    const tags = extractTags(doc)
    expect(tags).toContain("realtag")
  })

  it("dedupes tags combining frontmatter and inline sources", () => {
    const doc = "---\ntags: [important]\n---\nBody with #important again"
    const detailed = extractDetailedTags(doc)
    const importantEntries = detailed.filter((d) => d.tag === "important")
    expect(importantEntries.length).toBe(2)
    expect(importantEntries.map((e) => e.source).sort()).toEqual(["frontmatter", "inline"])
  })

  it("lowercases tags", () => {
    const doc = "Text with #ImportantTag"
    expect(extractTags(doc)).toEqual(["importanttag"])
  })

  it("returns tags sorted alphabetically then by source", () => {
    const doc = "#zeta #alpha"
    const tags = extractTags(doc)
    expect(tags).toEqual(["alpha", "zeta"])
  })
})
