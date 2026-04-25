// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

const executed: string[][] = []

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: vi.fn((_cmd: string, args: string[]) => ({
      execute: vi.fn(async () => {
        executed.push(args)
        if (args[2] === "stash" && args[3] === "list") {
          return { code: 0, stdout: "stash@{0}: WIP on main\nstash@{1}: older change", stderr: "" }
        }
        return { code: 0, stdout: "", stderr: "" }
      }),
    })),
  },
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(async () => true),
}))

vi.mock("./toastService", () => ({
  showToast: vi.fn(),
}))

import { StashSection } from "./GitBar"

describe("StashSection", () => {
  beforeEach(() => {
    executed.length = 0
  })

  it("loads stashes on mount and pops the selected stash entry", async () => {
    render(<StashSection vaultPath="/vault" />)

    await waitFor(() => {
      expect(executed).toContainEqual(["-C", "/vault", "stash", "list"])
    })

    fireEvent.click(screen.getByRole("button", { name: /Lista de stashes/i }))
    await screen.findByText("stash@{1}: older change")

    const popButtons = screen.getAllByTitle("Pop stash")
    fireEvent.click(popButtons[1])

    await waitFor(() => {
      expect(executed).toContainEqual(["-C", "/vault", "stash", "pop", "stash@{1}"])
    })
  })
})
