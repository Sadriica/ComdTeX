import { expect, it } from "vitest"
import { parseCriticMarks } from "./criticMarkup"
import { perfBudget } from "./perfBudget"

/**
 * A run of `{~~x~~}` with no `~>` used to be quadratic (each opener scanned the
 * rest of the text for a separator): 30 000 repeats took about 38 s. The budget
 * only catches that class of regression; the real cost is a few milliseconds.
 */
it("parses 30 000 substitutions without a separator in linear time", () => {
  const text = "{~~x~~}".repeat(30_000)
  const t0 = performance.now()
  const marks = parseCriticMarks(text)
  const ms = performance.now() - t0
  expect(marks).toEqual([])
  expect(ms).toBeLessThan(perfBudget(1000))
})

it("stays linear when the only separator is at the very end", () => {
  const text = "{~~x~~}".repeat(30_000) + "{~~a~>b~~}"
  const t0 = performance.now()
  const marks = parseCriticMarks(text)
  const ms = performance.now() - t0
  expect(marks).toHaveLength(1)
  expect(marks[0].oldText).toBe("a")
  expect(ms).toBeLessThan(perfBudget(1000))
})
