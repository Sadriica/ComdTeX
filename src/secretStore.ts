/**
 * OS-keychain-backed secret storage.
 *
 * Secrets like the AI provider API key (`settings.aiApiKey`) used to be
 * serialized in plaintext inside `localStorage` (`comdtex_settings`) — see
 * the "AI assistant — BYO provider" section in CLAUDE.md. This module routes
 * secrets through the Rust `set_secret` / `get_secret` / `delete_secret`
 * commands (src-tauri/src/lib.rs), which use the `keyring` crate to reach
 * the platform keychain (Secret Service on Linux, Keychain on macOS,
 * Credential Manager on Windows).
 *
 * Not every Linux desktop ships a Secret Service provider (e.g. minimal
 * window-manager setups without gnome-keyring/kwallet), so every function
 * here falls back to a namespaced `localStorage` key
 * (`comdtex_secret_<key>`) if the keychain invoke throws. This keeps the
 * app fully functional, just without OS-level secret protection — a
 * one-time console.warn surfaces the degradation to developers/power users.
 */
import { invoke } from "@tauri-apps/api/core"

const FALLBACK_PREFIX = "comdtex_secret_"

let warnedFallback = false

function warnFallbackOnce(err: unknown): void {
  if (warnedFallback) return
  warnedFallback = true
  console.warn(
    "[secretStore] OS keychain unavailable — falling back to localStorage for secrets. " +
      "This is common on Linux setups without a Secret Service provider (e.g. gnome-keyring/kwallet). " +
      `Underlying error: ${String(err)}`,
  )
}

function fallbackKey(key: string): string {
  return `${FALLBACK_PREFIX}${key}`
}

/** Best-effort check for whether the OS keychain backend is reachable. */
export async function isKeychainAvailable(): Promise<boolean> {
  try {
    // A harmless read of a very unlikely-to-exist key: succeeds (Some/None)
    // if the backend works, throws if there's no Secret Service / backend.
    await invoke("get_secret", { key: "__comdtex_keychain_probe__" })
    return true
  } catch {
    return false
  }
}

/** Reads a secret. Returns `null` if it isn't set anywhere. */
export async function getSecret(key: string): Promise<string | null> {
  try {
    const value = await invoke<string | null>("get_secret", { key })
    return value ?? null
  } catch (err) {
    warnFallbackOnce(err)
    try {
      return localStorage.getItem(fallbackKey(key))
    } catch {
      return null
    }
  }
}

/** Writes a secret. Falls back to a namespaced localStorage key on failure. */
export async function setSecret(key: string, value: string): Promise<void> {
  try {
    await invoke("set_secret", { key, value })
    // Keep the fallback store clean once the keychain write succeeds, in
    // case an earlier session had fallen back for this key.
    try {
      localStorage.removeItem(fallbackKey(key))
    } catch {
      // ignore
    }
  } catch (err) {
    warnFallbackOnce(err)
    try {
      localStorage.setItem(fallbackKey(key), value)
    } catch {
      // ignore — nothing more we can do
    }
  }
}

/** Deletes a secret from both the keychain and the localStorage fallback. */
export async function deleteSecret(key: string): Promise<void> {
  try {
    await invoke("delete_secret", { key })
  } catch (err) {
    warnFallbackOnce(err)
  }
  try {
    localStorage.removeItem(fallbackKey(key))
  } catch {
    // ignore
  }
}
