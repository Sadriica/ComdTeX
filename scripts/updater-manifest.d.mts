export interface ManifestEntry {
  signature: string
  url: string
}
/** latest.json for the in-app updater, and the installers that had no signature. */
export function buildManifest(input: {
  tag: string
  repo: string
  sigs: Record<string, string>
  pubDate: string
}): {
  manifest: {
    version: string
    notes: string
    pub_date: string
    platforms: Record<string, ManifestEntry>
  }
  missing: string[]
}
