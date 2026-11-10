import { describe, expect, it } from "vitest"
import { generateCalendar, generateIndex, generateTasks, runGenerator } from "./generators"
import { GENERATED_MARKER } from "./folderRules"

const files = [
  { path: "/v/a.md", content: "# A\n- [ ] one\n- [x] two\n- [ ] three\n" },
  { path: "/v/b.md", content: "---\ndate: 2026-01-05\n---\n# B\n" },
]

describe("generated folder files in English", () => {
  it("writes the task list in English", () => {
    const out = generateTasks(files, undefined, "en")
    expect(out).toContain(GENERATED_MARKER)
    expect(out).toContain("# Tasks")
    expect(out).toContain("**2 pending** · 1 completed")
    expect(out).toContain("This file is regenerated automatically")
    expect(generateTasks([], undefined, "en")).toContain("_No tasks._")
  })

  it("writes the calendar and index in English", () => {
    const cal = generateCalendar(files, undefined, "en")
    expect(cal).toContain("# Calendar")
    expect(cal).toContain("## No date")
    expect(generateIndex(files, undefined, "en")).toContain("# Index")
    expect(generateIndex([], undefined, "en")).toContain("_No notes._")
  })

  it("runGenerator threads the language and keeps Spanish as the default", () => {
    expect(runGenerator("tasks", files, undefined, "en")).toContain("# Tasks")
    expect(runGenerator("tasks", files)).toContain("# Tareas")
    expect(runGenerator("calendar", files)).toContain("## Sin fecha")
  })
})
