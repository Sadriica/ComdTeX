/**
 * `for await (const chunk of readableStream)` for engines without it.
 *
 * The WebKitGTK the Linux AppImage ships (2.50) cannot iterate a
 * ReadableStream. pdf.js 6 does so to read a page's text (getTextContent),
 * which its viewer, find controller and text layer all use: without this,
 * search and text selection failed on every PDF in the Linux app.
 *
 * Installs `values()` and `[Symbol.asyncIterator]()` on the given prototype
 * only when they are missing, built on `getReader()` as the Streams spec
 * defines them. Returns true when it installed anything.
 */
export function installStreamIterator(
  proto:
    { getReader(): ReadableStreamDefaultReader<unknown> } | undefined = typeof ReadableStream ===
  "undefined"
    ? undefined
    : (ReadableStream.prototype as unknown as {
        getReader(): ReadableStreamDefaultReader<unknown>
      }),
): boolean {
  if (!proto) return false
  const target = proto as unknown as Record<PropertyKey, unknown>
  if (typeof target[Symbol.asyncIterator] === "function") return false

  function values(
    this: { getReader(): ReadableStreamDefaultReader<unknown> },
    options?: { preventCancel?: boolean },
  ): AsyncIterableIterator<unknown> {
    const reader = this.getReader()
    const preventCancel = !!options?.preventCancel
    const iterator: AsyncIterableIterator<unknown> = {
      async next() {
        try {
          const result = await reader.read()
          if (result.done) reader.releaseLock()
          return result as IteratorResult<unknown>
        } catch (err) {
          reader.releaseLock()
          throw err
        }
      },
      async return(value?: unknown) {
        if (!preventCancel) {
          const cancelled = reader.cancel(value)
          reader.releaseLock()
          await cancelled
        } else {
          reader.releaseLock()
        }
        return { done: true, value }
      },
      [Symbol.asyncIterator]() {
        return iterator
      },
    }
    return iterator
  }

  Object.defineProperty(target, "values", { value: values, writable: true, configurable: true })
  Object.defineProperty(target, Symbol.asyncIterator, {
    value: values,
    writable: true,
    configurable: true,
  })
  return true
}
