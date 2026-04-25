import { describe, it, expect, beforeEach } from "vitest"
import {
  buildEnvHTML,
  extractEnvironments,
  resetEnvCounters,
  NUMBERED_ENVS,
  UNNUMBERED_ENVS,
  prescanEnvironmentLabels,
  resolveEnvironmentRefs,
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
})
