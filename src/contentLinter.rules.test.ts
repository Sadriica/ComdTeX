import { describe, it, expect } from "vitest"
import {
  ENV_REF_KINDS,
  KNOWN_BLOCK_TYPES,
  LINT_CODES,
  lintContent,
  lintFile,
  scanLintLabels,
  stripCode,
  wikilinkResolves,
  type LintContext,
  type LintVaultDoc,
} from "./contentLinter"
import { LintVaultIndex } from "./lintVault"
import { ALL_ENVS, ENV_REF_PREFIXES } from "./environments"
import { processWikilinks } from "./wikilinks"
import { en } from "./i18n/en"
import { es } from "./i18n/es"

const Severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkerSeverity = Severity as any

const base: LintContext = { vaultFileNames: new Set(), bibKeys: new Set() }

function lint(text: string, ctx: Partial<LintContext> = {}) {
  return lintContent(text, { ...base, ...ctx }, MarkerSeverity)
}
function codes(text: string, ctx: Partial<LintContext> = {}): string[] {
  return lint(text, ctx).map((m) => String(m.code))
}
function only(code: string, text: string, ctx: Partial<LintContext> = {}) {
  return lint(text, ctx).filter((m) => m.code === code)
}

function doc(path: string, content: string): LintVaultDoc {
  const index = new LintVaultIndex()
  return index.update([{ path, name: path.split("/").pop()!, content }])[0]
}
function docs(files: Record<string, string>): LintVaultDoc[] {
  const index = new LintVaultIndex()
  return [
    ...index.update(
      Object.entries(files).map(([path, content]) => ({
        path,
        name: path.split("/").pop()!,
        content,
      })),
    ),
  ]
}

// ── Marker contract ───────────────────────────────────────────────────────────

describe("marker contract", () => {
  it("every marker carries a stable code and the comdtex source", () => {
    const markers = lint("$$x\n:::theorem\n@eq:nope [[gone]] frac(a")
    expect(markers.length).toBeGreaterThan(0)
    for (const m of markers) {
      expect(LINT_CODES).toContain(m.code)
      expect(m.source).toBe("comdtex")
    }
  })

  it("keeps the environment reference prefixes in step with environments.ts", () => {
    expect([...ENV_REF_KINDS].sort()).toEqual(Object.keys(ENV_REF_PREFIXES).sort())
  })

  it("knows every environment type the renderer knows", () => {
    for (const name of Object.keys(ALL_ENVS)) expect(KNOWN_BLOCK_TYPES).toContain(name)
  })

  it("translates every message through the table it is given", () => {
    const text = [
      "$$open",
      ":::theorem",
      ":::weird",
      "@thm:nope @doc@thm:x @nodoc@thm:x [[gone]] [@lost] frac(a",
      "frac(a)",
      "| a | b |",
      "|---|---|",
      "| 1 |",
      "{{?}}",
      "Note[^orphan] and ![x](missing.png) and $\\nope$",
      "{#eq:dup} {#eq:dup}",
      "[^unused]: text",
      "@data:nothing {#data:d} {#data:d}",
    ].join("\n")
    const ctxFor = (messages: LintContext["messages"]): Partial<LintContext> => ({
      messages,
      vaultFileNames: new Set(["other"]),
      bibKeys: new Set(["known"]),
      docPath: "/v/a.md",
      vaultPath: "/v",
      vaultFilePaths: new Set(["/v/other.md"]),
      vaultDocs: docs({ "/v/doc.md": "{#thm:y}" }),
    })
    const spanish = lint(text, ctxFor(es.lint.messages))
    const english = lint(text, ctxFor(en.lint.messages))
    expect(spanish.map((m) => m.code)).toEqual(english.map((m) => m.code))
    const seen = new Set(english.map((m) => String(m.code)))
    for (const code of [
      "display-math-unclosed",
      "env-unclosed",
      "env-unknown-type",
      "ref-undefined",
      "ref-doc-missing",
      "ref-label-missing",
      "wikilink-missing",
      "cite-undefined",
      "shorthand-unclosed",
      "table-ragged",
      "gap-pending",
      "footnote-undefined",
      "footnote-unused",
      "label-duplicate",
      "image-missing",
      "math-parse-error",
      "data-duplicate",
      "data-undeclared",
    ]) {
      expect(seen, code).toContain(code)
    }
    // The two tables really differ: nothing is left hard-coded in one language.
    english.forEach((m, i) => expect(m.message).not.toBe(spanish[i].message))
  })

  it("translates the bib and macros linters", () => {
    const bib = "@article{a, title={t}}\n@article{a, title={t}}\n@weird{b,}\n@book{c,"
    const mac = "\\newcommand{\\a}{1}\n\\newcommand{\\a}{2}\nstray line\n}"
    for (const [text, name] of [
      [bib, "references.bib"],
      [mac, "macros.md"],
    ] as const) {
      const spanish = lintFile(text, name, { ...base, messages: es.lint.messages }, MarkerSeverity)
      const english = lintFile(text, name, { ...base, messages: en.lint.messages }, MarkerSeverity)
      expect(spanish.length).toBeGreaterThan(2)
      english.forEach((m, i) => {
        expect(m.code).toBe(spanish[i].code)
        expect(m.message).not.toBe(spanish[i].message)
      })
    }
  })
})

