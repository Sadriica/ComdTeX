import { describe, expect, it } from "vitest"
import { syncPosture, needsAttention, nextStep } from "./syncPosture"

const facts = (isRepo: boolean, hasRemote: boolean, inCloud: boolean) => ({ isRepo, hasRemote, inCloud })

describe("syncPosture", () => {
  it("reports the strong case when the vault is versioned and shared", () => {
    expect(syncPosture(facts(true, true, false))).toBe("git-shared")
    expect(nextStep("git-shared")).toBeNull()
    expect(needsAttention("git-shared")).toBe(false)
  })

  it("treats a repository with no remote as history that only exists here", () => {
    expect(syncPosture(facts(true, false, false))).toBe("git-local")
    expect(nextStep("git-local")).toBe("add-remote")
  })

  it("flags a repository inside a cloud folder above everything else", () => {
    // Even a fully shared repo: the cloud client corrupting .git does not
    // care that there is also a remote.
    expect(syncPosture(facts(true, true, true))).toBe("git-in-cloud")
    expect(syncPosture(facts(true, false, true))).toBe("git-in-cloud")
    expect(needsAttention("git-in-cloud")).toBe(true)
    expect(nextStep("git-in-cloud")).toBe("move-out-of-cloud")
  })

  it("recognises copies travelling without any history", () => {
    expect(syncPosture(facts(false, false, true))).toBe("cloud-only")
    expect(nextStep("cloud-only")).toBe("start-git")
  })

  it("says plainly when nothing leaves the disk", () => {
    expect(syncPosture(facts(false, false, false))).toBe("local-only")
    expect(needsAttention("local-only")).toBe(true)
    expect(nextStep("local-only")).toBe("start-git")
  })

  it("ignores a remote claim that cannot be true without a repository", () => {
    expect(syncPosture(facts(false, true, false))).toBe("local-only")
  })
})
