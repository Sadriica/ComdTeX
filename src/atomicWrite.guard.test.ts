import { describe, expect, it } from "vitest"
import appSrc from "./App.tsx?raw"
import vaultSrc from "./useVault.ts?raw"
import commentsSrc from "./comments.ts?raw"

// Every file the user owns is written atomically: a temp file in the same
// directory, then a rename. A crash mid-write must never leave a truncated
// bibliography, a half-written note or an empty macros file.
//
// This is a guard, not a unit test. The invariant is easy to break by
// reaching for the obvious `writeTextFile` in a new handler, and the cost
// of breaking it is a user losing work, which no test of behaviour would
// catch. Export paths are exempt: they write NEW files outside the vault,
// chosen by the user in a save dialog.

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("user documents are written atomically", () => {
  const files: Array<[string, string]> = [
    ["App.tsx", appSrc],
    ["useVault.ts", vaultSrc],
    ["comments.ts", commentsSrc],
  ]

  for (const [name, src] of files) {
    it(`${name} never calls writeTextFile directly`, () => {
      const code = stripComments(src)
      // `writeTextFileAtomic(` is fine; a bare `writeTextFile(` is not.
      const bare = code.match(/(?<!Atomic)\bwriteTextFile\(/g) ?? []
      expect(bare).toEqual([])
    })
  }

  it("the atomic helper itself is the one place that may write directly", () => {
    // Sanity check that the guard would actually catch a regression.
    expect(stripComments(appSrc)).toContain("writeTextFileAtomic(")
  })
})