// ── Structural references ─────────────────────────────────────────────────────

describe("structural references", () => {
  it("flags an undefined @thm: and accepts a defined one", () => {
    expect(only("ref-undefined", "See @thm:main.")).toHaveLength(1)
    expect(
      only("ref-undefined", ":::theorem[T]{#thm:main}\nx\n:::\n\nSee @thm:main."),
    ).toHaveLength(0)
  })

  it("covers every structural kind", () => {
    for (const [ref, label] of [
      ["@eq:e", "{#eq:e}"],
      ["@fig:f", "![c](a.png){#fig:f}"],
      ["@tbl:t", "{#tbl:t}"],
      ["@lem:l", "{#lem:l}"],
      ["@cor:c", "{#cor:c}"],
      ["@prop:p", "{#prop:p}"],
      ["@def:d", "{#def:d}"],
      ["@ex:x", "{#ex:x}"],
      ["@exc:y", "{#exc:y}"],
    ]) {
      expect(only("ref-undefined", `Use ${ref}.`), ref).toHaveLength(1)
      expect(only("ref-undefined", `${label}\n\nUse ${ref}.`), ref).toHaveLength(0)
    }
  })

  it("resolves @sec: against explicit labels and heading slugs", () => {
    expect(only("ref-undefined", "See @sec:nowhere.")).toHaveLength(1)
    expect(only("ref-undefined", "# Intro {#sec:intro}\n\nSee @sec:intro.")).toHaveLength(0)
    expect(only("ref-undefined", "# Intro {#sec:intro}\n\nSee @sec:sec:intro.")).toHaveLength(0)
    expect(only("ref-undefined", "## Mixing times\n\nSee @sec:mixing-times.")).toHaveLength(0)
  })

  it("ignores numeric references, code and look-alikes", () => {
    expect(codes("@eq:1 and @fig:2")).toEqual([])
    expect(codes("`@thm:x`\n\n```\n@thm:y\n```")).toEqual([])
    // Not structural kinds: email-like, ssh-like and BibTeX keys with a colon.
    expect(codes("mail a@b.com or user@host:path or [@smith:2020]")).toEqual([])
    expect(
      only("ref-undefined", "[@smith:2020]", { bibKeys: new Set(["smith:2020"]) }),
    ).toHaveLength(0)
  })

  it("accepts a label defined in a transcluded note", () => {
    const vaultDocs = docs({ "/v/a.md": "![[b]]", "/v/b.md": "$$x$$ {#eq:inner}" })
    const text = "![[b]]\n\nSee @eq:inner."
    expect(only("ref-undefined", text, { vaultDocs, docPath: "/v/a.md" })).toHaveLength(0)
    // Without the embed the label lives in another note: reported as such.
    expect(codes("See @eq:inner.", { vaultDocs, docPath: "/v/a.md" })).toEqual(["ref-other-note"])
  })

  it("follows transclusions through a chain", () => {
    const vaultDocs = docs({
      "/v/a.md": "![[b]]",
      "/v/b.md": "![[c]]",
      "/v/c.md": ":::lemma{#lem:deep}\nx\n:::",
    })
    expect(
      only("ref-undefined", "![[b]]\n@lem:deep", { vaultDocs, docPath: "/v/a.md" }),
    ).toHaveLength(0)
  })

  it("survives circular transclusions", () => {
    const vaultDocs = docs({ "/v/a.md": "![[b]]", "/v/b.md": "![[a]]" })
    expect(() => lint("![[b]] @eq:x", { vaultDocs, docPath: "/v/a.md" })).not.toThrow()
  })

  it("stays quiet about refs while the vault is loading and the text embeds a note", () => {
    expect(only("ref-undefined", "![[b]]\n@eq:inner")).toHaveLength(0)
    expect(only("ref-undefined", "@eq:inner")).toHaveLength(1)
  })

  it("explains a label that exists only in another note", () => {
    const vaultDocs = docs({
      "/v/a.md": "x",
      "/v/b.md": ":::theorem{#thm:far}\nx\n:::\n$$y$$ {#eq:far}",
    })
    const ctx = { vaultDocs, docPath: "/v/a.md", messages: en.lint.messages }
    const env = only("ref-other-note", "@thm:far", ctx)
    expect(env).toHaveLength(1)
    expect(env[0].message).toContain("@path@kind:name")
    const eq = only("ref-other-note", "@eq:far", ctx)
    expect(eq).toHaveLength(1)
    expect(eq[0].message).not.toContain("@path@kind:name")
  })

  it("resolves @path@kind:name by path and by label, as separate codes", () => {
    const vaultDocs = docs({ "/v/a.md": "x", "/v/gp/cal.md": ":::definition{#def:ok}\nx\n:::" })
    const ctx = { vaultDocs, docPath: "/v/a.md" }
    expect(codes("@gp/cal@def:ok", ctx)).toEqual([])
    expect(codes("@[gp/cal]@def:ok", ctx)).toEqual([])
    expect(codes("@cal@def:ok", ctx)).toEqual([])
    expect(codes("@gp/nope@def:ok", ctx)).toEqual(["ref-doc-missing"])
    expect(codes("@gp/cal@def:gone", ctx)).toEqual(["ref-label-missing"])
  })

  it("does not lint the inner @eq:x of a cross-file reference as a local one", () => {
    const vaultDocs = docs({ "/v/a.md": "x", "/v/b.md": "y" })
    expect(codes("see @b@eq:x here", { vaultDocs, docPath: "/v/a.md" })).toEqual([])
    expect(codes("see @b@thm:x here", { vaultDocs, docPath: "/v/a.md" })).toEqual([
      "ref-label-missing",
    ])
  })

  it("marks the whole reference, including the cross-file path", () => {
    const m = only("ref-undefined", "ab @thm:zz.")[0]
    expect(m.startColumn).toBe(4)
    expect(m.endColumn).toBe(11)
  })

  it("scanLintLabels reads literal labels and heading ids", () => {
    const labels = scanLintLabels("# A title {#sec:a}\n\n## Other one\n\n{#thm:x}")
    expect([...labels].sort()).toEqual(["sec:a", "sec:other-one", "sec:sec:a", "thm:x"])
  })
})

