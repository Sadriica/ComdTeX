// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import TemplateModal from "./TemplateModal"
import TextPromptModal from "./TextPromptModal"
import { LANGS, LanguageContext } from "./i18n"

afterEach(cleanup)

const en = (node: React.ReactNode) => (
  <LanguageContext.Provider value={LANGS.en}>{node}</LanguageContext.Provider>
)

const FOLDERS = [
  { path: "/v", rel: "", names: ["readme.md", "papers"] },
  { path: "/v/papers", rel: "papers", names: ["spectral-gap.md"] },
]

describe("TemplateModal destination", () => {
  const setup = (defaultFolder = "/v/papers") => {
    const onCreate = vi.fn()
    render(
      en(
        <TemplateModal
          open
          onClose={vi.fn()}
          onCreate={onCreate}
          folders={FOLDERS}
          defaultFolder={defaultFolder}
        />,
      ),
    )
    return { onCreate, input: screen.getByLabelText("File name") }
  }

  it("preselects the folder it was given and shows the full destination before creating", () => {
    const { input } = setup()
    expect((screen.getByLabelText("Folder") as HTMLSelectElement).value).toBe("/v/papers")
    fireEvent.change(input, { target: { value: "draft" } })
    expect(screen.getByText("Creates papers/draft.md")).toBeTruthy()
  })

  it("lets you choose another folder and creates there", () => {
    const { input, onCreate } = setup()
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "/v" } })
    fireEvent.change(input, { target: { value: "top" } })
    expect(screen.getByText("Creates top.md")).toBeTruthy()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onCreate).toHaveBeenCalledWith("top.md", expect.any(String), "/v")
  })

  it("refuses an existing name and invalid names, with the reason", () => {
    const { input, onCreate } = setup()
    fireEvent.change(input, { target: { value: "spectral-gap" } })
    expect(screen.getByText(/already exists in this folder/)).toBeTruthy()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onCreate).not.toHaveBeenCalled()
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.change(input, { target: { value: "a:b" } })
    expect(screen.getByText(/not allowed/)).toBeTruthy()
  })
})

describe("TextPromptModal (replaces window.prompt)", () => {
  it("confirms the trimmed text with Enter and the OK button", () => {
    const onResult = vi.fn()
    render(
      en(
        <TextPromptModal
          request={{ title: "T", label: "Name", initial: "abc" }}
          onResult={onResult}
        />,
      ),
    )
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true")
    const input = screen.getByLabelText("Name")
    fireEvent.change(input, { target: { value: "  hello  " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onResult).toHaveBeenCalledWith("hello")
  })

  it("cancels with Escape and Cancel, and cannot confirm an empty value", () => {
    const onResult = vi.fn()
    render(en(<TextPromptModal request={{ title: "T", label: "Name" }} onResult={onResult} />))
    expect((screen.getByRole("button", { name: "OK" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" })
    expect(onResult).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onResult).toHaveBeenCalledWith(null)
  })

  it("multiline confirms with Ctrl+Enter only", () => {
    const onResult = vi.fn()
    render(
      en(
        <TextPromptModal
          request={{ title: "T", label: "Comment", multiline: true }}
          onResult={onResult}
        />,
      ),
    )
    const area = screen.getByLabelText("Comment")
    fireEvent.change(area, { target: { value: "note" } })
    fireEvent.keyDown(area, { key: "Enter" })
    expect(onResult).not.toHaveBeenCalled()
    fireEvent.keyDown(area, { key: "Enter", ctrlKey: true })
    expect(onResult).toHaveBeenCalledWith("note")
  })

  it("renders nothing without a request", () => {
    render(en(<TextPromptModal request={null} onResult={vi.fn()} />))
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
