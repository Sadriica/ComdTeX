// One place that knows what "the finished document" means.
//
// A note is not what the editor holds: transclusions pull in other notes,
// and `:::csv` blocks pull in data. Every path that leaves the editor (the
// preview, the PDF, the .tex, pandoc's DOCX and friends) must see the same
// resolved document, or the same file exports differently depending on the
// button pressed. That bug is easy to introduce one handler at a time, so
// the resolution lives here and every caller uses it.
//
// Order matters: transclusion first, because an embedded note may itself
// contain a `:::csv` block that must then be expanded.

import { expandCsvBlocks } from "./csvRange"
import { resolveTransclusions, type TransclusionResolver } from "./transclusion"

/**
 * Expand a document's references against the vault: transcluded notes and
 * CSV selections. Without a resolver the content is returned untouched.
 *
 * A transcluded note is wrapped in HTML by `resolveTransclusions`, so a
 * `:::csv` block inside it would no longer look like a block afterwards.
 * The resolver is therefore wrapped to expand each note's own CSV blocks
 * BEFORE it is embedded, and the host document is expanded after.
 */
export function resolveDocumentContent(
  raw: string,
  resolver?: TransclusionResolver,
): string {
  if (!resolver) return raw
  const resolveEmbedded: TransclusionResolver = (target) => {
    const content = resolver(target)
    return content == null ? content : expandCsvBlocks(content, resolver)
  }
  return expandCsvBlocks(resolveTransclusions(raw, resolveEmbedded), resolver)
}
