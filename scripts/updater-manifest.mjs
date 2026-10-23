#!/usr/bin/env node
// Writes latest.json, the manifest the in-app updater reads from
// releases/latest/download/latest.json, from the signatures a release holds.
// Usage: node scripts/updater-manifest.mjs <tag> <owner/repo> <dir with .sig files>
// Exits 1 when a platform is missing, so a release never ships without one.
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

// Each installer, the manifest keys it answers (the updater looks for
// `{os}-{arch}-{bundle}` first, then `{os}-{arch}`) and how its file ends.
const PLATFORMS = [
  { keys: ["linux-x86_64-appimage", "linux-x86_64"], suffix: ".AppImage" },
  { keys: ["linux-x86_64-deb"], suffix: ".deb" },
  { keys: ["windows-x86_64-nsis", "windows-x86_64"], suffix: "-setup.exe" },
]

/**
 * @param {{ tag: string, repo: string, sigs: Record<string, string>, pubDate: string }} input
 *   `sigs` maps a signature file name (`x.AppImage.sig`) to its contents.
 */
export function buildManifest({ tag, repo, sigs, pubDate }) {
  const version = tag.replace(/^v/, "")
  const platforms = {}
  const missing = []
  for (const { keys, suffix } of PLATFORMS) {
    const sigName = Object.keys(sigs).find((n) => n.endsWith(`${suffix}.sig`))
    if (!sigName) {
      missing.push(suffix)
      continue
    }
    const file = sigName.slice(0, -".sig".length)
    const entry = {
      signature: sigs[sigName].trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(file)}`,
    }
    for (const key of keys) platforms[key] = entry
  }
  const manifest = {
    version,
    notes: `https://github.com/${repo}/releases/tag/${tag}`,
    pub_date: pubDate,
    platforms,
  }
  return { manifest, missing }
}

function main() {
  const [tag, repo, dir] = process.argv.slice(2)
  if (!tag || !repo || !dir) {
    console.error("usage: updater-manifest.mjs <tag> <owner/repo> <dir>")
    process.exit(1)
  }
  const sigs = {}
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".sig")))
    sigs[name] = readFileSync(join(dir, name), "utf8")
  const { manifest, missing } = buildManifest({
    tag,
    repo,
    sigs,
    pubDate: new Date().toISOString(),
  })
  if (missing.length) {
    console.error(`no signature for: ${missing.join(", ")}`)
    process.exit(1)
  }
  writeFileSync("latest.json", JSON.stringify(manifest, null, 2) + "\n")
  console.log(JSON.stringify(manifest, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
