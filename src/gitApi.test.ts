import { describe, expect, it } from "vitest"
import { isNotRepo, parseStatusZ, safeGitConfig } from "./gitApi"

const z = (...r: string[]) => r.join("\0") + "\0"

describe("parseStatusZ", () => {
  it("reads branch, upstream and counters", () => {
    const s = parseStatusZ(z("## main...origin/main [ahead 2, behind 1]"))
    expect(s).toMatchObject({ branch: "main", upstream: "origin/main", ahead: 2, behind: 1 })
  })

  it("keeps spaces and accented names unquoted", () => {
    const s = parseStatusZ(z("## main", " M notas de clase/Cálculo é.md", "A  año nuevo.md", "?? sin título.md"))
    expect(s.unstaged.map(f => f.path)).toEqual(["notas de clase/Cálculo é.md"])
    expect(s.staged.map(f => f.path)).toEqual(["año nuevo.md"])
    expect(s.untracked.map(f => f.path)).toEqual(["sin título.md"])
  })

  it("uses the new path for renames and consumes the original record", () => {
    const s = parseStatusZ(z("## main", "R  nuevo nombre.md", "viejo nombre.md", " M otro.md"))
    expect(s.staged).toEqual([{ x: "R", y: " ", path: "nuevo nombre.md", orig: "viejo nombre.md" }])
    expect(s.unstaged.map(f => f.path)).toEqual(["otro.md"])
  })

  it("handles rename with worktree modification", () => {
    const s = parseStatusZ(z("## main", "RM b.md", "a.md"))
    expect(s.staged[0].path).toBe("b.md")
    expect(s.unstaged[0].path).toBe("b.md")
  })

  it("handles a repo without commits", () => {
    expect(parseStatusZ(z("## No commits yet on main", "?? a.md")).branch).toBe("main")
  })

  it("handles empty output", () => {
    const s = parseStatusZ("")
    expect(s.staged.length + s.unstaged.length + s.untracked.length).toBe(0)
  })
})

describe("git helpers", () => {
  it("disables fsmonitor, hooks and ext transport", () => {
    const a = safeGitConfig().join(" ")
    expect(a).toContain("core.fsmonitor=false")
    expect(a).toContain("core.hooksPath=")
    expect(a).toContain("protocol.ext.allow=never")
    expect(a).toContain("core.quotepath=false")
  })

  it("recognises the not-a-repo exit", () => {
    expect(isNotRepo({ code: 128, stdout: "", stderr: "fatal: not a git repository (or any of the parent directories): .git" })).toBe(true)
    expect(isNotRepo({ code: 128, stdout: "", stderr: "fatal: other" })).toBe(false)
  })
})
