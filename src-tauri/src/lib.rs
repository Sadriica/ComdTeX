use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// Dot-prefixed files the app itself reads/writes inside a vault. These need an
/// explicit literal-name grant because the `<vault>/**` glob cannot match a
/// leading dot on Unix; see `allow_vault_dir`. Keep in sync with
/// `COMMENTS_FILENAME` in `src/comments.ts`.
const DOT_FILES_IN_VAULT: &[&str] = &[".comdtex-comments.json"];

/// Extends the runtime fs-plugin scope and asset-protocol scope to allow
/// access to the user's vault folder, which lives at an arbitrary,
/// user-chosen path on disk and therefore cannot be granted statically in
/// `capabilities/default.json` (see the "Tauri v2: important notes" /
/// scope-hardening section in CLAUDE.md).
///
/// The frontend MUST call this (via `src/vaultScope.ts`'s `allowVaultDir`)
/// every time a vault is opened, or all fs/asset access to files inside the
/// vault will be denied by the webview's permission scope.
#[tauri::command]
fn allow_vault_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = std::path::Path::new(&path);

    if path.trim().is_empty() {
        return Err("vault path is empty".to_string());
    }
    // A path that does not exist yet is allowed on purpose: `createVault`
    // grants the scope *before* `mkdir` creates the folder (the underlying
    // scope pattern is just a glob and does not require the path to exist).
    // The frontend's `validateVaultPath` already rejects system/root paths.
    if dir.exists() && !dir.is_dir() {
        return Err(format!("vault path is not a directory: {path}"));
    }

    app.fs_scope()
        .allow_directory(dir, true)
        .map_err(|e| format!("failed to extend fs scope for vault: {e}"))?;

    // `allow_directory` installs a `<vault>/**` glob, and the fs plugin matches
    // with glob's `require_literal_leading_dot`, which defaults to true on Unix
    // (tauri-plugin-fs `commands.rs`: `.unwrap_or(cfg!(unix))`). `**` therefore
    // does NOT match a component with a leading dot, so every dot-prefixed file
    // the app owns must be granted by literal name: a "." is not a glob
    // metacharacter, so `Pattern::escape` leaves it intact and it matches.
    // Setting `requireLiteralLeadingDot: false` in tauri.conf.json would NOT
    // help here: the plugin builds this runtime scope from `FsScope::default()`
    // and never threads the config value into its match options.
    for hidden in DOT_FILES_IN_VAULT {
        app.fs_scope()
            .allow_file(dir.join(hidden))
            .map_err(|e| format!("failed to allow {hidden} in vault scope: {e}"))?;
    }

    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|e| format!("failed to extend asset-protocol scope for vault: {e}"))?;

    Ok(())
}

/// OS-keychain-backed secret storage, used to keep the AI provider API key
/// (and any other future secrets) out of localStorage/plaintext JSON. See
/// the "AI assistant: BYO provider" section in CLAUDE.md: the key used to
/// live in `settings.aiApiKey` inside `localStorage`; it is now written
/// through here to the platform keychain (Secret Service on Linux, Keychain
/// on macOS, Credential Manager on Windows) via the `keyring` crate.
const SECRET_SERVICE: &str = "comdtex";

#[tauri::command]
fn set_secret(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SECRET_SERVICE, &key)
        .map_err(|e| format!("failed to create keyring entry: {e}"))?;
    entry
        .set_password(&value)
        .map_err(|e| format!("failed to write secret to keychain: {e}"))
}

#[tauri::command]
fn get_secret(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SECRET_SERVICE, &key)
        .map_err(|e| format!("failed to create keyring entry: {e}"))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read secret from keychain: {e}")),
    }
}

#[tauri::command]
fn delete_secret(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SECRET_SERVICE, &key)
        .map_err(|e| format!("failed to create keyring entry: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to delete secret from keychain: {e}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            allow_vault_dir,
            set_secret,
            get_secret,
            delete_secret
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
