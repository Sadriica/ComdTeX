import { describe, expect, it } from "vitest"
import { buildManifest } from "../scripts/updater-manifest.mjs"

const SIGS = {
  "comdtex_1.31.0_amd64.AppImage.sig": "appimage-sig\n",
  "comdtex_1.31.0_amd64.deb.sig": "deb-sig",
  "comdtex_1.31.0_x64-setup.exe.sig": "exe-sig",
}
const base = { tag: "v1.31.0", repo: "Sadriica/ComdTeX", pubDate: "2026-11-01T00:00:00.000Z" }

describe("updater manifest", () => {
  it("lists every installer under the keys the updater looks up", () => {
    const { manifest, missing } = buildManifest({ ...base, sigs: SIGS })
    expect(missing).toEqual([])
    expect(manifest.version).toBe("1.31.0")
    expect(Object.keys(manifest.platforms).sort()).toEqual([
      "linux-x86_64",
      "linux-x86_64-appimage",
      "linux-x86_64-deb",
      "windows-x86_64",
      "windows-x86_64-nsis",
    ])
    expect(manifest.platforms["linux-x86_64-deb"]).toEqual({
      signature: "deb-sig",
      url: "https://github.com/Sadriica/ComdTeX/releases/download/v1.31.0/comdtex_1.31.0_amd64.deb",
    })
    // A bare linux key must point at the AppImage: a .deb cannot replace an AppImage.
    expect(manifest.platforms["linux-x86_64"].url).toMatch(/\.AppImage$/)
    expect(manifest.platforms["linux-x86_64-appimage"].signature).toBe("appimage-sig")
    expect(manifest.platforms["windows-x86_64"].url).toMatch(/-setup\.exe$/)
  })

  it("reports an installer with no signature instead of leaving it out silently", () => {
    const { "comdtex_1.31.0_x64-setup.exe.sig": _exe, ...rest } = SIGS
    const { missing, manifest } = buildManifest({ ...base, sigs: rest })
    expect(missing).toEqual(["-setup.exe"])
    expect(manifest.platforms["windows-x86_64"]).toBeUndefined()
  })
})
