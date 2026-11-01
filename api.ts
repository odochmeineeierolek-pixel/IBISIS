import { invoke } from "@tauri-apps/api/core";

export interface Profile { id: number; name: string; active: boolean }
export interface Check { id: string; title: string; status: "ok" | "warn" | "error" | "na"; detail: string; fixable: boolean }
export interface BackupInfo { name: string; size: number; created: string }
export interface Stats { cpu: number; mem_used: number; mem_total: number; proc_cpu: number; proc_mem: number }
export interface Hw { cpu: string; cores: number; ram: number; gpus: string[]; os: string }
export interface NetEntry { host: string; ok: boolean; ms: number }

export const api = {
  stateGet: (key: string) => invoke<string | null>("state_get", { key }),
  stateSet: (key: string, value: string) => invoke<void>("state_set", { key, value }),
  settingsAll: () => invoke<Record<string, string>>("settings_all"),
  settingSet: (key: string, value: string) => invoke<void>("setting_set", { key, value }),
  profiles: () => invoke<Profile[]>("profiles_list"),
  profileCreate: (name: string) => invoke<number>("profile_create", { name }),
  profileSwitch: (id: number) => invoke<void>("profile_switch", { id }),
  profileDelete: (id: number) => invoke<void>("profile_delete", { id }),
  logRead: (maxLines = 500) => invoke<string>("log_read", { maxLines }),
  logWrite: (level: "INFO" | "WARN" | "ERROR", msg: string) => invoke<void>("log_write", { level, msg }),
  dataDir: () => invoke<string>("data_dir"),
  repairCheck: () => invoke<Check[]>("repair_check"),
  repairFix: (id: string) => invoke<string>("repair_fix", { id }),
  backupCreate: () => invoke<BackupInfo>("backup_create"),
  backups: () => invoke<BackupInfo[]>("backups_list"),
  backupRestore: (name: string) => invoke<void>("backup_restore", { name }),
  backupDelete: (name: string) => invoke<void>("backup_delete", { name }),
  stats: () => invoke<Stats>("system_stats"),
  hardware: () => invoke<Hw>("hardware_detect"),
  net: () => invoke<NetEntry[]>("net_check"),
};

export function errText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : "Unbekannter Fehler";
}