// ── Unknown ::: types ─────────────────────────────────────────────────────────

describe("unknown block types", () => {
  it("flags an unknown :::type", () => {
    const found = only("env-unknown-type", ":::theorm\nx\n:::")
    expect(found).toHaveLength(1)
    expect(found[0].message).toBe(es.lint.messages.envUnknownType("theorm"))
  })

  it("accepts every environment, special block, size prefix and mixed case", () => {
    for (const name of KNOWN_BLOCK_TYPES) {
      expect(only("env-unknown-type", `:::${name}\nx\n:::`), name).toHaveLength(0)
    }
    expect(only("env-unknown-type", ":::sm theorem\nx\n:::")).toHaveLength(0)
    expect(only("env-unknown-type", ":::lg lemma[T]\nx\n:::")).toHaveLength(0)
    expect(only("env-unknown-type", ":::Theorem\nx\n:::")).toHaveLength(0)
    expect(only("env-unknown-type", ":::code python\nx\n:::")).toHaveLength(0)
  })

  it("places the marker on the opening token even when indented", () => {
    const m = only("env-unclosed", "  :::theorem\nbody")[0]
    expect(m.startColumn).toBe(3)
  })
})

// ── Footnotes ─────────────────────────────────────────────────────────────────

describe("footnotes", () => {
  it("flags a reference without a definition", () => {
    expect(only("footnote-undefined", "Claim[^a].")).toHaveLength(1)
  })
  it("flags a definition nobody uses (Info)", () => {
    const m = only("footnote-unused", "[^a]: text")
    expect(m).toHaveLength(1)
    expect(m[0].severity).toBe(Severity.Info)
  })
  it("accepts matched pairs in any order", () => {
    expect(codes("Claim[^a].\n\n[^a]: text")).toEqual([])
    expect(codes("[^a]: text\n\nClaim[^a].")).toEqual([])
  })
  it("ignores code, math and special blocks", () => {
    expect(codes("`x[^a]`\n\n```\n[^b]\n```\n\n:::code\n[^c]\n:::")).toEqual([])
  })
})

