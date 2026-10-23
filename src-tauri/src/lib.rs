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
/// `capabilities/default.json`; the frontend grants it through
/// `src/vaultScope.ts` on every vault open.
///
/// The frontend MUST call this (via `src/vaultScope.ts`'s `allowVaultDir`)
/// every time a vault is opened, or all fs/asset access to files inside the
/// vault will be denied by the webview's permission scope.
const SYSTEM_PATHS_UNIX: &[&str] = &[
    "/",
    "/proc",
    "/sys",
    "/dev",
    "/run",
    "/boot",
    "/etc",
    "/var",
    "/usr",
    "/lib",
    "/lib64",
    "/sbin",
    "/bin",
    "/srv",
    "/opt",
    "/tmp",
    "/mnt",
    "/media",
    "/root",
    "/home",
    "/Users",
    "/System",
    "/Library",
    "/Applications",
    "/private",
    "/Volumes",
];
const SYSTEM_PATHS_WIN: &[&str] = &[
    "c:/",
    "c:/windows",
    "c:/program files",
    "c:/program files (x86)",
    "c:/programdata",
    "c:/users",
];

/// Normalizes separators, collapses repeats and strips the trailing slash so
/// `C:\Windows\`, `/etc//` and `/etc` compare equal. The root keeps its `/`.
fn normalize_for_compare(path: &str) -> String {
    let mut s = path.trim().replace('\\', "/");
    while s.contains("//") {
        s = s.replace("//", "/");
    }
    if s.len() > 1 && s.ends_with('/') {
        s.pop();
    }
    s
}

/// Rejects the filesystem root, the user's home directory itself and system
/// directories. A vault inside home (e.g. `~/Documents/notes`) is fine.
fn validate_vault_path(path: &str, home: Option<&std::path::Path>) -> Result<(), String> {
    let norm = normalize_for_compare(path);
    if norm.is_empty() {
        return Err("vault path is empty".to_string());
    }
    // `..` could climb out of an otherwise acceptable prefix into a system dir.
    if norm.split('/').any(|part| part == "..") {
        return Err(format!("vault path must not contain '..': {path}"));
    }
    let lower = norm.to_lowercase();
    // Bare drive roots such as `d:` or `d:/`.
    let bytes = lower.as_bytes();
    if (bytes.len() == 2 || (bytes.len() == 3 && bytes[2] == b'/'))
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
    {
        return Err(format!("vault path is a drive root: {path}"));
    }
    if SYSTEM_PATHS_UNIX.iter().any(|p| p.to_lowercase() == lower)
        || SYSTEM_PATHS_WIN.iter().any(|p| *p == lower)
    {
        return Err(format!("vault path is a system directory: {path}"));
    }
    if let Some(home) = home {
        let home_norm = normalize_for_compare(&home.to_string_lossy()).to_lowercase();
        if !home_norm.is_empty() && home_norm == lower {
            return Err(format!("vault path is the home directory itself: {path}"));
        }
    }
    Ok(())
}

#[tauri::command]
fn allow_vault_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = std::path::Path::new(&path);

    if path.trim().is_empty() {
        return Err("vault path is empty".to_string());
    }
    // Mirror of the frontend `validateVaultPath` (src/useVault.ts): the
    // webview is not a trust boundary, so the same rule is enforced here.
    let home = app.path().home_dir().ok();
    validate_vault_path(&path, home.as_deref())?;
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
/// (and any other future secrets) out of localStorage/plaintext JSON. The key used to
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

/// Navigation guard (defense in depth). The sanitizer and the preview click
/// handler already keep links from leaving the app, but if either is bypassed a
/// top-level navigation would replace the whole UI with remote content that
/// then runs next to the IPC bridge. Only the app's own origin may load.
fn is_allowed_navigation(url: &tauri::Url) -> bool {
    let host = url.host_str().unwrap_or("");
    match url.scheme() {
        // Linux/macOS production origin.
        "tauri" => host == "localhost",
        // Windows/Android production origin.
        "http" | "https" if host == "tauri.localhost" => true,
        // Vite dev server, debug builds only.
        "http" if cfg!(debug_assertions) => host == "localhost" || host == "127.0.0.1",
        // Embedded YouTube players (the sanitizer only lets these through).
        "https" => {
            host == "www.youtube.com"
                || host == "youtube.com"
                || host == "www.youtube-nocookie.com"
                || host == "youtube-nocookie.com"
        }
        "about" => url.as_str() == "about:blank",
        _ => false,
    }
}

fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|_webview, url| is_allowed_navigation(url))
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(navigation_guard())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn rejects_root_and_system_dirs() {
        for p in [
            "/",
            "//",
            "/etc",
            "/etc/",
            "/usr",
            "/ETC",
            "C:\\",
            "c:/",
            "C:\\Windows",
            "C:\\Windows\\",
            "D:\\",
            "d:",
            "/home",
            "/mnt",
        ] {
            assert!(validate_vault_path(p, None).is_err(), "should reject {p}");
        }
    }

    #[test]
    fn rejects_home_itself_but_not_children() {
        let home = Path::new("/home/w");
        assert!(validate_vault_path("/home/w", Some(home)).is_err());
        assert!(validate_vault_path("/home/w/", Some(home)).is_err());
        assert!(validate_vault_path("/home/w/notes", Some(home)).is_ok());
        assert!(validate_vault_path("/home/w/Documents/vault", Some(home)).is_ok());
    }

    #[test]
    fn rejects_dotdot_and_empty() {
        assert!(validate_vault_path("/home/w/../../etc", None).is_err());
        assert!(validate_vault_path("   ", None).is_err());
    }

    #[test]
    fn accepts_normal_vaults() {
        assert!(validate_vault_path("/data/notes", None).is_ok());
        assert!(validate_vault_path("D:\\Notes", None).is_ok());
        assert!(validate_vault_path("C:\\Users\\me\\vault", None).is_ok());
    }

    #[test]
    fn navigation_allows_only_app_origins() {
        let ok = |u: &str| is_allowed_navigation(&u.parse().unwrap());
        assert!(ok("tauri://localhost/index.html"));
        assert!(ok("http://tauri.localhost/"));
        assert!(ok("https://tauri.localhost/"));
        assert!(ok("https://www.youtube-nocookie.com/embed/x"));
        assert!(!ok("https://evil.example/"));
        assert!(!ok("http://evil.example/"));
        assert!(!ok("file:///etc/passwd"));
        assert!(!ok("tauri://evil/"));
        assert!(!ok("javascript:alert(1)"));
        assert_eq!(ok("http://localhost:1420/"), cfg!(debug_assertions));
    }
}
