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

  describe("macOS beta (optional platform)", () => {
    const MAC_SIG = "ComdTeX_1.31.0_aarch64.app.tar.gz.sig"
    const MAC_FILE = "ComdTeX_1.31.0_aarch64.app.tar.gz"
    const macSigs = { ...SIGS, [MAC_SIG]: "mac-sig\n" }

    it("adds darwin-aarch64 when the archive and its signature exist", () => {
      const { manifest, missing } = buildManifest({
        ...base,
        sigs: macSigs,
        assets: [MAC_FILE, MAC_SIG, "comdtex_1.31.0_amd64.deb"],
      })
      expect(missing).toEqual([])
      const entry = {
        signature: "mac-sig",
        url: `https://github.com/Sadriica/ComdTeX/releases/download/v1.31.0/${MAC_FILE}`,
      }
      expect(manifest.platforms["darwin-aarch64"]).toEqual(entry)
      expect(manifest.platforms["darwin-aarch64-app"]).toEqual(entry)
    })

    it("leaves darwin out, with no error, when there are no mac artifacts", () => {
      const { manifest, missing } = buildManifest({ ...base, sigs: SIGS, assets: [] })
      expect(missing).toEqual([])
      expect(Object.keys(manifest.platforms).some((k) => k.startsWith("darwin"))).toBe(false)
      expect(Object.keys(manifest.platforms)).toHaveLength(5)
    })

    it("never writes a partial entry: signature without the archive", () => {
      const { manifest, missing } = buildManifest({
        ...base,
        sigs: macSigs,
        assets: ["comdtex_1.31.0_amd64.deb", MAC_SIG],
      })
      expect(missing).toEqual([])
      expect(manifest.platforms["darwin-aarch64"]).toBeUndefined()
      expect(manifest.platforms["darwin-aarch64-app"]).toBeUndefined()
    })

    it("never writes a partial entry: archive without a signature", () => {
      const { manifest } = buildManifest({ ...base, sigs: SIGS, assets: [MAC_FILE] })
      expect(manifest.platforms["darwin-aarch64"]).toBeUndefined()
    })

    it("ignores an empty mac signature file", () => {
      const { manifest } = buildManifest({
        ...base,
        sigs: { ...SIGS, [MAC_SIG]: "  \n" },
        assets: [MAC_FILE, MAC_SIG],
      })
      expect(manifest.platforms["darwin-aarch64"]).toBeUndefined()
    })

    it("still requires the Linux and Windows installers when mac is present", () => {
      const { "comdtex_1.31.0_amd64.deb.sig": _deb, ...rest } = macSigs
      const { missing } = buildManifest({ ...base, sigs: rest, assets: [MAC_FILE, MAC_SIG] })
      expect(missing).toEqual([".deb"])
    })
  })
})