// ── Duplicate labels ──────────────────────────────────────────────────────────

describe("duplicate labels", () => {
  it("flags the second definition only", () => {
    const m = only("label-duplicate", "{#eq:a}\n\n{#eq:b}\n\n{#eq:a}")
    expect(m).toHaveLength(1)
    expect(m[0].startLineNumber).toBe(5)
  })
  it("accepts distinct labels and defers {#data:} duplicates to the dataset rule", () => {
    expect(only("label-duplicate", "{#eq:a} {#eq:b}")).toHaveLength(0)
    expect(only("label-duplicate", "{#data:x} {#data:x}")).toHaveLength(0)
    expect(only("data-duplicate", "{#data:x} {#data:x}")).toHaveLength(1)
  })
  it("ignores labels inside code", () => {
    expect(only("label-duplicate", "`{#eq:a}` `{#eq:a}`")).toHaveLength(0)
  })
})

// ── Images ────────────────────────────────────────────────────────────────────

describe("images", () => {
  const ctx = {
    docPath: "/v/papers/p.md",
    vaultPath: "/v",
    vaultFilePaths: new Set(["/v/papers/fig/a.png", "/v/shared/b.png", "/v/papers/p.md"]),
  }
  it("flags a local image that does not exist", () => {
    expect(only("image-missing", "![x](fig/zz.png)", ctx)).toHaveLength(1)
  })
  it("resolves next to the document first, then from the vault root", () => {
    expect(only("image-missing", "![x](fig/a.png)", ctx)).toHaveLength(0)
    expect(only("image-missing", "![x](shared/b.png)", ctx)).toHaveLength(0)
    expect(only("image-missing", "![x](../shared/b.png)", ctx)).toHaveLength(0)
  })
  it("understands titles, angle brackets, queries and percent-encoding", () => {
    expect(only("image-missing", '![x](fig/a.png "A title")', ctx)).toHaveLength(0)
    expect(only("image-missing", "![x](<fig/a.png>)", ctx)).toHaveLength(0)
    expect(only("image-missing", "![x](fig/a.png?raw=1)", ctx)).toHaveLength(0)
    expect(only("image-missing", "![x](fig/%61.png)", ctx)).toHaveLength(0)
  })
  it("ignores remote and inline images, code, and a vault that is not indexed yet", () => {
    expect(
      only("image-missing", "![x](https://e.com/a.png) ![y](data:image/png;base64,AAA)", ctx),
    ).toHaveLength(0)
    expect(only("image-missing", "`![x](gone.png)`", ctx)).toHaveLength(0)
    expect(
      only("image-missing", "![x](gone.png)", { ...ctx, vaultFilePaths: new Set() }),
    ).toHaveLength(0)
    expect(
      only("image-missing", "![x](gone.png)", { ...ctx, vaultFilePaths: undefined }),
    ).toHaveLength(0)
  })
})

