#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Generate mutable context to initialize the theme plugin
    let mut ctx = tauri::generate_context!();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Initialize theme plugin and auto-restore saved theme
        .plugin(tauri_plugin_theme::init(ctx.config_mut()))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(ctx)
        .expect("error while running tauri application");
}
