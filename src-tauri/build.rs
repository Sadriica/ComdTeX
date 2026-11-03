fn main() {
    // Register custom commands so tauri-build autogenerates their ACL
    // permissions (`allow-vault-dir`, `allow-set-secret`, `allow-get-secret`,
    // `allow-delete-secret`, `allow-list-system-fonts`), which `capabilities/default.json` grants
    // explicitly.
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "allow_vault_dir",
            "set_secret",
            "get_secret",
            "delete_secret",
            "list_system_fonts",
        ]));

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