// ── KaTeX parse errors ────────────────────────────────────────────────────────

describe("math parse errors", () => {
  it("flags an undefined control sequence in inline and display math", () => {
    expect(only("math-parse-error", "Take $\\notacommand$ here.")).toHaveLength(1)
    expect(only("math-parse-error", "$$\n\\notacommand\n$$")).toHaveLength(1)
    expect(only("math-parse-error", "$\\frac{1}{$")).toHaveLength(1)
  })
  it("cleans the message (no KaTeX prefix, no caret context)", () => {
    const m = only("math-parse-error", "$\\notacommand$")[0]
    expect(m.message).toBe(es.lint.messages.mathError("Undefined control sequence: \\notacommand"))
  })
  it("accepts valid math, shorthands and mhchem", () => {
    expect(only("math-parse-error", "$x^2 + \\alpha$ and $$\\int_0^1 f$$")).toHaveLength(0)
    expect(
      only("math-parse-error", "Use $frac(a, b)$ and $sqrt(x)$ and $sum(i=1, n)$"),
    ).toHaveLength(0)
    expect(only("math-parse-error", "frac(a, b) outside math")).toHaveLength(0)
    expect(only("math-parse-error", "$\\ce{H2O}$")).toHaveLength(0)
  })
  it("knows the user's macros", () => {
    expect(only("math-parse-error", "$\\RR$")).toHaveLength(1)
    expect(only("math-parse-error", "$\\RR$", { macros: { "\\RR": "\\mathbb{R}" } })).toHaveLength(
      0,
    )
    // The cache must not remember the verdict from before the macros arrived.
    expect(only("math-parse-error", "$\\RR$")).toHaveLength(1)
  })
  it("ignores escaped dollars, code, frontmatter and special blocks", () => {
    expect(only("math-parse-error", "It costs \\$5 and \\$\\bad")).toHaveLength(0)
    expect(only("math-parse-error", "`$\\bad$`")).toHaveLength(0)
    expect(only("math-parse-error", "```\n$\\bad$\n```")).toHaveLength(0)
    expect(only("math-parse-error", "---\ntitle: $\\bad$\n---\n\ntext")).toHaveLength(0)
    expect(only("math-parse-error", ":::pseudocode\nx <- $\\bad$\n:::")).toHaveLength(0)
  })
  it("marks the whole span", () => {
    const m = only("math-parse-error", "ab $\\bad$ cd")[0]
    expect(m.startColumn).toBe(4)
    expect(m.endColumn).toBe(10)
  })
})

// ── Citations ─────────────────────────────────────────────────────────────────

describe("citation markers", () => {
  const ctx = { bibKeys: new Set(["known"]) }
  it("puts one marker per missing key, each on its own @key token", () => {
    const text = "x [@aa; @known; @bb, p. 3] y"
    const m = only("cite-undefined", text, ctx)
    expect(m).toHaveLength(2)
    expect(text.slice(m[0].startColumn - 1, m[0].endColumn - 1)).toBe("@aa")
    expect(text.slice(m[1].startColumn - 1, m[1].endColumn - 1)).toBe("@bb")
  })
  it("does not repeat a marker on the same range", () => {
    const m = only("cite-undefined", "[@aa; @bb]", ctx)
    const ranges = new Set(m.map((x) => `${x.startColumn}-${x.endColumn}`))
    expect(ranges.size).toBe(m.length)
  })
  it("leaves a fully known group alone", () => {
    expect(only("cite-undefined", "[@known; @known]", ctx)).toHaveLength(0)
  })
})

// ── Wikilinks ─────────────────────────────────────────────────────────────────

