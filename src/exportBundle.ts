/**
 * Local asset discovery for LaTeX export bundling.
 *
 * Pure: given the RESOLVED document content (after transclusion/CSV
 * expansion; see documentResolve.ts), returns the local image paths it
 * references, so exportActions.ts / useExportActions.ts can copy them next
 * to the exported .tex without this module ever touching the filesystem.
 * Kept separate from exporter.ts so the asset list stays unit-testable
 * without dragging in markdown-it.
 */

// Same paren-capture shape as figures.ts's figure-counting regex: a ComdTeX
// image never carries an inline markdown title (the `{#fig:label}` suffix
// does that job instead), so everything between the parens IS the src,
// spaces included, and needs no further splitting.
const IMAGE_SRC_RE = /!\[[^\]]*\]\(([^)]*)\)/g

function isRemoteOrData(src: string): boolean {
  return /^(https?:|data:)/i.test(src)
}

/**
 * Local image paths referenced by `![...](...)` in the document (this also
 * covers every figure, since figures.ts's `{#fig:label}` figures are plain
 * markdown images under the hood). Deduped, in order of first appearance;
 * remote (http/https) and data: URIs excluded since those never need
 * bundling and copying them would make no sense.
 */
export function collectLocalImagePaths(content: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  IMAGE_SRC_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IMAGE_SRC_RE.exec(content)) !== null) {
    const src = m[1].trim()
    if (!src || isRemoteOrData(src)) continue
    if (!seen.has(src)) {
      seen.add(src)
      out.push(src)
    }
  }
  return out
}
