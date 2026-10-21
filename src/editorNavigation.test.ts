import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  canNavigateAt,
  configureEditorNavigation,
  createNavigationProviders,
  disposeEditorNavigation,
  findUsages,
  goToDefinition,
  registerEditorNavigation,
} from "./editorNavigation"
import {
  FakeUri,
  cancelToken,
  createFakeMonaco,
  editorModel,
  type FakeModel,
  type FakeMonaco,
} from "./fakeMonaco.testutil"
import { resetEditorNavigation } from "./navHost"
import type { NavFile } from "./navScan"

const A_TEXT = [
  "# A",
  ":::lemma{#lem:x}",
  "Body",
  ":::",
  "See @lem:x, [[b#Deep Heading]], @sub/b@thm:y, [@key1; @key2] and [[missing]].",
  "Local label {#sec:z} and `@lem:x` in code.",
].join("\n")

const B_TEXT = [
  "# B",
  "",
  "## Deep Heading",
  "",
  ":::theorem{#thm:y}",
  "T",
  ":::",
  "",
  "Back to @lem:x and [[a]].",
].join("\n")

const BIB = [
  "@book{key1,",
  "  title = {One}",
  "}",
  "",
  "@article{key2,",
  "  title = {Two}",
  "}",
].join("\n")

const files: NavFile[] = [
  // Deliberately stale: the editor model's live text must win for the active file.
  { path: "/v/a.md", name: "a.md", content: "# stale" },
  { path: "/v/sub/b.md", name: "b.md", content: B_TEXT },
]

const pos = (lineNumber: number, column: number) => ({ lineNumber, column }) as never

type Rng = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

function at(model: FakeModel, needle: string, shift = 1) {
  const lines = model.text.split("\n")
  const lineNumber = lines.findIndex((l) => l.includes(needle)) + 1
  return pos(lineNumber, lines[lineNumber - 1].indexOf(needle) + 1 + shift)
}

