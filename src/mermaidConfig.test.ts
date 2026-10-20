import { describe, expect, it } from "vitest"
import { MERMAID_CONFIG, buildMermaidConfig, mermaidThemeKey } from "./mermaidConfig"
import { setFlowchartThemeKey } from "./environments"

describe("MERMAID_CONFIG theming", () => {
  it("adopts the neo look and themes it from tokens through the base theme", () => {
    expect(MERMAID_CONFIG.look).toBe("neo")
    expect(MERMAID_CONFIG.theme).toBe("base")
  })

  it("leaves layout to Mermaid's default so documents can opt into dagre", () => {
    expect("layout" in MERMAID_CONFIG).toBe(false)
  })

  it("gives every categorical slot a plain hex colour khroma can parse", () => {
    const v = MERMAID_CONFIG.themeVariables
    for (const c of [v.pie1, v.pie8, v.cScale0, v.cScale7, v.primaryColor, v.lineColor]) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it("differs per app theme, so the palette key changes on a theme switch", () => {
    const dark = mermaidThemeKey(buildMermaidConfig(null, "dark"))
    const light = mermaidThemeKey(buildMermaidConfig(null, "light"))
    expect(dark).not.toBe(light)
    expect(mermaidThemeKey(buildMermaidConfig(null, "dark"))).toBe(dark)
  })

  it("flowchart cache reports a palette change only after the first palette", () => {
    expect(setFlowchartThemeKey("a")).toBe(false)
    expect(setFlowchartThemeKey("a")).toBe(false)
    expect(setFlowchartThemeKey("b")).toBe(true)
  })
})

// These are cheap guards on the config contract. They are NOT the real proof:
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
