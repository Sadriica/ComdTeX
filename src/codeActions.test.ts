import { describe, it, expect, vi, beforeEach } from "vitest"
import type * as monacoApi from "monaco-editor"
import {
  COMMAND_ADD_BIB_STUB,
  COMMAND_CREATE_NOTE,
  COMMAND_FILL_GAP,
  bibStubFor,
  closestMatches,
  editDistance,
  parseRef,
  registerCodeActions,
  setCodeActionHost,
  vaultRelativeDocPath,
  type CodeActionHost,
} from "./codeActions"
import { lintContent, type LintContext, type LintVaultDoc } from "./contentLinter"
import { LintVaultIndex } from "./lintVault"
import { parseBibtex } from "./bibtex"
import { en } from "./i18n/en"

// ── A fake Monaco: just what the provider and the registration touch ─────────

const Severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as const

type Action = monacoApi.languages.CodeAction
interface Registered {
  provider: monacoApi.languages.CodeActionProvider
  selector: unknown
  commands: Map<string, (...args: unknown[]) => unknown>
  disposed: string[]
}

function fakeMonaco(): { monaco: typeof monacoApi; registered: Registered } {
  const registered: Registered = {
    provider: undefined as never,
    selector: undefined,
    commands: new Map(),
    disposed: [],
  }
  const monaco = {
    languages: {
      registerCodeActionProvider(
        selector: unknown,
        provider: monacoApi.languages.CodeActionProvider,
      ) {
        registered.selector = selector
        registered.provider = provider
        return { dispose: () => registered.disposed.push("provider") }
      },
    },
    editor: {
      registerCommand(id: string, handler: (...args: unknown[]) => unknown) {
        registered.commands.set(id, handler)
        return { dispose: () => registered.disposed.push(id) }
      },
    },
  } as unknown as typeof monacoApi
  return { monaco, registered }
}

function fakeModel(text: string): monacoApi.editor.ITextModel {
  const lines = text.split("\n")
  const lineStarts: number[] = []
  let acc = 0
  for (const line of lines) {
    lineStarts.push(acc)
    acc += line.length + 1
  }
  const offsetOf = (p: { lineNumber: number; column: number }) =>
    lineStarts[p.lineNumber - 1] + p.column - 1
  return {
    uri: { toString: () => "inmemory://model/1" },
    getVersionId: () => 1,
    getValue: () => text,
    getLinesContent: () => lines,
    getLineCount: () => lines.length,
    getLineContent: (n: number) => lines[n - 1],
    getLineMaxColumn: (n: number) => lines[n - 1].length + 1,
    getValueInRange: (r: monacoApi.IRange) =>
      text.slice(
        offsetOf({ lineNumber: r.startLineNumber, column: r.startColumn }),
        offsetOf({ lineNumber: r.endLineNumber, column: r.endColumn }),
      ),
    getPositionAt: (offset: number) => {
      let line = lineStarts.length
      while (lineStarts[line - 1] > offset) line--
      return { lineNumber: line, column: offset - lineStarts[line - 1] + 1 }
    },
    getOffsetAt: offsetOf,
  } as unknown as monacoApi.editor.ITextModel
}

/** Apply one action's workspace edits to `text`. */
function apply(text: string, action: Action): string {
  const model = fakeModel(text)
  const edits = (action.edit?.edits ?? []) as monacoApi.languages.IWorkspaceTextEdit[]
  const offsetOf = (line: number, column: number) => model.getOffsetAt({ lineNumber: line, column })
  const resolved = edits
    .map((e) => ({
      from: offsetOf(e.textEdit.range.startLineNumber, e.textEdit.range.startColumn),
      to: offsetOf(e.textEdit.range.endLineNumber, e.textEdit.range.endColumn),
      text: e.textEdit.text,
    }))
    .sort((a, b) => b.from - a.from)
  let out = text
  for (const e of resolved) out = out.slice(0, e.from) + e.text + out.slice(e.to)
  return out
}

// ── Harness ───────────────────────────────────────────────────────────────────

const baseCtx: LintContext = {
  vaultFileNames: new Set(),
  bibKeys: new Set(),
  messages: en.lint.messages,
}

function docsOf(files: Record<string, string>): readonly LintVaultDoc[] {
  return new LintVaultIndex().update(
    Object.entries(files).map(([path, content]) => ({
      path,
      name: path.split("/").pop()!,
      content,
    })),
  )
}

