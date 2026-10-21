// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import FileTree from "./FileTree"
import { LANGS, LanguageContext } from "./i18n"
import type { FileNode } from "./types"

const ROOT = "/v"
const file = (path: string): FileNode => ({
  name: path.split("/").pop()!,
  path,
  type: "file",
  ext: path.split(".").pop(),
})
const dir = (path: string, children: FileNode[]): FileNode => ({
  name: path.split("/").pop()!,
  path,
  type: "dir",
  children,
})

const TREE: FileNode[] = [
  dir(`${ROOT}/notes`, [file(`${ROOT}/notes/mixing.md`)]),
  dir(`${ROOT}/papers`, [file(`${ROOT}/papers/spectral-gap.md`), file(`${ROOT}/papers/refs.bib`)]),
  file(`${ROOT}/readme.md`),
]

function setup(over: Partial<React.ComponentProps<typeof FileTree>> = {}) {
  const props: React.ComponentProps<typeof FileTree> = {
    vaultPath: ROOT,
    tree: TREE,
    activePath: `${ROOT}/papers/spectral-gap.md`,
    onSelectVault: vi.fn(),
    onOpenFile: vi.fn(),
    onCreateFile: vi.fn(async () => undefined),
    onCreateFolder: vi.fn(async (name: string, parent?: string) => `${parent ?? ROOT}/${name}`),
    onDeleteFile: vi.fn(),
    onRenameFile: vi.fn(async (oldPath: string, name: string) => {
      const dirPath = oldPath.slice(0, oldPath.lastIndexOf("/"))
      return `${dirPath}/${name}`
    }),
    onMoveFile: vi.fn(async (from: string, to: string) => `${to}/${from.split("/").pop()}`),
    ...over,
  }
  const view = render(
    <LanguageContext.Provider value={LANGS.en}>
      <FileTree {...props} />
    </LanguageContext.Provider>,
  )
  return { props, view }
}

const newFileBtn = () => screen.getByRole("button", { name: "New file" })
const newFolderBtn = () => screen.getByRole("button", { name: "New folder" })
const createInput = (label = "New file") => screen.getByRole("textbox", { name: label })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })

beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("inline create row", () => {
  it("opens inside the folder of the active note, focused, indented as its children", () => {
    setup()
    fireEvent.click(newFileBtn())
    const input = createInput()
    expect(document.activeElement).toBe(input)
    // Inside papers/: the row's wrapper sits in the papers treeitem.
    const papers = screen.getByRole("treeitem", { name: /papers/ })
    expect(within(papers).getByRole("textbox", { name: "New file" })).toBe(input)
    // Same depth as papers' other children (depth 1).
    const row = input.closest(".tree-row") as HTMLElement
    expect(row.style.getPropertyValue("--depth")).toBe("1")
    // No separate input at the top of the sidebar any more.
    expect(document.querySelector(".tree-new-input")).toBeNull()
  })

  it("uses the selected folder over the active note's folder", () => {
    setup()
    fireEvent.click(screen.getByLabelText("Folder: notes"))
    fireEvent.click(newFileBtn())
    const notes = screen.getByRole("treeitem", { name: /notes/ })
    expect(within(notes).getByRole("textbox", { name: "New file" })).toBeTruthy()
  })

  it("goes to the vault root when nothing is active or selected", () => {
    setup({ activePath: null })
    fireEvent.click(newFileBtn())
    const row = createInput().closest(".tree-row") as HTMLElement
    expect(row.style.getPropertyValue("--depth")).toBe("0")
  })

  it("expands a collapsed target folder", () => {
    setup({ activePath: null })
    const papers = screen.getByLabelText("Folder: papers")
    fireEvent.click(papers) // collapse and select
    expect(screen.queryByLabelText("spectral-gap.md")).toBeNull()
    fireEvent.click(newFileBtn())
    expect(screen.getByLabelText("spectral-gap.md")).toBeTruthy()
    expect(createInput()).toBeTruthy()
  })

  it("Enter creates with .md added, in that folder", async () => {
    const { props } = setup()
    fireEvent.click(newFileBtn())
    type(createInput(), "draft")
    fireEvent.keyDown(createInput(), { key: "Enter" })
    expect(props.onCreateFile).toHaveBeenCalledWith("draft.md", `${ROOT}/papers`)
    expect(screen.queryByRole("textbox", { name: "New file" })).toBeNull()
  })

  it("keeps .tex, .bib, .csv and .typ", () => {
    for (const [typed, final] of [
      ["a.tex", "a.tex"],
      ["b.bib", "b.bib"],
      ["c.csv", "c.csv"],
      ["d.typ", "d.typ"],
    ]) {
      const { props } = setup()
      fireEvent.click(newFileBtn())
      type(createInput(), typed)
      fireEvent.keyDown(createInput(), { key: "Enter" })
      expect(props.onCreateFile).toHaveBeenCalledWith(final, `${ROOT}/papers`)
      cleanup()
    }
  })

  it("passes undefined for the vault root", () => {
    const { props } = setup({ activePath: null })
    fireEvent.click(newFileBtn())
    type(createInput(), "top")
    fireEvent.keyDown(createInput(), { key: "Enter" })
    expect(props.onCreateFile).toHaveBeenCalledWith("top.md", undefined)
  })

  it("Escape cancels without creating", () => {
    const { props } = setup()
    fireEvent.click(newFileBtn())
    type(createInput(), "draft")
    fireEvent.keyDown(createInput(), { key: "Escape" })
    expect(props.onCreateFile).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox", { name: "New file" })).toBeNull()
  })

  it("blur with a valid name creates; blur on empty cancels", () => {
    const a = setup()
    fireEvent.click(newFileBtn())
    type(createInput(), "kept")
    fireEvent.blur(createInput())
    expect(a.props.onCreateFile).toHaveBeenCalledWith("kept.md", `${ROOT}/papers`)
    cleanup()

    const b = setup()
    fireEvent.click(newFileBtn())
    fireEvent.blur(createInput())
    expect(b.props.onCreateFile).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox", { name: "New file" })).toBeNull()
  })

  it("does not settle when the whole window loses focus", () => {
    const { props } = setup()
    fireEvent.click(newFileBtn())
    type(createInput(), "pending")
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    fireEvent.blur(createInput())
    expect(props.onCreateFile).not.toHaveBeenCalled()
    expect(createInput()).toBeTruthy()
  })

  it("shows the problem under the input and refuses Enter and blur", () => {
    const { props } = setup()
    fireEvent.click(newFileBtn())
    const cases: [string, RegExp][] = [
      ["a/b", /not allowed/],
      ["a:b", /not allowed/],
      ["..", /only dots/],
      [" lead", /start or end/],
      ["trail.", /start or end/],
      ["nul", /Reserved/],
      ["spectral-gap", /already exists in this folder/],
      ["SPECTRAL-GAP", /already exists here/],
      ["refs.bib", /already exists in this folder/],
    ]
    for (const [value, message] of cases) {
      type(createInput(), value)
      const alert = screen.getByRole("alert")
      expect(alert.textContent).toMatch(message)
      expect(createInput().getAttribute("aria-invalid")).toBe("true")
      fireEvent.keyDown(createInput(), { key: "Enter" })
      expect(props.onCreateFile).not.toHaveBeenCalled()
      expect(screen.getByRole("textbox", { name: "New file" })).toBeTruthy()
    }
    // A valid name clears the message.
    type(createInput(), "fine")
    expect(screen.queryByRole("alert")).toBeNull()
    // Blur on an invalid name cancels rather than creating.
    type(createInput(), "bad|name")
    fireEvent.blur(createInput())
    expect(props.onCreateFile).not.toHaveBeenCalled()
  })

  it("stays quiet while empty (no message before typing)", () => {
    setup()
    fireEvent.click(newFileBtn())
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.keyDown(createInput(), { key: "Enter" })
    expect(screen.getByRole("textbox", { name: "New file" })).toBeTruthy()
  })

  it("shows a file icon for a file and creates folders through the folder button", async () => {
    const { props } = setup()
    fireEvent.click(newFolderBtn())
    const input = createInput("New folder")
    type(input, "drafts")
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" })
    })
    expect(props.onCreateFolder).toHaveBeenCalledWith("drafts", `${ROOT}/papers`)
  })

  it("a folder row leads the folders; a file row leads the files", () => {
    setup({ activePath: null })
    fireEvent.click(newFolderBtn())
    const rows = Array.from(
      document.querySelectorAll(".tree-list > [role='treeitem'], .tree-list > .tree-edit"),
    )
    expect(rows[0].classList.contains("tree-edit")).toBe(true)
    cleanup()
    setup({ activePath: null })
    fireEvent.click(newFileBtn())
    const rows2 = Array.from(
      document.querySelectorAll(".tree-list > [role='treeitem'], .tree-list > .tree-edit"),
    )
    // Folders (notes, papers) first, then the new row, then readme.md.
    expect(rows2[2].classList.contains("tree-edit")).toBe(true)
  })

  it("the folder context menu and a file's context menu aim at the right folder", () => {
    const { props } = setup()
    fireEvent.contextMenu(screen.getByLabelText("Folder: notes"))
    fireEvent.mouseDown(screen.getByText("New file here"))
    type(createInput(), "inner")
    fireEvent.keyDown(createInput(), { key: "Enter" })
    expect(props.onCreateFile).toHaveBeenLastCalledWith("inner.md", `${ROOT}/notes`)

    fireEvent.contextMenu(screen.getByLabelText("refs.bib"))
    fireEvent.mouseDown(screen.getByText("New folder here"))
    type(createInput("New folder"), "next-to-refs")
    fireEvent.keyDown(createInput("New folder"), { key: "Enter" })
    expect(props.onCreateFolder).toHaveBeenLastCalledWith("next-to-refs", `${ROOT}/papers`)
  })

  it("an outside request (palette command) opens the same row", () => {
    const { view, props } = setup()
    view.rerender(
      <LanguageContext.Provider value={LANGS.en}>
        <FileTree {...props} createRequest={{ kind: "file", nonce: 1 }} />
      </LanguageContext.Provider>,
    )
    expect(createInput()).toBeTruthy()
  })

  it("reports the selection so other flows can follow the same rule", () => {
    const onSelectionChange = vi.fn()
    setup({ onSelectionChange })
    expect(onSelectionChange).toHaveBeenLastCalledWith(`${ROOT}/papers/spectral-gap.md`, false)
    fireEvent.click(screen.getByLabelText("Folder: notes"))
    expect(onSelectionChange).toHaveBeenLastCalledWith(`${ROOT}/notes`, true)
  })
})

