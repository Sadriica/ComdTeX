// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { LANGS, LanguageContext } from "./i18n"
import CommandPalette, { PALETTE_MAX_ROWS, type CommandPaletteProps } from "./CommandPalette"
import { parseBibtex } from "./bibtex"
import type { CursorContext, PaletteCommand } from "./paletteTypes"
import type { StructuralLabel } from "./structuralLabels"
import { loadPalettePrefs } from "./palettePrefs"
import { STORAGE_KEYS } from "./storageKeys"

const ROOT = "/v"
const FILES = [
  "papers/spectral-gap.md",
  "papers/typesetting.md",
  "notes/mixing-times.md",
  "notes/reading-list.md",
].map((p) => ({ path: `${ROOT}/${p}`, name: p.split("/").pop() as string }))

const DOC = ["# Intro", "text", ":::theorem[Gap]{#thm:gap}", "x", ":::", "## Methods", "more"].join(
  "\n",
)

const NOTE_TEXT = "# Alpha\n\n## Beta section\n\n```\n# not heading\n```\n"

const LABELS: StructuralLabel[] = [
  {
    id: "thm:gap",
    kind: "thm",
    name: "gap",
    filePath: `${ROOT}/papers/spectral-gap.md`,
    fileName: "spectral-gap.md",
    line: 3,
    context: ":::theorem[Gap]{#thm:gap}",
  },
  {
    id: "def:cheeger",
    kind: "def",
    name: "cheeger",
    filePath: `${ROOT}/notes/mixing-times.md`,
    fileName: "mixing-times.md",
    line: 9,
    context: ":::definition{#def:cheeger}",
  },
]

const BIB = parseBibtex(`
@article{alon1986, author = {Alon, Noga}, title = {Eigenvalues and expanders}, year = {1986}}
@book{levin2017, author = {Levin, David A. and Peres, Yuval}, title = {Markov Chains and Mixing Times}, year = {2017}}
`)

const CTX_TABLE: CursorContext = {
  lineNumber: 1,
  column: 1,
  line: "| a |",
  hasSelection: false,
  inMath: null,
  block: null,
  inCodeFence: false,
  inTable: true,
  label: null,
  ref: null,
  citation: false,
  onGap: false,
}

function makeCommands(run: Record<string, () => void> = {}): PaletteCommand[] {
  const fn = (id: string) => run[id] ?? (() => {})
  return [
    { id: "save", label: "Save", category: "Edición", action: fn("save") },
    { id: "find", label: "Find in file", category: "Edición", action: fn("find") },
    {
      id: "fmt:normalizeTable",
      label: "Normalize table",
      category: "Edición",
      here: (c) => c.inTable,
      action: fn("normalize"),
    },
    {
      id: "here:mathToDisplay",
      label: "Convert to display math",
      category: "Matemáticas",
      when: (c) => c.inMath === "inline",
      action: fn("display"),
    },
    {
      id: "fmt:highlight",
      label: "Highlight",
      category: "Edición",
      children: [{ id: "hl:yellow", label: "Yellow", action: fn("yellow") }],
    },
    { id: "ins:table", label: "Table editor", category: "Insertar", action: fn("table") },
    { id: "focus", label: "Focus mode", category: "Vista", action: fn("focus"), checked: true },
  ]
}

function setup(over: Partial<CommandPaletteProps> = {}) {
  const props: CommandPaletteProps = {
    open: true,
    initialMode: "files",
    onClose: vi.fn(),
    files: FILES,
    vaultRoot: ROOT,
    commands: makeCommands(),
    recentFiles: [],
    activeFilePath: `${ROOT}/papers/spectral-gap.md`,
    onOpenPath: vi.fn(),
    getDocumentText: () => DOC,
    getFileText: () => NOTE_TEXT,
    getCursorContext: () => null,
    labels: LABELS,
    bib: BIB,
    lineCount: () => 40,
    onGoToLine: vi.fn(),
    onInsertCitation: vi.fn(),
    onInsertReference: vi.fn(),
    onCreateNote: vi.fn(),
    ...over,
  }
  const view = render(
    <LanguageContext.Provider value={LANGS.en}>
      <CommandPalette {...props} />
    </LanguageContext.Provider>,
  )
  const input = screen.getByRole("combobox")
  return { props, view, input: input as HTMLInputElement }
}

