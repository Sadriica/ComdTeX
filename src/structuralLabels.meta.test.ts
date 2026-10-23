import { describe, expect, it } from "vitest"
import { NUMBERED_ENVS } from "./environments"
import { NUMBERED_ENV_TYPES, scanFileLabels, scanStructuralLabels } from "./structuralLabels"

describe("scanFileLabels metadata", () => {
  const scan = (content: string) => scanFileLabels({ path: "/a.md", name: "a.md", content })
  const byId = (content: string, id: string) => scan(content).labels.find((l) => l.id === id)

  it("numbers environments per type and records title and first body line", () => {
    const content = [
      ":::theorem[First]{#thm:a}",
      "Body of the first.",
      ":::",
      ":::lemma{#lem:b}",
      "A lemma.",
      ":::",
      ":::theorem[Second]{#thm:c}",
      "",
      "Later body.",
      ":::",
    ].join("\n")
    expect(byId(content, "thm:a")).toMatchObject({
      envType: "theorem",
      title: "First",
      number: "1",
      preview: "Body of the first.",
    })
    expect(byId(content, "lem:b")).toMatchObject({ number: "1", title: undefined })
    expect(byId(content, "thm:c")).toMatchObject({ number: "2", preview: "Later body." })
  })

  it("numbers every display equation in order and keeps the source as preview", () => {
    const content = ["$$ a $$", "", "$$", "b + c", "$$ {#eq:two}", "", "$x$ {#eq:three}"].join("\n")
    expect(byId(content, "eq:two")).toMatchObject({ number: "2", preview: "b + c" })
    expect(byId(content, "eq:three")).toMatchObject({ number: "3", preview: "x" })
  })

  it("takes the heading text as the title of a section and ignores fenced code", () => {
    const content = ["```", "# not a heading", "$$ nope $$", "```", "## Real one {#sec:real}"].join(
      "\n",
    )
    expect(byId(content, "sec:real")?.title).toBe("Real one")
    expect(scan(content).headings).toEqual(["Real one"])
  })

  it("numbers figures and takes the caption as title", () => {
    const content = "![One](a.png)\n\n![Second plot](b.png){#fig:b}"
    expect(byId(content, "fig:b")).toMatchObject({ number: "2", title: "Second plot" })
  })

  it("carries headings into the vault index by file path", () => {
    const index = scanStructuralLabels([
      { path: "/a.md", name: "a.md", content: "# One\n## Two {#sec:two}" },
    ])
    expect(index.headings.get("/a.md")).toEqual(["One", "Two"])
  })

  it("keeps its numbered environment types in step with the renderer", () => {
    expect([...NUMBERED_ENV_TYPES].sort()).toEqual(Object.keys(NUMBERED_ENVS).sort())
  })
})
