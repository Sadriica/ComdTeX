import { afterEach, describe, expect, it, vi } from "vitest"

describe("ADS bibcodes", () => {
  it("recognizes a real bibcode", async () => {
    const { isAdsBibcode } = await import("./doiFetch")
    expect(isAdsBibcode("2024ApJ...900....1A")).toBe(true)
    expect(isAdsBibcode("1998A&A...333L..87S")).toBe(true)
  })

  it("rejects anything that is not 19 characters of bibcode shape", async () => {
    const { isAdsBibcode } = await import("./doiFetch")
    expect(isAdsBibcode("10.1234/abc")).toBe(false)
    expect(isAdsBibcode("2024ApJ")).toBe(false)
    expect(isAdsBibcode("")).toBe(false)
  })
})

describe("INSPIRE references", () => {
  it("parses recids, URLs and arXiv ids", async () => {
    const { parseInspireInput } = await import("./doiFetch")
    expect(parseInspireInput("https://inspirehep.net/literature/1234567")).toEqual({
      kind: "recid",
      value: "1234567",
    })
    expect(parseInspireInput("inspire:98765")).toEqual({ kind: "recid", value: "98765" })
    expect(parseInspireInput("arXiv:2301.00001")).toEqual({ kind: "arxiv", value: "2301.00001" })
  })

  it("returns null for unrelated input", async () => {
    const { parseInspireInput } = await import("./doiFetch")
    expect(parseInspireInput("hello")).toBeNull()
  })
})

describe("PubMed references", () => {
  it("parses PMIDs, PMCIDs and URLs", async () => {
    const { parsePubmedInput } = await import("./doiFetch")
    expect(parsePubmedInput("PMID: 12345678")).toEqual({ kind: "pmid", value: "12345678" })
    expect(parsePubmedInput("pmid:42")).toEqual({ kind: "pmid", value: "42" })
    expect(parsePubmedInput("31452104")).toEqual({ kind: "pmid", value: "31452104" })
    expect(parsePubmedInput("pmc1234567")).toEqual({ kind: "pmcid", value: "PMC1234567" })
    expect(parsePubmedInput("https://pubmed.ncbi.nlm.nih.gov/31452104/")).toEqual({
      kind: "pmid",
      value: "31452104",
    })
    expect(parsePubmedInput("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6901234/")).toEqual({
      kind: "pmcid",
      value: "PMC6901234",
    })
  })

  it("leaves other identifiers alone", async () => {
    const { parsePubmedInput } = await import("./doiFetch")
    expect(parsePubmedInput("10.1000/abc")).toBeNull()
    expect(parsePubmedInput("2301.00001")).toBeNull()
    expect(parsePubmedInput("inspire:98765")).toBeNull()
    expect(parsePubmedInput("hello")).toBeNull()
  })

  it("adds fields without duplicating existing ones", async () => {
    const { addBibtexFields } = await import("./doiFetch")
    const out = addBibtexFields("@article{k,\n  title = {T},\n}", { pmid: "1", pmcid: "" })
    expect(out).toBe("@article{k,\n  title = {T},\n  pmid = {1}\n}")
    expect(addBibtexFields(out, { pmid: "2" })).toBe(out)
  })
})

describe("fetchBibtexFromPubmed", () => {
  const summary = {
    result: {
      "123": {
        title: "A study of cells.",
        authors: [{ name: "Smith JA" }, { name: "Lee K" }],
        fulljournalname: "Nature Cell Biology",
        pubdate: "2020 Jan 5",
        volume: "22",
        issue: "1",
        pages: "10-20",
        articleids: [{ idtype: "pmc", value: "PMC999" }],
      },
    },
  }

  afterEach(() => vi.unstubAllGlobals())

  it("builds an @article when there is no DOI", async () => {
    const { fetchBibtexFromPubmed } = await import("./doiFetch")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => summary })),
    )
    const bib = await fetchBibtexFromPubmed({ kind: "pmid", value: "123" })
    expect(bib).toContain("@article{smith2020pmid123,")
    expect(bib).toContain("author = {Smith, JA and Lee, K}")
    expect(bib).toContain("pages = {10--20}")
    expect(bib).toContain("pmid = {123}")
    expect(bib).toContain("pmcid = {PMC999}")
  })

  it("reuses the DOI path and adds the pmid", async () => {
    const { fetchBibtexFromPubmed } = await import("./doiFetch")
    const withDoi = structuredClone(summary)
    withDoi.result["123"].articleids.push({ idtype: "doi", value: "10.1000/xyz" })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("crossref")
          ? { ok: true, text: async () => "@article{x,\n  title={T}\n}" }
          : { ok: true, json: async () => withDoi },
      ),
    )
    const bib = await fetchBibtexFromPubmed({ kind: "pmid", value: "123" })
    expect(bib.startsWith("@article{x,")).toBe(true)
    expect(bib).toContain("pmid = {123}")
  })

  it("resolves a PMCID through the ID converter", async () => {
    const { fetchBibtexFromPubmed } = await import("./doiFetch")
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("idconv")
        ? { ok: true, json: async () => ({ records: [{ pmid: "123" }] }) }
        : { ok: true, json: async () => summary },
    )
    vi.stubGlobal("fetch", fetchMock)
    const bib = await fetchBibtexFromPubmed({ kind: "pmcid", value: "PMC999" })
    expect(bib).toContain("pmcid = {PMC999}")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws when PubMed has no record", async () => {
    const { fetchBibtexFromPubmed } = await import("./doiFetch")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ result: {} }) })),
    )
    await expect(fetchBibtexFromPubmed({ kind: "pmid", value: "1" })).rejects.toThrow()
  })
})
