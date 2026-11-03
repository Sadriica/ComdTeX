// Run `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`
// and `cargo add tauri-plugin-updater` to complete setup

export interface UpdateInfo {
  available: boolean
  version?: string
  body?: string
  /** The updater cannot replace this copy (unpacked AppImage, source build). */
  manual?: boolean
}

/** Shell command that installs or updates ComdTeX on Linux (scripts/install.sh). */
export const LINUX_INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/Sadriica/ComdTeX/main/scripts/install.sh | bash"

async function updatesByHand(): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    return (await invoke<string>("update_install_kind")) === "manual"
  } catch {
    return false
  }
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    // Use Tauri's updater plugin JS API
    const { check } = await import("@tauri-apps/plugin-updater")
    const update = await check()
    if (update) {
      return {
        available: true,
        version: update.version,
        body: update.body,
        manual: await updatesByHand(),
      }
    }
    return { available: false }
  } catch (e) {
    // If updater not configured or no network, fail silently
    console.warn("Update check failed:", e)
    return { available: false }
  }
}

export async function downloadAndInstallUpdate(): Promise<void> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater")
    const update = await check()
    if (update) {
      await update.downloadAndInstall()
      // Restart
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
    }
  } catch (e) {
    console.warn("Update install failed:", e)
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg)
  }
}
