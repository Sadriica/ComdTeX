import { describe, expect, it } from "vitest"
import { MERMAID_CONFIG } from "./mermaidConfig"

// These are cheap guards on the config contract. They are NOT the real proof —
// that lives in e2e/mermaid-labels.spec.ts, which renders actual Mermaid output
// through the actual sanitizer in a real browser and asserts the label text
// survives. Keep both: this catches an accidental edit, that catches a
// behavioural regression.
describe("MERMAID_CONFIG", () => {
  it("disables HTML labels so node text is native SVG the sanitizer keeps", () => {
    expect(MERMAID_CONFIG.htmlLabels).toBe(false)
  })

  it("does not opt into securityLevel 'loose' (default strict is enough)", () => {
    expect("securityLevel" in MERMAID_CONFIG).toBe(false)
  })

  it("does not auto-start mermaid on page load", () => {
    expect(MERMAID_CONFIG.startOnLoad).toBe(false)
  })
})