let ctx: LintContext
let ai = true
const host = {
  createNote: vi.fn(async () => true),
  addBibStub: vi.fn(async () => true),
  fillGapAt: vi.fn(),
}

function lintMarkers(text: string) {
  return lintContent(text, ctx, Severity as never)
}

function actionsFor(text: string, code: string, index = 0): Action[] {
  const markers = lintMarkers(text).filter((m) => m.code === code)
  expect(markers.length, `a ${code} marker`).toBeGreaterThan(index)
  const marker = markers[index]
  const { monaco, registered } = fakeMonaco()
  registerCodeActions(monaco)
  const model = fakeModel(text)
  const result = registered.provider.provideCodeActions(
    model,
    {
      startLineNumber: marker.startLineNumber,
      startColumn: marker.startColumn,
      endLineNumber: marker.endLineNumber,
      endColumn: marker.endColumn,
    } as never,
    { markers: [marker], trigger: 1, only: undefined } as never,
    { isCancellationRequested: false } as never,
  ) as monacoApi.languages.CodeActionList
  return [...result.actions]
}

beforeEach(() => {
  ctx = { ...baseCtx, docPath: "/v/a.md", vaultPath: "/v" }
  ai = true
  host.createNote.mockClear()
  host.addBibStub.mockClear()
  host.fillGapAt.mockClear()
  setCodeActionHost({
    getContext: () => ctx,
    getActions: () => en.lint.actions,
    aiEnabled: () => ai,
    ...host,
  } as CodeActionHost)
})

const fixedBy = (text: string, code: string, title: RegExp | string, index = 0) => {
  const action = actionsFor(text, code, index).find((a) =>
    typeof title === "string" ? a.title === title : title.test(a.title),
  )
  expect(action, `${code} fix ${String(title)}`).toBeDefined()
  return apply(text, action!)
}

// ── Registration ──────────────────────────────────────────────────────────────

describe("registerCodeActions", () => {
  it("registers one quick-fix provider for every language, and the three commands", () => {
    const { monaco, registered } = fakeMonaco()
    const handle = registerCodeActions(monaco)
    expect(registered.selector).toBe("*")
    expect([...registered.commands.keys()].sort()).toEqual(
      [COMMAND_ADD_BIB_STUB, COMMAND_CREATE_NOTE, COMMAND_FILL_GAP].sort(),
    )
    handle.dispose()
    expect(registered.disposed).toContain("provider")
    expect(registered.disposed).toContain(COMMAND_CREATE_NOTE)
  })

  it("the commands call the host", () => {
    const { monaco, registered } = fakeMonaco()
    registerCodeActions(monaco)
    registered.commands.get(COMMAND_CREATE_NOTE)!(null, "new note")
    registered.commands.get(COMMAND_ADD_BIB_STUB)!(null, "key1")
    registered.commands.get(COMMAND_FILL_GAP)!(null, 3, 7)
    expect(host.createNote).toHaveBeenCalledWith("new note")
    expect(host.addBibStub).toHaveBeenCalledWith("key1")
    expect(host.fillGapAt).toHaveBeenCalledWith(3, 7)
  })

  it("ignores markers from other sources, markers without a code, and a missing host", () => {
    const { monaco, registered } = fakeMonaco()
    registerCodeActions(monaco)
    const model = fakeModel("$$open")
    const own = lintMarkers("$$open")[0]
    const call = (markers: unknown[]) =>
      (
        registered.provider.provideCodeActions(
          model,
          {} as never,
          { markers, trigger: 1 } as never,
          {} as never,
        ) as monacoApi.languages.CodeActionList
      ).actions
    expect(call([{ ...own, source: "eslint" }])).toEqual([])
    expect(call([{ ...own, code: undefined }])).toEqual([])
    expect(call([own]).length).toBe(1)
    setCodeActionHost(null)
    expect(call([own])).toEqual([])
  })
})

// ── Text fixes ────────────────────────────────────────────────────────────────

