import { expect, it } from "vitest"
import { lintContent, scanLintLabels, type LintContext, type LintVaultDoc } from "./contentLinter"
import { perfBudget } from "./perfBudget"

const Sev = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as never

/**
 * Lint budget on a 1 MB document (see the report of the editor-intelligence wave:
 * measured ~90-120 ms cold and ~45-55 ms warm on a dev laptop). The bound here is
 * deliberately loose so CI machines do not flake; it only catches an accidental
 * quadratic pass, which is what would justify moving the pass to a worker.
 */
function makeDoc(targetBytes: number, unique: boolean) {
  const parts: string[] = []
  let i = 0
  let size = 0
  while (size < targetBytes) {
    const n = unique ? i : i % 300
    const block =
      `## Section ${i} {#sec:s${i}}\n\n` +
      `Some prose with an inline $x_{${n}}^2 + \\alpha_${n}$ and frac(a${n}, b) plus a citation [@key${i % 50}] ` +
      `and a link [[note-${i % 40}]] and a ref @eq:e${i} and @thm:t${i}.\n\n` +
      `$$\n\\int_0^{${n}} f(x)\\,dx = \\sum_{k=1}^{${n}} k^2\n$$ {#eq:e${i}}\n\n` +
      `:::theorem[Main ${i}]{#thm:t${i}}\nLet $G_${n}$ be a group and $|G|=${n}$.\n:::\n\n` +
      `| a | b |\n|---|---|\n| 1 | 2 |\n\n![fig](img/f${i % 10}.png){#fig:f${i}}\n\n` +
      `Footnote[^n${i}].\n\n[^n${i}]: text\n\n`
    parts.push(block)
    size += block.length
    i++
  }
  return { text: parts.join(""), blocks: i }
}

function ctxFor(): LintContext {
  const docs: LintVaultDoc[] = [
    { path: "/v/other.md", name: "other.md", labels: scanLintLabels("{#thm:zz}"), embeds: [] },
  ]
  return {
    vaultFileNames: new Set(Array.from({ length: 40 }, (_, k) => `note-${k}`)),
    bibKeys: new Set(Array.from({ length: 50 }, (_, k) => `key${k}`)),
    docPath: "/v/doc.md",
    vaultPath: "/v",
    vaultDocs: docs,
    vaultFilePaths: new Set(Array.from({ length: 10 }, (_, k) => `/v/img/f${k}.png`)),
    macros: {},
  }
}

for (const unique of [false, true]) {
  it(`lints a 1 MB document in a few hundred ms (${unique ? "unique" : "repeating"} math)`, () => {
    const { text } = makeDoc(1_000_000, unique)
    const ctx = ctxFor()
    const t0 = performance.now()
    const first = lintContent(text, ctx, Sev)
    const t1 = performance.now()
    const second = lintContent(text, ctx, Sev)
    const t2 = performance.now()
    // The generated document is clean: a marker here is a false positive.
    expect(first).toEqual([])
    expect(second).toEqual([])
    expect(t1 - t0).toBeLessThan(perfBudget(2000))
    expect(t2 - t1).toBeLessThan(perfBudget(1000))
  })
}
