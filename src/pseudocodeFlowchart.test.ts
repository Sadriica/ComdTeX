import { describe, expect, it } from "vitest"
import { pseudocodeToFlowchart } from "./pseudocodeFlowchart"

describe("pseudocodeToFlowchart", () => {
  it("renders a full algorithm with INPUT/WHILE/IF/ELSE/RETURN", () => {
    const code = [
      "ALGORITHM Test",
      "INPUT n",
      "WHILE n > 0",
      "  IF n > 10",
      "    OUTPUT n",
      "  ELSE",
      "    OUTPUT 0",
      "  ENDIF",
      "  n <- n - 1",
      "ENDWHILE",
      "RETURN n",
    ].join("\n")

    const out = pseudocodeToFlowchart(code)

    expect(out.startsWith("flowchart TD\n")).toBe(true)

    // Shape mapping
    expect(out).toContain('n0(["Start"])')
    expect(out).toContain('{{"ALGORITHM Test"}}') // header -> hexagon
    expect(out).toContain('[/"INPUT n"/]') // io -> parallelogram
    expect(out).toContain('{"WHILE n > 0"}') // while cond -> diamond
    expect(out).toContain('{"n > 10"}') // if cond -> diamond (THEN suffix stripped, none here)
    expect(out).toContain('[/"OUTPUT n"/]')
    expect(out).toContain('[/"OUTPUT 0"/]')
    expect(out).toContain('["n <- n - 1"]') // plain statement -> rectangle
    expect(out).toContain('(["RETURN n"])') // terminal -> stadium

    // IF branches: diamond fans out to both THEN ("Yes") and ELSE ("No") bodies
    const ifDiamondId = out.match(/(n\d+)\{"n > 10"\}/)?.[1]
    expect(ifDiamondId).toBeDefined()
    const thenIoId = out.match(/(n\d+)\[\/"OUTPUT n"\/\]/)?.[1]
    const elseIoId = out.match(/(n\d+)\[\/"OUTPUT 0"\/\]/)?.[1]
    expect(out).toContain(`${ifDiamondId} -->|"Yes"| ${thenIoId}`)
    expect(out).toContain(`${ifDiamondId} -->|"No"| ${elseIoId}`)

    // Both branches merge into the following statement
    const processId = out.match(/(n\d+)\["n <- n - 1"\]/)?.[1]
    expect(out).toContain(`${thenIoId} --> ${processId}`)
    expect(out).toContain(`${elseIoId} --> ${processId}`)

    // Loop-back edge is labeled with the loop glyph
    const whileDiamondId = out.match(/(n\d+)\{"WHILE n > 0"\}/)?.[1]
    expect(out).toContain(`${processId} -->|"↺"| ${whileDiamondId}`)

    // Because the algorithm ends with RETURN (a terminal), every path
    // terminates and no virtual "End" node should be synthesized.
    expect(out).not.toContain('(["End"])')
  })

  it("generates a labeled self-loop edge for FOR loops", () => {
    const out = pseudocodeToFlowchart("FOR i = 1 TO 10 DO\nOUTPUT i\nENDFOR")
    expect(out).toContain('{"FOR i = 1 TO 10"}') // trailing DO stripped
    expect(out).toContain('[/"OUTPUT i"/]')
    expect(out).toMatch(/-->\|"↺"\|/)
    // Loop falls through to a virtual End since there's no terminal statement
    expect(out).toContain('(["End"])')
  })

  it("classifies a word(args) line as a subroutine call", () => {
    const out = pseudocodeToFlowchart("foo(x, y)")
    expect(out).toContain('[["foo(x, y)"]]')
  })

  it("classifies a plain statement (no call syntax) as a process rectangle", () => {
    const out = pseudocodeToFlowchart("x <- 5")
    expect(out).toContain('["x <- 5"]')
    expect(out).not.toContain('[["x <- 5"]]')
  })

  it("produces the deterministic Start->End graph for an empty program", () => {
    const out = pseudocodeToFlowchart("")
    expect(out).toBe('flowchart TD\nn0(["Start"])\nn1(["End"])\nn0 --> n1')
  })

  it("does not throw on unbalanced IF/ENDIF (missing ENDIF) and still connects both exits to End", () => {
    const out = pseudocodeToFlowchart("IF x > 0\nOUTPUT x")
    expect(out.startsWith("flowchart TD")).toBe(true)
    expect(out).toContain('{"x > 0"}')
    expect(out).toContain('[/"OUTPUT x"/]')
    expect(out).toContain('(["End"])')
    // Both the THEN body and the (absent) ELSE fallthrough reach End.
    const endMatches = out.match(/--> n\d+\(\["End"\]\)|n\d+ --> \S+$/gm)
    expect(endMatches).not.toBeNull()
  })

  it("does not throw on unbalanced WHILE/ENDWHILE (missing terminator)", () => {
    expect(() => pseudocodeToFlowchart("WHILE true\nOUTPUT 1")).not.toThrow()
    const out = pseudocodeToFlowchart("WHILE true\nOUTPUT 1")
    expect(out.startsWith("flowchart TD")).toBe(true)
  })

  it("does not throw on garbage/empty-ish input", () => {
    expect(() => pseudocodeToFlowchart("\n\n   \n")).not.toThrow()
    expect(() => pseudocodeToFlowchart("???")).not.toThrow()
  })

  it("chains ELSE IF branches off the previous diamond's No path", () => {
    const code = [
      "IF a",
      "OUTPUT 1",
      "ELSE IF b",
      "OUTPUT 2",
      "ELSE",
      "OUTPUT 3",
      "ENDIF",
    ].join("\n")
    const out = pseudocodeToFlowchart(code)
    expect(out).toContain('{"a"}')
    expect(out).toContain('{"b"}')
    // ELSE IF diamond is reached via a "No" labeled edge from the previous diamond
    expect(out).toMatch(/-->\|"No"\|/)
  })

  it("drops a trailing structural END without leaving a disconnected node", () => {
    const withEnd = pseudocodeToFlowchart("ALGORITHM Foo\nOUTPUT 1\nEND")
    const withoutEnd = pseudocodeToFlowchart("ALGORITHM Foo\nOUTPUT 1")
    // The trailing END should not appear as its own stadium node distinct
    // from the rest of the diagram's node count.
    expect(withEnd).not.toContain('(["END"])')
    expect(withEnd.split("\n").length).toBe(withoutEnd.split("\n").length)
  })

  it("labels an IF diamond's THEN branch 'Yes' and its ELSE branch 'No'", () => {
    const out = pseudocodeToFlowchart([
      "ALGORITHM Sign",
      "IF n > 0",
      "  OUTPUT positive",
      "ELSE",
      "  OUTPUT negative",
      "ENDIF",
    ].join("\n"))
    expect(out).toMatch(/-->\|"Yes"\|/)
    expect(out).toMatch(/-->\|"No"\|/)
    // Both branch edges leave the same condition diamond.
    const cond = out.match(/(n\d+)\{"n > 0"\}/)
    expect(cond).not.toBeNull()
    const id = cond![1]
    expect(out).toContain(`${id} -->|"Yes"|`)
    expect(out).toContain(`${id} -->|"No"|`)
  })

  it("loops a REPEAT/UNTIL back to the body start, not to the condition itself", () => {
    const out = pseudocodeToFlowchart([
      "ALGORITHM Countdown",
      "REPEAT",
      "  OUTPUT n",
      "UNTIL n = 0",
    ].join("\n"))
    // The UNTIL condition diamond exists...
    const untilMatch = out.match(/(n\d+)\{"UNTIL[^}]*"\}/)
    expect(untilMatch).not.toBeNull()
    const untilId = untilMatch![1]
    // ...and its "No" loop-back edge must NOT point at itself (the old bug).
    expect(out).not.toContain(`${untilId} -->|"↺ No"| ${untilId}`)
    // It loops back to the body's first (output) node instead.
    expect(out).toMatch(/-->\|"↺ No"\|/)
  })
})
