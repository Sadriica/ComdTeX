import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  buildEnvHTML,
  extractEnvironments,
  resetEnvCounters,
  NUMBERED_ENVS,
  UNNUMBERED_ENVS,
  prescanEnvironmentLabels,
  resolveEnvironmentRefs,
  clearEnvRefCache,
  envRefCacheStats,
} from "./environments"

beforeEach(() => {
  resetEnvCounters()
})

// ── buildEnvHTML ──────────────────────────────────────────────────────────────

describe("buildEnvHTML", () => {
  it("wraps numbered env in math-env divs", () => {
    const html = buildEnvHTML("theorem", "", "1", "<p>Content</p>")
    expect(html).toContain('class="math-env math-env-theorem"')
    expect(html).toContain('class="math-env-body"')
    expect(html).toContain("<p>Content</p>")
  })

  it("includes label with env name and number", () => {
    const html = buildEnvHTML("theorem", "", "3", "body")
    expect(html).toContain("Teorema 3")
  })

  it("includes title in parentheses when provided", () => {
    const html = buildEnvHTML("theorem", "Pitágoras", "1", "body")
    expect(html).toContain("(Pitágoras)")
  })

  it("escapes HTML in title", () => {
    const html = buildEnvHTML("theorem", "<script>", "1", "body")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("adds □ QED marker for proof env", () => {
    const html = buildEnvHTML("proof", "", "", "Proof content")
    expect(html).toContain('class="math-env-qed"')
    expect(html).toContain("□")
  })

  it("does not add QED marker for non-proof envs", () => {
    const html = buildEnvHTML("theorem", "", "1", "body")
    expect(html).not.toContain("□")
  })

  it("returns innerHTML unchanged for unknown env", () => {
    const html = buildEnvHTML("unknown", "", "", "<p>body</p>")
    expect(html).toBe("<p>body</p>")
  })

  it("applies size class for sm/lg prefix", () => {
    const html = buildEnvHTML("theorem", "", "1", "body", "sm")
    expect(html).toContain("math-env-sm")
  })

  it("all numbered envs render with a number", () => {
    for (const name of Object.keys(NUMBERED_ENVS)) {
      const html = buildEnvHTML(name, "", "5", "body")
      expect(html).toContain("5")
    }
  })

  it("unnumbered envs don't include a number in label", () => {
    for (const name of Object.keys(UNNUMBERED_ENVS)) {
      const html = buildEnvHTML(name, "", "", "body")
      // No lone digit in the label
      const label = html.match(/class="math-env-label">([^<]*)</)?.[1] ?? ""
      expect(/\d/.test(label)).toBe(false)
    }
  })
})

// ── extractEnvironments ───────────────────────────────────────────────────────

const identity = (s: string) => s

describe("extractEnvironments", () => {
  it("extracts a simple environment", () => {
    const text = ":::theorem\nContent\n:::"
    const { text: out, slots } = extractEnvironments(text, identity)
    expect(slots).toHaveLength(1)
    expect(slots[0]).toContain("math-env-theorem")
    expect(out).toContain("\x02ENV0\x03")
  })

  it("auto-numbers theorem on each call", () => {
    const text = ":::theorem\nA\n:::\n:::theorem\nB\n:::"
    const { slots } = extractEnvironments(text, identity)
    expect(slots[0]).toContain("Teorema 1")
    expect(slots[1]).toContain("Teorema 2")
  })

  it("resets numbering between renders (via resetEnvCounters)", () => {
    extractEnvironments(":::theorem\nA\n:::", identity)
    resetEnvCounters()
    const { slots } = extractEnvironments(":::theorem\nB\n:::", identity)
    expect(slots[0]).toContain("Teorema 1")
  })

  it("handles env with title", () => {
    const text = ":::definition[Función continua]\nDefinition body\n:::"
    const { slots } = extractEnvironments(text, identity)
    expect(slots[0]).toContain("Función continua")
  })

  it("handles sm/lg size prefix", () => {
    const text = ":::sm theorem\nSmall theorem\n:::"
    const { slots } = extractEnvironments(text, identity)
    expect(slots[0]).toContain("math-env-sm")
  })

  it("handles unknown env type by leaving it unchanged", () => {
    const text = ":::unknown\nContent\n:::"
    const { text: out, slots } = extractEnvironments(text, identity)
    expect(slots).toHaveLength(0)
    expect(out).toContain(":::unknown")
  })

  it("multiple sibling environments at the same level", () => {
    const text = ":::theorem\nA\n:::\n:::lemma\nB\n:::"
    const { slots } = extractEnvironments(text, identity)
    expect(slots).toHaveLength(2)
    expect(slots[0]).toContain("math-env-theorem")
    expect(slots[1]).toContain("math-env-lemma")
  })

  it("passes inner content through renderFn", () => {
    const upper = (s: string) => s.toUpperCase()
    const text = ":::theorem\nhello world\n:::"
    const { slots } = extractEnvironments(text, upper)
    expect(slots[0]).toContain("HELLO WORLD")
  })

  it("unnumbered envs (proof, remark, note) get no number", () => {
    for (const name of Object.keys(UNNUMBERED_ENVS)) {
      resetEnvCounters()
      const { slots } = extractEnvironments(`:::${name}\nContent\n:::`, identity)
      const label = slots[0].match(/class="math-env-label">([^<]*)</)?.[1] ?? ""
      expect(/\d/.test(label)).toBe(false)
    }
  })

  it("text outside environments is preserved", () => {
    const text = "Before.\n:::theorem\nContent\n:::\nAfter."
    const { text: out } = extractEnvironments(text, identity)
    expect(out).toContain("Before.")
    expect(out).toContain("After.")
  })

  it("returns empty slots and original text when no envs found", () => {
    const text = "Just regular text."
    const { text: out, slots } = extractEnvironments(text, identity)
    expect(slots).toHaveLength(0)
    expect(out).toBe(text)
  })
})

describe("environment labels", () => {
  it("prescans labeled environments and resolves references", () => {
    const source = ":::theorem[Principal]{#thm:main}\nContenido\n:::\n\nVer @thm:main"
    const labels = prescanEnvironmentLabels(source)

    expect(labels.get("thm:main")?.number).toBe("1")
    expect(resolveEnvironmentRefs("Ver @thm:main", labels)).toContain("Teorema 1")
  })

  it("handles duplicate labels: first wins, second gets suffixed id, dupes warn", () => {
    const source =
      ":::theorem {#thm:foo}\nFirst\n:::\n:::theorem {#thm:foo}\nSecond\n:::\n@thm:foo"

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      // Both theorems render; first keeps id="env-thm:foo", second gets "-2".
      const { slots } = extractEnvironments(source, identity)
      expect(slots).toHaveLength(2)
      expect(slots[0]).toContain('id="env-thm:foo"')
      expect(slots[1]).toContain('id="env-thm:foo-2"')
      // Sanity: no collision (slot 0 must NOT carry the suffixed id).
      expect(slots[0]).not.toContain('id="env-thm:foo-2"')

      // Reference resolves to the FIRST occurrence (number 1, anchor #env-thm:foo).
      const labels = prescanEnvironmentLabels(source)
      expect(warn).toHaveBeenCalledWith("Duplicate environment label: thm:foo")
      expect(labels.get("thm:foo")?.number).toBe("1")
      const refHtml = resolveEnvironmentRefs("@thm:foo", labels)
      expect(refHtml).toContain('href="#env-thm:foo"')
      expect(refHtml).toContain("Teorema 1")
    } finally {
      warn.mockRestore()
    }
  })
})

describe("cross-file environment references", () => {
  // A target document whose THIRD definition carries the label we reference,
  // so the test fails if resolution invents a number instead of prescanning.
  const calendario = [
    ":::definition[Uno]{#def:uno}\na\n:::",
    ":::definition[Dos]{#def:dos}\nb\n:::",
    ":::definition[Valor integrado]{#def:valor}\nc\n:::",
    ":::theorem[Central]{#thm:central}\nd\n:::",
  ].join("\n\n")

  const vault: Record<string, string> = {
    "gp/calendario": calendario,
    "mi carpeta/mi nota": ":::lemma[Clave]{#lem:clave}\nx\n:::",
  }
  const resolver = (docPath: string): string | null => vault[docPath] ?? null

  const noLocals = new Map()

  beforeEach(() => clearEnvRefCache())

  it("resolves a bare vault-relative path ref to the target's own numbering", () => {
    const html = resolveEnvironmentRefs("Como vimos en @gp/calendario@def:valor", noLocals, resolver)
    expect(html).toContain("Definición 3")
    expect(html).toContain('data-target="gp/calendario"')
    expect(html).toContain('data-env-label="def:valor"')
    expect(html).toContain('href="#env-def:valor"')
    expect(html).toContain("env-ref-cross")
    // The literal path must be consumed, not left as stray prose.
    expect(html).not.toContain("@gp/calendario")
  })

  it("resolves the bracketed escape form when the path has spaces", () => {
    const html = resolveEnvironmentRefs("Ver @[mi carpeta/mi nota]@lem:clave", noLocals, resolver)
    expect(html).toContain("Lema 1")
    expect(html).toContain('data-target="mi carpeta/mi nota"')
    expect(html).not.toContain("mi carpeta/mi nota]@")
  })

  it("counts each environment type independently across files", () => {
    const html = resolveEnvironmentRefs("@gp/calendario@thm:central y @gp/calendario@def:dos", noLocals, resolver)
    expect(html).toContain("Teorema 1")
    expect(html).toContain("Definición 2")
  })

  it("does NOT let the inner @def:valor of a cross-file ref win", () => {
    // The old local-only regex matched the inner `@def:valor` and rendered a
    // broken LOCAL ref while leaving `@gp/calendario` as prose. Guard that.
    const html = resolveEnvironmentRefs("@gp/calendario@def:valor", noLocals, resolver)
    expect(html).not.toContain("env-ref-broken")
    expect(html).toContain("Definición 3")

    // Same document, no resolver at all: still must not degrade into a local
    // lookup: it degrades into a BROKEN CROSS ref.
    const noResolver = resolveEnvironmentRefs("@gp/calendario@def:valor", noLocals)
    expect(noResolver).toBe('<span class="env-ref-broken">Definición (?)</span>')
  })

  it("leaves plain local refs untouched", () => {
    const labels = prescanEnvironmentLabels(":::definition[L]{#def:local}\nx\n:::")
    const html = resolveEnvironmentRefs("@def:local", labels, resolver)
    expect(html).toContain("Definición 1")
    expect(html).toContain('href="#env-def:local"')
    expect(html).not.toContain("env-ref-cross")
  })

  it("renders a broken ref when the file is missing", () => {
    const html = resolveEnvironmentRefs("@no/such/doc@def:valor", noLocals, resolver)
    expect(html).toBe('<span class="env-ref-broken">Definición (?)</span>')
  })

  it("renders a broken ref when the label is missing from an existing file", () => {
    const html = resolveEnvironmentRefs("@gp/calendario@def:ausente", noLocals, resolver)
    expect(html).toBe('<span class="env-ref-broken">Definición (?)</span>')
  })

  it("ignores an unknown ref prefix rather than mangling it", () => {
    const html = resolveEnvironmentRefs("@gp/calendario@zzz:valor", noLocals, resolver)
    expect(html).toBe("@gp/calendario@zzz:valor")
  })

  it("does not throw when the resolver throws", () => {
    const boom = () => { throw new Error("disk on fire") }
    expect(() => resolveEnvironmentRefs("@gp/calendario@def:valor", noLocals, boom)).not.toThrow()
    expect(resolveEnvironmentRefs("@gp/calendario@def:valor", noLocals, boom)).toContain("env-ref-broken")
  })

  it("escapes HTML in the doc path so a ref cannot inject markup", () => {
    const evil: Record<string, string> = { '"><img src=x>': ":::definition{#def:x}\na\n:::" }
    const html = resolveEnvironmentRefs('@["><img src=x>]@def:x', noLocals, (p) => evil[p] ?? null)
    expect(html).not.toContain("<img")
    expect(html).toContain("&quot;&gt;&lt;img")
  })

  // ── Cache behaviour (the per-keystroke performance contract) ──────────────

  it("prescans a target document only ONCE across many renders", () => {
    expect(envRefCacheStats().prescans).toBe(0)

    // Simulate the typing debounce firing 50 times with the doc unchanged.
    for (let i = 0; i < 50; i++) {
      const html = resolveEnvironmentRefs("@gp/calendario@def:valor", noLocals, resolver)
      expect(html).toContain("Definición 3")
    }
    expect(envRefCacheStats().prescans).toBe(1)
  })

  it("prescans once per document, not once per reference", () => {
    resolveEnvironmentRefs(
      "@gp/calendario@def:uno @gp/calendario@def:dos @gp/calendario@thm:central",
      noLocals,
      resolver,
    )
    expect(envRefCacheStats().prescans).toBe(1)
  })

  it("re-prescans when the target document's content actually changes", () => {
    const mutable: Record<string, string> = { doc: ":::definition{#def:a}\nx\n:::" }
    const mutableResolver = (p: string): string | null => mutable[p] ?? null

    expect(resolveEnvironmentRefs("@doc@def:a", noLocals, mutableResolver)).toContain("Definición 1")
    expect(envRefCacheStats().prescans).toBe(1)

    // Insert a definition BEFORE the labelled one: its number must change.
    mutable.doc = ":::definition{#def:zero}\nz\n:::\n\n:::definition{#def:a}\nx\n:::"
    expect(resolveEnvironmentRefs("@doc@def:a", noLocals, mutableResolver)).toContain("Definición 2")
    expect(envRefCacheStats().prescans).toBe(2)
  })

  it("does not re-prescan an unrelated doc when a different doc changes", () => {
    const mutable: Record<string, string> = {
      stable: ":::definition{#def:s}\nx\n:::",
      churn: ":::definition{#def:c}\nx\n:::",
    }
    const mutableResolver = (p: string): string | null => mutable[p] ?? null

    resolveEnvironmentRefs("@stable@def:s @churn@def:c", noLocals, mutableResolver)
    expect(envRefCacheStats().prescans).toBe(2)

    mutable.churn = ":::definition{#def:c}\nedited\n:::"
    resolveEnvironmentRefs("@stable@def:s @churn@def:c", noLocals, mutableResolver)
    // Only `churn` re-prescanned; `stable` served from cache.
    expect(envRefCacheStats().prescans).toBe(3)
  })
})
