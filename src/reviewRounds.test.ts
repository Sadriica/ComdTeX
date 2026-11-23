import { describe, expect, it } from "vitest"
import { acceptAll, parseCriticMarks, rejectAll } from "./criticMarkup"
import {
  compareWithRound,
  diffToCriticMarkup,
  listRounds,
  noteAtRound,
  startRound,
} from "./reviewRounds"
import { toEditorContent, toStorage } from "./cmdxFormat"
import type { GitRunner } from "./vaultSync"

function roundTrip(a: string, b: string) {
  const d = diffToCriticMarkup(a, b)
  expect(d, `${JSON.stringify(a)} -> ${JSON.stringify(b)}`).not.toBeNull()
  expect(d!.exact).toBe(true)
  expect(acceptAll(d!.markup)).toBe(b)
  expect(rejectAll(d!.markup)).toBe(a)
  return d!.markup
}

describe("diffToCriticMarkup", () => {
  it("returns the text unchanged when nothing differs", () => {
    expect(diffToCriticMarkup("same\n", "same\n")).toEqual({ markup: "same\n", exact: true })
  })

  it("marks a replaced word, an added word and a removed word", () => {
    expect(roundTrip("The quick fox.\n", "The slow fox.\n")).toBe("The {~~quick~>slow~~} fox.\n")
    expect(roundTrip("The fox.\n", "The red fox.\n")).toContain("{++")
    expect(roundTrip("The red fox.\n", "The fox.\n")).toContain("{--")
  })

  it("keeps inline math whole", () => {
    const out = roundTrip("Take $x^2 + 1$ here.\n", "Take $x^2 + 2$ here.\n")
    expect(out).toBe("Take {~~$x^2 + 1$~>$x^2 + 2$~~} here.\n")
    for (const m of parseCriticMarks(out)) expect(m.raw.split("$").length % 2).toBe(1)
  })

  it("keeps display math and fenced code whole", () => {
    roundTrip("a\n$$\n\\int_0^1 f\n$$\nb\n", "a\n$$\n\\int_0^2 f\n$$\nb\n")
  })

  it("a changed fenced block cannot sit in a mark: shown as new text plus a note", () => {
    const d = diffToCriticMarkup(
      "t\n```py\nprint(1)\n```\nu\n",
      "t\n```py\nprint(2)\n```\nu\n",
      "NOTE",
    )
    expect(d).not.toBeNull()
    expect(d!.exact).toBe(false)
    expect(d!.markup).toContain("print(2)")
    expect(d!.markup).toContain("{>>NOTE<<}")
    expect(d!.markup).not.toContain("print(1)")
    // an unchanged block next to a changed sentence stays exact
    roundTrip("a b\n```py\nx\n```\n", "a c\n```py\nx\n```\n")
  })

  it("a whole added or removed line carries its line break, so reject is exact", () => {
    expect(roundTrip("# A\n", "# A\n## New\n")).toBe("# A\n{++## New\n++}")
    expect(roundTrip("- a\n- b\n", "- a\n")).toBe("- a\n{--- b\n--}")
  })

  it("handles added and removed paragraphs", () => {
    roundTrip("One.\n\nTwo.\n", "One.\n\nNew para.\n\nTwo.\n")
    roundTrip("One.\n\nGone.\n\nTwo.\n", "One.\n\nTwo.\n")
  })

  it("handles empty sides", () => {
    roundTrip("", "hello\n")
    roundTrip("hello\n", "")
  })

  it("does not write a closer that would end a mark early, or says so", () => {
    const a = "Use the ++} token.\n"
    const b = "Use the -- token.\n"
    const out = diffToCriticMarkup(a, b)
    if (out !== null && out.exact) {
      expect(acceptAll(out.markup)).toBe(b)
      expect(rejectAll(out.markup)).toBe(a)
    }
  })

  it("compares notes that already hold marks as accepted", () => {
    const out = diffToCriticMarkup("Keep {++this++}.\n", "Keep this and more.\n")
    expect(out).not.toBeNull()
    expect(rejectAll(out!.markup)).toBe("Keep this.\n")
    expect(acceptAll(out!.markup)).toBe("Keep this and more.\n")
  })

  it("is exact on random edits of prose with math", () => {
    let seed = 42
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    const words = [
      "alpha",
      "beta",
      "$x^2$",
      "gamma",
      "`code`",
      "delta",
      "$$\ny\n$$",
      "eps",
      "{",
      "}",
    ]
    const gen = () => {
      const lines: string[] = []
      for (let l = 0; l < 2 + Math.floor(rnd() * 6); l++) {
        const w: string[] = []
        for (let i = 0; i < 1 + Math.floor(rnd() * 7); i++)
          w.push(words[Math.floor(rnd() * words.length)])
        lines.push(w.join(" "))
      }
      return lines.join(rnd() < 0.3 ? "\n\n" : "\n") + "\n"
    }
    for (let n = 0; n < 200; n++) {
      const a = gen()
      const b = rnd() < 0.5 ? gen() : a.replace(/alpha|beta/, "omega").replace(/\n/, " \n")
      const out = diffToCriticMarkup(a, b)
      if (out === null || !out.exact) continue
      expect(acceptAll(out.markup), `${a}\n=>\n${b}`).toBe(b)
      expect(rejectAll(out.markup)).toBe(a)
    }
  })

  it("gives up (null) on huge unrelated hunks instead of hanging", () => {
    const a = Array.from({ length: 4000 }, (_, i) => `line a${i}`).join("\n") + "\n"
    const b = Array.from({ length: 4000 }, (_, i) => `row b${i}`).join("\n") + "\n"
    const t = Date.now()
    const out = diffToCriticMarkup(a, b)
    expect(Date.now() - t).toBeLessThan(5000)
    if (out !== null && out.exact) {
      expect(acceptAll(out.markup)).toBe(b)
      expect(rejectAll(out.markup)).toBe(a)
    }
  })
})

