import { describe, expect, it } from "vitest"
import { parseUnits, quantity, unitsToMath, unitsToSiunitx, numberForPreview } from "./units"
import { preprocess } from "./preprocessor"

describe("parseUnits", () => {
  it("splits products, divisions and exponents", () => {
    expect(parseUnits("m/s^2").map((t) => [t.unit, t.exp])).toEqual([
      ["meter", 1],
      ["second", -2],
    ])
    expect(parseUnits("kg m2/s3").map((t) => [t.short, t.exp])).toEqual([
      ["kg", 1],
      ["m", 2],
      ["s", -3],
    ])
  })

  it("understands SI prefixes, longest first", () => {
    expect(parseUnits("km")[0]).toMatchObject({ prefix: "kilo", unit: "meter", short: "km" })
    expect(parseUnits("da")[0].short).toBe("da") // "d" prefix + "a"? no: unknown, stays literal
    expect(parseUnits("um")[0]).toMatchObject({ prefix: "micro", unit: "meter" })
    expect(parseUnits("µm")[0]).toMatchObject({ prefix: "micro", unit: "meter" })
  })

  it("keeps unknown units as literals instead of guessing", () => {
    const t = parseUnits("widgets")[0]
    expect(t.unit).toBe("")
    expect(t.literal).toBe("widgets")
  })
})

describe("unitsToSiunitx", () => {
  it("emits real siunitx macros", () => {
    expect(unitsToSiunitx("m/s^2")).toBe("\\meter\\per\\second\\squared")
    expect(unitsToSiunitx("kg")).toBe("\\kilogram")
    expect(unitsToSiunitx("mol/L")).toBe("\\mole\\per\\litre")
    expect(unitsToSiunitx("km")).toBe("\\kilo\\meter")
  })

  it("wraps unknown units in text so the compile never breaks", () => {
    expect(unitsToSiunitx("CFU/mL")).toContain("\\text{CFU}")
    expect(unitsToSiunitx("CFU/mL")).toContain("\\per")
  })

  it("uses tothe for exponents beyond cubed", () => {
    expect(unitsToSiunitx("m^4")).toBe("\\meter\\tothe{4}")
  })
})

describe("unitsToMath (preview)", () => {
  it("renders upright abbreviations with negative exponents", () => {
    expect(unitsToMath("m/s^2")).toBe("\\mathrm{m\\,s^{-2}}")
    expect(unitsToMath("mol/L")).toBe("\\mathrm{mol\\,L^{-1}}")
  })
})

describe("quantity", () => {
  it("is siunitx on export and plain math in the preview", () => {
    expect(quantity("9.81", "m/s^2", "tex")).toBe("\\qty{9.81}{\\meter\\per\\second\\squared}")
    expect(quantity("9.81", "m/s^2", "preview")).toBe("9.81\\,\\mathrm{m\\,s^{-2}}")
  })

  it("degrades to a bare number when no unit is given", () => {
    expect(quantity("42", "", "tex")).toBe("\\num{42}")
    expect(quantity("42", "", "preview")).toBe("42")
  })

  it("passes concise uncertainty through to siunitx", () => {
    expect(quantity("1.23(4)", "mm", "tex")).toBe("\\qty{1.23(4)}{\\milli\\meter}")
  })
})

describe("numberForPreview", () => {
  it("turns scientific notation into real math", () => {
    expect(numberForPreview("6.022e23")).toBe("6.022 \\times 10^{23}")
    expect(numberForPreview("1.5E-9")).toBe("1.5 \\times 10^{-9}")
  })
})

describe("shorthands through the preprocessor", () => {
  it("si() renders for the preview and exports as siunitx", () => {
    expect(preprocess("$si(9.81, m/s^2)$")).toContain("9.81\\,\\mathrm{m\\,s^{-2}}")
    expect(preprocess("$si(9.81, m/s^2)$", "tex")).toContain("\\qty{9.81}{\\meter\\per\\second\\squared}")
  })

  it("ce() is identical on both targets (KaTeX ships mhchem)", () => {
    expect(preprocess("$ce(H2O)$")).toContain("\\ce{H2O}")
    expect(preprocess("$ce(H2O)$", "tex")).toContain("\\ce{H2O}")
  })

  it("num() and unit() follow the same dual rendering", () => {
    expect(preprocess("$num(6.022e23)$", "tex")).toContain("\\num{6.022e23}")
    expect(preprocess("$num(6.022e23)$")).toContain("\\times 10^{23}")
    expect(preprocess("$unit(mol/L)$", "tex")).toContain("\\mole\\per\\litre")
  })

  it("leaves shorthands inside code fences alone", () => {
    const out = preprocess("```\nsi(1, m)\n```", "tex")
    expect(out).toContain("si(1, m)")
    expect(out).not.toContain("\\qty")
  })
})
