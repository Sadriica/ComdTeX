import { describe, expect, it } from "vitest"
import { CMDX_ROUND_TRIP_FIXTURES } from "./fixtures/cmdx/roundtrip"
import { toCmdx, toDiskContent, toEditorContent, toStorage } from "./cmdxFormat"

describe("CMDX round-trip fixtures", () => {
  for (const fixture of CMDX_ROUND_TRIP_FIXTURES) {
    it(`${fixture.name}: storage -> editor`, () => {
      expect(toEditorContent(fixture.path, fixture.storage)).toBe(fixture.cmdx)
    })

    it(`${fixture.name}: editor -> storage`, () => {
      expect(toDiskContent(fixture.path, fixture.cmdx)).toBe(fixture.expectedStorage)
    })

    const format = fixture.format
    if (format) {
      it(`${fixture.name}: primitive conversion matches gateway`, () => {
        expect(toCmdx(fixture.storage, format)).toBe(toEditorContent(fixture.path, fixture.storage))
        expect(toStorage(fixture.cmdx, format)).toBe(toDiskContent(fixture.path, fixture.cmdx))
      })
    }
  }
})
