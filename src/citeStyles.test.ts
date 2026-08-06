import { describe, expect, it } from "vitest"
import { CITE_STYLES, parseAuthors, pickCiteStyle } from "./citeStyles"

const article = {
  type: "article",
  fields: {
    author: "Rudin, Walter and Smith, Ada Byron",
    year: "1976",
    title: "Principles of mathematical analysis",
    journal: "Journal of Analysis",
    volume: "12",
    number: "3",
    pages: "321-330",
  },
  n: 1,
}

const book = {
  type: "book",
  fields: {
    author: "Rudin, Walter",
    year: "1976",
    title: "Principles of mathematical analysis",
    publisher: "McGraw-Hill",
    address: "New York",
    edition: "3rd",
  },
  n: 2,
}

describe("parseAuthors", () => {
  it("reads both BibTeX author forms", () => {
    expect(parseAuthors("Rudin, Walter")).toEqual([{ last: "Rudin", initials: "W" }])
    expect(parseAuthors("Walter Rudin")).toEqual([{ last: "Rudin", initials: "W" }])
    expect(parseAuthors("Rudin, Walter and Smith, Ada Byron")).toEqual([
      { last: "Rudin", initials: "W" },
      { last: "Smith", initials: "AB" },
    ])
  })
})

describe("Vancouver", () => {
  const s = CITE_STYLES.vancouver

  it("cites by number", () => {
    expect(s.inText(article)).toBe("[1]")
  })

  it("puts author initials after the surname, no periods", () => {
    const ref = s.reference(article)
    expect(ref).toContain("Rudin W, Smith AB.")
    expect(ref).toContain("Journal of Analysis")
    expect(ref).toContain("1976;12(3):321-330")
  })

  it("formats a book with edition, place and publisher", () => {
    const ref = s.reference(book)
    expect(ref).toContain("3rd ed.")
    expect(ref).toContain("New York: McGraw-Hill")
  })

  it("collapses more than six authors into et al", () => {
    const many = Array.from({ length: 8 }, (_, i) => `Last${i}, First${i}`).join(" and ")
    expect(s.reference({ ...article, fields: { ...article.fields, author: many } })).toContain("et al")
  })

  it("maps to numeric natbib on export", () => {
    expect(s.natbib).toBe("numbers,square")
  })
})

describe("APA 7", () => {
  const s = CITE_STYLES.apa

  it("cites author and year in text", () => {
    expect(s.inText(article)).toBe("(Rudin & Smith, 1976)")
    expect(s.inText({ ...article, fields: { ...article.fields, author: "A, X and B, Y and C, Z" } }))
      .toBe("(A et al., 1976)")
  })

  it("uses ampersand and spaced initials in the reference", () => {
    const ref = s.reference(article)
    expect(ref).toContain("Rudin, W., & Smith, A. B.")
    expect(ref).toContain("(1976).")
  })

  it("says n.d. when the year is missing rather than printing nothing", () => {
    expect(s.inText({ ...article, fields: { author: "Rudin, Walter" } })).toBe("(Rudin, n.d.)")
  })

  it("maps to author-year natbib", () => {
    expect(s.natbib).toBe("authoryear,round")
  })
})

describe("author-year and AMA", () => {
  it("author-year cites without a comma", () => {
    expect(CITE_STYLES["author-year"].inText(article)).toBe("(Rudin & Smith 1976)")
  })

  it("AMA shares Vancouver's shape", () => {
    expect(CITE_STYLES.ama.reference(article)).toContain("Rudin W, Smith AB.")
    expect(CITE_STYLES.ama.numbered).toBe(true)
  })
})

describe("default style is unchanged", () => {
  it("keeps the original numeric look", () => {
    const s = CITE_STYLES.default
    expect(s.inText(article)).toBe("[1]")
    expect(s.reference(article)).toContain("Rudin, W.; Smith, AB.")
    expect(s.natbib).toBeNull()
  })
})

describe("pickCiteStyle", () => {
  it("reads frontmatter values, tolerating case and separators", () => {
    expect(pickCiteStyle("vancouver").id).toBe("vancouver")
    expect(pickCiteStyle("Author Year").id).toBe("author-year")
    expect(pickCiteStyle("author_year").id).toBe("author-year")
  })

  it("falls back to the default for unknown or missing values", () => {
    expect(pickCiteStyle("nonsense").id).toBe("default")
    expect(pickCiteStyle(undefined).id).toBe("default")
    expect(pickCiteStyle(42).id).toBe("default")
  })
})
