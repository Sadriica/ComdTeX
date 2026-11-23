#!/usr/bin/env node
// Writes latest.json, the manifest the in-app updater reads from
// releases/latest/download/latest.json, from the signatures a release holds.
// Usage: node scripts/updater-manifest.mjs <tag> <owner/repo> <dir with .sig files> [assets list]
// Exits 1 when a required platform is missing, so a release never ships without one.
// Optional platforms (the macOS beta) are written only when both the installer
// archive (named in the optional assets list, one release asset name per line) and
// its signature exist; otherwise they are left out whole, never half-written.
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

// Each installer, the manifest keys it answers (the updater looks for
// `{os}-{arch}-{bundle}` first, then `{os}-{arch}`) and how its file ends.
const PLATFORMS = [
  { keys: ["linux-x86_64-appimage", "linux-x86_64"], suffix: ".AppImage" },
  { keys: ["linux-x86_64-deb"], suffix: ".deb" },
  { keys: ["windows-x86_64-nsis", "windows-x86_64"], suffix: "-setup.exe" },
  // macOS beta, ad-hoc signed: the updater signature is minisign and does not
  // depend on Apple signing. `app` is the installer name the updater looks up.
  {
    keys: ["darwin-aarch64-app", "darwin-aarch64"],
    suffix: ".app.tar.gz",
    optional: true,
  },
]

/**
 * @param {{ tag: string, repo: string, sigs: Record<string, string>, pubDate: string }} input
 *   `sigs` maps a signature file name (`x.AppImage.sig`) to its contents.
 *   `assets`, when given, lists the release asset names; an optional platform
 *   needs its installer file there too.
 */
export function buildManifest({ tag, repo, sigs, pubDate, assets }) {
  const version = tag.replace(/^v/, "")
  const platforms = {}
  const missing = []
  for (const { keys, suffix, optional } of PLATFORMS) {
    const sigName = Object.keys(sigs).find(
      (n) => n.endsWith(`${suffix}.sig`) && sigs[n].trim() !== "",
    )
    const file = sigName?.slice(0, -".sig".length)
    const present = Boolean(sigName) && (!optional || !assets || assets.includes(file))
    if (!present) {
      if (!optional) missing.push(suffix)
      continue
    }
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
  const [tag, repo, dir, assetsFile] = process.argv.slice(2)
  if (!tag || !repo || !dir) {
    console.error("usage: updater-manifest.mjs <tag> <owner/repo> <dir>")
    process.exit(1)
  }
  const sigs = {}
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".sig")))
    sigs[name] = readFileSync(join(dir, name), "utf8")
  const assets = assetsFile
    ? readFileSync(assetsFile, "utf8")
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean)
    : undefined
  const { manifest, missing } = buildManifest({
    tag,
    repo,
    sigs,
    pubDate: new Date().toISOString(),
    assets,
  })
  if (missing.length) {
    console.error(`no signature for: ${missing.join(", ")}`)
    process.exit(1)
  }
  writeFileSync("latest.json", JSON.stringify(manifest, null, 2) + "\n")
  console.log(JSON.stringify(manifest, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