describe("editor navigation providers", () => {
  let fake: FakeMonaco
  let model: FakeModel
  let opened: [string, number, number][]
  let p: ReturnType<typeof createNavigationProviders>

  beforeEach(() => {
    resetEditorNavigation()
    fake = createFakeMonaco()
    model = editorModel(A_TEXT)
    opened = []
    configureEditorNavigation({
      getActivePath: () => "/v/a.md",
      getFiles: () => files,
      getBibPath: () => "/v/references.bib",
      readText: async (path) => (path === "/v/references.bib" ? BIB : null),
      openLocation: (path, line, col) => opened.push([path, line, col]),
    })
    p = createNavigationProviders(fake.api)
  })
  afterEach(() => resetEditorNavigation())

  const definition = async (needle: string, shift = 1) =>
    p.definition.provideDefinition(
      model as never,
      at(model, needle, shift),
      cancelToken,
    ) as Promise<
      { uri: FakeUri; range: Rng; targetSelectionRange: Rng; originSelectionRange: Rng }[] | null
    >

  describe("definition", () => {
    it("jumps from @kind:name to the label in the same file, in the editor's own model", async () => {
      const [hit] = (await definition("@lem:x"))!
      expect(hit.uri).toBe(model.uri)
      expect(hit.targetSelectionRange).toMatchObject({ startLineNumber: 2, startColumn: 9 })
      expect(hit.range).toMatchObject({ startLineNumber: 2, endLineNumber: 2 })
      expect(hit.originSelectionRange).toMatchObject({ startLineNumber: 5 })
    })

    it("resolves @path@kind:name in the other file, through a shadow model", async () => {
      const [hit] = (await definition("@sub/b@thm:y"))!
      expect(hit.uri.toString()).toBe("file:///v/sub/b.md")
      expect(fake.models.get("file:///v/sub/b.md")?.text).toBe(B_TEXT)
      expect(hit.range).toMatchObject({ startLineNumber: 5 })
    })

    it("falls back to another file for a bare ref the current file does not define", async () => {
      const m = editorModel("see @thm:y")
      const out = (await p.definition.provideDefinition(m as never, pos(1, 6), cancelToken)) as {
        uri: FakeUri
      }[]
      expect(out[0].uri.toString()).toBe("file:///v/sub/b.md")
    })

    it("opens [[note#heading]] at the heading and [[note]] at the top", async () => {
      const [hit] = (await definition("[[b#Deep Heading]]"))!
      expect(hit.uri.toString()).toBe("file:///v/sub/b.md")
      expect(hit.targetSelectionRange.startLineNumber).toBe(3)
      const m = editorModel("![[b]]")
      const [top] = (await p.definition.provideDefinition(m as never, pos(1, 4), cancelToken)) as {
        targetSelectionRange: { startLineNumber: number }
      }[]
      expect(top.targetSelectionRange.startLineNumber).toBe(1)
    })

    it("takes each key of a citation group to its entry in references.bib", async () => {
      const [one] = (await definition("@key1"))!
      expect(one.uri.toString()).toBe("file:///v/references.bib")
      expect(one.targetSelectionRange).toMatchObject({ startLineNumber: 1, startColumn: 7 })
      const [two] = (await definition("@key2"))!
      expect(two.targetSelectionRange).toMatchObject({ startLineNumber: 5, startColumn: 10 })
      expect(fake.models.get("file:///v/references.bib")?.language).toBe("plaintext")
    })

    it("returns nothing for unresolved targets, plain text and code spans", async () => {
      expect(await definition("[[missing]]")).toBeNull()
      expect(await definition("Body", 0)).toBeNull()
      expect(await definition("`@lem:x`", 3)).toBeNull()
    })

    it("on a {#label} returns the label itself (Monaco then lists its usages)", async () => {
      const [hit] = (await definition("{#sec:z}"))!
      expect(hit.uri).toBe(model.uri)
      expect(hit.targetSelectionRange.startLineNumber).toBe(6)
    })
  })

  describe("references", () => {
    const refs = async (needle: string) =>
      p.references.provideReferences(
        model as never,
        at(model, needle),
        { includeDeclaration: true },
        cancelToken,
      ) as Promise<{ uri: FakeUri; range: Rng }[] | null>

    it("lists the definition and every use of a label across the vault", async () => {
      const out = (await refs("@lem:x"))!
      const where = out.map((l) => `${l.uri.path}:${l.range.startLineNumber}`).sort()
      // Definition and the use in a.md (the code span is not a use), plus b.md's bare ref.
      expect(where).toEqual(["/v/a.md:2", "/v/a.md:5", "/v/sub/b.md:9"])
    })

    it("groups the active file under its real path, not the anonymous model URI", async () => {
      const out = (await refs("@lem:x"))!
      expect(out.every((l) => l.uri.scheme === "file")).toBe(true)
    })

    it("works from the {#label} definition too", async () => {
      const out = (await refs("{#lem:x}"))!
      expect(out.map((l) => `${l.uri.path}:${l.range.startLineNumber}`).sort()).toEqual([
        "/v/a.md:2",
        "/v/a.md:5",
        "/v/sub/b.md:9",
      ])
    })

    it("lists the notes linking to a wikilink target", async () => {
      const out = (await refs("[[b#Deep Heading]]"))!
      expect(out.map((l) => l.uri.path)).toEqual(["/v/a.md"])
    })

    it("returns null when nothing refers to the construct", async () => {
      expect(await refs("[[missing]]")).toBeNull()
    })
  })

  describe("links", () => {
    it("underlines navigable spans only, with a nav-scheme url", async () => {
      const { links } = (await p.links.provideLinks(model as never, cancelToken))!
      const spans = links.map((l) => {
        const r = l.range as { startLineNumber: number; startColumn: number; endColumn: number }
        return model.getLineContent(r.startLineNumber).slice(r.startColumn - 1, r.endColumn - 1)
      })
      expect(spans).toEqual(["@lem:x", "[[b#Deep Heading]]", "@sub/b@thm:y", "@key1", "@key2"])
      const first = links[0].url as FakeUri
      expect(first.scheme).toBe("comdtex-nav")
      expect(new URLSearchParams(first.query).get("path")).toBe("/v/a.md")
      expect(new URLSearchParams(first.query).get("line")).toBe("2")
    })
  })
})

describe("find usages across many notes", () => {
  it("keeps every model of the result list alive, however long the list is", async () => {
    resetEditorNavigation()
    const fake = createFakeMonaco()
    const many: NavFile[] = [
      { path: "/v/a.md", name: "a.md", content: A_TEXT },
      ...Array.from({ length: 60 }, (_, i) => ({
        path: `/v/n/note-${i}.md`,
        name: `note-${i}.md`,
        content: `uses @lem:x in note ${i}`,
      })),
    ]
    configureEditorNavigation({ getActivePath: () => "/v/a.md", getFiles: () => many })
    const p = createNavigationProviders(fake.api)
    const model = editorModel(A_TEXT)
    const hits = (await p.references.provideReferences(
      model as never,
      pos(5, 8),
      { includeDeclaration: true },
      cancelToken,
    )) as { uri: FakeUri }[]
    const uris = new Set(hits.map((h) => h.uri.toString()))
    expect(uris.size).toBeGreaterThan(50)
    for (const uri of uris) {
      const shadow = fake.models.get(uri)
      if (shadow) expect(shadow.disposed, uri).toBe(false)
    }
    // A later request may trim what the previous one left behind, never its own results.
    const again = (await p.references.provideReferences(
      model as never,
      pos(5, 8),
      { includeDeclaration: true },
      cancelToken,
    )) as { uri: FakeUri }[]
    for (const h of again) expect(fake.models.get(h.uri.toString())?.disposed ?? false).toBe(false)
    resetEditorNavigation()
  })
})

