import { describe, expect, it } from "vitest"
import { buildThemeData, monacoThemeName } from "./monacoThemes"

describe("monacoThemeName", () => {
  it("maps the settings theme to the token-built Monaco theme", () => {
    expect(monacoThemeName("vs-dark")).toBe("comdtex-dark")
    expect(monacoThemeName("vs")).toBe("comdtex-light")
    expect(monacoThemeName("hc-black")).toBe("comdtex-hc")
  })
})

describe("buildThemeData", () => {
  // A resolver that records which expressions were asked for and answers with a
  // fixed colour, so the test does not depend on a browser.
  const asked: string[] = []
  const resolve = (expr: string) => {
    asked.push(expr)
    return "#112233"
  }

  it("builds syntax rules and editor colours purely from tokens", () => {
    const data = buildThemeData("vs-dark", resolve)
    expect(data.base).toBe("vs-dark")
    expect(data.inherit).toBe(true)
    expect(data.colors["editor.background"]).toBe("#112233")
    expect(data.rules.find((r) => r.token === "keyword")?.foreground).toBe("112233")
    expect(data.rules.find((r) => r.token === "string.link")).toBeDefined()
    expect(asked.some((e) => e.includes("--syn-keyword") || e.includes("--accent"))).toBe(true)
    // Every request is a token reference or a mix of tokens, never a literal colour.
    for (const e of asked) expect(e).toMatch(/var\(--/)
  })

  it("skips colours the browser cannot resolve", () => {
    const data = buildThemeData("vs", () => undefined)
    expect(Object.keys(data.colors)).toHaveLength(0)
    expect(data.rules).toHaveLength(0)
  })
})
