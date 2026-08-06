// Units and numbers, written once and typeset twice.
//
// Researchers write `si(9.81, m/s^2)`. The preview must render it with KaTeX,
// which knows nothing about siunitx, and the LaTeX export must emit real
// siunitx so journals get consistent number/unit formatting. So every unit
// string is parsed once into tokens and rendered per target:
//
//   preview: 9.81\,\mathrm{m\,s^{-2}}
//   export : \qty{9.81}{\meter\per\second\squared}
//
// Deliberately a small, closed vocabulary of the units that actually appear
// in papers, plus SI prefixes. An unknown unit degrades to itself (upright
// text in the preview, `\text{}` inside siunitx) rather than throwing: a
// typo must never break a document.

export type UnitTarget = "preview" | "tex"

interface UnitToken {
  /** Prefix macro name without backslash, e.g. "kilo". Empty when none. */
  prefix: string
  /** Unit macro name without backslash, e.g. "meter". Empty when unknown. */
  unit: string
  /** Literal text as written, used when `unit` is empty. */
  literal: string
  /** Upright abbreviation for the preview, e.g. "kg". */
  short: string
  /** Exponent; negative means the unit sat after a division. */
  exp: number
}

// name → [siunitx macro, preview abbreviation]
const UNITS: Record<string, [string, string]> = {
  // SI base
  m: ["meter", "m"], s: ["second", "s"], kg: ["kilogram", "kg"], g: ["gram", "g"],
  mol: ["mole", "mol"], K: ["kelvin", "K"], A: ["ampere", "A"], cd: ["candela", "cd"],
  // SI derived
  Hz: ["hertz", "Hz"], N: ["newton", "N"], Pa: ["pascal", "Pa"], J: ["joule", "J"],
  W: ["watt", "W"], C: ["coulomb", "C"], V: ["volt", "V"], F: ["farad", "F"],
  ohm: ["ohm", "\\Omega"], S: ["siemens", "S"], T: ["tesla", "T"], H: ["henry", "H"],
  lm: ["lumen", "lm"], lx: ["lux", "lx"], Bq: ["becquerel", "Bq"], Gy: ["gray", "Gy"],
  Sv: ["sievert", "Sv"], kat: ["katal", "kat"], rad: ["radian", "rad"], sr: ["steradian", "sr"],
  // Accepted non-SI, common in papers
  L: ["litre", "L"], l: ["litre", "l"], t: ["tonne", "t"], min: ["minute", "min"],
  h: ["hour", "h"], d: ["day", "d"], au: ["astronomicalunit", "au"],
  eV: ["electronvolt", "eV"], u: ["atomicmassunit", "u"], Da: ["dalton", "Da"],
  bar: ["bar", "bar"], percent: ["percent", "\\%"],
  degC: ["celsius", "^{\\circ}C"], degF: ["fahrenheit", "^{\\circ}F"], deg: ["degree", "^{\\circ}"],
  arcmin: ["arcminute", "'"], arcsec: ["arcsecond", "''"],
  // Astronomy (siunitx has no macros for these: they ride as text)
  pc: ["", "pc"], kpc: ["", "kpc"], Mpc: ["", "Mpc"], ly: ["", "ly"],
  Msun: ["", "M_{\\odot}"], Lsun: ["", "L_{\\odot}"], Rsun: ["", "R_{\\odot}"],
  Jy: ["", "Jy"], mag: ["", "mag"],
  // Biology and chemistry
  M: ["", "M"], bp: ["", "bp"], kb: ["", "kb"], Da_: ["", "Da"], rpm: ["", "rpm"],
  cfu: ["", "CFU"], OD: ["", "OD"],
}

// prefix → [siunitx macro, preview abbreviation]
const PREFIXES: Record<string, [string, string]> = {
  q: ["quecto", "q"], r: ["ronto", "r"], y: ["yocto", "y"], z: ["zepto", "z"],
  a: ["atto", "a"], f: ["femto", "f"], p: ["pico", "p"], n: ["nano", "n"],
  u: ["micro", "\\mu"], µ: ["micro", "\\mu"], μ: ["micro", "\\mu"],
  m: ["milli", "m"], c: ["centi", "c"], D: ["deca", "da"], da: ["deca", "da"],
  h: ["hecto", "h"], k: ["kilo", "k"], M: ["mega", "M"], G: ["giga", "G"],
  T: ["tera", "T"], P: ["peta", "P"], E: ["exa", "E"], Z: ["zetta", "Z"],
  Y: ["yotta", "Y"], R: ["ronna", "R"], Q: ["quetta", "Q"],
}