describe("editor navigation registration", () => {
  let fake: FakeMonaco
  let opened: [string, number, number][]

  beforeEach(() => {
    resetEditorNavigation()
    fake = createFakeMonaco()
    opened = []
    configureEditorNavigation({
      getActivePath: () => "/v/a.md",
      getFiles: () => files,
      openLocation: (path, line, col) => opened.push([path, line, col]),
    })
  })
  afterEach(() => {
    disposeEditorNavigation()
    resetEditorNavigation()
  })

  it("registers definition, references, link and hover providers per language", () => {
    registerEditorNavigation(fake.api, ["markdown", "latex"])
    const kinds = fake.providers.map((p) => `${p.language}:${p.kind}`).sort()
    expect(kinds).toEqual([
      "latex:definition",
      "latex:hover",
      "latex:links",
      "latex:references",
      "markdown:definition",
      "markdown:hover",
      "markdown:links",
      "markdown:references",
    ])
  })

  it("defaults to markdown and replaces its previous registration", () => {
    registerEditorNavigation(fake.api)
    registerEditorNavigation(fake.api)
    expect(fake.providers).toHaveLength(4)
    expect(fake.editorOpeners).toHaveLength(1)
    expect(fake.linkOpeners).toHaveLength(1)
  })

  it("routes a click on another note's shadow model to the app's open routine", async () => {
    registerEditorNavigation(fake.api)
    const p = createNavigationProviders(fake.api)
    const model = editorModel("see @sub/b@thm:y")
    const [hit] = (await p.definition.provideDefinition(
      model as never,
      pos(1, 6),
      cancelToken,
    )) as { uri: FakeUri }[]
    const handled = fake.editorOpeners[0].openCodeEditor({} as never, hit.uri as never, {
      startLineNumber: 5,
      startColumn: 11,
      endLineNumber: 5,
      endColumn: 11,
    })
    expect(handled).toBe(true)
    expect(opened).toEqual([["/v/sub/b.md", 5, 11]])
  })

  it("makes an editor read-only while it shows a shadow model, and only then", async () => {
    registerEditorNavigation(fake.api)
    const p = createNavigationProviders(fake.api)
    const model = editorModel("see @sub/b@thm:y")
    const [hit] = (await p.definition.provideDefinition(
      model as never,
      pos(1, 6),
      cancelToken,
    )) as { uri: FakeUri }[]
    const shadow = fake.models.get(hit.uri.toString())!

    const options: Record<string, unknown>[] = []
    let onModel: () => void = () => {}
    let current: unknown = shadow
    const peek = {
      getModel: () => current,
      updateOptions: (o: Record<string, unknown>) => options.push(o),
      onDidChangeModel: (l: () => void) => {
        onModel = l
        return { dispose() {} }
      },
    }
    for (const listener of fake.createListeners) listener(peek)
    expect(options).toEqual([{ readOnly: true }])

    // The same editor moving to a real model gets its flag back.
    current = model
    onModel()
    expect(options).toEqual([{ readOnly: true }, { readOnly: false }])

    // An editor that never showed a shadow is left alone.
    const main = { ...peek, getModel: () => model, updateOptions: vi.fn() }
    for (const listener of fake.createListeners) listener(main)
    expect(main.updateOptions).not.toHaveBeenCalled()
  })

  it("leaves resources it does not own to Monaco", () => {
    registerEditorNavigation(fake.api)
    expect(
      fake.editorOpeners[0].openCodeEditor({} as never, new FakeUri("file", "/other") as never),
    ).toBe(false)
  })

  it("handles its own link scheme and nothing else", () => {
    registerEditorNavigation(fake.api)
    const opener = fake.linkOpeners[0]
    const url = new FakeUri("comdtex-nav", "/", "path=%2Fv%2Fa.md&line=7&col=3")
    expect(opener.open(url as never)).toBe(true)
    expect(opened).toEqual([["/v/a.md", 7, 3]])
    expect(opener.open(new FakeUri("https", "//example.com") as never)).toBe(false)
  })
})

describe("palette commands", () => {
  it("runs Monaco's own go-to-definition and references actions", async () => {
    const run = vi.fn(async () => {})
    const editor = {
      getAction: vi.fn(() => ({ run })),
      trigger: vi.fn(),
    }
    await goToDefinition(editor as never)
    await findUsages(editor as never)
    expect(editor.getAction).toHaveBeenNthCalledWith(1, "editor.action.revealDefinition")
    expect(editor.getAction).toHaveBeenNthCalledWith(2, "editor.action.goToReferences")
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("falls back to trigger when the action is missing", async () => {
    const editor = { getAction: vi.fn(() => null), trigger: vi.fn() }
    await findUsages(editor as never)
    expect(editor.trigger).toHaveBeenCalledWith("comdtex", "editor.action.goToReferences", null)
  })

  it("canNavigateAt tells whether the caret is on something navigable", () => {
    const m = editorModel("a [[note]] b")
    expect(canNavigateAt(m, pos(1, 5))).toBe(true)
    expect(canNavigateAt(m, pos(1, 1))).toBe(false)
  })
})
