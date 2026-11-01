// Verhindert unter Windows jedes Konsolenfenster im Release-Build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod logger;

use std::sync::Mutex;
use tauri::Manager;

pub struct Sys(pub Mutex<sysinfo::System>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            logger::init(data_dir.join("logs"));
            std::panic::set_hook(Box::new(|info| {
                logger::write("PANIC", &info.to_string());
            }));
            logger::write("INFO", "IBIS IV startet");
            let database = db::Db::open(data_dir.join("ibis.db"))
                .map_err(|e| format!("Datenbank konnte nicht geöffnet werden: {e}"))?;
            app.manage(database);
            app.manage(Sys(Mutex::new(sysinfo::System::new())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::state_get,
            commands::state_set,
            commands::settings_all,
            commands::setting_set,
            commands::profiles_list,
            commands::profile_create,
            commands::profile_switch,
            commands::profile_delete,
            commands::log_read,
            commands::log_write,
            commands::repair_check,
            commands::repair_fix,
            commands::backup_create,
            commands::backups_list,
            commands::backup_restore,
            commands::backup_delete,
            commands::system_stats,
            commands::hardware_detect,
            commands::net_check,
            commands::data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("IBIS IV konnte nicht gestartet werden");
}