describe("close unclosed blocks", () => {
  it("closes a $$ block at the end of its paragraph", () => {
    const text = "intro\n\n$$\nx^2 + y^2\n\nafter"
    const out = fixedBy(text, "display-math-unclosed", "Close the $$ block")
    expect(out).toBe("intro\n\n$$\nx^2 + y^2\n$$\n\nafter")
    expect(lintMarkers(out).filter((m) => m.code === "display-math-unclosed")).toHaveLength(0)
  })

  it("closes a $$ block at the end of the document", () => {
    const out = fixedBy("$$x", "display-math-unclosed", "Close the $$ block")
    expect(out).toBe("$$x\n$$")
  })

  it("closes an environment before the next heading", () => {
    const text = ":::theorem[T]\nLet x.\n\n\n# Next\n\ntext"
    const out = fixedBy(text, "env-unclosed", "Close the :::theorem environment")
    expect(out).toBe(":::theorem[T]\nLet x.\n:::\n\n\n# Next\n\ntext")
    expect(lintMarkers(out).filter((m) => m.code === "env-unclosed")).toHaveLength(0)
  })

  it("closes an environment at the end of the document", () => {
    const out = fixedBy(":::lemma\nbody\n", "env-unclosed", "Close the :::lemma environment")
    expect(lintMarkers(out).filter((m) => m.code === "env-unclosed")).toHaveLength(0)
  })

  it("removes a stray closing fence together with its line break", () => {
    expect(fixedBy("a\n:::\nb", "env-stray-close", en.lint.actions.removeStrayClose)).toBe("a\nb")
    expect(fixedBy(":::\nb", "env-stray-close", en.lint.actions.removeStrayClose)).toBe("b")
  })

  it("suggests the closest known block type", () => {
    const actions = actionsFor(":::theorm[T]\nx\n:::", "env-unknown-type")
    expect(actions[0].title).toBe('Change to "theorem"')
    expect(apply(":::theorm[T]\nx\n:::", actions[0])).toBe(":::theorem[T]\nx\n:::")
    expect(actions.length).toBeLessThanOrEqual(3)
  })

  it("offers nothing for a type that resembles nothing", () => {
    expect(actionsFor(":::qwertyuiop\nx\n:::", "env-unknown-type")).toEqual([])
  })
})

