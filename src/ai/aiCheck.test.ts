import { describe, expect, it } from "vitest"
import { classifyAiFailure } from "./aiProvider"

// The four causes of "the AI does not work" need four different fixes, and
// providers word them however they like. What the user is told must follow
// from what the provider actually said.
describe("classifyAiFailure", () => {
  it("reads a rejected key from any of the ways providers say it", () => {
    for (const msg of [
      "Anthropic error 401: invalid x-api-key",
      "OpenAI 403 Forbidden",
      "{\"error\":{\"message\":\"Incorrect API key provided\",\"code\":\"invalid_api_key\"}}",
      "authentication_error: your credential is expired",
    ]) {
      expect(classifyAiFailure(msg)).toBe("unauthorized")
    }
  })

  it("separates a missing model from a rejected key", () => {
    expect(classifyAiFailure("404 model `gpt-9` does not exist")).toBe("no-model")
    expect(classifyAiFailure("The model llama3.9 is not found on this server")).toBe("no-model")
  })

  it("recognises an endpoint that never answered", () => {
    for (const msg of [
      "TypeError: Failed to fetch",
      "error sending request: tcp connect error: ECONNREFUSED",
      "request timed out",
      "dns error: failed to lookup address information",
    ]) {
      expect(classifyAiFailure(msg)).toBe("unreachable")
    }
  })

  it("names a base URL the security guard refused", () => {
    expect(classifyAiFailure("AI base URL must be https:// or http://localhost")).toBe("bad-url")
  })

  it("says nothing it cannot tell, rather than guessing", () => {
    expect(classifyAiFailure("500 internal server error")).toBe("failed")
    expect(classifyAiFailure("rate limit exceeded")).toBe("failed")
  })
})
