/// <reference lib="webworker" />
import { scanFileLabels } from "./structuralLabels"
import type { LabelWorkerRequest, LabelWorkerResponse } from "./labelScanner"

self.onmessage = (event: MessageEvent<LabelWorkerRequest>) => {
  const { id, files } = event.data
  const response: LabelWorkerResponse = { id, scans: files.map(scanFileLabels) }
  self.postMessage(response)
}
