/// <reference lib="webworker" />
import { layoutGraph } from "./graphLayout"
import type { LayoutWorkerRequest, LayoutWorkerResponse } from "./graphLayoutClient"

self.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const { id, request } = event.data
  const result = layoutGraph(request)
  const response: LayoutWorkerResponse = { id, result }
  self.postMessage(response, { transfer: [result.pos.buffer] })
}