/** Split a written unit into prefix and base, e.g. "km" → kilo + meter. */
function splitPrefixed(raw: string): { prefix: string; unit: string; short: string; literal: string } {
  if (UNITS[raw]) {
    const [macro, short] = UNITS[raw]
    return { prefix: "", unit: macro, short, literal: raw }
  }
  // Longest prefix first so "da" beats "d".
  for (const len of [2, 1]) {
    const p = raw.slice(0, len)
    const rest = raw.slice(len)
    if (PREFIXES[p] && UNITS[rest]) {
      const [pMacro, pShort] = PREFIXES[p]
      const [uMacro, uShort] = UNITS[rest]
      return { prefix: uMacro ? pMacro : "", unit: uMacro, short: pShort + uShort, literal: raw }
    }
  }
  return { prefix: "", unit: "", short: raw, literal: raw }
}

/**
 * Parse a unit expression into tokens. Understands `/` (everything after it
 * is inverted), `*` and spaces as products, and `^n` exponents.
 */
export function parseUnits(expr: string): UnitToken[] {
  const tokens: UnitToken[] = []
  let sign = 1
  for (const chunk of expr.split(/([/*\s])/)) {
    const piece = chunk.trim()
    if (!piece) continue
    if (piece === "/") { sign = -1; continue }
    if (piece === "*") continue
    const m = /^([A-Za-zµμ_]+)(?:\^?(-?\d+))?$/.exec(piece)
    if (!m) continue
    const exp = (m[2] ? parseInt(m[2], 10) : 1) * sign
    tokens.push({ ...splitPrefixed(m[1]), exp })
  }
  return tokens
}

const POWER_MACROS: Record<number, string> = {
  2: "\\squared", 3: "\\cubed", [-1]: "", [-2]: "\\squared", [-3]: "\\cubed",
}

/** siunitx unit macros, e.g. "\meter\per\second\squared". */
export function unitsToSiunitx(expr: string): string {
  const tokens = parseUnits(expr)
  let out = ""
  for (const t of tokens) {
    // A known unit becomes its macro (with its prefix macro in front);
    // anything else rides as upright text inside the siunitx argument.
    const prefixed = t.unit
      ? (t.prefix ? `\\${t.prefix}\\${t.unit}` : `\\${t.unit}`)
      : `\\text{${t.literal}}`
    if (t.exp < 0) {
      out += `\\per${prefixed}`
      const p = POWER_MACROS[t.exp]
      if (p) out += p
      else if (t.exp < -3) out += `\\tothe{${-t.exp}}`
    } else {
      out += prefixed
      if (t.exp === 2 || t.exp === 3) out += POWER_MACROS[t.exp]
      else if (t.exp > 3) out += `\\tothe{${t.exp}}`
    }
  }
  return out
}

/** Upright math for the preview, e.g. "\mathrm{m\,s^{-2}}". */
export function unitsToMath(expr: string): string {
  const tokens = parseUnits(expr)
  if (tokens.length === 0) return ""
  const parts = tokens.map((t) => {
    const base = t.short
    if (t.exp === 1) return base
    return `${base}^{${t.exp}}`
  })
  return `\\mathrm{${parts.join("\\,")}}`
}

/**
 * A quantity: number plus unit. siunitx v3 spells it `\qty`; `\SI` is the
 * v2 name kept as an alias, so `\qty` is the forward-looking choice.
 */
export function quantity(value: string, unit: string, target: UnitTarget): string {
  const v = value.trim()
  const u = unit?.trim() ?? ""
  if (target === "tex") {
    return u ? `\\qty{${v}}{${unitsToSiunitx(u)}}` : `\\num{${numberForTex(v)}}`
  }
  const mathUnit = u ? `\\,${unitsToMath(u)}` : ""
  return `${numberForPreview(v)}${mathUnit}`
}

/** siunitx reads `1.2e3` and `1.23(4)` natively; pass them through. */
function numberForTex(v: string): string {
  return v
}

/** Scientific notation and parenthesised uncertainty, rendered for KaTeX. */
export function numberForPreview(v: string): string {
  const value = v.trim()
  const sci = /^([+-]?[\d.]+)[eE]([+-]?\d+)$/.exec(value)
  if (sci) return `${sci[1]} \\times 10^{${parseInt(sci[2], 10)}}`
  // 1.23(4) is standard concise uncertainty notation; keep it upright.
  return value.replace(/\(/g, "(").replace(/\)/g, ")")
}
