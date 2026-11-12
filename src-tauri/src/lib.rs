use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// Dot-prefixed files the app itself reads/writes inside a vault. These need an
/// explicit literal-name grant because the `<vault>/**` glob cannot match a
/// leading dot on Unix; see `allow_vault_dir`. Keep in sync with
/// `COMMENTS_FILENAME` in `src/comments.ts`.
const DOT_FILES_IN_VAULT: &[&str] = &[".comdtex-comments.json", ".comdtex-pdf-highlights.json"];

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

/// One installed font family, as shown in the font pickers.
#[derive(serde::Serialize, Debug, PartialEq, Eq)]
struct FontFamilyInfo {
    name: String,
    /// True when every installed face of the family is monospaced.
    monospace: bool,
}

/// Collapse per-face records into one entry per family name: sorted
/// case-insensitively, deduplicated, with `monospace` true only when all faces
/// of the family are monospaced. Names that are blank or start with a dot
/// (hidden system fonts such as ".SF NS") are dropped.
fn collapse_families<I: IntoIterator<Item = (String, bool)>>(faces: I) -> Vec<FontFamilyInfo> {
    let mut map: std::collections::BTreeMap<String, (String, bool)> =
        std::collections::BTreeMap::new();
    for (name, mono) in faces {
        let name = name.trim().to_string();
        if name.is_empty() || name.starts_with('.') {
            continue;
        }
        let entry = map
            .entry(name.to_lowercase())
            .or_insert_with(|| (name.clone(), true));
        entry.1 &= mono;
    }
    map.into_values()
        .map(|(name, monospace)| FontFamilyInfo { name, monospace })
        .collect()
}

/// Enumerate the font families installed on the system (Linux, Windows,
/// macOS). Scanning can take a while with many fonts, so it runs on the
/// blocking pool rather than the main thread.
#[tauri::command]
async fn list_system_fonts() -> Result<Vec<FontFamilyInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        collapse_families(
            db.faces()
                .filter_map(|f| f.families.first().map(|(n, _)| (n.clone(), f.monospaced))),
        )
    })
    .await
    .map_err(|e| format!("font scan failed: {e}"))
}

/// How this copy of the app can be updated: "self" when the updater can
/// replace it (a mounted AppImage, a .deb/.rpm, Windows, macOS), "manual" when
/// it runs from an unpacked AppImage or a source build. The updater replaces
/// the running executable in that case, which turns an extracted install (the
/// Arch path of scripts/install.sh) back into a raw AppImage and drops its
/// libwayland patch, so those installs update by re-running the installer.
///
/// A mounted AppImage on an Arch-based distro is "manual" too. It is what an
/// in-app update left behind on installs that predate this check, and the
/// AppImage forces `WEBKIT_DISABLE_DMABUF_RENDERER=1` (software rendering:
/// slow typing, slow PDF scrolling); updating it in place would keep it that
/// way. The installer's Arch path unpacks it and drops that variable.
#[tauri::command]
fn update_install_kind() -> &'static str {
    install_kind(
        cfg!(target_os = "linux"),
        std::env::var_os("APPIMAGE").is_some(),
        matches!(
            tauri::utils::platform::bundle_type(),
            Some(tauri::utils::config::BundleType::Deb | tauri::utils::config::BundleType::Rpm)
        ),
        std::fs::read_to_string("/etc/os-release")
            .map(|text| is_arch_like(&text))
            .unwrap_or(false),
    )
}

fn install_kind(linux: bool, in_appimage: bool, packaged: bool, arch_like: bool) -> &'static str {
    if !linux || packaged || (in_appimage && !arch_like) {
        "self"
    } else {
        "manual"
    }
}

/// `ID=arch` or `arch` among `ID_LIKE` (Manjaro, EndeavourOS, CachyOS...),
/// the same rule as `is_arch_like` in scripts/install.sh.
fn is_arch_like(os_release: &str) -> bool {
    let value = |key: &str| {
        os_release
            .lines()
            .find_map(|line| line.strip_prefix(key))
            .map(|v| v.trim().trim_matches('"').to_string())
            .unwrap_or_default()
    };
    value("ID=") == "arch" || value("ID_LIKE=").split_whitespace().any(|id| id == "arch")
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
            delete_secret,
            list_system_fonts,
            update_install_kind
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {

    #[test]
    fn collapse_families_dedupes_sorts_and_flags_monospace() {
        let out = collapse_families(vec![
            ("Zed Sans".to_string(), false),
            ("Fira Code".to_string(), true),
            ("fira code".to_string(), true),
            ("Mixed".to_string(), true),
            ("Mixed".to_string(), false),
            (".Hidden".to_string(), false),
            ("  ".to_string(), false),
        ]);
        let names: Vec<_> = out.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec!["Fira Code", "Mixed", "Zed Sans"]);
        assert!(out[0].monospace);
        assert!(!out[1].monospace);
    }
    use super::*;
    use std::path::Path;

    #[test]
    fn only_unpacked_linux_installs_update_by_hand() {
        assert_eq!(install_kind(false, false, false, false), "self");
        assert_eq!(install_kind(true, true, false, false), "self");
        assert_eq!(install_kind(true, false, true, false), "self");
        assert_eq!(install_kind(true, false, false, false), "manual");
        // A mounted AppImage on Arch goes back through the installer, which
        // unpacks it and turns hardware rendering back on.
        assert_eq!(install_kind(true, true, false, true), "manual");
        assert_eq!(install_kind(true, false, true, true), "self");
    }

    #[test]
    fn reads_arch_like_from_os_release() {
        assert!(is_arch_like("NAME=\"Arch Linux\"\nID=arch\n"));
        assert!(is_arch_like("ID=manjaro\nID_LIKE=arch\n"));
        assert!(is_arch_like("ID=cachyos\nID_LIKE=\"arch\"\n"));
        assert!(!is_arch_like("ID=ubuntu\nID_LIKE=debian\n"));
        assert!(!is_arch_like("ID=archlinux-ish\nID_LIKE=\"debian\"\n"));
        assert!(!is_arch_like(""));
    }

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