const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })
const key = (input: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(input, { key: k, ...init })
const options = () => screen.queryAllByRole("option")
const labels = () => options().map((o) => o.querySelector(".palette-label")?.textContent ?? "")

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage())
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => cleanup())

describe("files mode", () => {
  it("opens in files mode: recents first and the folder in the second column", () => {
    setup({ recentFiles: [FILES[2]] })
    expect(screen.getByTestId("palette-mode").textContent).toContain("Files")
    expect(labels()[0]).toBe("mixing-times.md")
    expect(options()[0].textContent).toContain("notes")
    // The folder column shows the folder, not the file name again.
    expect(options()[0].querySelector(".palette-desc")?.textContent).toBe("notes")
  })

  it("filters fuzzily, highlights the match and opens on Enter", () => {
    const { props, input } = setup()
    type(input, "spgap")
    expect(labels()[0]).toBe("spectral-gap.md")
    expect(options()[0].querySelectorAll("mark.palette-hit").length).toBeGreaterThan(0)
    key(input, "Enter")
    expect(props.onOpenPath).toHaveBeenCalledWith(`${ROOT}/papers/spectral-gap.md`)
    expect(props.onClose).toHaveBeenCalled()
  })

  it("offers to create a note when nothing matches, by row and by Shift+Enter", () => {
    const { props, input } = setup()
    type(input, "brand new idea")
    // The label is the full destination, so the user sees where it will land.
    expect(labels()).toEqual(["Create papers/brand new idea.md"])
    key(input, "Enter", { shiftKey: true })
    expect(props.onCreateNote).toHaveBeenCalledWith("brand new idea.md", "papers")
  })

  it("follows the shared target folder rule when the host provides it", () => {
    const { props, input } = setup({ getCreateFolderRel: () => "notes/deep" })
    type(input, "draft")
    expect(labels()).toContain("Create notes/deep/draft.md")
    key(input, "Enter", { shiftKey: true })
    expect(props.onCreateNote).toHaveBeenCalledWith("draft.md", "notes/deep")
  })

  it("says why a name cannot be created instead of offering a bad row", () => {
    const { input } = setup()
    type(input, "con")
    expect(labels()).toEqual(["Cannot create a note: Reserved name on Windows"])
  })

  it("still offers Create after real matches, as the last row", () => {
    const { input } = setup()
    type(input, "notes")
    const all = labels()
    expect(all[all.length - 1]).toMatch(/^Create papers\/notes\.md$/)
  })

  it("jumps to a heading of another note with note#heading", () => {
    const { props, input } = setup()
    type(input, "mixing#beta")
    expect(labels()).toEqual(["Beta section"])
    key(input, "Enter")
    expect(props.onOpenPath).toHaveBeenCalledWith(`${ROOT}/notes/mixing-times.md`, 3)
  })

  it("explains an unknown note in note#heading", () => {
    const { input } = setup()
    type(input, "zzzzzz#x")
    expect(screen.getByRole("option").textContent).toContain('No note matches "zzzzzz"')
  })
})

