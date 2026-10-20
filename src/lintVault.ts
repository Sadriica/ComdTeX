// What the linter needs to know about the other documents of the vault.
//
// `LintVaultIndex` turns the vault's documents into `LintVaultDoc`s (labels and
// transclusion targets) and caches them per path, so a pass after an edit
// rescans only the files whose text changed. Identity is stable on purpose:
// a document whose labels did not change keeps its object, and when no document
// changed the SAME array comes back, so the background lint of the open tabs
// (which keys its cache on that identity) is not invalidated by plain typing.

import { scanEmbeds, scanLintLabels, stripCode, type LintVaultDoc } from "./contentLinter"

export interface LintVaultFile {
  path: string
  name: string
  content: string
}

interface Entry {
  name: string
  content: string
  doc: LintVaultDoc
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

export class LintVaultIndex {
  private cache = new Map<string, Entry>()
  private last: readonly LintVaultDoc[] = []
  /** Files scanned by the most recent `update` (test seam). */
  lastScannedCount = 0

  update(files: readonly LintVaultFile[]): readonly LintVaultDoc[] {
    let changed = files.length !== this.last.length
    let scanned = 0
    const docs: LintVaultDoc[] = []
    const live = new Set<string>()

    files.forEach((file, i) => {
      live.add(file.path)
      const hit = this.cache.get(file.path)
      let doc: LintVaultDoc
      if (hit && hit.name === file.name && hit.content === file.content) {
        doc = hit.doc
      } else {
        scanned++
        const clean = stripCode(file.content)
        const labels = scanLintLabels(clean)
        const embeds = scanEmbeds(clean)
        const prev = hit?.doc
        doc =
          prev &&
          prev.name === file.name &&
          sameSet(prev.labels, labels) &&
          sameList(prev.embeds, embeds)
            ? prev
            : { path: file.path, name: file.name, labels, embeds }
        this.cache.set(file.path, { name: file.name, content: file.content, doc })
      }
      docs.push(doc)
      if (doc !== this.last[i]) changed = true
    })

    for (const path of [...this.cache.keys()]) if (!live.has(path)) this.cache.delete(path)
    this.lastScannedCount = scanned
    if (!changed) return this.last
    this.last = docs
    return docs
  }
}
