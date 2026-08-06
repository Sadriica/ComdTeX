import { describe, expect, it } from "vitest"
import appSrc from "./App.tsx?raw"
import { findVaultFile } from "./vaultResolve"

const files = [
  { path: "/v/notes/intro.md", name: "intro.md", content: "A" },
  { path: "/v/data/growth.csv", name: "growth.csv", content: "t,y\n0,1" },
  { path: "/v/archive/growth.csv", name: "growth.csv", content: "old" },
]

describe("findVaultFile", () => {
  it("finds a file by its stem, the way a document writes it", () => {
    expect(findVaultFile(files, "intro")?.path).toBe("/v/notes/intro.md")
  })

  it("finds a file by its full name, extension included", () => {
    expect(findVaultFile(files, "growth.csv")?.content).toBe("t,y\n0,1")
  })

  it("disambiguates two files with the same name by path fragment", () => {
    expect(findVaultFile(files, "archive/growth.csv")?.content).toBe("old")
  })

  it("returns null instead of guessing when nothing matches", () => {
    expect(findVaultFile(files, "missing")).toBeNull()
  })

  it("ignores case, as a person writing a name would expect", () => {
    expect(findVaultFile(files, "GROWTH.CSV")?.name).toBe("growth.csv")
  })
})

// A `:::csv` or `:::data` block names a spreadsheet, and the resolver that
// feeds the preview and every export must be able to find it. `vaultFiles`
// deliberately holds only `.md`/`.tex` (it also feeds the label scan and the
// diagnostics), so data files travel in their own list. This regressed once
// silently: every test passed because tests inject their own resolver, while
// the app itself rendered "not found in this vault" for every data block.
describe("the app resolver can reach data files", () => {
  it("keeps a csv source next to the document source", () => {
    expect(appSrc).toContain("vaultCsvFilesRef")
    expect(appSrc).toMatch(/filter\(\(f\) => f\.ext === "csv"\)/)
  })
})