describe("inline rename", () => {
  const startRename = (name: string) => fireEvent.doubleClick(screen.getByLabelText(name))

  it("happens in the row and selects the base name without the extension", () => {
    setup()
    startRename("spectral-gap.md")
    const input = screen.getByRole("textbox", {
      name: "Rename spectral-gap.md",
    }) as HTMLInputElement
    expect(input.closest(".tree-row")).toBeTruthy()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe("spectral-gap".length)
    expect(document.querySelector(".tree-new-input")).toBeNull()
  })

  it("F2 and the context menu rename in the row too", () => {
    setup()
    fireEvent.click(screen.getByLabelText("refs.bib"))
    fireEvent.keyDown(screen.getByRole("tree"), { key: "F2" })
    expect(screen.getByRole("textbox", { name: "Rename refs.bib" })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename refs.bib" }), { key: "Escape" })
    fireEvent.contextMenu(screen.getByLabelText("Folder: notes"))
    fireEvent.mouseDown(screen.getByText("Rename"))
    const input = screen.getByRole("textbox", { name: "Rename notes" }) as HTMLInputElement
    expect(input.selectionEnd).toBe("notes".length)
  })

  it("Enter renames, keeping the extension when none is typed", () => {
    const { props } = setup()
    startRename("refs.bib")
    type(screen.getByRole("textbox", { name: "Rename refs.bib" }), "bibliography")
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename refs.bib" }), { key: "Enter" })
    expect(props.onRenameFile).toHaveBeenCalledWith(`${ROOT}/papers/refs.bib`, "bibliography.bib")
  })

  it("Escape restores the name without renaming", () => {
    const { props } = setup()
    startRename("refs.bib")
    const input = screen.getByRole("textbox", { name: "Rename refs.bib" })
    type(input, "changed")
    fireEvent.keyDown(input, { key: "Escape" })
    expect(props.onRenameFile).not.toHaveBeenCalled()
    expect(screen.getByLabelText("refs.bib")).toBeTruthy()
  })

  it("blur commits a valid change and cancels an unchanged or invalid one", () => {
    const a = setup()
    startRename("refs.bib")
    type(screen.getByRole("textbox", { name: "Rename refs.bib" }), "other.bib")
    fireEvent.blur(screen.getByRole("textbox", { name: "Rename refs.bib" }))
    expect(a.props.onRenameFile).toHaveBeenCalledWith(`${ROOT}/papers/refs.bib`, "other.bib")
    cleanup()

    const b = setup()
    startRename("refs.bib")
    fireEvent.blur(screen.getByRole("textbox", { name: "Rename refs.bib" }))
    expect(b.props.onRenameFile).not.toHaveBeenCalled()
    cleanup()

    const c = setup()
    startRename("refs.bib")
    type(screen.getByRole("textbox", { name: "Rename refs.bib" }), "bad?")
    fireEvent.blur(screen.getByRole("textbox", { name: "Rename refs.bib" }))
    expect(c.props.onRenameFile).not.toHaveBeenCalled()
  })

  it("validates like create: invalid characters and clashes with siblings", () => {
    const { props } = setup()
    startRename("refs.bib")
    const input = screen.getByRole("textbox", { name: "Rename refs.bib" })
    type(input, "spectral-gap.md")
    expect(screen.getByRole("alert").textContent).toMatch(/already exists/)
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onRenameFile).not.toHaveBeenCalled()
    type(input, "a*b")
    expect(screen.getByRole("alert").textContent).toMatch(/not allowed/)
    type(input, "")
    expect(screen.getByRole("alert").textContent).toMatch(/Type a name/)
  })

  it("allows a case-only rename of the same file", () => {
    const { props } = setup()
    startRename("refs.bib")
    type(screen.getByRole("textbox", { name: "Rename refs.bib" }), "REFS.bib")
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename refs.bib" }), { key: "Enter" })
    expect(props.onRenameFile).toHaveBeenCalledWith(`${ROOT}/papers/refs.bib`, "REFS.bib")
  })

  it("renames folders in the row", () => {
    const { props } = setup()
    fireEvent.keyDown(
      (fireEvent.click(screen.getByLabelText("Folder: notes")), screen.getByRole("tree")),
      { key: "F2" },
    )
    const input = screen.getByRole("textbox", { name: "Rename notes" })
    type(input, "ideas")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onRenameFile).toHaveBeenCalledWith(`${ROOT}/notes`, "ideas")
  })

  it("keys typed in the field never reach the tree shortcuts (Delete does not delete)", () => {
    const { props } = setup()
    startRename("refs.bib")
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename refs.bib" }), { key: "Delete" })
    expect(props.onDeleteFile).not.toHaveBeenCalled()
  })
})

