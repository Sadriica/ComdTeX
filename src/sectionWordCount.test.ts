import { describe, expect, it } from "vitest"
import { computeSectionWordCounts, totalWordCount } from "./sectionWordCount"

describe("computeSectionWordCounts", () => {
  it("returns an empty map when there are no headings", () => {
    const map = computeSectionWordCounts("just a paragraph with some words")
    expect(map.size).toBe(0)
  })

  it("counts words in a single section's body, not including the heading text", () => {
    const content = "# Title\none two three"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(3)
  })

  it("gives a count of 0 for an empty section (immediately followed by the next heading)", () => {
    const content = "# A\n# B\ncontent here"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(0)
    expect(map.get(2)).toBe(2)
  })

  it("scopes a heading's body up to the next heading of equal-or-higher level, including nested subsection text and headings", () => {
    const content = [
      "# Section One", // line 1
      "word word word", // line 2
      "## Sub A", // line 3
      "alpha beta", // line 4
      "## Sub B", // line 5
      "gamma", // line 6
      "# Section Two", // line 7
      "delta epsilon zeta", // line 8
    ].join("\n")
    const map = computeSectionWordCounts(content)

    // Sub A's body is scoped only up to the next heading of level <= 2
    expect(map.get(3)).toBe(2) // "alpha beta"
    // Sub B's body runs until the next heading of level <= 2 (Section Two)
    expect(map.get(5)).toBe(1) // "gamma"
    // Section Two's body is just its own paragraph
    expect(map.get(7)).toBe(3) // "delta epsilon zeta"
    // Section One's body absorbs everything until the next level-1 heading,
    // INCLUDING the literal text of the nested "## Sub A" / "## Sub B" heading
    // lines themselves (only the leading "##" marker is stripped, "Sub A" /
    // "Sub B" remain and are counted as words) plus their bodies.
    // "word word word" (3) + "Sub A" (2) + "alpha beta" (2) + "Sub B" (2) + "gamma" (1) = 10
    expect(map.get(1)).toBe(10)
  })

  it("skips YAML frontmatter when locating headings", () => {
    const content = "---\ntitle: My Doc\ntags: [a, b]\n---\n# Heading\nbody text here"
    const map = computeSectionWordCounts(content)
    expect(map.size).toBe(1)
    expect(map.get(5)).toBe(3) // "body text here"; heading is now on line 5
  })

  it("excludes $$...$$ display math from word counts", () => {
    const content = "# Title\nbefore $$x^2 + y^2 = z^2$$ after"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(2) // "before" and "after" only
  })

  it("excludes inline $...$ math from word counts", () => {
    const content = "# Title\nbefore $x + y$ after"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(2)
  })

  it("excludes fenced code blocks from word counts", () => {
    const content = "# Title\nbefore\n```js\nconst hello = world + 1\n```\nafter"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(2) // "before" and "after" only
  })

  it("excludes inline code spans from word counts", () => {
    const content = "# Title\nbefore `code span here` after"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(2)
  })

  it("counts wikilink text (brackets stripped) as words", () => {
    const content = "# Title\nsee [[Some Note]] for more"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(5) // see, Some, Note, for, more
  })

  it("excludes citations [@key] entirely", () => {
    const content = "# Title\nas shown [@smith2020] here"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(3) // "as", "shown", "here"
  })

  it("excludes label markers {#label}", () => {
    const content = "# Title\nsome text {#sec:foo} continues"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(3) // "some", "text", "continues"
  })

  it("excludes bare URLs", () => {
    const content = "# Title\nvisit https://example.com/path today"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(2) // "visit" and "today"
  })

  it("strips markdown emphasis markers but counts the enclosed words", () => {
    const content = "# Title\nthis is **bold** and _italic_ and ~~struck~~"
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(7) // this, is, bold, and, italic, and, struck
  })

  it("excludes ComdTeX environment marker lines (:::type[title] and :::)", () => {
    const content = '# Title\n:::theorem[Pythagoras]\na squared plus b squared\n:::'
    const map = computeSectionWordCounts(content)
    expect(map.get(1)).toBe(5) // "a", "squared", "plus", "b", "squared"
  })
})

describe("totalWordCount", () => {
  it("counts words with no headings at all", () => {
    expect(totalWordCount("just a simple paragraph")).toBe(4)
  })

  it("returns 0 for empty content", () => {
    expect(totalWordCount("")).toBe(0)
  })

  it("includes text before the first heading", () => {
    const content = "intro words here\n# Heading\nmore words"
    expect(totalWordCount(content)).toBe(6)
  })

  it("skips frontmatter when computing the total", () => {
    const content = "---\ntitle: My Document About Cats\n---\nbody text"
    expect(totalWordCount(content)).toBe(2) // frontmatter words are not counted
  })

  it("treats content with only frontmatter (no closing delimiter found) as starting at line 0", () => {
    // Surprising real behavior: skipFrontmatter returns 0 (i.e. "no frontmatter")
    // when the closing "---" is never found, so in that edge case the opening
    // "---" line itself IS scanned/counted as body content.
    const content = "---\ntitle: unclosed"
    // "---" contributes no word tokens (only punctuation), "title: unclosed" -> 2 words
    expect(totalWordCount(content)).toBe(2)
  })
})
