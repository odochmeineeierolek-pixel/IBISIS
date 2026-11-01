use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::OnceLock,
};

static LOG_FILE: OnceLock<PathBuf> = OnceLock::new();
const MAX_BYTES: u64 = 2 * 1024 * 1024;

pub fn init(dir: PathBuf) {
    let _ = fs::create_dir_all(&dir);
    let file = dir.join("ibis.log");
    if fs::metadata(&file).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = fs::rename(&file, dir.join("ibis.old.log"));
    }
    let _ = LOG_FILE.set(file);
}

pub fn path() -> Option<PathBuf> {
    LOG_FILE.get().cloned()
}

pub fn write(level: &str, msg: &str) {
    if let Some(p) = LOG_FILE.get() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(p) {
            let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = writeln!(f, "{ts} [{level}] {}", msg.replace('\n', " | "));
        }
    }
}

pub fn read_tail(max_lines: usize) -> String {
    let Some(p) = LOG_FILE.get() else { return String::new() };
    let text = fs::read_to_string(p).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}
