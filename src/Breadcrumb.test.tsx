// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import Breadcrumb from "./Breadcrumb"

describe("Breadcrumb", () => {
  it("renders intermediate segments as buttons only when navigation is available", () => {
    render(
      <Breadcrumb
        vaultPath="/vault"
        filePath="/vault/math/algebra.md"
      />
    )

    expect(screen.queryByRole("button", { name: "vault" })).toBeNull()
    expect(screen.queryByRole("button", { name: "math" })).toBeNull()
    expect(screen.getByText("vault")).toBeTruthy()
    expect(screen.getByText("math")).toBeTruthy()
  })

  it("calls onNavigate for clickable segments", () => {
    const onNavigate = vi.fn()
    render(
      <Breadcrumb
        vaultPath="/vault"
        filePath="/vault/math/algebra.md"
        onNavigate={onNavigate}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "math" }))
    expect(onNavigate).toHaveBeenCalledWith("/vault/math")
  })
})
