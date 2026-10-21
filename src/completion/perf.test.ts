import { describe, expect, it } from "vitest"
import { scanStructuralLabels } from "../structuralLabels"
import { complete, FakeModel, fakeMonaco, parseCaret } from "./fakeMonaco"
import { provideCompletion } from "./index"
import { setLatexCommandsForTest } from "./latex"
import {
  setCompletionCurrentFile,
  updateBibSuggestions,
  updateLabelIndex,
  updateVaultFiles,
} from "./state"
import { LATEX_COMMANDS } from "../latexCommands"

// Budget (docs): a completion call stays under 5 ms on a 5k-label vault. The
// assertion is looser than the budget so a loaded CI machine does not flake;
// the measured medians are printed for the report.
const BUDGET_MS = 25

const KINDS = [
  ["theorem", "thm"],
  ["lemma", "lem"],
  ["definition", "def"],
  ["proposition", "prop"],
  ["example", "ex"],
] as const

function buildVault(files: number, labelsPerFile: number) {
  const nodes: { path: string; name: string; ext: string }[] = []
  const contents: { path: string; name: string; content: string }[] = []
  let total = 0
  for (let f = 0; f < files; f++) {
    const path = `/vault/area${f % 20}/note-${f}.md`
    const parts: string[] = [`# Note ${f}`]
    for (let l = 0; l < labelsPerFile; l++) {
      const [env, kind] = KINDS[l % KINDS.length]
      parts.push(
        `:::${env}[Title ${f} ${l}]{#${kind}:n${f}-${l}}`,
        `Body of the ${env} number ${l}.`,
        ":::",
      )
      total++
    }
    nodes.push({ path, name: `note-${f}.md`, ext: "md" })
    contents.push({ path, name: `note-${f}.md`, content: parts.join("\n") })
  }
  return { nodes, contents, total }
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * Median time of one call. With `typing` the model's version changes before
 * every call, as it does on every keystroke, so the per-document scans (own
 * labels, footnotes) are recomputed each time instead of served from cache.
 */
async function time(text: string, typing = false, runs = 40): Promise<number> {
  const { model, position } = parseCaret(text)
  await provideCompletion(fakeMonaco, model, position) // warm
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    if (typing) model.setText(model.text())
    const t0 = performance.now()
    await provideCompletion(fakeMonaco, model, position)
    samples.push(performance.now() - t0)
  }
  return median(samples)
}

describe("completion performance on a 5k-label vault", () => {
  it("answers every structural trigger within budget", async () => {
    const { nodes, contents, total } = buildVault(500, 10)
    expect(total).toBe(5000)
    updateVaultFiles(nodes, "/vault")
    const index = scanStructuralLabels(contents)
    updateLabelIndex(index)
    updateBibSuggestions(
      Array.from({ length: 2000 }, (_, i) => ({
        key: `key${i}`,
        author: `Author${i} and Other${i}`,
        title: `A study of thing number ${i}`,
        year: String(1950 + (i % 70)),
      })),
    )
    setCompletionCurrentFile("/vault/area0/note-0.md")
    setLatexCommandsForTest(LATEX_COMMANDS)

    // A 3000-line current document with 300 of its own labels.
    const own = contents[0].content.split("\n")
    const filler = Array.from({ length: 2700 }, (_, i) => `Line ${i} of prose with some $x_${i}$.`)
    const currentDoc = [...own, ...filler].join("\n")

    const results: Record<string, number> = {}
    results["@thm:"] = await time(`${currentDoc}\n@thm:|`)
    results["@thm: (typing)"] = await time(`${currentDoc}\n@thm:|`, true)
    results["[^ (typing)"] = await time(`${currentDoc}\nsee [^|`, true)
    results["@thm:n12"] = await time(`${currentDoc}\n@thm:n12|`)
    results["@def:"] = await time(`${currentDoc}\n@def:|`)
    results["@ (kinds)"] = await time(`${currentDoc}\nsee @|`)
    results["@area1 (paths)"] = await time(`${currentDoc}\nsee @area1|`)
    results["[["] = await time(`${currentDoc}\nsee [[|`)
    results["[[note-4"] = await time(`${currentDoc}\nsee [[note-4|`)
    results["[@"] = await time(`${currentDoc}\nsee [@|`)
    results["[@author12"] = await time(`${currentDoc}\nsee [@author12|`)
    results["[^"] = await time(`${currentDoc}\nsee [^|`)
    results["\\ (1000 cmds)"] = await time(`${currentDoc}\nsee \\|`)
    results["\\fr"] = await time(`${currentDoc}\nsee \\fr|`)
    results["{#"] = await time(`# Heading {#|`)

    console.info(
      "completion medians (ms), 5000 labels / 500 notes / 2000 bib / 3000-line doc:\n" +
        Object.entries(results)
          .map(([k, v]) => `  ${k.padEnd(18)} ${v.toFixed(2)}`)
          .join("\n"),
    )
    for (const [name, ms] of Object.entries(results)) {
      expect(ms, name).toBeLessThan(BUDGET_MS)
    }
  })

  it("keeps a repeated call on an unchanged document cheap (no rescans)", async () => {
    const model = new FakeModel(Array.from({ length: 4000 }, (_, i) => `[^${i}]: note`).join("\n"))
    const t0 = performance.now()
    await complete(`${model.text()}\nx [^|`)
    const first = performance.now() - t0
    expect(first).toBeLessThan(200)
  })
})
