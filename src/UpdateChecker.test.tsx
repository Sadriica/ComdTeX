// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import UpdateChecker from "./UpdateChecker"
import { LINUX_INSTALL_COMMAND } from "./useUpdater"
import { LANGS } from "./i18n"

const t = LANGS.en
const props = { onInstall: () => {}, onDismiss: () => {}, installing: false }

afterEach(cleanup)

describe("UpdateChecker", () => {
  it("shows a release notes link instead of a bare URL", () => {
    render(
      <UpdateChecker
        {...props}
        updateInfo={{ available: true, version: "9.9.9", body: "https://example.com/v9.9.9" }}
      />,
    )
    expect(screen.getByRole("button", { name: t.updateBanner.releaseNotes })).toBeTruthy()
    expect(screen.queryByText("https://example.com/v9.9.9")).toBeNull()
  })

  it("offers to install when the app can replace itself", () => {
    const onInstall = vi.fn()
    render(
      <UpdateChecker
        {...props}
        onInstall={onInstall}
        updateInfo={{ available: true, version: "9.9.9" }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: t.updateBanner.installRestart }))
    expect(onInstall).toHaveBeenCalled()
  })

  it("copies the installer command instead of installing an unpacked copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const onInstall = vi.fn()
    render(
      <UpdateChecker
        {...props}
        onInstall={onInstall}
        updateInfo={{ available: true, version: "9.9.9", manual: true }}
      />,
    )
    expect(screen.queryByRole("button", { name: t.updateBanner.installRestart })).toBeNull()
    expect(screen.getByText(t.updateBanner.manualHint)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t.updateBanner.copyCommand }))
    expect(writeText).toHaveBeenCalledWith(LINUX_INSTALL_COMMAND)
    await waitFor(() => screen.getByRole("button", { name: t.updateBanner.commandCopied }))
    expect(onInstall).not.toHaveBeenCalled()
  })
})