describe("drag and drop", () => {
  const dt = (data: Record<string, string>) => ({
    getData: (k: string) => data[k] ?? "",
    setData: vi.fn(),
    dropEffect: "",
    effectAllowed: "",
  })

  it("highlights the target folder while over it and clears it on leave and drop", () => {
    setup()
    const target = screen.getByLabelText("Folder: notes")
    const transfer = dt({ "text/plain": `${ROOT}/readme.md` })
    fireEvent.dragOver(target, { dataTransfer: transfer })
    expect(target.classList.contains("tree-drop-target")).toBe(true)
    fireEvent.dragLeave(target, { dataTransfer: transfer, relatedTarget: document.body })
    expect(target.classList.contains("tree-drop-target")).toBe(false)
    fireEvent.dragOver(target, { dataTransfer: transfer })
    fireEvent.drop(target, { dataTransfer: transfer })
    expect(target.classList.contains("tree-drop-target")).toBe(false)
  })

  it("moves, then selects the moved item and keeps its folder open", async () => {
    const { props } = setup()
    const transfer = dt({ "text/plain": `${ROOT}/readme.md` })
    await act(async () => {
      fireEvent.drop(screen.getByLabelText("Folder: notes"), { dataTransfer: transfer })
    })
    expect(props.onMoveFile).toHaveBeenCalledWith(`${ROOT}/readme.md`, `${ROOT}/notes`)
  })

  it("dropping on the empty tree area moves to the vault root", async () => {
    const { props } = setup()
    const transfer = dt({ "text/plain": `${ROOT}/papers/refs.bib` })
    await act(async () => {
      fireEvent.drop(document.querySelector(".tree-list") as HTMLElement, {
        dataTransfer: transfer,
      })
    })
    expect(props.onMoveFile).toHaveBeenCalledWith(`${ROOT}/papers/refs.bib`, ROOT)
  })

  it("folders are draggable too", () => {
    setup()
    expect(screen.getByLabelText("Folder: notes").getAttribute("draggable")).toBe("true")
  })
})

describe("selection follows the active note", () => {
  it("expands the folders above a newly active file", () => {
    const { view, props } = setup({ activePath: null })
    fireEvent.click(screen.getByLabelText("Folder: notes")) // collapse
    expect(screen.queryByLabelText("mixing.md")).toBeNull()
    view.rerender(
      <LanguageContext.Provider value={LANGS.en}>
        <FileTree {...props} activePath={`${ROOT}/notes/mixing.md`} />
      </LanguageContext.Provider>,
    )
    expect(screen.getByLabelText("mixing.md")).toBeTruthy()
  })

  it("a reveal request selects and expands without opening", () => {
    const { view, props } = setup({ activePath: null })
    fireEvent.click(screen.getByLabelText("Folder: notes"))
    view.rerender(
      <LanguageContext.Provider value={LANGS.en}>
        <FileTree {...props} revealRequest={{ path: `${ROOT}/notes/mixing.md`, nonce: 1 }} />
      </LanguageContext.Provider>,
    )
    expect(screen.getByLabelText("mixing.md").classList.contains("tree-focused")).toBe(true)
    expect(props.onOpenFile).not.toHaveBeenCalled()
  })
})
