import { describe, it, expect } from "vitest"
import { AiError, PROVIDER_PRESETS, getPreset, isAiReady } from "./aiProvider"
import { DEFAULTS, type Settings } from "../useSettings"

// NOTE: `assertSafeBaseUrl`, `resolveBaseUrl`, `stripWrappingFence`, `sendMessage`,
// `warmUp` and `sendInlineEdit` are either not exported from aiProvider.ts or
// perform real network/CLI I/O. Per the repo's no-mocks testing rule and the
// restriction against editing aiProvider.ts (owned by another agent), only the
// already-exported pure helpers below are covered here.

function baseSettings(overrides: Partial<Settings> = {}): Settings {
  // Spread the real defaults: these tests care about the AI fields only, and a
  // full literal would need editing every time an unrelated setting is added.
  return { ...DEFAULTS, aiEnabled: true, ...overrides }
}


describe("PROVIDER_PRESETS", () => {
  it("lists exactly the five supported provider ids", () => {
    expect(PROVIDER_PRESETS.map((p) => p.id).sort()).toEqual(
      ["anthropic", "cli", "gemini", "openai", "openai-compatible"].sort(),
    )
  })

  it("flags only the cli preset as isCli", () => {
    const cliPresets = PROVIDER_PRESETS.filter((p) => p.isCli)
    expect(cliPresets.map((p) => p.id)).toEqual(["cli"])
  })

  it("flags only openai-compatible as needing a base URL", () => {
    const needsBaseUrl = PROVIDER_PRESETS.filter((p) => p.needsBaseUrl)
    expect(needsBaseUrl.map((p) => p.id)).toEqual(["openai-compatible"])
  })
})

describe("getPreset", () => {
  it("returns the matching preset by id", () => {
    expect(getPreset("openai").label).toBe("OpenAI")
    expect(getPreset("gemini").label).toBe("Google Gemini")
    expect(getPreset("cli").isCli).toBe(true)
  })

  it("falls back to the first preset (anthropic) for an unknown id", () => {
    expect(getPreset("does-not-exist").id).toBe("anthropic")
  })
})

describe("AiError", () => {
  it("is a proper Error subclass carrying the message", () => {
    const err = new AiError("missing-api-key")
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AiError)
    expect(err.message).toBe("missing-api-key")
  })
})

describe("isAiReady", () => {
  it("is false when AI is disabled regardless of other config", () => {
    const s = baseSettings({ aiEnabled: false, aiModel: "gpt-4o-mini" })
    expect(isAiReady(s)).toBe(false)
  })

  it("is false for an HTTP provider missing a model id", () => {
    const s = baseSettings({ aiEnabled: true, aiProviderId: "anthropic", aiModel: "" })
    expect(isAiReady(s)).toBe(false)
  })

  it("is true for an HTTP provider with a model id set", () => {
    const s = baseSettings({ aiEnabled: true, aiProviderId: "anthropic", aiModel: "claude-3-5-sonnet-latest" })
    expect(isAiReady(s)).toBe(true)
  })

  it("requires a base URL for the openai-compatible provider", () => {
    const withoutUrl = baseSettings({ aiEnabled: true, aiProviderId: "openai-compatible", aiModel: "local-model", aiBaseUrl: "" })
    expect(isAiReady(withoutUrl)).toBe(false)

    const withUrl = baseSettings({ aiEnabled: true, aiProviderId: "openai-compatible", aiModel: "local-model", aiBaseUrl: "http://localhost:11434" })
    expect(isAiReady(withUrl)).toBe(true)
  })

  it("requires only a non-empty CLI command for the cli provider (model id irrelevant)", () => {
    const withoutCmd = baseSettings({ aiEnabled: true, aiProviderId: "cli", aiCliCommand: "  " })
    expect(isAiReady(withoutCmd)).toBe(false)

    const withCmd = baseSettings({ aiEnabled: true, aiProviderId: "cli", aiCliCommand: "claude -p" })
    expect(isAiReady(withCmd)).toBe(true)
  })
})
