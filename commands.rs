use crate::{db::{Db, Profile}, logger, Sys};
use serde::Serialize;
use std::{collections::HashMap, fs, net::ToSocketAddrs, path::PathBuf, time::{Duration, Instant}};
use sysinfo::ProcessesToUpdate;
use tauri::State;

// ---------- Zustand & Einstellungen ----------

#[tauri::command]
pub fn state_get(db: State<Db>, key: String) -> Result<Option<String>, String> { db.state_get(&key) }
#[tauri::command]
pub fn state_set(db: State<Db>, key: String, value: String) -> Result<(), String> { db.state_set(&key, &value) }
#[tauri::command]
pub fn settings_all(db: State<Db>) -> Result<HashMap<String, String>, String> { db.settings_all() }
#[tauri::command]
pub fn setting_set(db: State<Db>, key: String, value: String) -> Result<(), String> {
    if key.is_empty() || key.len() > 64 || value.len() > 200_000 {
        return Err("Ungültige Einstellung.".into());
    }
    db.setting_set(&key, &value)
}

// ---------- Profile ----------

#[tauri::command]
pub fn profiles_list(db: State<Db>) -> Result<Vec<Profile>, String> { db.profiles_list() }
#[tauri::command]
pub fn profile_create(db: State<Db>, name: String) -> Result<i64, String> {
    let id = db.profile_create(&name)?;
    logger::write("INFO", &format!("Profil erstellt: {name}"));
    Ok(id)
}
#[tauri::command]
pub fn profile_switch(db: State<Db>, id: i64) -> Result<(), String> { db.profile_switch(id) }
#[tauri::command]
pub fn profile_delete(db: State<Db>, id: i64) -> Result<(), String> { db.profile_delete(id) }

// ---------- Protokolle ----------

#[tauri::command]
pub fn log_read(max_lines: usize) -> String { logger::read_tail(max_lines.min(2000)) }
#[tauri::command]
pub fn log_write(level: String, msg: String) {
    let lvl = match level.as_str() { "ERROR" | "WARN" | "INFO" => level.as_str(), _ => "INFO" };
    logger::write(lvl, &format!("[ui] {}", msg.chars().take(2000).collect::<String>()));
}
#[tauri::command]
pub fn data_dir(db: State<Db>) -> String {
    db.path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default()
}

// ---------- Sicherungen ----------

#[derive(Serialize)]
pub struct BackupInfo { pub name: String, pub size: u64, pub created: String }

fn backup_dir(db: &Db) -> PathBuf {
    db.path.parent().unwrap_or(&PathBuf::from(".")).join("backups")
}

fn valid_backup_name(n: &str) -> bool {
    n.starts_with("ibis-backup-") && n.ends_with(".db") && !n.contains(['/', '\\', ':'])
}

fn list_backups(db: &Db) -> Vec<BackupInfo> {
    let mut v: Vec<BackupInfo> = fs::read_dir(backup_dir(db))
        .map(|rd| rd.flatten().filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !valid_backup_name(&name) { return None; }
            let m = e.metadata().ok()?;
            let created = m.modified().ok()
                .map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%d.%m.%Y %H:%M:%S").to_string())
                .unwrap_or_default();
            Some(BackupInfo { name, size: m.len(), created })
        }).collect())
        .unwrap_or_default();
    v.sort_by(|a, b| b.name.cmp(&a.name));
    v
}

fn create_backup(db: &Db) -> Result<BackupInfo, String> {
    let dir = backup_dir(db);
    fs::create_dir_all(&dir).map_err(|e| format!("Sicherungsordner nicht beschreibbar: {e}"))?;
    let name = format!("ibis-backup-{}.db", chrono::Local::now().format("%Y%m%d-%H%M%S"));
    db.backup_to(&dir.join(&name))?;
    for old in list_backups(db).into_iter().skip(20) {
        let _ = fs::remove_file(dir.join(old.name)); // nur die letzten 20 behalten
    }
    logger::write("INFO", &format!("Sicherung erstellt: {name}"));
    list_backups(db).into_iter().find(|b| b.name == name).ok_or_else(|| "Sicherung nicht gefunden.".into())
}

#[tauri::command]
pub fn backup_create(db: State<Db>) -> Result<BackupInfo, String> { create_backup(&db) }
#[tauri::command]
pub fn backups_list(db: State<Db>) -> Vec<BackupInfo> { list_backups(&db) }
#[tauri::command]
pub fn backup_restore(db: State<Db>, name: String) -> Result<(), String> {
    if !valid_backup_name(&name) { return Err("Ungültiger Dateiname.".into()); }
    db.restore_from(&backup_dir(&db).join(&name))?;
    logger::write("INFO", &format!("Sicherung wiederhergestellt: {name}"));
    Ok(())
}
#[tauri::command]
pub fn backup_delete(db: State<Db>, name: String) -> Result<(), String> {
    if !valid_backup_name(&name) { return Err("Ungültiger Dateiname.".into()); }
    fs::remove_file(backup_dir(&db).join(name)).map_err(|e| e.to_string())
}

// ---------- Reparatur ----------

#[derive(Serialize)]
pub struct Check {
    pub id: &'static str,
    pub title: &'static str,
    /// ok | warn | error | na
    pub status: &'static str,
    pub detail: String,
    pub fixable: bool,
}

