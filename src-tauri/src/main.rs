#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // In development mode, load from .env file
    #[cfg(debug_assertions)]
    dotenv::dotenv().ok();

    // For both dev and production, embed the value from .env
    let dsn = include_str!("../../.env")
        .lines()
        .find(|line| line.starts_with("SENTRY_TAURI="))
        .and_then(|line| line.split('=').nth(1))
        .map(|value| value.trim())
        .map(|value| value.trim_matches('"'))
        .expect("SENTRY_TAURI must be set in .env");

    let _guard = sentry::init((
        dsn,
        sentry::ClientOptions {
            release: sentry::release_name!(),
            ..Default::default()
        },
    ));

    app_lib::run();
}
