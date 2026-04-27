// Run `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`
// and `cargo add tauri-plugin-updater` to complete setup

export interface UpdateInfo {
  available: boolean
  version?: string
  body?: string
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    // Use Tauri's updater plugin JS API
    const { check } = await import("@tauri-apps/plugin-updater")
    const update = await check()
    if (update) {
      return { available: true, version: update.version, body: update.body }
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