describe("wikilink resolution parity", () => {
  const names = new Set(["growth", "mixing-times", "my note"])
  const samples = [
    "growth",
    "Growth",
    "  growth ",
    "folder/growth",
    "growth.md",
    "mixing-times",
    "My Note",
    "missing",
    "a/b",
  ]
  it("agrees with processWikilinks on every sample", () => {
    for (const target of samples) {
      const html = processWikilinks(`[[${target}]]`, names)
      const brokenInApp = html.includes("wikilink-broken")
      expect(wikilinkResolves(target, names), target).toBe(!brokenInApp)
      const flagged =
        only("wikilink-missing", `[[${target}]]`, { vaultFileNames: names }).length > 0
      expect(flagged, target).toBe(brokenInApp)
    }
  })
  it("treats [[folder/note]] like the app: the whole target is the name", () => {
    expect(only("wikilink-missing", "[[folder/growth]]", { vaultFileNames: names })).toHaveLength(1)
  })
  it("ignores [[toc]], aliases and headings", () => {
    expect(codes("[[toc]]", { vaultFileNames: names })).toEqual([])
    expect(codes("[[growth#Intro|the growth note]]", { vaultFileNames: names })).toEqual([])
  })
})

// ── Code stripping ────────────────────────────────────────────────────────────

describe("stripCode offsets", () => {
  it("keeps the length and the newlines", () => {
    const text = "😀 a `b` c\n```js\nx\n```\nend"
    const out = stripCode(text)
    expect(out).toHaveLength(text.length)
    expect(out.split("\n")).toHaveLength(text.split("\n").length)
  })

  it("masks a fence that follows astral characters (code-point indexing used to shift it)", () => {
    const emoji = "😀".repeat(12)
    const text = `${emoji}\n\n\`\`\`\n$$never closed\n\`\`\`\n\nplain text after the fence`
    expect(only("display-math-unclosed", text)).toHaveLength(0)
    expect(stripCode(text)).toContain("plain text after the fence")
    expect(stripCode(text)).not.toContain("never closed")
  })

  it("reports a marker on the right line after astral characters", () => {
    const text = `${"😀".repeat(8)} line one\nfrac(a`
    const m = only("shorthand-unclosed", text)[0]
    expect(m.startLineNumber).toBe(2)
    expect(m.startColumn).toBe(1)
  })

  it("also masks ~~~ fences like the renderer", () => {
    expect(only("display-math-unclosed", "~~~\n$$open\n~~~")).toHaveLength(0)
  })
})

// ── The vault index ───────────────────────────────────────────────────────────

describe("LintVaultIndex", () => {
  it("rescans only the files whose text changed", () => {
    const index = new LintVaultIndex()
    const files = [
      { path: "/v/a.md", name: "a.md", content: "{#eq:a}" },
      { path: "/v/b.md", name: "b.md", content: "{#eq:b}" },
    ]
    index.update(files)
    expect(index.lastScannedCount).toBe(2)
    index.update(files)
    expect(index.lastScannedCount).toBe(0)
    index.update([files[0], { ...files[1], content: "{#eq:b} more" }])
    expect(index.lastScannedCount).toBe(1)
  })

  it("keeps the same array while no document's labels change (typing prose)", () => {
    const index = new LintVaultIndex()
    const first = index.update([{ path: "/v/a.md", name: "a.md", content: "{#eq:a} text" }])
    const typed = index.update([{ path: "/v/a.md", name: "a.md", content: "{#eq:a} text more" }])
    expect(typed).toBe(first)
    const relabelled = index.update([{ path: "/v/a.md", name: "a.md", content: "{#eq:z} text" }])
    expect(relabelled).not.toBe(first)
    expect(relabelled[0].labels.has("eq:z")).toBe(true)
  })

  it("drops removed files and indexes transclusions", () => {
    const index = new LintVaultIndex()
    const one = index.update([
      { path: "/v/a.md", name: "a.md", content: "![[b#Intro]] and `![[code]]`" },
      { path: "/v/b.md", name: "b.md", content: "x" },
    ])
    expect(one[0].embeds).toEqual(["b"])
    const two = index.update([{ path: "/v/b.md", name: "b.md", content: "x" }])
    expect(two).toHaveLength(1)
    expect(doc("/v/z.md", "{#thm:q}").labels.has("thm:q")).toBe(true)
  })
})
