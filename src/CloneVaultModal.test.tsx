// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import CloneVaultModal from "./CloneVaultModal"
import { LANGS, LanguageContext } from "./i18n"
import type { CloneHost } from "./vaultClone"

vi.mock("@tauri-apps/api/path", () => ({ documentDir: async () => "/home/ada/Documents" }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }))

afterEach(cleanup)

function host(over: Partial<{ code: number; stderr: string[]; hang: boolean }> = {}) {
  const calls: string[] = []
  let close: (c: number | null) => void = () => undefined
  const h: CloneHost = {
    async spawn(args, _env, handlers) {
      calls.push(args.join(" "))
      close = handlers.onClose
      for (const c of over.stderr ?? []) handlers.onStderr(c)
      if (!over.hang) queueMicrotask(() => handlers.onClose(over.code ?? 0))
      return { kill: async () => queueMicrotask(() => close(null)) }
    },
    prepare: async (parent, name) => ({
      temp: `${parent}/.comdtex-clone-1`,
      dest: `${parent}/${name}`,
    }),
    finish: async () => undefined,
    discard: async () => {
      calls.push("discard")
    },
  }
  return { h, calls }
}

function setup(h: CloneHost) {
  const onCloned = vi.fn()
  const onClose = vi.fn()
  render(
    <LanguageContext.Provider value={LANGS.en}>
      <CloneVaultModal open host={h} onCloned={onCloned} onClose={onClose} />
    </LanguageContext.Provider>,
  )
  return { onCloned, onClose }
}

describe("CloneVaultModal", () => {
  it("fills the folder name from the address and blocks a bad address", async () => {
    setup(host().h)
    const field = screen.getByLabelText("Repository address")
    fireEvent.change(field, { target: { value: "https://github.com/ada/notes.git" } })
    expect(screen.getByLabelText("Folder name")).toHaveProperty("value", "notes")
    await waitFor(() => expect(screen.getByText(/Will be created at/)).toBeTruthy())
    const go = screen.getByRole("button", { name: "Download and open" })
    expect(go).toHaveProperty("disabled", false)
    fireEvent.change(field, { target: { value: "ext::sh -c id" } })
    expect(screen.getByRole("alert").textContent).toMatch(/not allowed/)
    expect(go).toHaveProperty("disabled", true)
    fireEvent.change(field, { target: { value: "--upload-pack=x" } })
    expect(screen.getByRole("alert").textContent).toMatch(/dash/)
  })

  it("clones and hands the new folder to the app", async () => {
    const { h, calls } = host({ stderr: ["Receiving objects:  50% (1/2), 2 KiB | 1 KiB/s\r"] })
    const { onCloned, onClose } = setup(h)
    fireEvent.change(screen.getByLabelText("Repository address"), {
      target: { value: "git@github.com:ada/notes.git" },
    })
    await waitFor(() => expect(screen.getByText(/Will be created at/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Download and open" }))
    await waitFor(() => expect(onCloned).toHaveBeenCalledWith("/home/ada/Documents/notes"))
    expect(onClose).toHaveBeenCalled()
    expect(calls[0]).toContain(
      "-- git@github.com:ada/notes.git /home/ada/Documents/.comdtex-clone-1",
    )
  })

  it("explains a login failure in plain words and keeps the form", async () => {
    const { h } = host({
      code: 128,
      stderr: ["fatal: could not read Username for 'https://x': terminal prompts disabled\n"],
    })
    const { onCloned } = setup(h)
    fireEvent.change(screen.getByLabelText("Repository address"), {
      target: { value: "https://github.com/ada/private.git" },
    })
    await waitFor(() => expect(screen.getByText(/Will be created at/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Download and open" }))
    const err = await screen.findByTestId("clone-error")
    expect(err.textContent).toMatch(/SSH key or a git credential helper/)
    expect(onCloned).not.toHaveBeenCalled()
  })

  it("cancels a running download and keeps nothing", async () => {
    const { h, calls } = host({ hang: true })
    const { onCloned } = setup(h)
    fireEvent.change(screen.getByLabelText("Repository address"), {
      target: { value: "https://github.com/ada/big.git" },
    })
    await waitFor(() => expect(screen.getByText(/Will be created at/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Download and open" }))
    const cancel = await screen.findByRole("button", { name: "Cancel" })
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    fireEvent.click(cancel)
    const err = await screen.findByTestId("clone-error")
    expect(err.textContent).toMatch(/cancelled/)
    expect(calls).toContain("discard")
    expect(onCloned).not.toHaveBeenCalled()
  })
})
