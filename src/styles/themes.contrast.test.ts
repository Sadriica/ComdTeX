import { describe, expect, it } from "vitest"
import { contrast, oklchToLinear, loadThemes, runChecks } from "../../scripts/check-contrast.mjs"

const themes = loadThemes()

describe("theme contrast gate", () => {
  it("converts oklch correctly at the extremes", () => {
    expect(contrast(oklchToLinear(0, 0, 0), oklchToLinear(1, 0, 0))).toBeCloseTo(21, 0)
  })

  it.each(["dark", "light", "hc"] as const)("%s theme defines every colour token", (name) => {
    const t = themes[name]
    for (const k of [
      "--bg-app",
      "--bg-surface",
      "--bg-raised",
      "--bg-sunken",
      "--bg-hover",
      "--bg-active",
      "--bg-selected",
      "--chrome-bg",
      "--chrome-fg",
      "--status-bg",
      "--status-fg",
      "--fg",
      "--fg-muted",
      "--fg-subtle",
      "--border",
      "--border-strong",
      "--accent",
      "--accent-fg",
      "--accent-soft",
      "--link",
      "--focus-ring",
      "--danger",
      "--warn",
      "--ok",
      "--info",
      "--code-bg",
      "--code-fg",
      "--selection",
    ])
      expect(t[k], `${name} ${k}`).toBeDefined()
  })

  it.each(["dark", "light", "hc"] as const)("%s theme passes every contrast check", (name) => {
    const failed = runChecks({ [name]: themes[name] }).filter((r) => !r.ok)
    expect(failed.map((r) => `${r.label} ${r.ratio.toFixed(2)} < ${r.min}`)).toEqual([])
  })
})
