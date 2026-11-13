// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import CloudSyncPanel from "./CloudSyncPanel"
import { LANGS, LanguageContext } from "./i18n"
import type { CloudProvider } from "./cloudSync"
import type { SyncPosture } from "./syncPosture"

vi.mock("@tauri-apps/plugin-fs", () => ({ remove: vi.fn(), rename: vi.fn(), exists: vi.fn() }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn() }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn() }))

afterEach(cleanup)

const en = LANGS.en

function renderEmpty(over: {
  provider?: CloudProvider | null
  detectEnabled?: boolean
  posture?: SyncPosture
}) {
  const onOpenGit = vi.fn()
  const onOpenSettings = vi.fn()
  const view = render(
    <LanguageContext.Provider value={en}>
      <CloudSyncPanel
        conflicts={[]}
        onOpenFile={() => {}}
        onResolved={() => {}}
        provider={over.provider ?? null}
        detectEnabled={over.detectEnabled ?? true}
        posture={over.posture ?? "git-shared"}
        onOpenGit={onOpenGit}
        onOpenSettings={onOpenSettings}
      />
    </LanguageContext.Provider>,
  )
  return { ...view, onOpenGit, onOpenSettings }
}

describe("CloudSyncPanel with no conflicts", () => {
  it("explains that a vault outside any cloud folder cannot have conflict copies", () => {
    const { container } = renderEmpty({ posture: "git-shared" })
    const text = container.textContent ?? ""
    expect(text).toContain(en.cloudSync.panelNotInCloud)
    expect(text).toContain(en.cloudSync.settings.postureGitShared)
    expect(text).not.toContain(en.cloudSync.panelEmpty)
    expect(container.querySelector(".panel-empty-rich")).not.toBeNull()
  })

  it("names the provider when the vault is inside its folder", () => {
    const { container } = renderEmpty({ provider: "dropbox", posture: "cloud-only" })
    const text = container.textContent ?? ""
    expect(text).toContain("No conflict copies in your Dropbox folder.")
    expect(text).toContain(en.cloudSync.settings.stepStartGit)
  })

  it("says when detection is switched off", () => {
    const { container } = renderEmpty({ provider: "dropbox", detectEnabled: false })
    expect(container.textContent).toContain(en.cloudSync.panelDetectOff)
  })

  it("opens the Git panel and the Sync settings", () => {
    const { getByRole, onOpenGit, onOpenSettings } = renderEmpty({})
    fireEvent.click(getByRole("button", { name: en.cloudSync.settings.openGit }))
    fireEvent.click(getByRole("button", { name: en.cloudSync.panelOpenSettings }))
    expect(onOpenGit).toHaveBeenCalledOnce()
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})