describe("references", () => {
  it("offers 'did you mean' for a mistyped label, nearest first, at most three", () => {
    ctx.vaultDocs = docsOf({ "/v/a.md": "x" })
    const text =
      ":::theorem{#thm:main}\nx\n:::\n:::theorem{#thm:mian2}\nx\n:::\n:::lemma{#lem:main}\nx\n:::\n:::theorem{#thm:maint}\nx\n:::\n\nSee @thm:mian."
    const actions = actionsFor(text, "ref-undefined")
    expect(actions.length).toBeLessThanOrEqual(3)
    expect(actions.length).toBeGreaterThan(0)
    const fixed = apply(
      text,
      actions.find((a) => a.title === 'Change to "thm:main"')!,
    )
    expect(fixed.endsWith("See @thm:main.")).toBe(true)
    expect(lintMarkers(fixed).filter((m) => m.code === "ref-undefined")).toHaveLength(0)
  })

  it("can switch the kind when the label has another prefix", () => {
    const text = ":::lemma{#lem:growth}\nx\n:::\n\n@thm:growth"
    const out = fixedBy(text, "ref-undefined", 'Change to "lem:growth"')
    expect(out.endsWith("@lem:growth")).toBe(true)
  })

  it("rewrites an environment label defined elsewhere to the cross-file form", () => {
    ctx.vaultDocs = docsOf({
      "/v/a.md": "x",
      "/v/gp/cal.md": ":::definition{#def:far}\nx\n:::",
    })
    const text = "see @def:far here"
    const out = fixedBy(text, "ref-other-note", "Use the cross-file form @gp/cal@def:far")
    expect(out).toBe("see @gp/cal@def:far here")
    expect(lintMarkers(out)).toHaveLength(0)
  })

  it("uses the bracket form when the path has spaces", () => {
    ctx.vaultDocs = docsOf({
      "/v/a.md": "x",
      "/v/my folder/my note.md": ":::definition{#def:far}\nx\n:::",
    })
    const out = fixedBy("@def:far", "ref-other-note", /cross-file form/)
    expect(out).toBe("@[my folder/my note]@def:far")
    expect(lintMarkers(out)).toHaveLength(0)
  })

  it("uses the bracket form when the path has accents", () => {
    ctx.vaultDocs = docsOf({
      "/v/a.md": "x",
      "/v/Álgebra/Teoría.md": ":::definition{#def:far}\nx\n:::",
    })
    const out = fixedBy("@def:far", "ref-other-note", /cross-file form/)
    expect(out).toBe("@[Álgebra/Teoría]@def:far")
    expect(lintMarkers(out)).toHaveLength(0)
  })

  it("brackets a corrected path that needs it", () => {
    ctx.vaultDocs = docsOf({ "/v/a.md": "x", "/v/Álgebra/Teoría.md": "{#def:d}" })
    const out = fixedBy("@Algebra/Teoria@def:d", "ref-doc-missing", /Change to/)
    expect(out).toBe("@[Álgebra/Teoría]@def:d")
    expect(lintMarkers(out)).toHaveLength(0)
  })

  it("does not offer the cross-file form for kinds that cannot cross files", () => {
    ctx.vaultDocs = docsOf({ "/v/a.md": "x", "/v/b.md": "$$y$$ {#eq:far}" })
    const titles = actionsFor("@eq:far", "ref-other-note").map((a) => a.title)
    expect(titles.some((t) => /cross-file/.test(t))).toBe(false)
  })

  it("suggests an existing note path for a mistyped cross-file path", () => {
    ctx.vaultDocs = docsOf({ "/v/a.md": "x", "/v/gp/calendar.md": "{#def:d}" })
    const text = "@gp/calender@def:d"
    const out = fixedBy(text, "ref-doc-missing", 'Change to "gp/calendar"')
    expect(out).toBe("@gp/calendar@def:d")
    expect(lintMarkers(out)).toHaveLength(0)
  })

  it("suggests a label of the target note for a mistyped cross-file label", () => {
    ctx.vaultDocs = docsOf({ "/v/a.md": "x", "/v/gp/cal.md": "{#def:alpha}" })
    const out = fixedBy("@gp/cal@def:alpa", "ref-label-missing", 'Change to "def:alpha"')
    expect(out).toBe("@gp/cal@def:alpha")
  })

  it("parseRef reads local, bare and bracket forms", () => {
    expect(parseRef("@thm:x")).toMatchObject({ kind: "thm", name: "x", idFrom: 1, idTo: 6 })
    expect(parseRef("@a/b@thm:x")).toMatchObject({ path: "a/b", pathFrom: 1, pathTo: 4, idFrom: 5 })
    expect(parseRef("@[a b]@thm:x")).toMatchObject({
      path: "a b",
      pathFrom: 2,
      pathTo: 5,
      idFrom: 7,
    })
    expect(parseRef("nope")).toBeNull()
  })
})

describe("notes and citations", () => {
  it("offers to create the missing note through the host (a command, not a text edit)", () => {
    ctx.vaultFileNames = new Set(["other"])
    const actions = actionsFor("see [[brand new#Intro|alias]]", "wikilink-missing")
    const create = actions.find((a) => a.title === 'Create note "brand new"')!
    expect(create.edit).toBeUndefined()
    expect(create.command).toMatchObject({ id: COMMAND_CREATE_NOTE, arguments: ["brand new"] })
  })

  it("suggests an existing note for a typo, keeping the heading and alias", () => {
    ctx.vaultFileNames = new Set(["mixing-times", "growth"])
    const text = "[[mixing-time#Intro|alias]]"
    const out = fixedBy(text, "wikilink-missing", 'Change to "mixing-times"')
    expect(out).toBe("[[mixing-times#Intro|alias]]")
    expect(lintMarkers(out)).toHaveLength(0)
  })

  it("uses the original-case note names when the vault index is available", () => {
    ctx.vaultFileNames = new Set(["growth"])
    ctx.vaultDocs = docsOf({ "/v/Growth.md": "x" })
    const text = "[[growht]]"
    expect(actionsFor(text, "wikilink-missing").map((a) => a.title)).toContain('Change to "Growth"')
  })

  it("offers a BibTeX stub for an unknown key and 'did you mean' for a typo", () => {
    ctx.bibKeys = new Set(["lubotzky1988", "knuth84"])
    const text = "see [@lubotzky1989]."
    const actions = actionsFor(text, "cite-undefined")
    const stub = actions.find((a) => /Add a BibTeX entry/.test(a.title))!
    expect(stub.command).toMatchObject({ id: COMMAND_ADD_BIB_STUB, arguments: ["lubotzky1989"] })
    const out = apply(
      text,
      actions.find((a) => a.title === 'Change to "lubotzky1988"')!,
    )
    expect(out).toBe("see [@lubotzky1988].")
  })

  it("fixes only the key under the marker in a grouped citation", () => {
    ctx.bibKeys = new Set(["alpha", "beta"])
    const text = "[@alpha; @betta, p. 2]"
    const out = fixedBy(text, "cite-undefined", 'Change to "beta"')
    expect(out).toBe("[@alpha; @beta, p. 2]")
  })

  it("the stub it adds is a valid entry that satisfies the citation", () => {
    const entry = bibStubFor("fresh2026")
    expect(parseBibtex(entry).has("fresh2026")).toBe(true)
  })
})

