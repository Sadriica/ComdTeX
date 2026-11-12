import { describe, expect, it } from "vitest"
import { installStreamIterator } from "./streamIterator"

// A stream class like WebKitGTK 2.50's: getReader() but no async iteration.
function makeStreamClass() {
  class Plain {
    constructor(private chunks: string[]) {}
    getReader() {
      const chunks = this.chunks
      let released = false
      return {
        read: async () =>
          chunks.length ? { done: false, value: chunks.shift() } : { done: true, value: undefined },
        releaseLock: () => {
          released = true
        },
        cancel: async () => {
          chunks.length = 0
        },
        get released() {
          return released
        },
      }
    }
  }
  return Plain
}

describe("installStreamIterator", () => {
  it("adds for-await iteration to a stream that only has getReader", async () => {
    const Plain = makeStreamClass()
    expect(installStreamIterator(Plain.prototype as never)).toBe(true)
    const out: unknown[] = []
    for await (const chunk of new Plain(["a", "b", "c"]) as unknown as AsyncIterable<string>)
      out.push(chunk)
    expect(out).toEqual(["a", "b", "c"])
  })

  it("cancels the stream when the loop stops early", async () => {
    const Plain = makeStreamClass()
    installStreamIterator(Plain.prototype as never)
    const stream = new Plain(["a", "b", "c"])
    for await (const chunk of stream as unknown as AsyncIterable<string>) {
      expect(chunk).toBe("a")
      break
    }
    // Cancelled: the remaining chunks are gone.
    expect((stream as unknown as { chunks: string[] }).chunks).toEqual([])
  })

  it("leaves an engine's own iteration alone", () => {
    expect(installStreamIterator()).toBe(false)
  })
})