describe("commands mode", () => {
  it("> switches to commands and shows the chip; backspace on empty returns to files", () => {
    const { input } = setup()
    type(input, ">")
    expect(screen.getByTestId("palette-mode").textContent).toContain("Commands")
    expect(input.value).toBe("")
    key(input, "Backspace")
    expect(screen.getByTestId("palette-mode").textContent).toContain("Files")
  })

  it("opens straight into commands for Ctrl+Shift+P", () => {
    setup({ initialMode: "commands" })
    expect(screen.getByTestId("palette-mode").textContent).toContain("Commands")
  })

  it("the empty view lists categories, not every command", () => {
    setup({ initialMode: "commands" })
    const l = labels()
    expect(l).toContain("Edit")
    expect(l).toContain("Insert")
    expect(l).not.toContain("Save")
  })

  it("drills into a category and Escape steps back before closing", () => {
    const { props, input } = setup({ initialMode: "commands" })
    fireEvent.click(options().find((o) => o.textContent?.startsWith("Edit"))!)
    expect(labels()).toContain("Save")
    key(input, "Escape")
    expect(labels()).toContain("Edit")
    expect(props.onClose).not.toHaveBeenCalled()
    key(input, "Escape")
    expect(props.onClose).toHaveBeenCalled()
  })

  it("runs a command on click, not on mouse down", () => {
    const save = vi.fn()
    const { props, input } = setup({ initialMode: "commands", commands: makeCommands({ save }) })
    type(input, "save")
    const row = options()[0]
    fireEvent.mouseDown(row)
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(row)
    expect(save).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalled()
  })

  it("finds children while filtering and shows their parent", () => {
    const yellow = vi.fn()
    const { input } = setup({ initialMode: "commands", commands: makeCommands({ yellow }) })
    type(input, "yellow")
    expect(labels()).toEqual(["Yellow"])
    expect(options()[0].querySelector(".palette-desc")?.textContent).toBe("Highlight")
    key(input, "Enter")
    expect(yellow).toHaveBeenCalled()
  })

  it("hides `when` commands unless the cursor context allows them", () => {
    const { view, input } = setup({ initialMode: "commands" })
    type(input, "display")
    expect(options()).toHaveLength(0)
    view.unmount()
    cleanup()
    const inline: CursorContext = { ...CTX_TABLE, inTable: false, inMath: "inline" }
    const again = setup({ initialMode: "commands", getCursorContext: () => inline })
    type(again.input, "display")
    expect(labels()).toEqual(["Convert to display math"])
  })

  it("shows a Here group first for the context under the cursor", () => {
    setup({ initialMode: "commands", getCursorContext: () => CTX_TABLE })
    expect(labels()[0]).toBe("Normalize table")
    expect(screen.getByText("Here")).toBeTruthy()
  })

  it("shows the registry shortcut as key caps and a check on toggles", () => {
    const { input } = setup({ initialMode: "commands" })
    type(input, "save")
    const kbds = [...options()[0].querySelectorAll("kbd")].map((k) => k.textContent)
    expect(kbds).toEqual(["Ctrl", "S"])
    type(input, "focus")
    expect(options()[0].querySelector(".palette-check")).not.toBeNull()
  })
})

describe("recents and pins", () => {
  it("records the command run, with its count, and lists it as Recent next time", () => {
    const save = vi.fn()
    const first = setup({ initialMode: "commands", commands: makeCommands({ save }) })
    type(first.input, "save")
    key(first.input, "Enter")
    key(first.input, "Enter")
    const prefs = loadPalettePrefs()
    expect(prefs.recent[0].id).toBe("save")
    cleanup()

    setup({ initialMode: "commands" })
    expect(screen.getByText("Recent")).toBeTruthy()
    expect(labels()[0]).toBe("Save")
  })

  it("pins with Alt+P and with the row button, and lists pins in their own group", () => {
    const { input, view } = setup({ initialMode: "commands" })
    type(input, "find")
    key(input, "p", { altKey: true, code: "KeyP" })
    expect(loadPalettePrefs().pinned).toEqual(["find"])
    type(input, "table")
    fireEvent.click(within(options()[0]).getByLabelText("Pin command"))
    expect(loadPalettePrefs().pinned).toEqual(["find", "table"].slice(0, 1).concat(["ins:table"]))
    view.unmount()
    cleanup()

    setup({ initialMode: "commands" })
    expect(screen.getByText("Pinned")).toBeTruthy()
    expect(labels().slice(0, 2)).toEqual(["Find in file", "Table editor"])
  })

  it("unpins from the button", () => {
    localStorage.setItem(
      STORAGE_KEYS.PALETTE_PREFS,
      JSON.stringify({ v: 1, recent: [], pinned: ["save"] }),
    )
    setup({ initialMode: "commands" })
    fireEvent.click(screen.getByLabelText("Unpin command"))
    expect(loadPalettePrefs().pinned).toEqual([])
  })

  it("a used command outranks an equally good one that was never used", () => {
    localStorage.setItem(
      STORAGE_KEYS.PALETTE_PREFS,
      JSON.stringify({ v: 1, recent: [{ id: "ins:table", count: 5 }], pinned: [] }),
    )
    const { input } = setup({
      initialMode: "commands",
      commands: [
        { id: "a:tab", label: "Tab action", action: () => {} },
        { id: "ins:table", label: "Tab editor", action: () => {} },
      ],
    })
    type(input, "tab")
    expect(labels()[0]).toBe("Tab editor")
  })
})

