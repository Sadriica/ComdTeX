// One place that knows what "the finished document" means.
//
// A note is not what the editor holds: transclusions pull in other notes,
// and `:::csv` blocks pull in data. Every path that leaves the editor (the
// preview, the PDF, the .tex, pandoc's DOCX and friends) must see the same
// resolved document, or the same file exports differently depending on the
// button pressed. That bug is easy to introduce one handler at a time, so
// the resolution lives here and every caller uses it.
//
// `val(...)` references (resultValues.ts) are the last step, so a value
// lands in the finished text before the preprocessor and exporters run.
//
// Order matters: transclusion first, because an embedded note may itself
// contain a `:::csv` block that must then be expanded.

import { expandCsvBlocks } from "./csvRange"
import { parseDataBlocks } from "./datasets"
import { expandPlotData } from "./plotData"
import { expandValueRefs } from "./resultValues"
import { resolveTransclusions, type TransclusionResolver } from "./transclusion"

/**
 * Expand a document's references against the vault: transcluded notes and
 * CSV selections. Without a resolver the content is returned untouched.
 *
 * A transcluded note is wrapped in HTML by `resolveTransclusions`, so a
 * `:::csv` block inside it would no longer look like a block afterwards.
 * The resolver is therefore wrapped to expand each note's own data
 * declarations and CSV blocks BEFORE it is embedded, and the host document
 * is expanded after.
 */
export function resolveDocumentContent(raw: string, resolver?: TransclusionResolver): string {
  if (!resolver) return raw
  const resolveEmbedded: TransclusionResolver = (target) => {
    const content = resolver(target)
    if (content == null) return content
    // An embedded note may declare its own datasets and use them.
    const embedded = parseDataBlocks(content)
    const withPlots = expandPlotData(embedded.content, embedded.datasets, resolver)
    const withCsv = expandCsvBlocks(withPlots, resolver, embedded.datasets)
    // Values of datasets the note does not declare wait for the host pass.
    return expandValueRefs(withCsv, embedded.datasets, resolver, { leaveUndeclared: true })
  }
  // Datasets are declared before anything reads them, and their blocks
  // vanish: a declaration prints nothing, like a macro definition.
  const { datasets, content } = parseDataBlocks(resolveTransclusions(raw, resolveEmbedded))
  // Plots that name a dataset become plots with literal series, so the
  // renderer never needs a vault resolver.
  const withPlots = expandPlotData(content, datasets, resolver)
  const withCsv = expandCsvBlocks(withPlots, resolver, datasets)
  // `val(dataset, cell)` becomes the number the results file holds now.
  return expandValueRefs(withCsv, datasets, resolver)
}
