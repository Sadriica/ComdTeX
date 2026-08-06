/**
 * Runtime vault scoping.
 *
 * The Tauri fs-plugin scope and the asset-protocol scope are static in
 * `src-tauri/capabilities/default.json` / `tauri.conf.json`; but the vault
 * is a user-chosen folder that can live anywhere on disk, so its path can't
 * be granted ahead of time. Instead, the Rust command `allow_vault_dir`
 * (src-tauri/src/lib.rs) extends both scopes at runtime for the chosen
 * directory (recursively).
 *
 * IMPORTANT: this must be called every time a vault is opened (initial
 * open, "open vault" action, switching recent vaults, etc.); until it is
 * called for a given path, all `@tauri-apps/plugin-fs` reads/writes and all
 * `asset://` image loads under that path will be denied by the webview.
 * Wiring the call site (in `useVault.ts` / `App.tsx`) happens separately.
 */
import { invoke } from "@tauri-apps/api/core"

/**
 * Grants the current webview recursive fs + asset-protocol access to
 * `path`. Safe to call multiple times (e.g. re-opening the same vault),
 * the underlying Tauri scope is additive.
 *
 * @throws {Error} if `path` does not exist, is not a directory, or the
 * scope could not be extended (wraps the Rust-side error message).
 */
export async function allowVaultDir(path: string): Promise<void> {
  try {
    await invoke("allow_vault_dir", { path })
  } catch (err) {
    throw new Error(`Failed to grant vault access for "${path}": ${String(err)}`)
  }
}