#[tauri::command]
pub fn repair_check(db: State<Db>) -> Vec<Check> {
    let mut out = vec![];

    match db.integrity() {
        Ok(s) if s == "ok" => out.push(Check { id: "db", title: "Einstellungsdatenbank", status: "ok", detail: "Keine Fehler gefunden.".into(), fixable: false }),
        Ok(s) => out.push(Check { id: "db", title: "Einstellungsdatenbank", status: "error", detail: format!("Beschädigt: {s}"), fixable: true }),
        Err(e) => out.push(Check { id: "db", title: "Einstellungsdatenbank", status: "error", detail: e, fixable: true }),
    }

    let dir = db.path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let probe = dir.join(".write-test");
    let writable = fs::write(&probe, b"x").is_ok();
    let _ = fs::remove_file(&probe);
    out.push(Check {
        id: "dir", title: "Datenordner",
        status: if writable { "ok" } else { "error" },
        detail: if writable { dir.to_string_lossy().to_string() } else { format!("Nicht beschreibbar: {}", dir.to_string_lossy()) },
        fixable: !writable,
    });

    let n = list_backups(&db).len();
    out.push(Check {
        id: "backup", title: "Sicherungen",
        status: if n > 0 { "ok" } else { "warn" },
        detail: if n > 0 { format!("{n} Sicherung(en) vorhanden.") } else { "Es existiert noch keine Sicherung.".into() },
        fixable: n == 0,
    });

    out.push(Check {
        id: "webview", title: "Anzeige-Komponente (WebView2)", status: "ok",
        detail: format!("Version {}", tauri::webview_version().unwrap_or_else(|_| "unbekannt".into())),
        fixable: false,
    });
    out.push(Check { id: "engine", title: "Streaming-Engine (libobs)", status: "na",
        detail: "Noch nicht enthalten – folgt in Phase 3.".into(), fixable: false });
    out.push(Check { id: "ffmpeg", title: "FFmpeg", status: "na",
        detail: "Noch nicht enthalten – folgt in Phase 3.".into(), fixable: false });
    out
}

#[tauri::command]
pub fn repair_fix(db: State<Db>, id: String) -> Result<String, String> {
    let msg = match id.as_str() {
        "db" => {
            db.reindex()?;
            if db.integrity().map(|s| s == "ok").unwrap_or(false) {
                "Indizes neu aufgebaut, die Datenbank ist wieder in Ordnung.".to_string()
            } else if let Some(b) = list_backups(&db).first() {
                db.restore_from(&backup_dir(&db).join(&b.name))?;
                format!("Letzte Sicherung ({}) wurde wiederhergestellt.", b.created)
            } else {
                return Err("Die Datenbank ist beschädigt und es gibt keine Sicherung. Lösche den Datenordner im Menü Datenschutz, um neu zu beginnen.".into());
            }
        }
        "dir" => {
            let dir = db.path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
            fs::create_dir_all(&dir).map_err(|e| format!("Konnte den Ordner nicht anlegen: {e}"))?;
            "Datenordner wurde angelegt.".to_string()
        }
        "backup" => { create_backup(&db)?; "Sicherung wurde erstellt.".to_string() }
        _ => return Err("Dieser Punkt kann nicht automatisch repariert werden.".into()),
    };
    logger::write("INFO", &format!("Reparatur '{id}': {msg}"));
    Ok(msg)
}

// ---------- System ----------

#[derive(Serialize)]
pub struct Stats { pub cpu: f32, pub mem_used: u64, pub mem_total: u64, pub proc_cpu: f32, pub proc_mem: u64 }

#[tauri::command]
pub fn system_stats(sys: State<Sys>) -> Stats {
    let mut s = sys.0.lock().unwrap_or_else(|e| e.into_inner());
    s.refresh_cpu_usage();
    s.refresh_memory();
    let (proc_cpu, proc_mem) = match sysinfo::get_current_pid() {
        Ok(pid) => {
            s.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
            s.process(pid).map(|p| (p.cpu_usage(), p.memory())).unwrap_or((0.0, 0))
        }
        Err(_) => (0.0, 0),
    };
    Stats { cpu: s.global_cpu_usage(), mem_used: s.used_memory(), mem_total: s.total_memory(), proc_cpu, proc_mem }
}

#[derive(Serialize)]
pub struct Hw { pub cpu: String, pub cores: usize, pub ram: u64, pub gpus: Vec<String>, pub os: String }

#[cfg(windows)]
fn gpu_names() -> Vec<String> {
    use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};
    let mut v: Vec<String> = vec![];
    let class = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11cd-be10-08002be10318}");
    if let Ok(k) = class {
        for name in k.enum_keys().flatten() {
            if name.len() == 4 && name.chars().all(|c| c.is_ascii_digit()) {
                if let Ok(sk) = k.open_subkey(&name) {
                    if let Ok(d) = sk.get_value::<String, _>("DriverDesc") {
                        if !v.contains(&d) { v.push(d); }
                    }
                }
            }
        }
    }
    v
}
#[cfg(not(windows))]
fn gpu_names() -> Vec<String> { vec![] }

#[tauri::command]
pub fn hardware_detect(sys: State<Sys>) -> Hw {
    let mut s = sys.0.lock().unwrap_or_else(|e| e.into_inner());
    s.refresh_cpu_all();
    s.refresh_memory();
    Hw {
        cpu: s.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        cores: s.cpus().len(),
        ram: s.total_memory(),
        gpus: gpu_names(),
        os: sysinfo::System::long_os_version().unwrap_or_default(),
    }
}

#[derive(Serialize)]
pub struct NetEntry { pub host: String, pub ok: bool, pub ms: u64 }

#[tauri::command]
pub async fn net_check() -> Result<Vec<NetEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        ["id.twitch.tv:443", "api.twitch.tv:443", "1.1.1.1:443"].iter().map(|h| {
            let start = Instant::now();
            let ok = h.to_socket_addrs().ok()
                .and_then(|mut a| a.find_map(|addr| std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(4)).ok()))
                .is_some();
            NetEntry { host: h.to_string(), ok, ms: start.elapsed().as_millis() as u64 }
        }).collect()
    })
    .await
    .map_err(|e| e.to_string())
}