/** A scripted runner: first matching prefix wins. */
function script(table: Record<string, { code?: number; stdout?: string; stderr?: string }>) {
  const calls: string[] = []
  const git: GitRunner = async (args) => {
    const key = args.join(" ")
    calls.push(key)
    const hit = Object.keys(table).find((k) => key.startsWith(k))
    const r = hit ? table[hit] : { code: 1, stderr: `unexpected: ${key}` }
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }
  }
  return { git, calls }
}

describe("rounds with a scripted runner", () => {
  it("lists review tags in numeric order and ignores other tags", async () => {
    const { git } = script({
      "for-each-ref": {
        stdout:
          "review-10\tc3\t2026-03-01T10:00:00+00:00\nreview-2\tb2\t2026-02-01T10:00:00+00:00\nv1.0\ta1\tx\nreview-x\tz\ty\n",
      },
    })
    expect((await listRounds(git)).map((r) => r.n)).toEqual([2, 10])
  })

  it("starts a round: commits pending work, then tags the next number", async () => {
    const { git, calls } = script({
      "rev-parse --is-inside-work-tree": { stdout: "true\n" },
      "for-each-ref": { stdout: "review-1\tabc\t2026-01-01T00:00:00+00:00\n" },
      "status --porcelain": { stdout: " M a.md\n" },
      "add -A": {},
      commit: {},
      "rev-parse --short HEAD": { stdout: "def\n" },
      "tag review-2 HEAD": {},
      "log -1": { stdout: "2026-02-02T00:00:00+00:00\n" },
    })
    const r = await startRound(git, { message: (n) => `Review round ${n}` })
    expect(r.ok && r.round.tag).toBe("review-2")
    expect(r.ok && r.committed).toBe(true)
    expect(calls).toContain("commit -m Review round 2")
    expect(calls.some((c) => c.startsWith("push"))).toBe(false)
  })

  it("does not commit when the vault is clean", async () => {
    const { git, calls } = script({
      "rev-parse --is-inside-work-tree": { stdout: "true\n" },
      "for-each-ref": {},
      "status --porcelain": { stdout: "" },
      "rev-parse --short HEAD": { stdout: "def\n" },
      "tag review-1 HEAD": {},
      "log -1": { stdout: "d\n" },
    })
    const r = await startRound(git, { message: (n) => `R${n}` })
    expect(r.ok && r.committed).toBe(false)
    expect(calls.some((c) => c.startsWith("commit"))).toBe(false)
  })

  it("reports a folder that is not a repository", async () => {
    const { git } = script({
      "rev-parse --is-inside-work-tree": { code: 128, stderr: "fatal: not a git repository" },
    })
    const r = await startRound(git, { message: () => "x" })
    expect(!r.ok && r.reason).toBe("not-repo")
  })

  it("reads a note at a round and says when it did not exist", async () => {
    const { git } = script({
      "show review-1:./notes/a.md": { stdout: "old\n" },
      "show review-1:./notes/b.md": { code: 128, stderr: "fatal: path does not exist" },
    })
    expect(await noteAtRound(git, 1, "notes/a.md")).toBe("old\n")
    expect(await noteAtRound(git, 1, "notes\\a.md")).toBe("old\n")
    expect(await noteAtRound(git, 1, "notes/b.md")).toBeNull()
    expect(await compareWithRound(git, 1, "notes/b.md", "x")).toEqual({
      ok: false,
      reason: "no-such-note",
    })
    const c = await compareWithRound(git, 1, "notes/a.md", "new\n")
    expect(c.ok && c.markup).toBe("{~~old~>new~~}\n")
  })
})

describe("compareWithRound with editor (CMDX) text", () => {
  const cmdx =
    "# T\n\n:::theorem[Bolzano]{#thm:b}\nEvery bounded sequence has a limit point.\n:::\n\ntable(A, B)\n\nEnd.\n"
  const disk = toStorage(cmdx, "md")
  const git =
    (text: string): GitRunner =>
    async () => ({ code: 0, stdout: text, stderr: "" })

  it("the stored form really differs from the editor form", () => {
    expect(disk).not.toBe(cmdx)
  })

  it("gives no marks for an unchanged note", async () => {
    const editor = toEditorContent("a.md", disk)
    const c = await compareWithRound(git(disk), 1, "a.md", editor)
    expect(c.ok && c.changed).toBe(false)
    expect(c.ok && parseCriticMarks(c.markup).length).toBe(0)
  })

  it("gives no spurious marks when the file has CRLF on disk", async () => {
    const crlf = disk.replace(/\n/g, "\r\n")
    const editor = toEditorContent("a.md", crlf)
    const c = await compareWithRound(git(crlf), 1, "a.md", editor)
    expect(c.ok && c.changed).toBe(false)
    expect(c.ok && parseCriticMarks(c.markup).length).toBe(0)
  })

  it("still marks a real change", async () => {
    const editor = toEditorContent("a.md", disk).replace("End.", "The end.")
    const c = await compareWithRound(git(disk), 1, "a.md", editor)
    expect(c.ok && c.changed).toBe(true)
    expect(c.ok && parseCriticMarks(c.markup).length).toBe(1)
    expect(c.ok && acceptAll(c.markup)).toBe(editor)
    expect(c.ok && rejectAll(c.markup)).toBe(toEditorContent("a.md", disk))
  })
})
