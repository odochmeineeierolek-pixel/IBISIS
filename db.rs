//! Lokale Datenhaltung (SQLite). Einstellungen gehören zu einem Profil,
//! app-weite Werte (aktives Profil, Einrichtungsassistent) liegen in `app_state`.

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

pub struct Db {
    conn: Mutex<Connection>,
    pub path: PathBuf,
}

#[derive(Serialize, Clone, Debug)]
pub struct Profile {
    pub id: i64,
    pub name: String,
    pub active: bool,
}

const SCHEMA: &str = "
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS profiles(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS settings(profile_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(profile_id,key));
CREATE TABLE IF NOT EXISTS app_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
";

fn es(e: rusqlite::Error) -> String {
    e.to_string()
}

impl Db {
    pub fn open(path: PathBuf) -> rusqlite::Result<Self> {
        let conn = Connection::open(&path)?;
        conn.execute_batch(SCHEMA)?;
        let db = Db { conn: Mutex::new(conn), path };
        db.ensure_default_profile()?;
        Ok(db)
    }

    fn c(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn ensure_default_profile(&self) -> rusqlite::Result<()> {
        let c = self.c();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?;
        if n == 0 {
            c.execute("INSERT INTO profiles(name) VALUES('Standard')", [])?;
        }
        let active: Option<String> = c
            .query_row("SELECT value FROM app_state WHERE key='active_profile'", [], |r| r.get(0))
            .optional()?;
        let valid = match active.and_then(|a| a.parse::<i64>().ok()) {
            Some(id) => c.query_row("SELECT COUNT(*) FROM profiles WHERE id=?1", [id], |r| r.get::<_, i64>(0))? > 0,
            None => false,
        };
        if !valid {
            let id: i64 = c.query_row("SELECT MIN(id) FROM profiles", [], |r| r.get(0))?;
            c.execute("INSERT OR REPLACE INTO app_state(key,value) VALUES('active_profile',?1)", [id.to_string()])?;
        }
        Ok(())
    }

    fn active_id(c: &Connection) -> rusqlite::Result<i64> {
        let s: String = c.query_row("SELECT value FROM app_state WHERE key='active_profile'", [], |r| r.get(0))?;
        Ok(s.parse().unwrap_or(1))
    }

    pub fn state_get(&self, key: &str) -> Result<Option<String>, String> {
        self.c()
            .query_row("SELECT value FROM app_state WHERE key=?1", [key], |r| r.get(0))
            .optional()
            .map_err(es)
    }

    pub fn state_set(&self, key: &str, value: &str) -> Result<(), String> {
        self.c()
            .execute("INSERT OR REPLACE INTO app_state(key,value) VALUES(?1,?2)", [key, value])
            .map(|_| ())
            .map_err(es)
    }

    pub fn settings_all(&self) -> Result<HashMap<String, String>, String> {
        let c = self.c();
        let pid = Self::active_id(&c).map_err(es)?;
        let mut st = c.prepare("SELECT key,value FROM settings WHERE profile_id=?1").map_err(es)?;
        let rows = st
            .query_map([pid], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(es)?;
        let mut m = HashMap::new();
        for row in rows {
            let (k, v) = row.map_err(es)?;
            m.insert(k, v);
        }
        Ok(m)
    }

    pub fn setting_set(&self, key: &str, value: &str) -> Result<(), String> {
        let c = self.c();
        let pid = Self::active_id(&c).map_err(es)?;
        c.execute(
            "INSERT OR REPLACE INTO settings(profile_id,key,value) VALUES(?1,?2,?3)",
            rusqlite::params![pid, key, value],
        )
        .map(|_| ())
        .map_err(es)
    }

    pub fn profiles_list(&self) -> Result<Vec<Profile>, String> {
        let c = self.c();
        let active = Self::active_id(&c).map_err(es)?;
        let mut st = c.prepare("SELECT id,name FROM profiles ORDER BY id").map_err(es)?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(es)?;
        let mut v = vec![];
        for row in rows {
            let (id, name) = row.map_err(es)?;
            v.push(Profile { id, name, active: id == active });
        }
        Ok(v)
    }

    /// Legt ein neues Profil als Kopie der Einstellungen des aktiven Profils an.
    pub fn profile_create(&self, name: &str) -> Result<i64, String> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 40 {
            return Err("Der Profilname muss 1 bis 40 Zeichen lang sein.".into());
        }
        let c = self.c();
        let from = Self::active_id(&c).map_err(es)?;
        c.execute("INSERT INTO profiles(name) VALUES(?1)", [name])
            .map_err(|_| "Ein Profil mit diesem Namen existiert bereits.".to_string())?;
        let id = c.last_insert_rowid();
        c.execute(
            "INSERT INTO settings(profile_id,key,value) SELECT ?1,key,value FROM settings WHERE profile_id=?2",
            rusqlite::params![id, from],
        )
        .map_err(es)?;
        Ok(id)
    }

    pub fn profile_switch(&self, id: i64) -> Result<(), String> {
        let c = self.c();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM profiles WHERE id=?1", [id], |r| r.get(0)).map_err(es)?;
        if n == 0 {
            return Err("Dieses Profil existiert nicht.".into());
        }
        c.execute("INSERT OR REPLACE INTO app_state(key,value) VALUES('active_profile',?1)", [id.to_string()])
            .map(|_| ())
            .map_err(es)
    }

    pub fn profile_delete(&self, id: i64) -> Result<(), String> {
        {
            let c = self.c();
            let n: i64 = c.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0)).map_err(es)?;
            if n <= 1 {
                return Err("Das letzte Profil kann nicht gelöscht werden.".into());
            }
            c.execute("DELETE FROM settings WHERE profile_id=?1", [id]).map_err(es)?;
            c.execute("DELETE FROM profiles WHERE id=?1", [id]).map_err(es)?;
        }
        self.ensure_default_profile().map_err(es)
    }

    pub fn integrity(&self) -> Result<String, String> {
        self.c().query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(es)
    }

    pub fn reindex(&self) -> Result<(), String> {
        self.c().execute_batch("REINDEX;").map_err(es)
    }

    /// Konsistente Sicherung (VACUUM INTO) – auch bei laufendem Betrieb.
    pub fn backup_to(&self, dest: &Path) -> Result<(), String> {
        if dest.exists() {
            return Err("Die Sicherungsdatei existiert bereits.".into());
        }
        let quoted = dest.to_string_lossy().replace('\'', "''");
        self.c().execute_batch(&format!("VACUUM INTO '{quoted}'")).map_err(es)
    }

    pub fn restore_from(&self, src: &Path) -> Result<(), String> {
        {
            let t = Connection::open_with_flags(src, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(|_| "Die Sicherung kann nicht geöffnet werden.".to_string())?;
            let ok: String = t
                .query_row("PRAGMA integrity_check", [], |r| r.get(0))
                .map_err(|_| "Die Sicherung ist beschädigt.".to_string())?;
            if ok != "ok" {
                return Err("Die Sicherung ist beschädigt.".into());
            }
            for tbl in ["settings", "profiles", "app_state"] {
                t.query_row(&format!("SELECT COUNT(*) FROM {tbl}"), [], |r| r.get::<_, i64>(0))
                    .map_err(|_| "Die Datei ist keine IBIS-IV-Sicherung.".to_string())?;
            }
        }
        let c = self.c();
        c.execute("ATTACH DATABASE ?1 AS bk", [src.to_string_lossy().to_string()]).map_err(es)?;
        let res = c.execute_batch(
            "BEGIN;
             DELETE FROM settings; DELETE FROM profiles; DELETE FROM app_state;
             INSERT INTO profiles SELECT * FROM bk.profiles;
             INSERT INTO settings SELECT * FROM bk.settings;
             INSERT INTO app_state SELECT * FROM bk.app_state;
             COMMIT;",
        );
        if res.is_err() {
            let _ = c.execute_batch("ROLLBACK;");
        }
        let _ = c.execute_batch("DETACH DATABASE bk;");
        drop(c);
        res.map_err(es)?;
        self.ensure_default_profile().map_err(es)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("ibis-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_file(&p);
        p
    }

    #[test]
    fn settings_are_per_profile() {
        let db = Db::open(temp("a.db")).unwrap();
        db.setting_set("fps", "60").unwrap();
        let id = db.profile_create("Gaming").unwrap();
        db.profile_switch(id).unwrap();
        assert_eq!(db.settings_all().unwrap().get("fps").unwrap(), "60"); // Kopie
        db.setting_set("fps", "30").unwrap();
        db.profile_switch(1).unwrap();
        assert_eq!(db.settings_all().unwrap().get("fps").unwrap(), "60");
    }

    #[test]
    fn last_profile_cannot_be_deleted() {
        let db = Db::open(temp("b.db")).unwrap();
        assert!(db.profile_delete(1).is_err());
    }

    #[test]
    fn backup_and_restore_roundtrip() {
        let db = Db::open(temp("c.db")).unwrap();
        db.setting_set("title", "vorher").unwrap();
        let bk = temp("c-backup.db");
        db.backup_to(&bk).unwrap();
        db.setting_set("title", "nachher").unwrap();
        db.restore_from(&bk).unwrap();
        assert_eq!(db.settings_all().unwrap().get("title").unwrap(), "vorher");
        assert_eq!(db.integrity().unwrap(), "ok");
    }

    #[test]
    fn restore_rejects_garbage() {
        let db = Db::open(temp("d.db")).unwrap();
        let junk = temp("junk.db");
        std::fs::write(&junk, b"das ist keine datenbank").unwrap();
        assert!(db.restore_from(&junk).is_err());
    }
}
