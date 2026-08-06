// How a document names another file, and how that name is found.
//
// A `![[note]]` transclusion, a `:::csv` source and a `@data:` declaration all
// write the target the way a person would: a bare name, sometimes with the
// extension, sometimes with a folder in front. This is the one place that
// turns such a name into a file, so the preview and every export path agree
// on what a name refers to.

export interface ResolvableFile {
  path: string
  name: string
  content: string
}

/**
 * Find the file a target name refers to: by stem (`growth` finds
 * `growth.csv`), by full name, or by a trailing path fragment
 * (`data/growth.csv`). Returns null when nothing matches.
 */
export function findVaultFile<T extends ResolvableFile>(
  files: readonly T[],
  target: string,
): T | null {
  const stem = target.replace(/\.[^.]+$/, "").toLowerCase()
  const lower = target.toLowerCase()
  // A target that carries a folder is an author disambiguating between two
  // files with the same name, so the path wins over the bare name.
  if (lower.includes("/")) {
    const byPath = files.find((file) => file.path.toLowerCase().endsWith(`/${lower}`))
    if (byPath) return byPath
  }
  return (
    files.find(
      (file) =>
        file.name.replace(/\.[^.]+$/, "").toLowerCase() === stem ||
        file.name.toLowerCase() === lower ||
        file.path.toLowerCase().endsWith(`/${lower}`),
    ) ?? null
  )
}
