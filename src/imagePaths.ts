/**
 * The one rule for turning an image path written in a document into files.
 *
 * `![](../figures/x.svg)` in `papers/doc.md` means the folder next to the
 * document, which is what every Markdown tool does; ComdTeX used to read every
 * relative path from the vault root, so that image never loaded. The document's
 * own folder now comes first, and the vault root stays as the fallback so
 * notes written against the old rule keep working.
 *
 * Pure (no filesystem, no Tauri): the preview, the Document Lab diagnostics
 * and the export bundler all go through `imageCandidates`, so they agree.
 */

/** Joins `base` and a relative `rel`, collapsing `.` and `..`. Output uses `/`. */
export function joinNormalized(base: string, rel: string): string {
  const relative = rel.replace(/\\/g, "/")
  if (relative.startsWith("/")) return relative
  const out = base.replace(/\\/g, "/").split("/")
  for (const part of relative.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") {
      if (out.length > 1) out.pop()
    } else out.push(part)
  }
  return out.join("/")
}

function dirOf(path: string): string {
  const p = path.replace(/\\/g, "/")
  const idx = p.lastIndexOf("/")
  return idx < 0 ? "" : p.slice(0, idx)
}

function isAbsolute(src: string): boolean {
  return src.startsWith("/") || /^[A-Za-z]:[\\/]/.test(src)
}

/**
 * Absolute paths to try for `src`, best first: the document's folder, then the
 * vault root. An absolute `src` is its own and only candidate.
 */
export function imageCandidates(
  src: string,
  docPath: string | null | undefined,
  vaultPath: string | null | undefined,
): string[] {
  const clean = src.trim()
  if (!clean) return []
  if (isAbsolute(clean)) return [clean.replace(/\\/g, "/")]
  const out: string[] = []
  const docDir = docPath ? dirOf(docPath) : ""
  if (docDir) out.push(joinNormalized(docDir, clean))
  if (vaultPath) {
    const root = joinNormalized(vaultPath, clean)
    if (!out.includes(root)) out.push(root)
  }
  return out
}

/**
 * Picks the file `src` refers to. With an `exists` check the first candidate
 * that exists wins and the vault root is the default when none does. Without
 * one nothing can be verified, so only a path that climbs out of its folder
 * (`../x`), which can never mean the vault root, is read from the document.
 */
export function resolveImagePath(
  src: string,
  docPath: string | null | undefined,
  vaultPath: string | null | undefined,
  exists?: (absPath: string) => boolean,
): string | null {
  const candidates = imageCandidates(src, docPath, vaultPath)
  if (candidates.length === 0) return null
  if (exists) return candidates.find((c) => exists(c)) ?? candidates[candidates.length - 1]
  if (/^\.\.[\\/]/.test(src.trim())) return candidates[0]
  return candidates[candidates.length - 1]
}