describe("tables, gaps, shorthands, footnotes, labels", () => {
  it("normalizes a ragged table", () => {
    const text = "| a | b | c |\n|---|---|---|\n| 1 | 2 |\n| 3 | 4 | 5 |"
    const out = fixedBy(text, "table-ragged", "Normalize table")
    expect(out.split("\n")[2].match(/\|/g)).toHaveLength(4)
    expect(lintMarkers(out).filter((m) => m.code === "table-ragged")).toHaveLength(0)
  })

  it("offers 'fill gap' only when the AI is enabled", () => {
    const text = "intro\n\nA {{? the main idea }} here"
    const actions = actionsFor(text, "gap-pending")
    expect(actions).toHaveLength(1)
    expect(actions[0].command!.id).toBe(COMMAND_FILL_GAP)
    // The command lands inside the gap so the fill finds it under the cursor.
    expect(actions[0].command!.arguments).toEqual([3, 4])
    ai = false
    expect(actionsFor(text, "gap-pending")).toEqual([])
  })

  it("adds the missing arguments of a shorthand", () => {
    expect(fixedBy("frac(a)", "shorthand-arity", /Add the missing arguments/)).toBe("frac(a, )")
  })

  it("keeps the first arguments when there are too many", () => {
    expect(
      fixedBy("x sqrt(a, b, c) y", "shorthand-arity", /Keep only the first 1 argument of/),
    ).toBe("x sqrt(a) y")
    expect(fixedBy("frac(a, b, c)", "shorthand-arity", /Keep only the first 2 arguments/)).toBe(
      "frac(a, b)",
    )
  })

  it("adds a footnote definition at the end", () => {
    const out = fixedBy("Claim[^n1].", "footnote-undefined", "Add a definition for [^n1]")
    expect(out).toBe("Claim[^n1].\n\n[^n1]: ")
    expect(lintMarkers(out).filter((m) => m.code === "footnote-undefined")).toHaveLength(0)
  })

  it("renames a duplicate label to a free one", () => {
    const text = "{#eq:a}\n{#eq:a}\n{#eq:a-2}"
    const out = fixedBy(text, "label-duplicate", "Rename this label to eq:a-3")
    expect(out).toBe("{#eq:a}\n{#eq:a-3}\n{#eq:a-2}")
    expect(lintMarkers(out).filter((m) => m.code === "label-duplicate")).toHaveLength(0)
  })
})

describe("suggestion helpers", () => {
  it("editDistance is Levenshtein and gives up past the limit", () => {
    expect(editDistance("kitten", "sitting")).toBe(3)
    expect(editDistance("a", "a")).toBe(0)
    expect(editDistance("abcdef", "uvwxyz", 2)).toBeGreaterThan(2)
  })

  it("closestMatches ranks by distance, drops far words and the word itself", () => {
    expect(closestMatches("thm:mian", ["thm:main", "lem:zzzzzz", "thm:mian"])).toEqual(["thm:main"])
    expect(closestMatches("a", ["zzzz", "yyyy"])).toEqual([])
    expect(closestMatches("abc", ["abd", "abe", "abf", "abg"], 3)).toHaveLength(3)
  })

  it("vaultRelativeDocPath strips the vault root and the extension", () => {
    expect(vaultRelativeDocPath("/v/gp/cal.md", "/v")).toBe("gp/cal")
    expect(vaultRelativeDocPath("C:\\v\\gp\\cal.md", "C:\\v")).toBe("gp/cal")
    expect(vaultRelativeDocPath("/elsewhere/x.md", "/v")).toBe("/elsewhere/x")
  })
})