describe("keyboard and accessibility", () => {
  it("implements the combobox / listbox / option pattern", () => {
    const { input } = setup({ initialMode: "commands" })
    type(input, "i")
    const list = screen.getByRole("listbox")
    expect(input.getAttribute("aria-controls")).toBe(list.id)
    expect(input.getAttribute("aria-expanded")).toBe("true")
    const rows = options()
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.filter((r) => r.getAttribute("aria-selected") === "true")).toHaveLength(1)
    expect(input.getAttribute("aria-activedescendant")).toBe(rows[0].id)
    key(input, "ArrowDown")
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[1].id)
    expect(options()[1].getAttribute("aria-selected")).toBe("true")
    expect(options()[0].getAttribute("aria-selected")).toBe("false")
  })

  it("announces the result count in a polite live region", () => {
    const { input } = setup()
    const region = screen.getByRole("status")
    expect(region.getAttribute("aria-live")).toBe("polite")
    type(input, "typeset")
    expect(region.textContent).toMatch(/^\d+ results?$|^No results$/)
    type(input, "qqqqqq")
    expect(region.textContent).toBe("Create note result".replace("Create note result", "1 result"))
  })

  it("scrolls the selected row into view", () => {
    const { input } = setup({ initialMode: "commands" })
    type(input, "i")
    const spy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
    spy.mockClear()
    key(input, "ArrowDown")
    expect(spy).toHaveBeenCalledWith({ block: "nearest" })
  })

  it("ignores Enter while an IME composition is active", () => {
    const { props, input } = setup()
    type(input, "spectral")
    key(input, "Enter", { isComposing: true })
    expect(props.onOpenPath).not.toHaveBeenCalled()
    key(input, "Enter")
    expect(props.onOpenPath).toHaveBeenCalled()
  })

  it("gives rows stable keys: the DOM node of a row survives a re-filter", () => {
    const { input } = setup()
    type(input, "spectral")
    const before = options()[0]
    type(input, "spectral-gap")
    expect(options()[0]).toBe(before)
  })

  it("renders at most 60 rows and asks the user to keep typing", () => {
    const many: PaletteCommand[] = Array.from({ length: 200 }, (_, i) => ({
      id: `c${i}`,
      label: `Alpha command ${i}`,
      action: () => {},
    }))
    const { input } = setup({ initialMode: "commands", commands: many })
    type(input, "alpha")
    expect(options()).toHaveLength(PALETTE_MAX_ROWS)
    expect(screen.getByText("Showing 60 of 200: keep typing to narrow")).toBeTruthy()
  })

  it("Escape closes, and the page is labelled as a dialog", () => {
    const { props, input } = setup()
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true")
    key(input, "Escape")
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe("@ outline mode", () => {
  it("lists headings and environments of the current document and jumps", () => {
    const { props, input } = setup()
    type(input, "@")
    expect(screen.getByTestId("palette-mode").textContent).toContain("This document")
    expect(labels()).toEqual(["# Intro", "Gap", "## Methods"])
    type(input, "meth")
    expect(labels()).toEqual(["## Methods"])
    key(input, "Enter")
    expect(props.onGoToLine).toHaveBeenCalledWith(6)
  })

  it("says so when there is no document", () => {
    const { input } = setup({ getDocumentText: () => null })
    type(input, "@")
    expect(options()[0].textContent).toContain("Open a document")
  })
})

describe("# labels mode", () => {
  it("jumps in the current file and opens another file at the line", () => {
    const { props, input } = setup()
    type(input, "#")
    expect(labels()).toEqual(["thm:gap", "def:cheeger"])
    key(input, "Enter")
    expect(props.onGoToLine).toHaveBeenCalledWith(3)
    cleanup()

    const other = setup()
    type(other.input, "#cheeger")
    key(other.input, "Enter")
    expect(other.props.onOpenPath).toHaveBeenCalledWith(`${ROOT}/notes/mixing-times.md`, 9)
  })

  it("Alt+Enter inserts a reference; a cross-file env uses the path form", () => {
    const { props, input } = setup()
    type(input, "#cheeger")
    key(input, "Enter", { altKey: true })
    expect(props.onInsertReference).toHaveBeenCalledWith("@notes/mixing-times@def:cheeger")
  })

  it("in insert intent Enter inserts and Alt+Enter jumps", () => {
    const { props, input } = setup({ initialMode: "labels", intent: "insert" })
    type(input, "gap")
    key(input, "Enter")
    expect(props.onInsertReference).toHaveBeenCalledWith("@thm:gap")
    expect(props.onGoToLine).not.toHaveBeenCalled()
  })
})

describe("[ citations mode", () => {
  it("searches by author, title and year and inserts on Enter", () => {
    const { props, input } = setup()
    type(input, "[")
    expect(labels()).toEqual(["Alon 1986", "Levin and Peres 2017"])
    type(input, "markov")
    expect(labels()).toEqual(["Levin and Peres 2017"])
    key(input, "Enter")
    expect(props.onInsertCitation).toHaveBeenCalledWith("levin2017")
  })

  it("says so for an empty bibliography", () => {
    const { input } = setup({ bib: new Map() })
    type(input, "[")
    expect(options()[0].textContent).toContain("No entries in references.bib")
  })
})

describe(": line mode and ? help", () => {
  it("goes to a line and column", () => {
    const { props, input } = setup()
    type(input, ":12:3")
    expect(labels()).toEqual(["Go to line 12, column 3"])
    key(input, "Enter")
    expect(props.onGoToLine).toHaveBeenCalledWith(12, 3)
  })

  it("explains the valid range when the number is wrong", () => {
    const { props, input } = setup()
    type(input, ":abc")
    expect(options()[0].textContent).toContain("1 to 40")
    key(input, "Enter")
    expect(props.onGoToLine).not.toHaveBeenCalled()
  })

  it("? lists the modes, each with its prefix, and Enter switches to one", () => {
    const { input } = setup()
    type(input, "?")
    const l = labels()
    expect(l).toEqual(["Files", "Commands", "This document", "Labels", "Citations", "Line"])
    key(input, "ArrowDown")
    key(input, "Enter")
    expect(screen.getByTestId("palette-mode").textContent).toContain("Commands")
  })
})

describe("closed state", () => {
  it("renders nothing and does no work when closed", () => {
    const getDocumentText = vi.fn(() => DOC)
    render(
      <CommandPalette
        open={false}
        initialMode="files"
        onClose={() => {}}
        files={FILES}
        vaultRoot={ROOT}
        commands={makeCommands()}
        activeFilePath={null}
        onOpenPath={() => {}}
        labels={[]}
        bib={new Map()}
        getDocumentText={getDocumentText}
      />,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(getDocumentText).not.toHaveBeenCalled()
  })

  it("act helper is available", () => {
    expect(typeof act).toBe("function")
  })
})
