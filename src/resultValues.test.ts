import { beforeEach, describe, expect, it } from "vitest"
import { expandValueRefs, findValueRefs, formatValue, parseValueFormat } from "./resultValues"
import { clearDatasetCache } from "./datasets"
import { resolveDocumentContent } from "./documentResolve"
import { preprocess } from "./preprocessor"
import { exportToTex } from "./exporter"
import { renderMarkdown } from "./renderer"

const STATS =
  "metric,value,ci\npvalue,0.0321,x\nn,48,\neffect,0.41736,\ntiny,0.0000123,\nname,ok,\nB4,key,\n"
const FIT = JSON.stringify({
  metrics: { auc: 0.91234, acc: "0.88" },
  folds: [{ acc: 0.5 }, { acc: 0.75 }],
})
const files: Record<string, string> = { "stats.csv": STATS, "fit.json": FIT }
const resolver = (t: string): string | null => files[t] ?? null
const DECL = ":::data{#data:stats}\nstats.csv\n:::\n\n:::data{#data:fit}\nfit.json\n:::\n\n"
const run = (body: string) => resolveDocumentContent(DECL + body, resolver).trim()

beforeEach(() => clearDatasetCache())

describe("formats", () => {
  it("parses the small grammar", () => {
    expect(parseValueFormat("3sf")).toEqual({ kind: "sf", digits: 3 })
    expect(parseValueFormat(".2f")).toEqual({ kind: "fixed", digits: 2 })
    expect(parseValueFormat(".2e")).toEqual({ kind: "sci", digits: 2 })
    expect(parseValueFormat("p")).toEqual({ kind: "p" })
    expect(parseValueFormat("value")).toBeNull()
    expect(parseValueFormat("0sf")).toBeNull()
  })
  it("formats numbers", () => {
    const f = (v: string, fmt: string, m = false) => formatValue(v, parseValueFormat(fmt)!, m)
    expect(f("0.41736", "3sf")).toBe("0.417")
    expect(f("0.05", "3sf")).toBe("0.0500")
    expect(f("123456", "3sf")).toBe("123000")
    expect(f("0.41736", ".2f")).toBe("0.42")
    expect(f("-0.001", ".1f")).toBe("0.0")
    expect(f("0.0000123", ".2e")).toBe("$1.23 \\times 10^{-5}$")
    expect(f("0.0000123", ".2e", true)).toBe("1.23 \\times 10^{-5}")
    expect(f("0.0321", "p")).toBe("$p = 0.032$")
    expect(f("0.0004", "p", true)).toBe("p < 0.001")
    expect(f("2", "p")).toBeNull()
    expect(f("abc", "3sf")).toBeNull()
  })
})

describe("findValueRefs", () => {
  it("skips code, single-argument calls and look-alikes", () => {
    const text = "`val(stats, n)` and\n```\nval(stats, n)\n```\nval(x) eval(a, b) val(stats, n)"
    expect(findValueRefs(text).map((r) => r.raw)).toEqual(["val(stats, n)"])
  })
})

describe("expandValueRefs through the document", () => {
  it("reads by row key, default column, named column and A1", () => {
    expect(run("p val(stats, pvalue)")).toBe("p 0.0321")
    expect(run("c val(stats, pvalue, ci)")).toBe("c x")
    expect(run("c val(stats, pvalue, C)")).toBe("c x")
    expect(run("n val(stats, B2)")).toBe("n 0.0321")
    expect(run("h val(stats, A1)")).toBe("h metric")
    expect(run('k val(stats, "B4")')).toBe("k key")
    expect(run("n = val(@data:stats, n)")).toBe("n = 48")
  })
  it("reads JSON by dotted path", () => {
    expect(run("val(fit, metrics.auc, 3sf)")).toBe("0.912")
    expect(run("val(fit, folds.1.acc)")).toBe("0.75")
    expect(run("val(fit, folds[0].acc, .2f)")).toBe("0.50")
    expect(run("val(fit, metrics.acc)")).toBe("0.88")
  })
  it("formats and wraps only when math is needed", () => {
    expect(run("(val(stats, pvalue, p))")).toBe("($p = 0.032$)")
    expect(run("$val(stats, pvalue, p)$")).toBe("$p = 0.032$")
    expect(run("x val(stats, tiny, .2e)")).toBe("x $1.23 \\times 10^{-5}$")
    expect(run("$d = val(stats, effect, 2sf)$")).toBe("$d = 0.42$")
  })
  it("composes with si()", () => {
    const resolved = run("si(val(stats, effect, 3sf), mg/L)")
    expect(resolved).toBe("si(0.417, mg/L)")
    expect(preprocess(resolved)).toBe(preprocess("si(0.417, mg/L)"))
  })
  it("leaves code alone", () => {
    expect(run("`val(stats, n)`")).toBe("`val(stats, n)`")
  })
  it("renders honest notes for what is missing", () => {
    expect(run("val(nope, n)")).toContain("no dataset with that name is declared")
    expect(run("val(stats, ghost)")).toContain("no value at ghost")
    expect(run("val(stats, name, 3sf)")).toContain('"ok" is not a number')
    expect(run("val(fit, metrics.zzz)")).toContain("no value at metrics.zzz")
    const gone = resolveDocumentContent(":::data{#data:s}\nmissing.csv\n:::\nval(s, n)", resolver)
    expect(gone).toContain("missing.csv: not found in this vault")
    const bad = resolveDocumentContent(":::data{#data:j}\nbad.json\n:::\nval(j, a)", (t) =>
      t === "bad.json" ? "{oops" : null,
    )
    expect(bad).toContain("bad.json: could not be read")
    expect(run("$val(stats, ghost)$")).toContain("\\text{[")
  })
  it("a note's own datasets resolve inside a transcluded note, the host's wait", () => {
    const r = (t: string) =>
      t === "chapter" ? "Chapter n = val(stats, n); host = val(hostset, n)" : resolver(t)
    const out = resolveDocumentContent(
      ":::data{#data:stats}\nstats.csv\n:::\n:::data{#data:hostset}\nstats.csv\n:::\n![[chapter]]",
      r,
    )
    expect(out).toContain("Chapter n = val(stats, n)".replace("val(stats, n)", "48"))
    expect(out).toContain("host = 48")
  })
  it("re-reads when the file content changes", () => {
    expect(run("val(stats, n)")).toBe("48")
    files["stats.csv"] = STATS.replace("n,48", "n,60")
    expect(run("val(stats, n)")).toBe("60")
    files["stats.csv"] = STATS
  })
  it("returns the text untouched without declarations to read", () => {
    expect(expandValueRefs("no refs here", new Map(), resolver)).toBe("no refs here")
  })
})

describe("preview and LaTeX export print the same numbers", () => {
  it("agree on every formatted value", () => {
    const body =
      "Effect val(stats, effect, 3sf), n = val(stats, n), $p$ is val(stats, pvalue, .3f), auc val(fit, metrics.auc, 2sf)."
    const resolved = resolveDocumentContent(DECL + body, resolver)
    const html = renderMarkdown(DECL + body, {}, undefined, undefined, undefined, resolver)
    const tex = exportToTex(resolved, "", "T")
    for (const n of ["0.417", "48", "0.032", "0.91"]) {
      expect(html).toContain(n)
      expect(tex).toContain(n)
    }
    expect(tex).not.toContain("val(")
    expect(html).not.toContain("val(")
  })
})
