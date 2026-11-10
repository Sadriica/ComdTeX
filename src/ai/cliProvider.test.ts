import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULTS, type Settings } from "../useSettings"

// The Tauri shell is the boundary: record what the CLI provider spawns.
const spawned = vi.hoisted(
  () => [] as Array<{ name: string; args: string[]; opts?: { cwd?: string } }>,
)
vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: (name: string, args: string[], opts?: { cwd?: string }) => {
      spawned.push({ name, args, opts })
      return { stdout: undefined, execute: async () => ({ stdout: "ok", stderr: "", code: 0 }) }
    },
  },
}))

import { cliWorkspaceNote, sendMessage, setAiVaultDir } from "./aiProvider"

const cli: Settings = {
  ...DEFAULTS,
  aiEnabled: true,
  aiProviderId: "cli",
  aiCliCommand: "claude -p",
}

afterEach(() => {
  spawned.length = 0
  setAiVaultDir(null)
})

describe("local agent CLI", () => {
  it("runs in the open vault and says so in the prompt", async () => {
    setAiVaultDir("/home/me/thesis")
    expect(await sendMessage(cli, [{ role: "user", content: "Summarize chapter 2" }])).toBe("ok")
    const [run] = spawned
    expect(run.name).toBe("claude")
    expect(run.opts).toEqual({ cwd: "/home/me/thesis" })
    const prompt = run.args.at(-1)!
    expect(run.args.slice(0, -1)).toEqual(["-p", "--"])
    expect(prompt).toContain("working directory is the user's ComdTeX vault: /home/me/thesis")
    expect(prompt).toContain("User: Summarize chapter 2")
  })

  it("keeps the app's directory, and says there is no vault, when none is open", async () => {
    await sendMessage(cli, [{ role: "user", content: "Hi" }])
    expect(spawned[0].opts).toBeUndefined()
    expect(spawned[0].args.at(-1)).toContain(cliWorkspaceNote(null))
  })
})
